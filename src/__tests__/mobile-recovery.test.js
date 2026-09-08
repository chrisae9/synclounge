import {
  afterEach, describe, expect, it, vi,
} from 'vitest';
import { beginRecovery, finishRecovery, connectionStatus } from '@/utils/connectionstatus';
import { buildProblemReport } from '@/utils/problemreport';
import settingsState from '@/store/modules/settings/state';
import settingsGetters from '@/store/modules/settings/getters';
import settingsMutations from '@/store/modules/settings/mutations';

afterEach(() => { finishRecovery(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('mobile recovery and diagnostics', () => {
  it('keeps quick reconnects quiet and clears a persistent recovery status', () => {
    vi.useFakeTimers();
    beginRecovery();
    vi.advanceTimersByTime(1000);
    expect(connectionStatus.recovering).toBe(false);
    finishRecovery();
    vi.advanceTimersByTime(2000);
    expect(connectionStatus.recovering).toBe(false);
    beginRecovery();
    vi.advanceTimersByTime(1500);
    expect(connectionStatus.recovering).toBe(true);
    finishRecovery();
    expect(connectionStatus.recovering).toBe(false);
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
