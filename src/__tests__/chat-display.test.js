import { expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createStore } from 'vuex';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import MessageList from '@/components/MessageList.vue';

it('renders compact message rows with sender, time and literal multiline text', async () => {
  const text = 'First line\n<b>This stays text</b>\nA long message '.repeat(5);
  const store = createStore({
    modules: {
      synclounge: {
        namespaced: true,
        getters: {
          GET_MESSAGES: () => [{ senderId: 'me', time: 1000, text }],
          GET_SOCKET_ID: () => 'me',
          GET_MESSAGES_USER_CACHE_USER: () => () => ({ username: 'Sample viewer', thumb: '' }),
        },
      },
    },
  });
  const wrapper = mount(MessageList, { global: { plugins: [store, createVuetify({ components })] } });
  try {
    await vi.dynamicImportSettled();
    await flushPromises();
    const row = wrapper.get('[role="listitem"]');
    expect(row.element.tagName).toBe('ARTICLE');
    expect(row.get('.message-sender').text()).toBe('Sample viewer');
    expect(row.get('.message-time').text()).not.toBe('');
    expect(row.get('.message-content').element.textContent).toBe(text);
    expect(row.find('b').exists()).toBe(false);
  } finally { wrapper.unmount(); }
});
