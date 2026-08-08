export const combineUrl = (url, base) => {
  const fixedBase = new URL(base);
  if (!fixedBase.pathname.endsWith('/')) {
    fixedBase.pathname = `${fixedBase.pathname}/`;
  }

  return new URL(url, fixedBase);
};

export const combineRelativeUrlParts = (base, path) => (!base
  ? `${base}${path}`
  : `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`);
