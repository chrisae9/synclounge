import {
  beforeEach, afterEach, expect, it, vi,
} from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createStore } from 'vuex';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';
import SignIn from '@/views/SignIn.vue';
import mutations from '@/store/modules/plex/mutations';
import getters from '@/store/modules/plex/getters';
import { canAutoUpdatePwa } from '@/pwa';

let wrapper;
beforeEach(() => { sessionStorage.clear(); });
afterEach(() => { wrapper?.unmount(); wrapper = null; });
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
const setup = (init, request = vi.fn().mockResolvedValue()) => {
  const store = createStore({
    getters: { GET_CONFIG: () => ({}) },
    modules: {
      plex: {
        namespaced: true,
        state: { pendingAuthenticationCount: 0, plexAuthToken: null },
        mutations,
        getters: { ...getters, IS_USER_AUTHORIZED: () => false, GET_PLEX_AUTH_TOKEN: () => null },
        actions: {
          FETCH_PLEX_INIT_AUTH: () => init(),
          REQUEST_PLEX_AUTH_TOKEN: () => request(),
          FETCH_PLEX_DEVICES_IF_NEEDED: vi.fn(),
        },
      },
      plexservers: { namespaced: true, actions: { FETCH_AND_SET_RANDOM_BACKGROUND_IMAGE: vi.fn() } },
    },
  });
  wrapper = mount(SignIn, {
    global: {
      plugins: [store, createVuetify({ components, directives })],
      mocks: {
        $route: { query: {} },
        $router: {
          push: vi.fn().mockResolvedValue(),
          resolve: (path) => ({ fullPath: path, matched: [{ meta: { requiresAuth: true } }] }),
        },
      },
    },
  });
  return store;
};

it('renders connection recovery and prevents another submission while retrying', async () => {
  const retry = deferred();
  const init = vi.fn().mockRejectedValueOnce(new Error('offline')).mockReturnValueOnce(retry.promise);
  setup(init);
  await flushPromises();
  expect(wrapper.get('[role="alert"]').text()).toContain('Couldn’t connect to Plex');
  const button = wrapper.findAll('button').find((node) => node.text().includes('Retry connection'));
  await button.trigger('click');
  expect(init).toHaveBeenCalledTimes(2);
  expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  expect(wrapper.findAll('button').find((node) => node.text().includes('Continue with Plex'))
    .attributes('disabled')).toBeDefined();
  retry.resolve({ id: 'sample', code: 'sample' });
  await flushPromises();
  expect(wrapper.findAll('button').find((node) => node.text().includes('Continue with Plex'))
    .attributes('disabled')).toBeUndefined();
});

it.each(['redirect', 'cookie'])('blocks automatic updates throughout deferred %s authentication', async (flow) => {
  const lookup = deferred();
  const state = { pendingAuthenticationCount: 0 };
  const safe = () => canAutoUpdatePwa({
    route: { name: 'SignIn' }, authenticating: getters.IS_AUTHENTICATING(state),
  });
  const context = {
    BEGIN_AUTHENTICATION: () => mutations.BEGIN_AUTHENTICATION(state),
    END_AUTHENTICATION: () => mutations.END_AUTHENTICATION(state),
    REQUEST_PLEX_AUTH_TOKEN: () => lookup.promise,
    FETCH_PLEX_USER: () => lookup.promise,
    FETCH_PLEX_DEVICES_IF_NEEDED: vi.fn().mockResolvedValue(),
    FETCH_AND_SET_RANDOM_BACKGROUND_IMAGE: vi.fn(),
    SET_PLEX_AUTH_TOKEN: vi.fn(),
    fetchInitialAuthCode: vi.fn().mockResolvedValue(),
    redirect: vi.fn().mockResolvedValue(),
    getSafeRedirect: () => '/',
    $router: { push: vi.fn().mockResolvedValue() },
  };
  sessionStorage.setItem('plex_auth_pin', JSON.stringify({ id: 123, redirect: '/' }));
  const operation = flow === 'redirect'
    ? SignIn.methods.completeRedirectAuth.call(context, { id: 123, redirect: '/' })
    : SignIn.methods.cookieAuth.call(context, 'sample-token');
  expect(safe()).toBe(false);
  expect(sessionStorage.getItem('plex_auth_pin')).not.toBeNull();
  lookup.resolve();
  await operation;
  expect(safe()).toBe(true);
  if (flow === 'redirect') expect(sessionStorage.getItem('plex_auth_pin')).toBeNull();
});

it('retains the saved PIN when authentication fails', async () => {
  const store = setup(vi.fn().mockResolvedValue({ id: 'sample', code: 'sample' }));
  await flushPromises();
  sessionStorage.setItem('plex_auth_pin', '{"id":123}');
  const context = {
    ...wrapper.vm,
    REQUEST_PLEX_AUTH_TOKEN: vi.fn().mockRejectedValue(new Error('offline')),
    fetchInitialAuthCode: vi.fn().mockResolvedValue(),
  };
  await SignIn.methods.completeRedirectAuth.call(context, { id: 123 });
  expect(sessionStorage.getItem('plex_auth_pin')).toBe('{"id":123}');
  expect(store.getters['plex/IS_AUTHENTICATING']).toBe(false);
});

it('keeps the saved PIN and update guard through the mounted redirect-return flow', async () => {
  const token = deferred();
  sessionStorage.setItem('plex_auth_pin', '{"id":123,"redirect":"/"}');
  const store = setup(vi.fn(), () => token.promise);
  expect(store.getters['plex/IS_AUTHENTICATING']).toBe(true);
  expect(sessionStorage.getItem('plex_auth_pin')).not.toBeNull();
  token.resolve();
  await flushPromises();
  expect(store.getters['plex/IS_AUTHENTICATING']).toBe(false);
  expect(sessionStorage.getItem('plex_auth_pin')).toBeNull();
});
