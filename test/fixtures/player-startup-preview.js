import 'shaka-player/dist/controls.css';
import '@/assets/css/style.css';
import '@/assets/css/player-menu.css';
import { createApp, h } from 'vue';
import vuetify from '@/plugins/vuetify';
import PlayerUnmuteButton from '@/components/PlayerUnmuteButton.vue';
import store from '@/store';
import initialize from '@/player/init';
import WebPlayer from '@/views/WebPlayer.vue';
import { getRawPlayer } from '@/player/state';
import { getSmallPlayButton } from '@/player';

if (!import.meta.env.DEV) throw new Error('Development fixture only');
const previewUnmute = new URLSearchParams(globalThis.location.search).has('unmute');
const result = globalThis.document.querySelector('#result');
try {
  const config = await (await fetch('/config.json')).json();
  store.commit('SET_CONFIGURATION', config);
  // Local-only role preview: no server connection or real room is created.
  if (new URLSearchParams(globalThis.location.search).has('guest')) {
    store.commit('synclounge/SET_SOCKET_ID', 'fixture-guest');
    store.commit('synclounge/SET_HOST_ID', 'fixture-host');
  }
  if (new URLSearchParams(globalThis.location.search).has('tracks')) {
    store.commit('plexclients/SET_ACTIVE_MEDIA_METADATA', {
      Media: [{
        videoResolution: '1080',
        bitrate: 8000,
        Part: [{
          Stream: [
            { id: 1, streamType: 2, displayTitle: 'English stereo' },
            { id: 2, streamType: 2, displayTitle: 'French stereo' },
            { id: 3, streamType: 3, displayTitle: 'English subtitles' },
          ],
        }],
      }],
    });
    if (new URLSearchParams(globalThis.location.search).has('versions')) {
      const metadata = store.getters['plexclients/GET_ACTIVE_MEDIA_METADATA'];
      store.commit('plexclients/SET_ACTIVE_MEDIA_METADATA', {
        ...metadata,
        Media: [...metadata.Media, { ...metadata.Media[0], videoResolution: '720', bitrate: 4000 }],
      });
      store.commit('slplayer/SET_MEDIA_INDEX', '1');
    } else {
      store.commit('slplayer/SET_MEDIA_INDEX', 0);
    }
  }
  await initialize({
    mediaElement: globalThis.document.querySelector('video'),
    videoContainer: globalThis.document.querySelector('#player'),
    playerConfig: {},
    overlayConfig: WebPlayer.methods.getPlayerUiOptions(),
  });
  // Exercise the real Vuex startup and event registration, not a mock dispatch.
  await store.dispatch('slplayer/INIT_PLAYER_STATE');
  if (!store.getters['slplayer/IS_PLAYER_INITIALIZED']
    || !getSmallPlayButton()) throw new Error('Missing startup controls');
  const unmuteRoot = globalThis.document.createElement('div');
  globalThis.document.querySelector('#player').appendChild(unmuteRoot);
  createApp({
    render: () => h(PlayerUnmuteButton, {
      visible: store.getters['slplayer/IS_AUTOPLAY_BLOCKED'],
      onUnmute: () => store.dispatch('slplayer/UNMUTE_AFTER_AUTOPLAY_BLOCK'),
    }),
  }).use(store).use(vuetify).mount(unmuteRoot);
  result.textContent = 'PASS: real Shaka overlay and full player state initialized';
} catch (error) {
  result.textContent = `FAIL: ${error.message}`;
  throw error;
}
globalThis.document.querySelector('#load').addEventListener('click', async () => {
  try {
    globalThis.document.querySelector('video').muted = previewUnmute;
    store.commit('slplayer/SET_AUTOPLAY_BLOCKED', previewUnmute);
    await getRawPlayer().load('https://storage.googleapis.com/shaka-demo-assets/angel-one-hls/hls.m3u8');
    await globalThis.document.querySelector('video').play();
    result.textContent = 'PASS: full startup and sample playback';
  } catch (error) {
    result.textContent = `FAIL: ${error.message}`;
  }
});
