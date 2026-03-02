import muxjs from 'mux.js';
import shaka from 'shaka-player/dist/shaka-player.ui.debug';
import store from '@/store';
import playerUiPlugins from '@/player/ui';

import {
  getPlayer, setPlayer, getOverlay, setOverlay,
} from './state';

window.muxjs = muxjs;

playerUiPlugins(store);

shaka.log.setLevel(shaka.log.Level.ERROR);
shaka.polyfill.installAll();

const initialize = async ({
  mediaElement, playerConfig, videoContainer, overlayConfig,
}) => {
  console.debug('Shaka player initializing');
  try {
    setPlayer(new shaka.Player());
    await getPlayer().attach(mediaElement, false);
    getPlayer().configure(playerConfig);

    setOverlay(new shaka.ui.Overlay(getPlayer(), videoContainer, mediaElement));
    getOverlay().configure(overlayConfig);
    console.debug('Shaka player initialized, version:', shaka.Player.version);
  } catch (e) {
    console.error('Shaka player initialization failed:', e);
    throw e;
  }
};

export default initialize;
