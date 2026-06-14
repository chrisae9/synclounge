import {
  describe, it, expect, vi,
} from 'vitest';
import slplayerGetters from '@/store/modules/slplayer/getters';

vi.mock('@/utils/mediasupport', () => ({
  isVideoSupported: vi.fn(({ codec }) => codec !== 'vp9'),
  isAudioSupported: vi.fn(({ codec }) => codec === 'aac'),
  isContainerSupported: vi.fn(({ container }) => container === 'mp4'),
}));

describe('slplayer Plex profile extras', () => {
  it('uses Plex Web-style DASH profile extras for browser-supported HEVC playback', () => {
    const getters = {
      GET_STREAMING_PROTOCOL: 'dash',
      GET_FORCE_TRANSCODE: false,
      GET_STREAMS: [
        { streamType: 1, codec: 'hevc', bitDepth: 10 },
      ],
      GET_HEVC_VIDEO_STREAM: { streamType: 1, codec: 'hevc', bitDepth: 10 },
      GET_CAN_DIRECT_STREAM_HEVC_VIDEO: true,
    };
    const rootGetters = {
      'settings/GET_SLPLAYERQUALITY': null,
    };

    const extras = slplayerGetters.GET_PLEX_PROFILE_EXTRAS({}, getters, {}, rootGetters);

    expect(extras).toContain('protocol=dash');
    expect(extras).toContain('videoCodec=hevc');
    expect(extras).toContain('videoCodec=h264%2Chevc');
    expect(extras).toContain('audioCodec=aac');
    expect(extras).toContain('scope=videoCodec&scopeName=hevc');
    expect(extras).toContain('name=video.bitDepth&value=10');
    expect(extras).toContain('scope=videoTranscodeTarget&scopeName=hevc');
    expect(extras).toContain('name=video.colorTrc');
  });

  it('uses DASH direct-stream video with AAC audio transcode for supported HEVC browsers', () => {
    const state = { session: 'test-session' };
    const getters = {
      GET_MEDIA_INDEX: 0,
      GET_STREAMING_PROTOCOL: 'dash',
      CAN_DIRECT_PLAY: false,
      GET_FORCE_TRANSCODE: false,
      GET_SHOULD_FORCE_VIDEO_TRANSCODE: false,
      GET_HEVC_VIDEO_STREAM: { streamType: 1, codec: 'hevc', bitDepth: 10 },
      GET_CAN_DIRECT_STREAM_HEVC_VIDEO: true,
      GET_PLEX_SERVER_LOCATION: 'wan',
      GET_SUBTITLE_PARAMS: { subtitles: 'auto', advancedSubtitles: 'text' },
      GET_X_PLEX_SESSION_ID: 'plex-session',
      GET_PLEX_PROFILE_EXTRAS: 'profile-extra',
      GET_PLEX_SERVER_ACCESS_TOKEN: 'token',
    };
    const rootGetters = {
      'plexclients/GET_ACTIVE_MEDIA_METADATA': { key: '/library/metadata/20957' },
      'settings/GET_SLPLAYERQUALITY': null,
      'plex/GET_PLEX_BASE_PARAMS': () => ({ 'X-Plex-Token': 'token' }),
    };

    const params = slplayerGetters.GET_DECISION_AND_START_PARAMS(state, getters, {}, rootGetters);

    expect(params.protocol).toBe('dash');
    expect(params.directPlay).toBe(0);
    expect(params.directStream).toBe(1);
    expect(params.directStreamAudio).toBe(0);
    expect(params.autoAdjustSubtitle).toBe(1);
    expect(params.videoCodec).toBeUndefined();
    expect(params.audioCodec).toBeUndefined();
  });

  it('forces H.264/AAC transcode when HEVC video cannot be direct-streamed', () => {
    const state = { session: 'test-session' };
    const getters = {
      GET_MEDIA_INDEX: 0,
      GET_STREAMING_PROTOCOL: 'dash',
      CAN_DIRECT_PLAY: false,
      GET_FORCE_TRANSCODE: false,
      GET_SHOULD_FORCE_VIDEO_TRANSCODE: true,
      GET_HEVC_VIDEO_STREAM: { streamType: 1, codec: 'hevc', bitDepth: 10 },
      GET_CAN_DIRECT_STREAM_HEVC_VIDEO: false,
      GET_PLEX_SERVER_LOCATION: 'wan',
      GET_SUBTITLE_PARAMS: { subtitles: 'auto', advancedSubtitles: 'text' },
      GET_X_PLEX_SESSION_ID: 'plex-session',
      GET_PLEX_PROFILE_EXTRAS: 'profile-extra',
      GET_PLEX_SERVER_ACCESS_TOKEN: 'token',
    };
    const rootGetters = {
      'plexclients/GET_ACTIVE_MEDIA_METADATA': { key: '/library/metadata/20957' },
      'settings/GET_SLPLAYERQUALITY': null,
      'plex/GET_PLEX_BASE_PARAMS': () => ({ 'X-Plex-Token': 'token' }),
    };

    const params = slplayerGetters.GET_DECISION_AND_START_PARAMS(state, getters, {}, rootGetters);

    expect(params.directPlay).toBe(0);
    expect(params.directStream).toBe(0);
    expect(params.directStreamAudio).toBe(0);
    expect(params.videoCodec).toBe('h264');
    expect(params.audioCodec).toBe('aac');
  });

  it('keeps high-bitrate supported HEVC browser playback on DASH instead of falling back to HLS', () => {
    const getters = {
      IS_IN_BUGGY_CHROME_STATE: true,
      GET_HEVC_VIDEO_STREAM: { streamType: 1, codec: 'hevc', bitDepth: 10 },
      GET_CAN_DIRECT_STREAM_HEVC_VIDEO: true,
    };
    const rootGetters = {
      GET_BROWSER: { os: 'macOS' },
    };
    const state = { streamingProtocol: 'dash' };

    const protocol = slplayerGetters.GET_STREAMING_PROTOCOL(state, getters, {}, rootGetters);

    expect(protocol).toBe('dash');
  });
});
