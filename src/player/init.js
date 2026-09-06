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
  try {
    setPlayer(new shaka.Player());
    await getPlayer().attach(mediaElement, false);
    getPlayer().configure(playerConfig);

    setControlsCleanup(null);
    setOverlay(new shaka.ui.Overlay(getPlayer(), videoContainer, mediaElement));
    getOverlay().configure(overlayConfig);
    const stopMouseFilter = suppressStationaryMouseMoves(videoContainer);
    const stopSeekTracking = trackSeekControls({
      container: videoContainer, getPlayer, controls: getOverlay().getControls(),
    });
    const castProxy = getOverlay().getControls().getCastProxy();
    const proxyVideo = castProxy.getVideo();
    const onCastSeeked = () => {
      if (castProxy.isCasting()) store.dispatch('slplayer/HANDLE_SEEKED');
    };
    proxyVideo.addEventListener('seeked', onCastSeeked);
    setControlsCleanup(() => {
      proxyVideo.removeEventListener('seeked', onCastSeeked);
      stopMouseFilter();
      stopSeekTracking();
    });
    console.debug('Shaka player initialized, version:', shaka.Player.version);
  } catch (e) {
    console.error('Shaka player initialization failed:', e);
    throw e;
  }
};

export default initialize;
