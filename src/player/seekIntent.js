// Each request owns its marker, so deferred cleanup cannot erase a newer seek.
let pendingIntent = null;
let userSeekRevision = 0;

export const getUserSeekRevision = () => userSeekRevision;

export const recordSeekIntent = (userInitiated = false) => {
  if (userInitiated) userSeekRevision += 1;
  pendingIntent = userInitiated ? {} : null;
  return pendingIntent;
};

export const hasPendingUserSeek = () => pendingIntent !== null;

export const clearSeekIntent = (intent) => {
  if (pendingIntent === intent) pendingIntent = null;
};

// Media events describe what the decoder did, not who requested it.
export const consumeUserSeekIntent = () => {
  const userInitiated = hasPendingUserSeek();
  pendingIntent = null;
  return userInitiated;
};
