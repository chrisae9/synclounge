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

      <v-spacer />

      <v-toolbar-items>
        <v-btn
          v-if="inviteUrl"
          color="primary"
          @click="copyToClipboard(inviteUrl)"
        >
          <v-icon start class="d-sm-none">
            person_add
          </v-icon>
          <span class="d-none d-sm-inline">Invite</span>
        </v-btn>

        <v-btn
          class="d-none d-sm-flex"
          icon
          href="https://github.com/chrisae9/synclounge"
          target="_blank"
        >
          <v-icon>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/></svg>
          </v-icon>
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
          style="max-width: 400px; min-width: 0; flex-shrink: 1;"
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
          style="height: calc(100vh - var(--v-layout-top, 64px));"
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
import clipboard from '@/mixins/clipboard';
import linkWithRoom from '@/mixins/linkwithroom';

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
      'SET_LEFT_SIDEBAR_OPEN',
    ]),

  },
};
</script>

