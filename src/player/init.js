import muxjs from 'mux.js';
import shaka from 'shaka-player/dist/shaka-player.ui';
import store from '@/store';
import playerUiPlugins from '@/player/ui';
import trackSeekControls from './trackSeekControls';
import suppressStationaryMouseMoves from './suppressStationaryMouseMoves';

import {
  getPlayer, setPlayer, getOverlay, setOverlay, setControlsCleanup,
} from './state';

window.muxjs = muxjs;

playerUiPlugins(store);

shaka.polyfill.installAll();

const initialize = async ({
  mediaElement, playerConfig, videoContainer, overlayConfig,
}) => {
  console.debug('Shaka player initializing');
  const cleanups = [];
  const cleanup = () => {
    cleanups.splice(0).reverse().forEach((stop) => {
      try { stop(); } catch (error) { console.error('Player control cleanup failed:', error); }
    });
  };
  try {
    const player = new shaka.Player();
    setPlayer(player);
    await player.attach(mediaElement, false);
    player.configure(playerConfig);

    setControlsCleanup(null);
    setOverlay(new shaka.ui.Overlay(player, videoContainer, mediaElement));
    getOverlay().configure(overlayConfig);
    cleanups.push(suppressStationaryMouseMoves(videoContainer));
    cleanups.push(trackSeekControls({
      container: videoContainer, getPlayer, controls: getOverlay().getControls(),
    }));
    const castProxy = getOverlay().getControls().getCastProxy();
    const proxyVideo = castProxy.getVideo();
    const onCastSeeked = () => {
      if (castProxy.isCasting()) store.dispatch('slplayer/HANDLE_SEEKED');
    };
    cleanups.push(() => proxyVideo.removeEventListener('seeked', onCastSeeked));
    proxyVideo.addEventListener('seeked', onCastSeeked);
    setControlsCleanup(cleanup);
    console.debug('Shaka player initialized, version:', shaka.Player.version);
  } catch (e) {
    cleanup();
    console.error('Shaka player initialization failed:', e);
    throw e;
  }
};

export default initialize;
