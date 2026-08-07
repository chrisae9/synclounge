import muxjs from 'mux.js';
import shaka from 'shaka-player/dist/shaka-player.ui.debug';
import store from '@/store';
import playerUiPlugins from '@/player/ui';
import suppressStationaryMouseMoves from './suppressStationaryMouseMoves';

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
    const controls = getOverlay().getControls();
    const { mouseMoveHandler, mouseLeaveHandler } = suppressStationaryMouseMoves(controls);
    controls.onMouseMove_ = mouseMoveHandler;
    if (mouseLeaveHandler) controls.onMouseLeave_ = mouseLeaveHandler;
    getOverlay().configure(overlayConfig);
    console.debug('Shaka player initialized, version:', shaka.Player.version);
  } catch (e) {
    console.error('Shaka player initialization failed:', e);
    throw e;
  }
};

export default initialize;
