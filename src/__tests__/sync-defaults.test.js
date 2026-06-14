import { describe, it, expect } from 'vitest';
import defaults from '../../config/defaults';

describe('sync defaults', () => {
  it('uses gentle playback-rate correction by default', () => {
    expect(defaults.slplayer_speed_sync_rate).toBeLessThanOrEqual(0.05);
  });

  it('only allows playback-rate correction for sub-second drift by default', () => {
    expect(defaults.slplayer_speed_sync_max_correction).toBeLessThanOrEqual(500);
  });
});
