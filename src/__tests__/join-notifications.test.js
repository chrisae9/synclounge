import {
  afterEach, describe, expect, it, vi,
} from 'vitest';
import eventhandlers from '@/store/modules/synclounge/eventhandlers';

afterEach(() => vi.unstubAllGlobals());

const joinWithNotifications = async ({ play, notification }) => {
  vi.resetModules();
  vi.stubGlobal('Audio', class { play = play; });
  vi.stubGlobal('Notification', notification);
  const actions = (await import('@/store/modules/synclounge/actions')).default;
  const commit = vi.fn();
  const getters = {
    ARE_SOUND_NOTIFICATIONS_ENABLED: true,
    ARE_NOTIFICATIONS_ENABLED: true,
    GET_MESSAGES_USER_CACHE_USER: () => ({ username: 'Guest', thumb: '' }),
  };
  const dispatch = vi.fn((type, payload) => (type === 'ADD_MESSAGE_AND_CACHE_AND_NOTIFY'
    ? actions[type]({ getters, dispatch }, payload) : Promise.resolve()));
  await eventhandlers.HANDLE_USER_JOINED({ getters, commit, dispatch }, {
    id: 'guest', username: 'Guest',
  });
  expect(commit).toHaveBeenCalledWith('SET_USER', {
    id: 'guest', data: { username: 'Guest', updatedAt: expect.any(Number) },
  });
  expect(dispatch).toHaveBeenCalledWith('ADD_MESSAGE_AND_CACHE', {
    senderId: 'guest', text: 'Guest joined',
  });
};

describe('join notification failures', () => {
  it('preserves the join message when audio playback is rejected and Notification is absent', async () => {
    await joinWithNotifications({
      play: vi.fn().mockRejectedValue(new DOMException('Blocked', 'NotAllowedError')),
      notification: undefined,
    });
  });

  it('preserves the join message when desktop notification construction throws', async () => {
    // A constructible mock is needed because production calls new Notification().
    // eslint-disable-next-line prefer-arrow-callback
    const notification = vi.fn(function NotificationMock() {
      throw new TypeError('Illegal constructor');
    });
    notification.permission = 'granted';
    await joinWithNotifications({ play: vi.fn().mockResolvedValue(undefined), notification });
    expect(notification).toHaveBeenCalledWith('Guest', { body: 'Guest joined', icon: '' });
  });

  it('does not request notification permission in response to another participant joining', async () => {
    const notification = vi.fn();
    notification.permission = 'default';
    notification.requestPermission = vi.fn();
    await joinWithNotifications({ play: vi.fn().mockResolvedValue(undefined), notification });
    expect(notification.requestPermission).not.toHaveBeenCalled();
    expect(notification).not.toHaveBeenCalled();
  });

  it('still sends notifications when permission is granted', async () => {
    const notification = vi.fn();
    notification.permission = 'granted';
    const play = vi.fn().mockResolvedValue(undefined);
    await joinWithNotifications({ play, notification });
    expect(play).toHaveBeenCalled();
    expect(notification).toHaveBeenCalledWith('Guest', { body: 'Guest joined', icon: '' });
  });
});
