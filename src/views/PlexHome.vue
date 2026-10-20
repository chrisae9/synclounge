<template>
  <v-container fluid>
    <v-alert
      v-if="$route?.query?.playback === 'unavailable'"
      type="info"
      variant="tonal"
      class="recovery-panel"
      title="No movie is playing in this room"
    >
      You’re in the room, but there’s no playback to restore. Rooms clear when everyone leaves.
      Pick a movie below, or wait for your host to start one.
    </v-alert>
    <v-alert
      v-if="GET_PLEX_SERVERS.length && !hasEnabledServers"
      type="info"
      variant="tonal"
      class="recovery-panel"
      title="No libraries enabled"
    >
      Your Plex servers are hidden. Use each server’s crossed-out eye button below to include it in browsing and search.
    </v-alert>
    <v-alert
      v-if="refreshError"
      type="error"
      variant="tonal"
      class="recovery-panel"
    >
      Couldn’t refresh your Plex servers. Check your connection and try again.
    </v-alert>
    <PlexOnDeck
      v-if="GET_LAST_SERVER?.chosenConnection && IS_PLEX_SERVER_ENABLED(GET_LAST_SERVER_ID)"
      :machine-identifier="GET_LAST_SERVER_ID"
    >
      <template #header>
        Continue watching from {{ GET_LAST_SERVER.name }}
      </template>
    </PlexOnDeck>

    <v-list-subheader class="mt-4">
      Browse
      <v-btn
        size="small"
        icon
        variant="text"
        aria-label="Refresh Plex servers"
        title="Refresh Plex servers"
        :loading="refreshPending"
        @click="refreshServers"
      >
        <v-icon size="small">
          refresh
        </v-icon>
      </v-btn>
    </v-list-subheader>

    <v-row>
      <v-col
        v-if="!GET_PLEX_SERVERS.length"
        cols="12"
        class="text-h5 text-primary"
      >
        No Plex Servers found.
        Make sure your server owner has shared libraries with you!
        <div class="mt-3">
          <v-btn

            :loading="refreshPending"
            @click="refreshServers"
          >
            Retry
          </v-btn>
        </div>
      </v-col>

      <v-col
        v-for="server in GET_PLEX_SERVERS"
        :key="server.clientIdentifier"
        cols="12"
        md="6"
        lg="4"
        xl="3"
      >
        <v-card
          :to="server.chosenConnection && IS_PLEX_SERVER_ENABLED(server.clientIdentifier)
            ? linkWithRoom({ name: 'PlexServer', params: { machineIdentifier: server.clientIdentifier } })
            : undefined"
          rounded="lg"
          class="server-card"
          :class="{ 'server-card--disabled': !IS_PLEX_SERVER_ENABLED(server.clientIdentifier) }"
        >
          <v-container class="fill-height">
            <v-row
              dense
              justify="center"
              align="center"
            >
              <v-col cols="4">
                <v-img
                  src="@/assets/images/logos/plexlogo.png"
                  height="110px"
                />
              </v-col>

              <v-col
                cols="8"
                class="pl-2"
              >
                <div>
                  <div class="d-flex align-center">
                    <div class="text-truncate text-h5 flex-grow-1">
                      {{ server.name }}
                    </div>

                    <v-btn
                      :icon="IS_PLEX_SERVER_ENABLED(server.clientIdentifier) ? 'visibility' : 'visibility_off'"
                      :aria-label="visibilityLabel(server)"
                      :title="visibilityLabel(server)"
                      size="small"
                      variant="text"
                      :color="IS_PLEX_SERVER_ENABLED(server.clientIdentifier) ? 'primary' : 'grey'"
                      @click.prevent.stop="TOGGLE_SERVER_ENABLED(server.clientIdentifier)"
                    />
                  </div>

                  <div class="text-medium-emphasis text-caption">
                    v{{ server.productVersion }}
                  </div>

                  <div class="text-subtitle-2 text-medium-emphasis">
                    Owned by {{ ownerOfServer(server) }}
                  </div>

                  <div
                    v-if="!server.chosenConnection"
                    class="text-error text-caption"
                  >
                    Can’t reach this Plex server.
                    <v-btn
                      size="small"
                      variant="text"
                      :loading="refreshPending"
                      @click.prevent.stop="refreshServers"
                    >
                      Retry connection
                    </v-btn>
                    <details @click.stop>
                      <summary>Troubleshooting</summary>
                      Check that the server is online and your network can reach it. Browser extensions
                      may also block requests; check them if the problem continues.
                    </details>
                  </div>

                  <div
                    v-if="!IS_PLEX_SERVER_ENABLED(server.clientIdentifier)"
                    class="text-caption text-medium-emphasis"
                  >
                    Hidden from browsing and search
                  </div>
                </div>
              </v-col>
            </v-row>
          </v-container>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script>
