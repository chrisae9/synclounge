import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createStore } from 'vuex';
import TheAppBarCrumbs from '@/components/TheAppBarCrumbs.vue';
import TheAppHeader from '@/components/TheAppHeader.vue';

const button = {
  props: ['to'],
  template: '<button :data-route="JSON.stringify(to)"><slot /></button>',
};
const stubs = {
  VBtn: button,
  VIcon: { template: '<i><slot /></i>' },
  VBreadcrumbs: { template: '<div><slot /></div>' },
};
const crumbs = (metadata) => mount(TheAppBarCrumbs, {
  global: {
    plugins: [createStore({
      modules: {
        plexservers: { namespaced: true, getters: { GET_PLEX_SERVER: () => () => ({ name: 'Friends library' }) } },
      },
      getters: {
        GET_ACTIVE_METADATA: () => metadata,

        'synclounge/GET_ROOM': () => 'movie-night',
        'synclounge/GET_SERVER': () => 'https://coordination.invalid',
      },
    })],
    mocks: { $vuetify: { display: { smAndDown: true } } },
    stubs,
  },
});

describe('compact library navigation', () => {
  it('identifies library home without an unnecessary back action', () => {
    const wrapper = crumbs(null);
    expect(wrapper.get('[aria-current="page"]').text()).toContain('Library home');
    expect(wrapper.find('button').exists()).toBe(false);
    wrapper.unmount();
  });
  it('links back to the parent while retaining the room and coordination server', () => {
    const wrapper = crumbs({
      machineIdentifier: 'plex-1', ratingKey: '7', title: 'A long movie title', type: 'movie',
    });
    const back = wrapper.get('button');
    expect(back.attributes('aria-label')).toBe('Back to Friends library');
    expect(JSON.parse(back.attributes('data-route'))).toEqual({
      name: 'PlexServer',
      params: {
        machineIdentifier: 'plex-1', room: 'movie-night', server: 'https://coordination.invalid',
      },
    });
    expect(wrapper.get('[aria-current="page"]').text()).toBe('A long movie title');
    wrapper.unmount();
  });
  it('keeps header navigation and invite actions operable', async () => {
    const wrapper = mount(TheAppHeader, {
      props: { inviteUrl: 'https://fixture.invalid/room' },
      global: {
        mocks: { $vuetify: { display: { smAndDown: true } } },
        stubs: {
          ...stubs,
          VAppBar: { template: '<header><slot /></header>' },
          VAppBarNavIcon: button,
          VSpacer: true,
          RouterLink: true,
        },
      },
    });
    await wrapper.get('[aria-label="Open navigation"]').trigger('click');
    await wrapper.get('[aria-label="Copy room invite link"]').trigger('click');
    expect(wrapper.emitted('toggle-navigation')).toHaveLength(1);
    expect(wrapper.emitted('copy-invite')).toHaveLength(1);
    await wrapper.setProps({ navigationOpen: true, inviteUrl: '' });
    expect(wrapper.get('[aria-label="Close navigation"]').attributes('aria-expanded')).toBe('true');
    expect(wrapper.find('[aria-label="Copy room invite link"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
