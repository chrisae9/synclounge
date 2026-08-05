const dns = require('node:dns').promises;
const http = require('node:http');
const https = require('node:https');
const ipaddr = require('ipaddr.js');

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

function isPrivateAddress(address) {
  try {
    const parsed = ipaddr.parse(address);
    if (parsed.kind() === 'ipv6' && parsed.isIPv4MappedAddress()) {
      return isPrivateAddress(parsed.toIPv4Address().toString());
    }
    return parsed.range() !== 'unicast';
  } catch {
    return true;
  }
}

async function resolvePosterTarget(urlString, {
  lookup = dns.lookup,
  allowedPrivateOrigin,
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

  const allowPrivate = allowedPrivateOrigin && url.origin === allowedPrivateOrigin;
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
