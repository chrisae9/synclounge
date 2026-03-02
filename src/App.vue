<template>
  <v-app>
    <TheSidebarLeft />
    <router-view name="rightSidebar" />

    <v-app-bar
      style="z-index: 5;"
    >
      <v-app-bar-nav-icon @click="SET_LEFT_SIDEBAR_OPEN" />

      <router-link
        :to="{ name: 'RoomCreation' }"
      >
        <picture>
          <source
            srcset="@/assets/images/logos/logo-small-light.png"
            :media="smallLogoMedia"
          >
          <img
            height="42"
            src="@/assets/images/logos/logo-long-light.png"
            style="vertical-align: middle;"
          >
        </picture>
      </router-link>

      <TheNowPlayingChip
        v-if="showNowPlaying"
        class="pl-4"
      />

      <v-spacer />

      <v-toolbar-items>
        <v-btn
          v-if="inviteUrl"
          color="primary"
          @click="copyToClipboard(inviteUrl)"
        >
          Invite
        </v-btn>

        <v-btn
          icon
          href="https://github.com/chrisae9/synclounge"
          target="_blank"
        >
          <v-icon>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/></svg>
          </v-icon>
        </v-btn>

        <v-btn
          class="d-lg-none"
          icon
          @click="toggleFullScreen"
        >
          <v-icon>fullscreen</v-icon>
        </v-btn>

      </v-toolbar-items>

      <router-view name="rightSidebarButton" />

      <template
        v-if="showAppBarExtension"
        #extension
      >
        <TheAppBarCrumbs />

        <v-spacer />
        <router-view
          style="max-width: 400px;"
          name="searchBar"
        />

        <router-view name="appBarView" />
      </template>
    </v-app-bar>

    <v-main
      class="main-content"
    >
      <v-container
        align="start"
        class="pa-0"
        fluid
      >
        <v-sheet
          color="transparent"
          class="overflow-y-auto pa-3"
          :height="bgHeight"
        >
            <v-container
              v-if="!GET_CONFIG"
              class="fill-height"
            >
              <v-row
                justify="center"
                align="center"
                class="pt-4 text-center"
              >
                <v-col>
                  <v-progress-circular
                    indeterminate
                    size="60"
                    class="text-amber"
                  />
                </v-col>
              </v-row>
            </v-container>

            <router-view v-else />

            <v-snackbar
              :model-value="GET_SNACKBAR_OPEN"
              :color="GET_SNACKBAR_MESSAGE.color"
              location="bottom"
              timeout="4000"
              content-class="text-center"
              @update:model-value="SET_SNACKBAR_OPEN"
            >
              {{ GET_SNACKBAR_MESSAGE.text }}
            </v-snackbar>

            <TheUpnextDialog v-if="GET_UP_NEXT_POST_PLAY_DATA" />
          </v-sheet>
      </v-container>
    </v-main>
  </v-app>
</template>

<script>
import './assets/css/style.css';

import {
  mapActions, mapGetters, mapMutations,
} from 'vuex';
import { defineAsyncComponent } from 'vue';
import redirection from '@/mixins/redirection';
import clipboard from '@/mixins/clipboard';
import linkWithRoom from '@/mixins/linkwithroom';
import { slPlayerClientId } from '@/player/constants';

