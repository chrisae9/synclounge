import {
  afterEach, describe, expect, it, vi,
} from 'vitest';
import { isAudioSupported, isVideoSupported } from '@/utils/mediasupport';

describe('media support detection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses ManagedMediaSource when MediaSource is unavailable', () => {
    const isTypeSupported = vi.fn(() => true);
    vi.stubGlobal('MediaSource', undefined);
    vi.stubGlobal('ManagedMediaSource', { isTypeSupported });

    expect(isVideoSupported({
      codec: 'hevc',
      profile: 'main 10',
      level: 120,
    })).toBe(true);
    expect(isTypeSupported).toHaveBeenCalledWith(
      'video/mp4; codecs="hev1.2.2.L120.B0"',
    );
  });

  it('uses ManagedMediaSource for audio support checks', () => {
    const isTypeSupported = vi.fn(() => true);
    vi.stubGlobal('MediaSource', undefined);
    vi.stubGlobal('ManagedMediaSource', { isTypeSupported });

    expect(isAudioSupported({ codec: 'aac', profile: 'lc' })).toBe(true);
    expect(isTypeSupported).toHaveBeenCalledWith(
      'audio/mp4; codecs="mp4a.40.2"',
    );
  });
});
