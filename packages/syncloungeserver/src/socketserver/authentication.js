import {
  createHmac, randomBytes, randomUUID, timingSafeEqual,
} from 'node:crypto';

// Each server instance verifies its own reconnect proofs. Public room identities
// contain no credential and cannot be used to mint a reconnect token.
export const createReconnectIdentity = () => {
  const secret = randomBytes(32);
  const sign = (identity) => createHmac('sha256', secret).update(identity).digest('hex');
  return (token) => {
    if (typeof token === 'string' && /^[a-f0-9-]{36}\.[a-f0-9]{64}$/.test(token)) {
      const [identity, signature] = token.split('.');
      if (timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(sign(identity), 'hex'))) {
        return { identity, token };
      }
    }
    const identity = randomUUID();
    return { identity, token: `${identity}.${sign(identity)}` };
  };
};

export const createSocketAuthentication = (authentication = { mechanism: 'none' }, fetchImpl = fetch) => {
  if (authentication.mechanism === 'none') return async () => {};
  if (authentication.mechanism !== 'plex'
    || !Array.isArray(authentication.type) || authentication.type.length === 0
    || authentication.type.some((type) => !['user', 'server'].includes(type))
    || !Array.isArray(authentication.authorized) || authentication.authorized.length === 0
    || authentication.authorized.some((entry) => typeof entry !== 'string' || !entry)) {
    throw new TypeError('Plex authentication requires user/server types and a non-empty authorized list');
  }
  const allowed = new Set(authentication.authorized);
  return async (token) => {
    if (typeof token !== 'string' || !token || token.length > 2048) throw new Error('Not authorized');
    const signal = AbortSignal.timeout(10000);
    const request = async (endpoint) => {
      const response = await fetchImpl(`https://plex.tv/api/v2/${endpoint}`, {
        headers: {
          Accept: 'application/json',
          'X-Plex-Product': 'SyncLounge',
          'X-Plex-Client-Identifier': 'synclounge-server',
          'X-Plex-Token': token,
        },
        signal,
        redirect: 'error',
      });
      if (!response.ok) throw new Error('Not authorized');
      return response.json();
    };
    if (authentication.type.includes('user')) {
      const user = await request('user');
      if (allowed.has(user.username) || allowed.has(user.email)) return;
    }
    if (authentication.type.includes('server')) {
      const resources = await request('resources?includeHttps=1');
      if (Array.isArray(resources) && resources.some((resource) => resource.provides?.split(',').includes('server')
        && allowed.has(resource.clientIdentifier))) return;
    }
    throw new Error('Not authorized');
  };
};
