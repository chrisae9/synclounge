import 'shaka-player/dist/controls.css';
import '@/assets/css/player-menu.css';
import store from '@/store';
import initialize from '@/player/init';
import WebPlayer from '@/views/WebPlayer.vue';
import { getRawPlayer } from '@/player/state';
import { getSmallPlayButton, getBigPlayButton } from '@/player';

if (!import.meta.env.DEV) throw new Error('Development fixture only');
const result = globalThis.document.querySelector('#result');
try {
  const config = await (await fetch('/config.json')).json();
  store.commit('SET_CONFIGURATION', config);
  await initialize({
    mediaElement: globalThis.document.querySelector('video'),
    videoContainer: globalThis.document.querySelector('#player'),
    playerConfig: {},
    overlayConfig: WebPlayer.methods.getPlayerUiOptions(),
  });
  // Exercise the real Vuex startup and event registration, not a mock dispatch.
  await store.dispatch('slplayer/INIT_PLAYER_STATE');
  if (!store.getters['slplayer/IS_PLAYER_INITIALIZED']
    || !getSmallPlayButton() || !getBigPlayButton()) throw new Error('Missing startup controls');
  result.textContent = 'PASS: real Shaka overlay and full player state initialized';
} catch (error) {
  result.textContent = `FAIL: ${error.message}`;
  throw error;
}
globalThis.document.querySelector('#load').addEventListener('click', async () => {
  try {
    await getRawPlayer().load('https://storage.googleapis.com/shaka-demo-assets/angel-one-hls/hls.m3u8');
    await globalThis.document.querySelector('video').play();
    result.textContent = 'PASS: full startup and sample playback';
  } catch (error) {
    result.textContent = `FAIL: ${error.message}`;
  }
});
