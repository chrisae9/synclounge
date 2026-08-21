const round = (value, digits = 3) => {
  if (!Number.isFinite(value)) return null;
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
};

const readBufferedRanges = (buffered) => {
  const ranges = [];
  if (!buffered) return ranges;

  for (let index = 0; index < Math.min(buffered.length, 8); index += 1) {
    ranges.push({
      start: round(buffered.start(index)),
      end: round(buffered.end(index)),
    });
  }
  return ranges;
};

const getBufferAhead = (ranges, currentTime) => {
  const activeRange = ranges.find(({ start, end }) => currentTime >= start - 0.05
    && currentTime <= end + 0.05);
  return activeRange ? round(Math.max(0, activeRange.end - currentTime)) : 0;
};

const selectShakaStats = (stats = {}) => Object.fromEntries([
  'currentCodecs',
  'streamBandwidth',
  'estimatedBandwidth',
  'decodedFrames',
  'droppedFrames',
  'corruptedFrames',
  'stallsDetected',
  'gapsJumped',
  'playTime',
  'pauseTime',
  'bufferingTime',
  'bytesDownloaded',
  'nonFatalErrorCount',
  'maxSegmentDuration',
  'completionPercent',
].filter((key) => stats[key] !== undefined)
  .map((key) => [key, typeof stats[key] === 'number' ? round(stats[key]) : stats[key]]));

export const buildPlaybackDiagnostics = ({ mediaElement, stats }) => {
  if (!mediaElement) return { attached: false, shaka: selectShakaStats(stats) };

  const currentTime = round(mediaElement.currentTime) ?? 0;
  const bufferedRanges = readBufferedRanges(mediaElement.buffered);
  const quality = mediaElement.getVideoPlaybackQuality?.();

  return {
    attached: true,
    currentTime,
    duration: round(mediaElement.duration),
    paused: Boolean(mediaElement.paused),
    ended: Boolean(mediaElement.ended),
    seeking: Boolean(mediaElement.seeking),
    readyState: mediaElement.readyState,
    networkState: mediaElement.networkState,
    playbackRate: round(mediaElement.playbackRate),
    videoWidth: mediaElement.videoWidth,
    videoHeight: mediaElement.videoHeight,
    bufferedRanges,
    bufferAhead: getBufferAhead(bufferedRanges, currentTime),
    mediaQuality: quality ? {
      totalVideoFrames: quality.totalVideoFrames,
      droppedVideoFrames: quality.droppedVideoFrames,
      corruptedVideoFrames: quality.corruptedVideoFrames,
    } : null,
    mediaError: mediaElement.error ? {
      code: mediaElement.error.code,
      message: mediaElement.error.message,
    } : null,
    shaka: selectShakaStats(stats),
  };
};

export const summarizePlayerError = (error) => {
  const detail = error?.detail || error;
  if (!detail) return null;

  return {
    name: detail.name,
    message: detail.message,
    severity: detail.severity,
    category: detail.category,
    code: detail.code,
    data: Array.isArray(detail.data) ? detail.data.slice(0, 4).map(String) : undefined,
  };
};
