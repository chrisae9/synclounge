/* eslint-disable no-bitwise -- Unsigned 32-bit seeded PRNG for reproducible fault traces. */
// Deterministic decoder double. The application actions, player seek adapter,
// event waits and room sync lock remain real; no Plex or production room is used.
export const createDecoder = () => {
  const video = new EventTarget();
  const listeners = new Set();
  const add = video.addEventListener.bind(video);
  const remove = video.removeEventListener.bind(video);
  video.addEventListener = (type, callback, options) => {
    if (type === 'seeked') listeners.add(callback);
    add(type, callback, options);
  };
  video.removeEventListener = (type, callback) => {
    if (type === 'seeked') listeners.delete(callback);
    remove(type, callback);
  };
  let position = 100;
  let pending;
  const decoder = {
    video,
    seeks: [],
    loads: 0,
    missMs: 0,
    reloadMissMs: 0,
    delayMs: 20,
    emitSeeked: true,
    bufferStart: 0,
    bufferEnd: 1000,
    listenerCount: () => listeners.size,
    getPlayer: () => ({
      getMediaElement: () => video,
      isBuffering: () => video.seeking,
      getPlaybackRate: () => video.playbackRate,
      unload: async () => { clearTimeout(pending); position = 0; video.seeking = false; },
      load: async () => {
        decoder.loads += 1;
        position = 0;
        video.paused = !video.autoplay;
      },
    }),
    finish: () => { clearTimeout(pending); },
    setPosition: (seconds) => { position = seconds; },
  };
  Object.assign(video, {
    paused: false,
    seeking: false,
    readyState: 4,
    playbackRate: 1,
    duration: 6000,
    buffered: { length: 1, start: () => decoder.bufferStart, end: () => decoder.bufferEnd },
    pause: () => { video.paused = true; },
    play: async () => { video.paused = false; },
  });
  Object.defineProperty(video, 'currentTime', {
    get: () => position,
    set: (seconds) => {
      clearTimeout(pending);
      position = seconds;
      video.seeking = true;
      decoder.seeks.push(seconds * 1000);
      pending = setTimeout(() => {
        const miss = decoder.loads ? decoder.reloadMissMs : decoder.missMs;
        position = seconds + miss / 1000;
        video.seeking = false;
        if (decoder.emitSeeked) video.dispatchEvent(new Event('seeked'));
      }, decoder.delayMs);
    },
  });
  return decoder;
};

export const seededRandom = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
};
