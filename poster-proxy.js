const dns = require('node:dns').promises;
const http = require('node:http');
const https = require('node:https');
const ipaddr = require('ipaddr.js');

const MAX_POSTER_BYTES = 5 * 1024 * 1024;
const MAX_POSTER_TIMEOUT_MS = 2_147_483_647;
const MAX_PENDING_DNS_LOOKUPS = 32;
let pendingDnsLookups = 0;
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
  if (pendingDnsLookups >= MAX_PENDING_DNS_LOOKUPS) {
    throw new PosterProxyError('Poster DNS resolver is busy', 503);
  }

  let records;
  pendingDnsLookups += 1;
  try {
    records = await lookup(hostname, { all: true, verbatim: true });
  } finally {
    pendingDnsLookups -= 1;
  }
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
  const { signal, timeoutMs = 10000 } = options;

  if (signal?.aborted) {
    throw new PosterProxyError('Poster request was aborted');
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_POSTER_TIMEOUT_MS) {
    throw new PosterProxyError(`Poster timeout must be between 1 and ${MAX_POSTER_TIMEOUT_MS}`);
  }

  const startedAt = Date.now();
  const {
    promise: resolutionCancelled,
    reject: rejectResolution,
  } = Promise.withResolvers();
  const resolutionDeadline = setTimeout(
    () => rejectResolution(new PosterProxyError('Poster upstream timed out')),
    timeoutMs,
  );
  const abortResolution = () => rejectResolution(new PosterProxyError('Poster request was aborted'));
  signal?.addEventListener('abort', abortResolution, { once: true });

  let target;
  try {
    target = await Promise.race([
      resolvePosterTarget(urlString, options),
      resolutionCancelled,
    ]);
  } finally {
    clearTimeout(resolutionDeadline);
    signal?.removeEventListener('abort', abortResolution);
  }

  if (signal?.aborted) {
    throw new PosterProxyError('Poster request was aborted');
  }

  const remainingMs = timeoutMs - (Date.now() - startedAt);
  if (remainingMs <= 0) {
    throw new PosterProxyError('Poster upstream timed out');
  }

  const { url, addresses } = target;
  const transport = url.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    let responseStream;
    let request;
    let settled = false;
    let deadline;
    let abortRequest = () => {};

    const cleanup = () => {
      clearTimeout(deadline);
      signal?.removeEventListener('abort', abortRequest);
    };

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };

    const fail = (error) => {
      if (settled) return;
      responseStream?.destroy();
      request.destroy();
      finish(reject, error);
    };

    abortRequest = () => {
      fail(new PosterProxyError('Poster request was aborted'));
    };

    request = transport.get(url, {
      headers: {
        Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif',
        'User-Agent': 'SyncLounge poster proxy',
      },
      lookup: makePinnedLookup(addresses),
    }, (response) => {
      responseStream = response;
      const statusCode = response.statusCode || 500;
      if (statusCode < 200 || statusCode >= 300) {
        fail(new PosterProxyError(`Poster upstream returned ${statusCode}`));
        return;
      }

      const contentType = (response.headers['content-type'] || '').split(';')[0].toLowerCase();
      if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
        fail(new PosterProxyError('Poster upstream did not return a supported image'));
        return;
      }

      const contentLength = Number.parseInt(response.headers['content-length'], 10);
      if (Number.isFinite(contentLength) && contentLength > MAX_POSTER_BYTES) {
        fail(new PosterProxyError('Poster upstream response is too large'));
        return;
      }

      const chunks = [];
      let totalBytes = 0;
      response.on('data', (chunk) => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_POSTER_BYTES) {
          fail(new PosterProxyError('Poster upstream response is too large'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => finish(resolve, {
        body: Buffer.concat(chunks),
        contentType,
      }));
      response.on('error', fail);
    });

    deadline = setTimeout(() => fail(new PosterProxyError('Poster upstream timed out')), remainingMs);
    request.setTimeout(remainingMs, () => fail(new PosterProxyError('Poster upstream timed out')));
    request.on('error', fail);
    signal?.addEventListener('abort', abortRequest, { once: true });
  });
}

module.exports = {
  MAX_PENDING_DNS_LOOKUPS,
  MAX_POSTER_BYTES,
  MAX_POSTER_TIMEOUT_MS,
  PosterProxyError,
  fetchPoster,
  isPrivateAddress,
  resolvePosterTarget,
};
