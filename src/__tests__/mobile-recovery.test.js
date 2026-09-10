import {
  afterEach, describe, expect, it, vi,
} from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { finishRecovery } from '@/utils/connectionstatus';
import ConnectionStatus from '@/components/ConnectionStatus.vue';
import eventhandlers from '@/store/modules/synclounge/eventhandlers';
import { buildProblemReport } from '@/utils/problemreport';
import settingsState from '@/store/modules/settings/state';
import settingsGetters from '@/store/modules/settings/getters';
import settingsMutations from '@/store/modules/settings/mutations';

vi.mock('@/socket', () => ({ emit: vi.fn(), waitForEvent: vi.fn(), getId: () => 'reconnected' }));

afterEach(() => { finishRecovery(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('mobile recovery and diagnostics', () => {
  it('keeps quick recovery quiet and shows then clears delayed connection status', async () => {
    vi.useFakeTimers();
    const wrapper = mount(ConnectionStatus);
    const context = { dispatch: vi.fn(), commit: vi.fn() };
    await eventhandlers.HANDLE_DISCONNECT(context);
    await vi.advanceTimersByTimeAsync(1000);
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    await eventhandlers.HANDLE_RECONNECT(context);
    expect(context.dispatch).toHaveBeenCalledWith('JOIN_ROOM_AND_INIT', { reconnecting: true });
    expect(context.dispatch).not.toHaveBeenCalledWith('DISPLAY_NOTIFICATION', expect.anything(), expect.anything());
    await vi.advanceTimersByTimeAsync(2000);
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    await eventhandlers.HANDLE_DISCONNECT(context);
    await vi.advanceTimersByTimeAsync(1500);
    expect(wrapper.get('[role="status"]').text()).toContain('Reconnecting');
    await eventhandlers.HANDLE_RECONNECT(context);
    await nextTick();
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    wrapper.unmount();
  });
  it('captures a report when optional mobile APIs and safe-area values are missing', () => {
    vi.stubGlobal('visualViewport', undefined);
    vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '' }));
    const report = buildProblemReport({});
    expect(report.environment.capabilities.visualViewport).toBe(false);
    expect(Object.values(report.environment.safeArea)).toEqual(['0px', '0px', '0px', '0px']);
  });
  it('captures visual viewport and safe area without copying arbitrary browser data', () => {
    vi.stubGlobal('visualViewport', {
      width: 390, height: 500, offsetTop: 59, scale: 1, secret: 'excluded',
    });
    vi.stubGlobal('document', { documentElement: {}, visibilityState: 'visible' });
    vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '59px' }));
    const report = buildProblemReport({});
    expect(report.environment.viewport.visualHeight).toBe(500);
    expect(report.environment.safeArea.top).toBe('59px');
    expect(JSON.stringify(report)).not.toContain('excluded');
  });
  it('defaults old and new preferences to Basic and allows Advanced', () => {
    const state = settingsState();
    expect(settingsGetters.GET_ADVANCED_PARTY_MODE({})).toBe(false);
    expect(settingsGetters.GET_ADVANCED_PARTY_MODE(state)).toBe(false);
    settingsMutations.SET_ADVANCED_PARTY_MODE(state, true);
    expect(settingsGetters.GET_ADVANCED_PARTY_MODE(state)).toBe(true);
  });
});
