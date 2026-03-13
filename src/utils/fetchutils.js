export const makeUrl = (url, params) => {
  if (!params) {
    return url;
  }
  const queryStr = (new URLSearchParams(params)).toString();
  return `${url}?${queryStr}`;
};

export class PlexAuthError extends Error {
  constructor(status, statusText, url) {
    super(`${status} ${statusText}`);
    this.name = 'PlexAuthError';
    this.status = status;
    this.url = url;
  }
}

const safeFetch = async (...args) => {
  const response = await fetch(...args);
  if (!response.ok) {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
    console.warn(`HTTP ${response.status} ${response.statusText}: ${url}`);

    if ((response.status === 401 || response.status === 403)
      && url && url.includes('plex.tv')) {
      throw new PlexAuthError(response.status, response.statusText, url);
    }

    throw new Error(`${response.status} ${response.statusText}`);
  }

  return response;
};

export const queryFetch = (url, queryParams, init) => safeFetch(
  makeUrl(url, queryParams),
  init,
);

export const fetchText = async (...args) => {
  const response = await queryFetch(...args);
  return response.text();
};

export const fetchJson = async (url, queryParams, { headers, ...rest } = {}) => {
  const response = await queryFetch(
    url,
    queryParams,
    {
      headers: {
        Accept: 'application/json',
        ...headers,
      },
      ...rest,
    },
  );

  return response.json();
};

export const fetchXmlAndTransform = async (...args) => {
  const text = await fetchText(...args);

  const xmlutils = (await import('@/utils/xmlutils')).default;
  return xmlutils.parse(text);
};

export const fetchBodyReader = async (...args) => {
  const response = await queryFetch(...args);
  return response.body.getReader();
};
