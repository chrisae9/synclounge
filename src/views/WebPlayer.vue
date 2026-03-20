<template>
  <v-row
    style="position: relative;"
    class="ma-n3"
  >
    <v-col class="pa-0">
      <div
        ref="videoPlayerContainer"
        class="slplayer"
        @click="HANDLE_PLAYER_CLICK"
      >
        <video
          ref="videoPlayer"
          autoplay
          preload="auto"
          playsinline
          style="background-color: black;"

          @pause="HANDLE_PLAYER_PAUSE"
          @ended="PRESS_STOP"
          @playing="HANDLE_PLAYER_PLAYING"
          @seeking="HANDLE_SEEKING"
          @seeked="HANDLE_SEEKED"
          @volumechange="HANDLE_PLAYER_VOLUME_CHANGE"
          @enterpictureinpicture="HANDLE_PICTURE_IN_PICTURE_CHANGE"
          @leavepictureinpicture="HANDLE_PICTURE_IN_PICTURE_CHANGE"
          @timeupdate="handleTimeUpdate"
        />

        <v-fade-transition>
          <v-btn
            v-show="IS_AUTOPLAY_BLOCKED"
            size="large"
            variant="flat"
            color="primary"
            class="unmute-banner text-white"
            @click.stop="UNMUTE_AFTER_AUTOPLAY_BLOCK"
          >
            <v-icon start>mdi-volume-off</v-icon>
            Click to unmute
          </v-btn>
        </v-fade-transition>

        <v-fade-transition
          transition="fade-transition"
        >
          <v-btn
            v-show="shouldShowSkipIntroButton"
            size="large"
            variant="flat"
            color="primary"
            class="skip-intro text-white"
            :style="skipIntroButtonStyle"
            @click="SKIP_INTRO"
          >
            Skip Intro
          </v-btn>
        </v-fade-transition>
      </div>

      <v-row
        no-gutters
        class="pa-3 d-none d-sm-flex hoverBar"
      >
          <v-col>
            <v-container fluid>
              <v-row no-gutters>
                <v-col cols="auto">
                  <img
                    :src="GET_THUMB_URL"
                    class="plex-thumb"
                  >
                </v-col>

                <v-col class="pl-3" style="min-width: 0;">
                  <div>
                    <div class="text-h5 text-truncate">{{ GET_TITLE }}</div>
                    <div class="text-subtitle-1 text-medium-emphasis text-truncate">{{ GET_SECONDARY_TITLE }}</div>
                    <div class="text-subtitle-2 text-primary">
                      Playing from {{ GET_PLEX_SERVER?.name }}
                    </div>
                  </div>
                </v-col>
              </v-row>
            </v-container>
          </v-col>
        </v-row>

      <div
        v-if="$vuetify.display.xs"
      >
        <MessageList class="messages-wrapper" />
        <MessageInput />
      </div>

      <div class="d-sm-none">
        <v-row
          justify="center"
          class="pa-3"
        >
          <v-col cols="auto">
            <img
              :src="GET_THUMB_URL"
              class="plex-thumb"
            >
          </v-col>

          <v-col class="pl-2" style="min-width: 0;">
            <div>
              <div class="text-h6 text-truncate">{{ GET_TITLE }}</div>
              <div class="text-subtitle-2 text-medium-emphasis text-truncate">{{ GET_SECONDARY_TITLE }}</div>
              <div class="text-subtitle-2 text-primary">
                Playing from {{ GET_PLEX_SERVER?.name }}
              </div>
            </div>
          </v-col>
        </v-row>

        <v-row>
          <v-col v-if="!AM_I_HOST">
            <v-btn
              block
              variant="flat"
              color="primary"
              class="text-white"
              @click="MANUAL_SYNC"
            >
              Manual sync
            </v-btn>
          </v-col>

          <v-col>
            <v-btn
              block
              variant="flat"
              color="error"
              @click="PRESS_STOP"
            >
              Stop playback
            </v-btn>
          </v-col>
        </v-row>
      </div>
    </v-col>
  </v-row>
</template>

<script>

