import { createApp } from 'vue';
import { rememberDiagnostic } from './utils/problemreport';

import vuetify from './plugins/vuetify';
import App from './App.vue';
import router from './router';
import store from './store';
import { startPwa, canAutoUpdatePwa } from './pwa';
import mapErrorMessage from './utils/errorutils';
import {
  getSignInRoute,
  getEmptyPlayerRedirect,
  shouldApplyAutojoin,
  shouldRedirectProtectedRoute,
  getRoomJoinRedirect,
} from './router/guardutils';
import { isConnected } from './socket';

const vChatScroll = {
  mounted(el) {
    const observer = new MutationObserver(() => {
      const threshold = 50;
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
      if (isNearBottom) {
        // eslint-disable-next-line no-param-reassign
        el.scrollTop = el.scrollHeight;
      }
    });
    observer.observe(el, { childList: true, subtree: true });
    // eslint-disable-next-line no-param-reassign
    el._chatScrollObserver = observer;
  },
  unmounted(el) {
    el._chatScrollObserver?.disconnect();
  },
};

const recordAppError = () => rememberDiagnostic({
  event: 'application-error', clientTimestamp: new Date().toISOString(),
});
document.addEventListener('visibilitychange', () => rememberDiagnostic({
  event: document.hidden ? 'app-backgrounded' : 'app-resumed',
  clientTimestamp: new Date().toISOString(),
}));
window.addEventListener('online', () => rememberDiagnostic({
  event: 'network-online', clientTimestamp: new Date().toISOString(),
}));
window.addEventListener('offline', () => rememberDiagnostic({
  event: 'network-offline', clientTimestamp: new Date().toISOString(),
}));
window.addEventListener('error', recordAppError);
window.addEventListener('unhandledrejection', recordAppError);

const app = createApp(App);
app.use(router).use(store).use(vuetify);
app.directive('chat-scroll', vChatScroll);

app.config.errorHandler = (err) => {
  // Suppress Vuetify v-img internal error during unmount (known race condition)
  if (err instanceof TypeError && err.message?.includes('naturalHeight')) {
    console.debug('Suppressed v-img unmount error:', err.message);
    return;
  }

  recordAppError();
  console.error(err);

  store.dispatch('DISPLAY_NOTIFICATION', {
    text: mapErrorMessage(err),
    color: 'error',
  });
};

router.beforeEach(async (to, from, next) => {
  if (!store.getters.GET_CONFIG) {
    await store.dispatch('FETCH_CONFIG');

    // This will only happen once per refresh of the page
    if (shouldApplyAutojoin(to, store.getters.GET_CONFIG)) {
      next({
        name: 'RoomJoin',
        params: store.getters.GET_CONFIG.autojoin,
      });
      return;
    }
  }

  if (store.getters['plex/IS_UNAUTHORIZED']
    && to.matched.some((record) => record.meta.requiresAuth)) {
    next(getSignInRoute(to));
  } else if (!store.getters['plex/GET_PLEX_AUTH_TOKEN']
    && to.matched.some((record) => record.meta.requiresPlexToken)) {
    next({ name: 'SignIn' });
  } else if (to.matched.some((record) => record.meta.requiresNoAuth)
    && store.getters['plex/GET_PLEX_AUTH_TOKEN'] && store.getters['plex/IS_USER_AUTHORIZED']) {
    next({ name: 'RoomCreation' });
  } else if (shouldRedirectProtectedRoute(to, {
    inRoom: store.getters['synclounge/IS_IN_ROOM'],
    server: store.getters['synclounge/GET_SERVER'],
    room: store.getters['synclounge/GET_ROOM'],
  }, isConnected())) {
    next(getRoomJoinRedirect(to));
  } else {
    next(getEmptyPlayerRedirect(to, store.getters['plexclients/GET_ACTIVE_MEDIA_METADATA'])
      || undefined);
  }
});

const stopPwa = startPwa({
  register: import.meta.env.PROD,
  ready: router.isReady(),
  canAutoUpdate: () => canAutoUpdatePwa({
    inRoom: store.getters['synclounge/IS_IN_ROOM'],
    authenticating: store.getters['plex/IS_AUTHENTICATING'],
    joiningRoom: store.getters['synclounge/IS_ROOM_JOIN_PENDING']
      || store.getters['synclounge/IS_JOIN_SYNC_IN_PROGRESS'],
    route: router.currentRoute.value,
  }),
});
if (import.meta.hot) import.meta.hot.dispose(stopPwa);

app.mount('#app');
