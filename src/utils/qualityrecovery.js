import qualities from '@/store/modules/slplayer/qualities';

const recommendLowerQuality = ({
  episodes, now, currentLimit, streamBitrate, bufferAhead,
}) => {
  const recent = episodes.filter((episode) => now - episode.at < 120000 && episode.durationMs >= 1500);
  if (recent.length < 3 || recent.reduce((sum, episode) => sum + episode.durationMs, 0) < 8000
    || !Number.isFinite(bufferAhead) || bufferAhead > 3) return null;
  const ceiling = Math.min(currentLimit || Infinity, streamBitrate > 0 ? streamBitrate / 1000 : Infinity);
  if (!Number.isFinite(ceiling)) return null;
  return qualities.find((quality) => quality.maxVideoBitrate >= 720
    && quality.maxVideoBitrate < ceiling * 0.8) || null;
};

export default recommendLowerQuality;
