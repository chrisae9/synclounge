const makeQualityTemplate = (label, maxVideoBitrate, videoResolution) => ({
  label, maxVideoBitrate, ...(videoResolution && { videoResolution }),
});

const qualities = [
  makeQualityTemplate('Original', null),
  makeQualityTemplate('20 Mbps 1080p', 20000, '1920x1080'),
  makeQualityTemplate('12 Mbps 1080p', 12000, '1920x1080'),
  makeQualityTemplate('10 Mbps 1080p', 10000, '1920x1080'),
  makeQualityTemplate('8 Mbps 1080p', 8000, '1920x1080'),
  makeQualityTemplate('4 Mbps 720p', 4000, '1280x720'),
  makeQualityTemplate('3 Mbps 720p', 3000, '1280x720'),
  makeQualityTemplate('2 Mbps 720p', 2000, '1280x720'),
  makeQualityTemplate('1.5 Mbps 480p', 1500, '720x480'),
  makeQualityTemplate('720 Kbps', 720),
  makeQualityTemplate('320 Kbps', 320),
  makeQualityTemplate('208 Kbps', 208),
  makeQualityTemplate('96 Kbps', 96),
  makeQualityTemplate('64 Kbps', 64),
];

export default qualities;
