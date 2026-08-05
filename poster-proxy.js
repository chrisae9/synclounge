/* eslint-disable no-bitwise -- IP address parsing is explicitly bit-oriented. */

const dns = require('node:dns').promises;
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');

const MAX_POSTER_BYTES = 5 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set([
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

class PosterProxyError extends Error {
  constructor(message, statusCode = 502) {
    super(message);
    this.statusCode = statusCode;
  }
}

function parseIpv4(address) {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4
    || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return null;
  }
  return octets;
}

function expandIpv6(address) {
  let normalized = address.toLowerCase().split('%')[0];
  const ipv4Match = normalized.match(/(?:^|:)(\d+\.\d+\.\d+\.\d+)$/);
  if (ipv4Match) {
    const octets = parseIpv4(ipv4Match[1]);
    if (!octets) return null;
    const high = ((octets[0] << 8) | octets[1]).toString(16);
    const low = ((octets[2] << 8) | octets[3]).toString(16);
    normalized = `${normalized.slice(0, -ipv4Match[1].length)}${high}:${low}`;
  }

  const halves = normalized.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves[1] ? halves[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
  const groups = [...left, ...Array(missing).fill('0'), ...right]
    .map((group) => Number.parseInt(group || '0', 16));
  if (groups.length !== 8 || groups.some((group) => !Number.isInteger(group))) return null;
  return groups;
}

function isPrivateAddress(address) {
  if (net.isIP(address) === 4) {
    const [a, b, c] = parseIpv4(address);
    return a === 0
      || a === 10
      || a === 127
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 0)
      || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19))
      || (a === 198 && b === 51 && c === 100)
      || (a === 203 && b === 0 && c === 113)
      || a >= 224;
  }

  if (net.isIP(address) === 6) {
    const groups = expandIpv6(address);
    if (!groups) return true;
    const [first, second] = groups;
    const isUnspecifiedOrLoopback = groups.slice(0, 7).every((group) => group === 0)
      && groups[7] <= 1;
    const isIpv4Mapped = groups.slice(0, 5).every((group) => group === 0)
      && groups[5] === 0xffff;
    if (isIpv4Mapped) {
      const ipv4 = `${groups[6] >> 8}.${groups[6] & 0xff}.${groups[7] >> 8}.${groups[7] & 0xff}`;
      return isPrivateAddress(ipv4);
    }
    return isUnspecifiedOrLoopback
      || (first & 0xfe00) === 0xfc00
      || (first & 0xffc0) === 0xfe80
      || (first & 0xff00) === 0xff00
      || (first === 0x2001 && second === 0x0db8);
  }

  return true;
}

async function resolvePosterTarget(urlString, {
  lookup = dns.lookup,
  allowedPrivateHost,
} = {}) {
  let url;
  try {
    url = new URL(urlString);
  } catch {
    throw new PosterProxyError('Poster URL is invalid', 403);
  }

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new PosterProxyError('Poster URL is not allowed', 403);
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const records = await lookup(hostname, { all: true, verbatim: true });
  if (!Array.isArray(records) || records.length === 0) {
    throw new PosterProxyError('Poster host did not resolve');
  }

  const allowPrivate = allowedPrivateHost && hostname === allowedPrivateHost;
  const addresses = allowPrivate
    ? records
    : records.filter(({ address }) => !isPrivateAddress(address));
  if (addresses.length === 0) {
    throw new PosterProxyError('Poster host resolves to a private address', 403);
  }

  return { url, addresses };
}

function makePinnedLookup(addresses) {
  return (hostname, options, callback) => {
    const normalizedOptions = typeof options === 'number' ? { family: options } : options;
    const family = normalizedOptions?.family;
    const matching = addresses.filter((record) => !family || record.family === family);
    if (matching.length === 0) {
      callback(new Error(`No approved address for ${hostname}`));
      return;
    }
    if (normalizedOptions?.all) {
      callback(null, matching);
      return;
    }
    callback(null, matching[0].address, matching[0].family);
  };
}

async function fetchPoster(urlString, options = {}) {
  const { url, addresses } = await resolvePosterTarget(urlString, options);
  const transport = url.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const request = transport.get(url, {
      headers: {
        Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif',
        'User-Agent': 'SyncLounge poster proxy',
      },
      lookup: makePinnedLookup(addresses),
    }, (response) => {
      const statusCode = response.statusCode || 500;
      if (statusCode < 200 || statusCode >= 300) {
        response.resume();
        reject(new PosterProxyError(`Poster upstream returned ${statusCode}`));
        return;
      }

      const contentType = (response.headers['content-type'] || '').split(';')[0].toLowerCase();
      if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
        response.resume();
        reject(new PosterProxyError('Poster upstream did not return a supported image'));
        return;
      }

      const contentLength = Number.parseInt(response.headers['content-length'], 10);
      if (Number.isFinite(contentLength) && contentLength > MAX_POSTER_BYTES) {
        response.resume();
        reject(new PosterProxyError('Poster upstream response is too large'));
        return;
      }

      const chunks = [];
      let totalBytes = 0;
      response.on('data', (chunk) => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_POSTER_BYTES) {
          response.destroy(new PosterProxyError('Poster upstream response is too large'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => resolve({
        body: Buffer.concat(chunks),
        contentType,
      }));
      response.on('error', reject);
    });

    request.setTimeout(10000, () => {
      request.destroy(new PosterProxyError('Poster upstream timed out'));
    });
    request.on('error', reject);
  });
}

module.exports = {
  MAX_POSTER_BYTES,
  PosterProxyError,
  fetchPoster,
  isPrivateAddress,
  resolvePosterTarget,
};
