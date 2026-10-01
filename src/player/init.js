import muxjs from 'mux.js';
import shaka from 'shaka-player/dist/shaka-player.ui';
import store from '@/store';
import playerUiPlugins from '@/player/ui';
import { abortable, throwIfAborted } from '@/utils/cancellation';
import trackSeekControls from './trackSeekControls';
import suppressStationaryMouseMoves from './suppressStationaryMouseMoves';

import {
  getPlayer, setPlayer, setOverlay, setControlsCleanup,
} from './state';

window.muxjs = muxjs;

playerUiPlugins(store);

shaka.polyfill.installAll();

const initialize = async ({
  mediaElement, playerConfig, videoContainer, overlayConfig, signal,
}) => {
  console.debug('Shaka player initializing');
  const cleanups = [];
  let player;
  let overlay;
  const cleanup = () => {
    cleanups.splice(0).reverse().forEach((stop) => {
      try { stop(); } catch (error) { console.error('Player control cleanup failed:', error); }
    });
  };
  try {
    throwIfAborted(signal);
    player = new shaka.Player();
    await abortable(player.attach(mediaElement, false), signal);
    throwIfAborted(signal);
    player.configure(playerConfig);

    overlay = new shaka.ui.Overlay(player, videoContainer, mediaElement);
    overlay.configure(overlayConfig);
    cleanups.push(suppressStationaryMouseMoves(videoContainer));
    cleanups.push(trackSeekControls({
      container: videoContainer, getPlayer, controls: overlay.getControls(),
    }));
    const castProxy = overlay.getControls().getCastProxy();
    const proxyVideo = castProxy.getVideo();
    const onCastSeeked = () => {
      if (castProxy.isCasting()) store.dispatch('slplayer/HANDLE_SEEKED');
    };
    cleanups.push(() => proxyVideo.removeEventListener('seeked', onCastSeeked));
    proxyVideo.addEventListener('seeked', onCastSeeked);
    throwIfAborted(signal);
    // Publish only a fully initialized instance; a cancelled attach must not replace a newer player.
    setControlsCleanup(null);
    setPlayer(player);
    setOverlay(overlay);
    setControlsCleanup(cleanup);
    console.debug('Shaka player initialized, version:', shaka.Player.version);
  } catch (e) {
    cleanup();
    try {
      if (overlay) await overlay.destroy();
      else await player?.destroy();
    } catch (cleanupError) {
      console.error('Partial player destruction failed:', cleanupError);
      if (overlay) await player?.destroy().catch(() => {});
    }
    if (!signal?.aborted) console.error('Shaka player initialization failed:', e);
    throw e;
  }
};

export default initialize;