import { defineAsyncComponent } from 'vue';
import { mapActions, mapGetters, mapMutations } from 'vuex';
import linkWithRoom from '@/mixins/linkwithroom';

export default {
  name: 'PlexHome',

  components: {
    PlexOnDeck: defineAsyncComponent(() => import('@/components/PlexOnDeck.vue')),
  },

  mixins: [
    linkWithRoom,
  ],

  data: () => ({
    abortController: null,
    refreshPending: false,
    refreshError: false,
  }),

  computed: {
    hasEnabledServers() {
      return this.GET_PLEX_SERVERS.some((server) => this.IS_PLEX_SERVER_ENABLED(server.clientIdentifier));
    },
    ...mapGetters('plexservers', [
      'GET_LAST_SERVER',
      'GET_LAST_SERVER_ID',
      'GET_PLEX_SERVERS',
      'IS_PLEX_SERVER_ENABLED',
    ]),
  },

  async created() {
    this.SET_ACTIVE_METADATA(null);
    await this.fetchRandomBackground();
  },

  beforeUnmount() {
    this.abortRequests();
  },

  methods: {
    visibilityLabel(server) {
      return `${this.IS_PLEX_SERVER_ENABLED(server.clientIdentifier) ? 'Hide' : 'Show'} libraries from ${server.name}`;
    },
    async refreshServers() {
      if (this.refreshPending) return;
      this.refreshPending = true;
      this.refreshError = false;
      try {
        await this.FETCH_PLEX_DEVICES();
      } catch {
        this.refreshError = true;
      } finally {
        this.refreshPending = false;
      }
    },
    ...mapActions('plexservers', [
      'FETCH_AND_SET_RANDOM_BACKGROUND_IMAGE',
    ]),

    ...mapActions('plex', [
      'FETCH_PLEX_DEVICES',
    ]),

    ...mapMutations([
      'SET_ACTIVE_METADATA',
    ]),

    ...mapMutations('plexservers', [
      'TOGGLE_SERVER_ENABLED',
    ]),

    abortRequests() {
      if (this.abortController) {
        // Cancel outstanding request
        this.abortController.abort();
        this.abortController = null;
      }
    },

    ownerOfServer({ owned, sourceTitle }) {
      return owned
        ? 'you'
        : sourceTitle;
    },

    async fetchRandomBackgroundCriticalSection(signal) {
      await this.FETCH_AND_SET_RANDOM_BACKGROUND_IMAGE({
        signal,
      });
    },

    async fetchRandomBackground() {
      this.abortRequests();

      const controller = new AbortController();
      this.abortController = controller;

      try {
        await this.fetchRandomBackgroundCriticalSection(controller.signal);
      } catch (e) {
        if (!controller.signal.aborted) {
          throw e;
        }
      }
    },
  },
};
</script>

<style scoped>
.server-card {
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: background 0.2s ease, border-color 0.2s ease;
}

.server-card:hover {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(229, 160, 13, 0.4);
}

.server-card--disabled {
  opacity: 0.4;
}
</style>