export default {
  components: {
    TheSidebarLeft: defineAsyncComponent(() => import('@/components/TheSidebarLeft.vue')),
    TheUpnextDialog: defineAsyncComponent(() => import('@/components/TheUpnextDialog.vue')),
    TheNowPlayingChip: defineAsyncComponent(() => import('@/components/TheNowPlayingChip.vue')),
    TheAppBarCrumbs: defineAsyncComponent(() => import('@/components/TheAppBarCrumbs.vue')),
  },

  mixins: [
    redirection,
    clipboard,
    linkWithRoom,
  ],

  computed: {
    ...mapGetters([
      'GET_UP_NEXT_POST_PLAY_DATA',
      'GET_CONFIG',
      'GET_ACTIVE_METADATA',
      'GET_SNACKBAR_MESSAGE',
      'GET_SNACKBAR_OPEN',
      'GET_NAVIGATE_TO_PLAYER',
      'GET_NAVIGATE_HOME',
    ]),

    ...mapGetters('plex', [
      'GET_PLEX_AUTH_TOKEN',
    ]),

    ...mapGetters('plexclients', [
      'GET_CHOSEN_CLIENT_ID',
      'GET_ACTIVE_SERVER_ID',
      'GET_PLEX_CLIENT_TIMELINE',
      'GET_ACTIVE_MEDIA_METADATA',
    ]),

    ...mapGetters('plexservers', [
      'GET_PLEX_SERVER',
    ]),

    ...mapGetters('synclounge', [
      'IS_IN_ROOM',
      'GET_ROOM',
      'GET_SERVER',
    ]),

    showNowPlaying() {
      return this.GET_ACTIVE_SERVER_ID && this.GET_CHOSEN_CLIENT_ID !== slPlayerClientId;
    },

    showAppBarExtension() {
      return this.$route.meta.showAppBarExtension;
    },

    smallLogoMedia() {
      return `(max-width: ${this.$vuetify.display.thresholds.sm}px)`;
    },

    bgHeight() {
      return this.$vuetify.display.height - (document.querySelector('.v-toolbar')?.offsetHeight || 64);
    },

    inviteUrl() {
      if (this.GET_ROOM) {
        if (this.GET_CONFIG?.autojoin) {
          // If autojoin, just link to main site
          return window.location.origin;
        }

        const invitePart = this.$router.resolve({
          name: 'RoomJoin',
          params: {
            room: this.GET_ROOM,
            ...(this.GET_SERVER && { server: this.GET_SERVER }),
          },
        }).href;

        const currentUrl = new URL(window.location.pathname, window.location.origin);
        return new URL(invitePart, currentUrl).toString();
      }
      return '';
    },
  },

  watch: {
    GET_ACTIVE_MEDIA_METADATA(metadata) {
      // This handles regular plex clients (nonslplayer) playback changes
      if (this.IS_IN_ROOM && this.GET_CHOSEN_CLIENT_ID !== slPlayerClientId) {
        if (metadata) {
          this.redirectToMediaPage();
        } else {
          this.$router.push(this.linkWithRoom({ name: 'PlexHome' }));
        }
      }
    },

    GET_NAVIGATE_TO_PLAYER(navigate) {
      if (navigate) {
        this.$router.push(this.linkWithRoom({ name: 'WebPlayer' }));
        this.SET_NAVIGATE_TO_PLAYER(false);
      }
    },

    async GET_NAVIGATE_HOME(navigate) {
      if (navigate) {
        console.debug('NAVIGATE_HOME');
        this.$router.push({ name: 'RoomCreation' });
        this.SET_NAVIGATE_HOME(false);
      }
    },
  },

  async created() {
    if (this.GET_PLEX_AUTH_TOKEN) {
      try {
        await Promise.all([
          this.FETCH_PLEX_USER(),
          this.FETCH_PLEX_DEVICES(),
        ]);
      } catch (e) {
        // If these fail, then the auth token is probably invalid
        console.error(e);
        await this.DISPLAY_NOTIFICATION({
          text: 'Failed to connect to Plex API. Try logging out and back in.',
          color: 'error',
        });
      }
    }
  },

  mounted() {
    document.addEventListener('fullscreenchange', this.onFullScreenChange);
  },

  beforeUnmount() {
    document.removeEventListener('fullscreenchange', this.onFullScreenChange);
  },

  methods: {
    ...mapActions([
      'DISPLAY_NOTIFICATION',
    ]),

    ...mapActions('plex', [
      'FETCH_PLEX_DEVICES',
      'FETCH_PLEX_USER',
    ]),

    ...mapMutations([
      'SET_SNACKBAR_OPEN',
      'SET_NAVIGATE_TO_PLAYER',
      'SET_NAVIGATE_HOME',
      'SET_LEFT_SIDEBAR_OPEN',
    ]),

    onFullScreenChange() {
      document.body.classList.toggle('is-fullscreen', document.fullscreenElement);
    },

    toggleFullScreen() {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
      } else if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    },
  },
};
</script>
