import { describe, it, expect } from 'vitest';
import { buildProblemReport, rememberDiagnostic, safeDiagnostic } from '@/utils/problemreport';

describe('copyable problem report', () => {
  it('excludes raw errors, URLs, credentials and chat while preserving diagnostic codes', () => {
    const result = safeDiagnostic({
      event: 'playback-error',
      accessToken: 'secret',
      messages: ['private chat'],
      details: { code: 1001, message: 'https://plex/?X-Plex-Token=secret', data: ['secret'] },
      playback: { currentTime: 10, mediaError: { code: 3, message: 'secret' } },
      sessions: { plex: 'correlation-id' },
    });
    expect(JSON.stringify(result)).not.toMatch(/secret|private chat|https/);
    expect(result.details.code).toBe(1001);
    expect(result.sessions.plex).toBe('correlation-id');
  });
  it('bounds history and snapshots it independently for a disconnected report', () => {
    for (let i = 0; i < 40; i += 1) rememberDiagnostic({ event: 'buffering-start', details: { episode: i } });
    const report = buildProblemReport({ version: 'test', connection: { connected: false } });
    expect(report.recent).toHaveLength(30);
    expect(report.recent[0].details.episode).toBe(10);
    report.recent[0].details.episode = 99;
    expect(buildProblemReport({}).recent[0].details.episode).toBe(10);
  });
});
