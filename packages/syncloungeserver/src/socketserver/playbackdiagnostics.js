const MAX_DEPTH = 4;
const MAX_ARRAY_LENGTH = 8;
const MAX_STRING_LENGTH = 300;
const MAX_LEAVES = 140;

const streamSchema = {
  streamType: true,
  codec: true,
  profile: true,
  level: true,
  bitDepth: true,
  bitrate: true,
  width: true,
  height: true,
  frameRate: true,
  colorPrimaries: true,
  colorSpace: true,
  colorTrc: true,
  decision: true,
  selected: true,
};

// Diagnostic payloads are untrusted. Enumerate only fields the client emits so a future
// nested object (for example playback.accessToken) cannot accidentally reach the logs.
const diagnosticSchema = {
  event: true,
  clientTimestamp: true,
  details: {
    episode: true,
    durationMs: true,
    name: true,
    message: true,
    severity: true,
    category: true,
    code: true,
    data: [true],
  },
  browser: {
    name: true,
    version: true,
    os: true,
    type: true,
    userAgent: true,
  },
  sessions: {
    plex: true,
    transcode: true,
  },
  playback: {
    attached: true,
    currentTime: true,
    duration: true,
    paused: true,
    ended: true,
    seeking: true,
    readyState: true,
    networkState: true,
    playbackRate: true,
    videoWidth: true,
    videoHeight: true,
    bufferedRanges: [{ start: true, end: true }],
    bufferAhead: true,
    mediaQuality: {
      totalVideoFrames: true,
      droppedVideoFrames: true,
      corruptedVideoFrames: true,
    },
    mediaError: { code: true, message: true },
    shaka: {
      currentCodecs: true,
      streamBandwidth: true,
      estimatedBandwidth: true,
      decodedFrames: true,
      droppedFrames: true,
      corruptedFrames: true,
      stallsDetected: true,
      gapsJumped: true,
      playTime: true,
      pauseTime: true,
      bufferingTime: true,
      bytesDownloaded: true,
      nonFatalErrorCount: true,
      maxSegmentDuration: true,
      completionPercent: true,
    },
  },
  stream: {
    ratingKey: true,
    sourceVideo: streamSchema,
    sourceAudio: streamSchema,
    videoSupport: { codec: true, mime: true, supported: true },
    request: {
      protocol: true,
      directPlay: true,
      directStream: true,
      directStreamAudio: true,
      videoCodec: true,
      audioCodec: true,
      maxVideoBitrate: true,
      forceTranscode: true,
      allowDirectPlay: true,
      canDirectStreamHevc: true,
    },
    decision: {
      part: true,
      video: streamSchema,
      audio: streamSchema,
      directPlayCode: true,
      transcodeCode: true,
    },
  },
};

const sanitizeString = (value) => [...value.slice(0, MAX_STRING_LENGTH)]
  .map((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint <= 31 || codePoint === 127 ? ' ' : character;
  })
  .join('');

const sanitizeValue = (value, schema, depth, budget) => {
  if (!budget.hasRemaining() || depth > MAX_DEPTH || value == null) {
    return value == null ? null : undefined;
  }

  if (schema === true) {
    if (typeof value === 'string') {
      budget.consume();
      return sanitizeString(value);
    }

    if (typeof value === 'number') {
      budget.consume();
      return Number.isFinite(value) ? value : null;
    }

    if (typeof value === 'boolean') {
      budget.consume();
      return value;
    }

    return undefined;
  }

  if (Array.isArray(schema)) {
    if (!Array.isArray(value)) return undefined;
    return value.slice(0, MAX_ARRAY_LENGTH)
      .map((item) => sanitizeValue(item, schema[0], depth + 1, budget))
      .filter((item) => item !== undefined);
  }

  if (typeof schema === 'object' && typeof value === 'object' && !Array.isArray(value)) {
    const sanitized = {};
    Object.entries(schema).forEach(([key, childSchema]) => {
      if (!(key in value)) return;
      const cleanItem = sanitizeValue(value[key], childSchema, depth + 1, budget);
      if (cleanItem !== undefined) sanitized[key] = cleanItem;
    });
    return sanitized;
  }

  return undefined;
};

export const sanitizePlaybackDiagnostic = (data) => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;

  let remainingLeaves = MAX_LEAVES;
  const budget = {
    hasRemaining: () => remainingLeaves > 0,
    consume: () => { remainingLeaves -= 1; },
  };
  const sanitized = sanitizeValue(data, diagnosticSchema, 0, budget);

  if (typeof sanitized.event !== 'string' || sanitized.event.length === 0) return null;
  sanitized.event = sanitized.event.toLowerCase().replace(/[^a-z0-9._-]/g, '-').slice(0, 64);
  return sanitized;
};

export default sanitizePlaybackDiagnostic;
