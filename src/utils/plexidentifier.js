// Plex library identifiers occupy one path segment. Reject URL syntax before
// constructing requests, even when the metadata came from another room member.
const plexIdentifier = (value) => {
  const validType = typeof value === 'string' || (Number.isSafeInteger(value) && value >= 0);
  if (!validType || !/^[A-Za-z0-9_-]{1,500}$/.test(String(value))) {
    throw new TypeError('Invalid Plex metadata identifier');
  }
  return encodeURIComponent(String(value));
};

export default plexIdentifier;