import { defineAsyncComponent } from 'vue';
import { mapActions, mapGetters, mapState } from 'vuex';

import initialize from '@/player/init';
import {
  getControlsOffset, getCurrentTimeMs, setCurrentTimeMs, getVolume, setVolume,
} from '@/player';
import linkWithRoom from '@/mixins/linkwithroom';

import 'shaka-player/dist/controls.css';
import 'synclounge-libjass/lib/libjass.css';

export default {
  name: 'WebPlayer',

  components: {
    MessageList: defineAsyncComponent(() => import('@/components/MessageList.vue')),
    MessageInput: defineAsyncComponent(() => import('@/components/MessageInput.vue')),
  },

  mixins: [
    linkWithRoom,
  ],

  data: () => ({
    videoTimeStamp: 0,
    controlsOffset: 0,
  }),

  computed: {
    ...mapGetters('slplayer', [
      'GET_THUMB_URL',
      'GET_PLEX_SERVER',
      'GET_TITLE',
      'GET_SECONDARY_TITLE',
      'ARE_PLAYER_CONTROLS_SHOWN',
      'GET_PLAYER_STATE',
      'IS_USING_NATIVE_SUBTITLES',
      'IS_AUTOPLAY_BLOCKED',
    ]),

    ...mapGetters('synclounge', [
      'AM_I_HOST',
    ]),

    ...mapGetters('plexclients', [
      'GET_ACTIVE_MEDIA_METADATA',
      'GET_ACTIVE_MEDIA_METADATA_INTRO_MARKER',
    ]),

    ...mapGetters('settings', [
      'GET_AUTO_SKIP_INTRO',
    ]),

    ...mapGetters([
      'GET_CONFIG',
    ]),

    ...mapState('slplayer', [
      'forceBurnSubtitles',
    ]),

    playerConfig() {
      return {
        streaming: {
          bufferingGoal: this.GET_CONFIG.slplayer_buffering_goal,
        },
      };
    },

    skipIntroButtonStyle() {
      return {
        'margin-bottom': `${this.controlsOffset + 12}px`,
      };
    },

    isInIntro() {
      return this.GET_ACTIVE_MEDIA_METADATA_INTRO_MARKER
        && this.videoTimeStamp >= this.GET_ACTIVE_MEDIA_METADATA_INTRO_MARKER.startTimeOffset
        && this.videoTimeStamp < this.GET_ACTIVE_MEDIA_METADATA_INTRO_MARKER.endTimeOffset;
    },

    isInInitialIntroRegion() {
      return this.GET_ACTIVE_MEDIA_METADATA_INTRO_MARKER
        && this.videoTimeStamp >= this.GET_ACTIVE_MEDIA_METADATA_INTRO_MARKER.startTimeOffset
        && this.videoTimeStamp - this.GET_ACTIVE_MEDIA_METADATA_INTRO_MARKER.startTimeOffset
          < this.GET_CONFIG.slplayer_initial_skip_intro_visible_period;
    },

    shouldShowSkipIntroButton() {
      return this.AM_I_HOST && this.isInIntro && (this.ARE_PLAYER_CONTROLS_SHOWN
      || this.isInInitialIntroRegion);
    },
  },

  watch: {
    GET_PLAYER_STATE(state) {
      if (state === 'stopped') {
        this.$router.push(this.linkWithRoom({ name: 'PlexHome' }));
      }
    },

    GET_ACTIVE_MEDIA_METADATA: {
      async handler(newMetadata) {
        // This handles regular plex clients (nonslplayer) playback changes
        if (newMetadata) {
          await this.SET_MEDIA_AS_BACKGROUND(newMetadata);
        }
      },
      immediate: true,
    },

    ARE_PLAYER_CONTROLS_SHOWN() {
      return this.RERENDER_SUBTITLE_CONTAINER();
    },

    isInIntro: {
      handler() {
        return this.checkAutoSkipIntro();
      },
      immediate: true,
    },

    GET_AUTO_SKIP_INTRO: {
      handler() {
        return this.checkAutoSkipIntro();
      },
      immediate: true,
    },

    async forceBurnSubtitles(forceBurn) {
      if (forceBurn && this.IS_USING_NATIVE_SUBTITLES) {
        await this.UPDATE_PLAYER_SRC_AND_KEEP_TIME();
      }
    },
  },

  async mounted() {
    // TODO: monitor upnext stuff interval probably or idk state change timeugh
    console.debug('WebPlayer: mounted, initializing Shaka player');

    try {
      await initialize({
        mediaElement: this.$refs.videoPlayer,
        playerConfig: this.playerConfig,
        videoContainer: this.$refs.videoPlayerContainer,
        overlayConfig: this.getPlayerUiOptions(),
      });
    } catch (e) {
      console.error('WebPlayer: Shaka initialization failed:', e);
      throw e;
    }

    await this.INIT_PLAYER_STATE();
    console.debug('WebPlayer: player initialized successfully');

    window.addEventListener('keydown', this.onKeyUp);
    window.addEventListener('resize', this.RERENDER_SUBTITLE_CONTAINER);
    this.controlsOffset = getControlsOffset(this.$refs?.videoPlayerContainer?.offsetHeight);
  },

  beforeUnmount() {
    window.removeEventListener('keydown', this.onKeyUp);
    window.removeEventListener('resize', this.RERENDER_SUBTITLE_CONTAINER);
    this.DESTROY_PLAYER_STATE();
  },

  methods: {
    ...mapActions('plexservers', [
      'SET_MEDIA_AS_BACKGROUND',
    ]),

    ...mapActions('slplayer', [
      'CHANGE_MEDIA_INDEX',
      'CHANGE_PLAYER_SRC',
      'HANDLE_PLAYER_PLAYING',
      'HANDLE_PLAYER_PAUSE',
      'HANDLE_PLAYER_VOLUME_CHANGE',
      'HANDLE_PLAYER_CLICK',
      'HANDLE_SEEKING',
      'HANDLE_SEEKED',
      'HANDLE_PICTURE_IN_PICTURE_CHANGE',

      'PRESS_STOP',
      'INIT_PLAYER_STATE',
      'DESTROY_PLAYER_STATE',
      'PLAY_PAUSE_VIDEO',
      'SEND_PARTY_PLAY_PAUSE',
      'SKIP_INTRO',
      'RERENDER_SUBTITLE_CONTAINER',
      'UPDATE_PLAYER_SRC_AND_KEEP_TIME',
      'UNMUTE_AFTER_AUTOPLAY_BLOCK',
    ]),

    ...mapActions('synclounge', [
      'MANUAL_SYNC',
    ]),

    getPlayerUiOptions() {
      return {
        addBigPlayButton: true,
        controlPanelElements: [
          'mute',
          'volume',
          'time_and_duration',

          'spacer',

          'previous',
          'replay10',
          'play_pause',
          'forward30',
          'next',
          'close',
          'manual_sync',

          'spacer',

          'audio',
          'subtitle',
          'cast',
          'overflow_menu',
          'fullscreen',
        ],

        overflowMenuButtons: [
          'media',
          'bitrate',

          'subtitleoffset',
          'subtitlesize',
          'subtitleposition',
          'subtitlecolor',

          'picture_in_picture',
        ],

        castReceiverAppId: '21725FD3',
      };
    },

    isTyping() {
      const { activeElement } = document;
      if (!activeElement) return false;
      const { tagName } = activeElement;
      return tagName === 'INPUT' || tagName === 'TEXTAREA'
        || activeElement.closest('[contenteditable]');
    },

    onKeyUp(event) {
      if (this.isTyping()) return;

      const { activeElement } = document;
      const isSeekBar = activeElement && activeElement.classList
        && activeElement.classList.contains('shaka-seek-bar');

      switch (event.key) {
        case ' ':
          if (activeElement.tagName !== 'BUTTON') {
            if (!isSeekBar) {
              this.PLAY_PAUSE_VIDEO();
            }
            this.SEND_PARTY_PLAY_PAUSE();
          }
          break;

        case 'f':
          if (document.fullscreenElement) {
            document.exitFullscreen();
          } else {
            this.$refs.videoPlayerContainer?.requestFullscreen();
          }
          break;

        case 'm':
          if (this.IS_AUTOPLAY_BLOCKED) {
            this.UNMUTE_AFTER_AUTOPLAY_BLOCK();
          } else {
            this.$refs.videoPlayer.muted = !this.$refs.videoPlayer.muted;
          }
          break;

        case 'ArrowLeft':
          event.preventDefault();
          setCurrentTimeMs(Math.max(0, getCurrentTimeMs() - 10000));
          break;

        case 'ArrowRight':
          event.preventDefault();
          setCurrentTimeMs(getCurrentTimeMs() + 10000);
          break;

        case 'ArrowUp':
          event.preventDefault();
          setVolume(Math.min(1, getVolume() + 0.1));
          break;

        case 'ArrowDown':
          event.preventDefault();
          setVolume(Math.max(0, getVolume() - 0.1));
          break;

        default:
          break;
      }
    },

    handleTimeUpdate() {
      this.videoTimeStamp = (this.$refs?.videoPlayer?.currentTime ?? 0) * 1000;
    },

    async checkAutoSkipIntro() {
      if (this.isInIntro && this.GET_AUTO_SKIP_INTRO) {
        await this.SKIP_INTRO();
      }
    },
  },
};
</script>

