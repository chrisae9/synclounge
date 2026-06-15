export const shouldApplyAutojoin = (to, config) => Boolean(
  config?.autojoin
  && to.name === 'RoomCreation'
  && to.fullPath === '/',
);

const isEqualIfExpectedTrue = (expected, got) => (expected
  ? expected === got
  : !got);

const doesServerMatch = (expected, got) => expected.room === got.room
  && isEqualIfExpectedTrue(expected.server, got.server);

export const shouldRedirectProtectedRoute = (to, syncloungeState, socketConnected) => (
  to.matched.some((record) => record.meta.protected)
  && (!socketConnected
    || !syncloungeState.inRoom
    || !doesServerMatch({
      server: syncloungeState.server,
      room: syncloungeState.room,
    }, to.params))
);
