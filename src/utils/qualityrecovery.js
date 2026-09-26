import qualities from '@/store/modules/slplayer/qualities';

const recommendLowerQuality = ({
  episodes, now, currentLimit, streamBitrate, bufferAhead,
}) => {
  // Many short stalls can be just as disruptive as a few long stalls. Exclude
  // tiny pause/seek transitions, but retain meaningful cumulative starvation.
  const recent = episodes.filter((episode) => now - episode.at < 120000
    && now >= episode.at && episode.durationMs >= 250);
  const prolongedStall = recent.some((episode) => episode.durationMs >= 10000);
  if ((!prolongedStall && recent.length < 3)
    || recent.reduce((sum, episode) => sum + episode.durationMs, 0) < 8000
    || !Number.isFinite(bufferAhead) || bufferAhead > 3) return null;
  const ceiling = Math.min(currentLimit || Infinity, streamBitrate > 0 ? streamBitrate / 1000 : Infinity);
  if (!Number.isFinite(ceiling)) return null;
  return qualities.find((quality) => quality.maxVideoBitrate >= 720
    && quality.maxVideoBitrate < ceiling * 0.8) || null;
};

export default recommendLowerQuality;