<style scoped>
.slplayer video {
  width: 100%;
  height: 100%;
}

.slplayer {
  height: calc(100vh - var(--v-layout-top, 64px));
}

@media screen and (max-width: 960px) {
  div.slplayer {
    height: calc(0.5625 * 100vw);
  }
}

.hoverBar {
  position: absolute;
  pointer-events: none;
  background:
    -webkit-gradient(
      linear,
      left top,
      left bottom,
      from(rgb(0 0 0 / 80%)),
      color-stop(60%, rgb(0 0 0 / 35%)),
      to(transparent)
    );
  background: linear-gradient(180deg, rgb(0 0 0 / 80%) 0, rgb(0 0 0 / 35%) 60%, transparent);
  top: 0;
  left: 0;
  width: 100%;
  opacity: 0;
  transition: opacity 0.3s ease;
}

/* Show hoverBar when Shaka's controls container has the shown attribute.
   This ties hoverBar visibility directly to Shaka's native show/hide,
   bypassing JavaScript polling and matching the play bar's behavior exactly. */
.slplayer:has([shown]) ~ .hoverBar {
  opacity: 1;
}

.plex-thumb {
  height: 80px;
  width: auto;
  vertical-align: middle;
  margin-left: auto;
  margin-right: auto;
}

.v-btn.unmute-banner {
  z-index: 2;
  position: absolute;
  top: 12px;
  left: 12px;
}

.v-btn.skip-intro {
  z-index: 2;
  position: absolute;
  bottom: 0;
  right: 0;
}

.v-btn.skip-intro.fade-transition-leave-active {
  transition-duration: 0.6s !important;
}
</style>

<style>
.messages-wrapper {
  max-height: calc(100dvh - (0.5625 * 100vw) - 150px);
  min-height: 100px;
  overflow-y: auto;
}

.is-fullscreen .messages-wrapper {
  height: calc(100vh - (0.5625 * 100vw));
}

/* Shaka adds a no-cursor class to hide the cursor when controls auto-hide.
  The cursor style change triggers a synthetic mousemove in some browsers,
  which Shaka interprets as user interaction and re-shows controls (feedback loop).
  Override cursor to prevent the loop while still allowing controls to auto-hide. */
.shaka-video-container.no-cursor,
.shaka-video-container.no-cursor * {
  cursor: auto !important;
}

/* Having to put shaka styling here since scoped rules don't seem to apply to them
  likely because its added dynamically */

.shaka-slplayer-button:disabled {
  opacity: 0.5;
  cursor: default;
}

.shaka-play-button {
  padding: 50px !important;
}

.shaka-spinner {
  padding: 57px !important;
}

.libjass-wrapper {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}
</style>
