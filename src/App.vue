<template>
  <v-app>
    <a
      class="skip-link"
      href="#main-content"
    >Skip to content</a>
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
      <v-app-bar-nav-icon
        :aria-label="isLeftSidebarOpen ? 'Close navigation' : 'Open navigation'"
        :aria-expanded="!!isLeftSidebarOpen"
        @click="SET_LEFT_SIDEBAR_OPEN(!isLeftSidebarOpen)"
      />

      <router-link
        :to="{ name: 'RoomCreation' }"
      >
        <picture>
          <source
            srcset="@/assets/images/logos/logo-small-light.png"
            :media="smallLogoMedia"
          >
          <img
            alt="SyncLounge home"
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
          aria-label="Copy room invite link"
          @click="copyToClipboard(inviteUrl)"
        >
          <v-icon
            start
            class="d-sm-none"
          >
            person_add
          </v-icon>
          <span>Invite</span>
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
      id="main-content"
      tabindex="-1"
      class="main-content"
    >
      <v-container
        align="start"
        class="pa-0"
        fluid
      >
        <v-sheet
          color="transparent"
          class="app-content-scroll overflow-y-auto pa-3"
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

          <div
            v-if="pwaState.offline"
            role="status"
            class="offline-status"
          >
            You're offline. Reconnect to watch and chat with your room.
          </div>
          <ConnectionStatus />
          <router-view v-if="GET_CONFIG" />

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
import { pwaState } from '@/pwa';

import {
  mapActions, mapGetters, mapMutations, mapState,
} from 'vuex';
import { defineAsyncComponent } from 'vue';
import clipboard from '@/mixins/clipboard';
import linkWithRoom from '@/mixins/linkwithroom';
import ConnectionStatus from '@/components/ConnectionStatus.vue';
import { getSignInRoute } from '@/router/guardutils';
import { PlexAuthError } from '@/utils/fetchutils';

export default {
  components: {
    ConnectionStatus,
    TheSidebarLeft: defineAsyncComponent(() => import('@/components/TheSidebarLeft.vue')),
    TheUpnextDialog: defineAsyncComponent(() => import('@/components/TheUpnextDialog.vue')),
    TheAppBarCrumbs: defineAsyncComponent(() => import('@/components/TheAppBarCrumbs.vue')),
  },

  mixins: [
    clipboard,
    linkWithRoom,
  ],

  data: () => ({
    pendingAuthRedirect: null,
    pwaState,
  }),

  computed: {
    ...mapState(['isLeftSidebarOpen']),
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
        await this.navigateToSignIn();
        this.SET_NAVIGATE_SIGN_IN(false);
      }
    },
  },

  async created() {
    this.rememberAuthRedirect();

    if (this.GET_PLEX_AUTH_TOKEN) {
      try {
        await Promise.all([
          this.FETCH_PLEX_USER(),
          this.FETCH_PLEX_DEVICES(),
        ]);
        this.pendingAuthRedirect = null;
      } catch (e) {
        console.error(e);
        if (e instanceof PlexAuthError) {
          this.SET_PLEX_AUTH_TOKEN(null);
          await this.navigateToSignIn();
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
    rememberAuthRedirect() {
      const redirect = getSignInRoute(this.$route).query?.redirect
        || (this.$route.name === 'SignIn' ? this.$route.query.redirect : null);
      if (typeof redirect === 'string') {
        this.pendingAuthRedirect = redirect;
      }
    },

    async navigateToSignIn() {
      // Auth expiry can be reported by both the user and device requests. Preserve the route
      // captured before either request began, even if another report reached bare SignIn first.
      this.rememberAuthRedirect();
      const currentRedirect = this.$route.name === 'SignIn'
        ? (this.$route.query.redirect || null)
        : null;
      const redirect = currentRedirect || this.pendingAuthRedirect;

      if (this.$route.name !== 'SignIn' || currentRedirect !== redirect) {
        await this.$router.push({
          name: 'SignIn',
          ...(redirect && { query: { redirect } }),
        });
      }

      // Once SignIn owns the redirect, duplicate expiry reports can read it from the route.
      // Do not retain it in app state where a later, unrelated sign-in could reuse it.
      this.pendingAuthRedirect = null;
    },

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

<style scoped>
.skip-link {
  position: fixed;
  top: -100px;
  left: 16px;
  z-index: 9999;
  padding: 12px 20px;
  background: #e5a00d;
  color: #17120a;
  border-radius: 8px;
}
.skip-link:focus { top: max(8px, env(safe-area-inset-top)); }
.app-bar-blur { margin-top: env(safe-area-inset-top); }
.main-content { padding-top: calc(var(--v-layout-top, 64px) + env(safe-area-inset-top)); }
.app-content-scroll {
  height: calc(100dvh - var(--v-layout-top, 64px) - env(safe-area-inset-top)) !important;
  padding-bottom: max(12px, env(safe-area-inset-bottom)) !important;
  padding-left: max(12px, env(safe-area-inset-left)) !important;
  padding-right: max(12px, env(safe-area-inset-right)) !important;
}
.offline-status {
  padding: 12px 16px;
  margin: 0 auto 16px;
  max-width: 960px;
  color: #f3cc77;
  background: #2a2318;
  border: 1px solid #705522;
  border-radius: 12px;
}
</style>
