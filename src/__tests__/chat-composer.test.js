import {
  describe, expect, it, vi,
} from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createStore } from 'vuex';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';
import MessageInput from '@/components/MessageInput.vue';

const createComposer = (send) => ({
  ...MessageInput.data(),
  messageToBeSent: '  Hello everyone  ',
  SEND_MESSAGE: send,
});

describe('room chat composer', () => {
  it('sends trimmed text once while a message is pending', async () => {
    let finish;
    const send = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    const composer = createComposer(send);
    const pending = MessageInput.methods.sendMessage.call(composer);
    await MessageInput.methods.sendMessage.call(composer);
    expect(send).toHaveBeenCalledExactlyOnceWith('Hello everyone');
    expect(composer.sending).toBe(true);
    finish();
    await pending;
    expect(composer.messageToBeSent).toBe('');
    expect(composer.sending).toBe(false);
  });

  it('keeps a new draft typed while the previous message sends', async () => {
    let finish;
    const composer = createComposer(() => new Promise((resolve) => { finish = resolve; }));
    const pending = MessageInput.methods.sendMessage.call(composer);
    composer.messageToBeSent = 'Next message';
    finish();
    await pending;
    expect(composer.messageToBeSent).toBe('Next message');
  });

  it('keeps the draft available for retry after a failed send', async () => {
    const composer = createComposer(vi.fn().mockRejectedValue(new Error('Disconnected')));
    await expect(MessageInput.methods.sendMessage.call(composer)).rejects.toThrow('Disconnected');
    expect(composer.messageToBeSent).toBe('  Hello everyone  ');
    expect(composer.sending).toBe(false);
  });

  it('does not submit Enter while text composition is active', () => {
    const preventDefault = vi.fn();
    MessageInput.methods.handleEnter({ isComposing: true, preventDefault });
    expect(preventDefault).not.toHaveBeenCalled();
  });
});

const mountComposer = (send) => {
  const store = createStore({
    modules: {
      synclounge: { namespaced: true, actions: { SEND_MESSAGE: (_context, text) => send(text) } },
    },
  });
  return mount(MessageInput, {
    attachTo: document.body,
    global: { plugins: [store, createVuetify({ components, directives })] },
  });
};

describe('Vuetify chat input interaction', () => {
  it('sends once through the real append-inner button click', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountComposer(send);
    try {
      await wrapper.get('input').setValue('Button message');
      await wrapper.get('button[aria-label="Send message"]').trigger('click');
      await flushPromises();
      expect(send).toHaveBeenCalledExactlyOnceWith('Button message');
      expect(wrapper.get('input').element.value).toBe('');
    } finally {
      wrapper.unmount();
    }
  });

  it('sends once when Enter is pressed inside the real text field', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountComposer(send);
    try {
      await wrapper.get('input').setValue('Keyboard message');
      await wrapper.get('input').trigger('keydown', { key: 'Enter' });
      await flushPromises();
      expect(send).toHaveBeenCalledExactlyOnceWith('Keyboard message');
      expect(wrapper.get('input').element.value).toBe('');
    } finally {
      wrapper.unmount();
    }
  });

  it.each([
    { isComposing: true, keyCode: 13 },
    { isComposing: false, keyCode: 229 },
  ])('leaves composing Enter untouched: %j', async ({ isComposing, keyCode }) => {
    const send = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountComposer(send);
    try {
      await wrapper.get('input').setValue('まだ入力中');
      const event = new KeyboardEvent('keydown', {
        key: 'Enter', isComposing, keyCode, bubbles: true, cancelable: true,
      });
      wrapper.get('input').element.dispatchEvent(event);
      await flushPromises();
      expect(event.defaultPrevented).toBe(false);
      expect(send).not.toHaveBeenCalled();
      expect(wrapper.get('input').element.value).toBe('まだ入力中');
    } finally {
      wrapper.unmount();
    }
  });
});
