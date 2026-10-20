export const shouldApplyAutojoin = (to, config) => Boolean(
  config?.autojoin
  && to.name === 'RoomCreation'
  && to.fullPath === '/',
);

export const getEmptyPlayerRedirect = (to, activeMedia) => (
  to.name === 'WebPlayer' && !activeMedia
    ? {
      name: 'PlexHome',
      params: to.params,
      query: { playback: 'unavailable' },
      replace: true,
    }
    : null
);

export const getSignInRoute = (route) => ({
  name: 'SignIn',
  ...(route?.matched?.some((record) => record.meta.requiresAuth) && {
    query: {
      redirect: route.fullPath,
    },
  }),
});

export const getRoomJoinRedirect = (to) => (to.params.room ? {
  name: 'RoomJoin',
  params: { room: to.params.room, ...(to.params.server && { server: to.params.server }) },
  query: { redirect: to.fullPath },
} : { name: 'RoomCreation' });

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
