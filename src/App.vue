<template>
  <v-app>
    <TheSidebarLeft />
    <router-view name="rightSidebar" />

    <v-app-bar
      color="transparent"
      elevation="0"
      class="app-bar-blur"
      scroll-behavior="hide"
      style="z-index: 5;"
      :extension-height="showAppBarExtension ? 80 : 0"
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

      <v-spacer />

      <v-toolbar-items>
        <v-btn
          v-if="inviteUrl"
          variant="flat"
          color="primary"
          class="text-white"
          @click="copyToClipboard(inviteUrl)"
        >
          <v-icon
            start
            class="d-sm-none"
          >
            person_add
          </v-icon>
          <span class="d-none d-sm-inline">Invite</span>
        </v-btn>
      </v-toolbar-items>

      <router-view name="rightSidebarButton" />

      <template
        v-if="showAppBarExtension"
        #extension
      >
        <div class="extension-wrapper">
          <div class="app-bar-search">
            <router-view name="searchBar" />
          </div>
          <TheAppBarCrumbs />
        </div>

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
          style="height: calc(100dvh - var(--v-layout-top, 64px));"
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
                  color="primary"
                />
              </v-col>
            </v-row>
          </v-container>

          <router-view v-else />

          <v-snackbar
            :model-value="GET_SNACKBAR_OPEN"
            :color="GET_SNACKBAR_MESSAGE.color"
            :location="GET_SNACKBAR_MESSAGE.location || 'bottom'"
            timeout="4000"
            content-class="text-center"
            @update:model-value="SET_SNACKBAR_OPEN"
          >
            <v-icon
              v-if="GET_SNACKBAR_MESSAGE.icon"
              class="mr-2 snackbar-icon-spin"
            >
              {{ GET_SNACKBAR_MESSAGE.icon }}
            </v-icon>
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
import clipboard from '@/mixins/clipboard';
import linkWithRoom from '@/mixins/linkwithroom';
import { PlexAuthError } from '@/utils/fetchutils';

export default {
  components: {
    TheSidebarLeft: defineAsyncComponent(() => import('@/components/TheSidebarLeft.vue')),
    TheUpnextDialog: defineAsyncComponent(() => import('@/components/TheUpnextDialog.vue')),
    TheAppBarCrumbs: defineAsyncComponent(() => import('@/components/TheAppBarCrumbs.vue')),
  },

  mixins: [
    clipboard,
    linkWithRoom,
  ],

  computed: {
    ...mapGetters([
      'GET_UP_NEXT_POST_PLAY_DATA',
      'GET_CONFIG',
      'GET_SNACKBAR_MESSAGE',
      'GET_SNACKBAR_OPEN',
      'GET_NAVIGATE_TO_PLAYER',
      'GET_NAVIGATE_HOME',
      'GET_NAVIGATE_SIGN_IN',
    ]),

    ...mapGetters('plex', [
      'GET_PLEX_AUTH_TOKEN',
    ]),

    ...mapGetters('synclounge', [
      'GET_ROOM',
      'GET_SERVER',
    ]),

    ...mapGetters('plexclients', [
      'GET_ACTIVE_MEDIA_METADATA',
    ]),

    showAppBarExtension() {
      return this.$route.meta.showAppBarExtension;
    },

    smallLogoMedia() {
      return `(max-width: ${this.$vuetify.display.thresholds.sm}px)`;
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
        const url = new URL(invitePart, currentUrl);

        const meta = this.GET_ACTIVE_MEDIA_METADATA;
        if (meta) {
          const slug = this.mediaSlug(meta);
          if (slug) {
            url.searchParams.set('watching', slug);
          }
        }

        return url.toString();
      }
      return '';
    },
  },

  watch: {
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

    async GET_NAVIGATE_SIGN_IN(navigate) {
      if (navigate) {
        console.debug('NAVIGATE_SIGN_IN');
        this.$router.push({ name: 'SignIn' });
        this.SET_NAVIGATE_SIGN_IN(false);
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
        console.error(e);
        if (e instanceof PlexAuthError) {
          this.SET_PLEX_AUTH_TOKEN(null);
          this.$router.push({ name: 'SignIn' });
        } else {
          await this.DISPLAY_NOTIFICATION({
            text: 'Failed to connect to Plex API. Try logging out and back in.',
            color: 'error',
          });
        }
      }
    }
  },

  methods: {
    mediaSlug(meta) {
      let name;
      if (meta.type === 'episode') {
        const show = meta.grandparentTitle || '';
        const s = meta.parentIndex != null ? `s${String(meta.parentIndex).padStart(2, '0')}` : '';
        const e = meta.index != null ? `e${String(meta.index).padStart(2, '0')}` : '';
        name = [show, `${s}${e}`, meta.title].filter(Boolean).join('-');
      } else {
        name = meta.year ? `${meta.title}-${meta.year}` : (meta.title || '');
      }
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      return slug || `id-${meta.ratingKey}`;
    },

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
      'SET_NAVIGATE_SIGN_IN',
      'SET_LEFT_SIDEBAR_OPEN',
    ]),

    ...mapMutations('plex', [
      'SET_PLEX_AUTH_TOKEN',
    ]),

  },
};
</script>

<style scoped>
.app-bar-blur {
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  background: rgba(0, 0, 0, 0.6) !important;
}

.extension-wrapper {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  flex: 1;
  width: 100%;
  gap: 2px;
  min-width: 0;
}

.app-bar-search {
  max-width: 600px;
  min-width: 120px;
  width: 100%;
  margin: 0 auto;
}

.snackbar-icon-spin {
  animation: spin 1.5s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
