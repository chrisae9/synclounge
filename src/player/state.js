let player = null;
let overlay = null;

export const getPlayer = () => {
  const castProxy = overlay?.getControls()?.getCastProxy();
  return castProxy ? castProxy.getPlayer() : player;
};

export const getRawPlayer = () => player;

export const setPlayer = (newPlayer) => {
  player = newPlayer;
};

export const getOverlay = () => overlay;
export const setOverlay = (newOverlay) => {
  overlay = newOverlay;
};

export const isCasting = () => {
  const castProxy = overlay?.getControls()?.getCastProxy();
  return castProxy ? castProxy.isCasting() : false;
};
