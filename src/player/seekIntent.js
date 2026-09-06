// Media events describe what the decoder did, not who requested it. Consume the
// latest explicit intent once; unrequested decoder recovery is never a party seek.
let userSeekPending = false;

export const recordSeekIntent = (userInitiated = false) => {
  userSeekPending = userInitiated;
};

export const consumeUserSeekIntent = () => {
  const userInitiated = userSeekPending;
  userSeekPending = false;
  return userInitiated;
};
