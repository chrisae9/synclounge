<template>
  <v-container fluid>
    <PlexOnDeck :machine-identifier="GET_LAST_SERVER_ID">
      <template #header>
        Continue watching from {{ GET_LAST_SERVER.name }}
      </template>
    </PlexOnDeck>

    <v-divider />

    <v-list-subheader>
      Browse
      <v-btn
        size="x-small"
        icon
        @click="FETCH_PLEX_DEVICES"
      >
        <v-icon>refresh</v-icon>
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
          :to="IS_PLEX_SERVER_ENABLED(server.clientIdentifier)
            ? linkWithRoom({ name: 'PlexServer', params: { machineIdentifier: server.clientIdentifier } })
            : undefined"
          :style="{
            background: 'rgb(0 0 0 / 60%)',
            opacity: IS_PLEX_SERVER_ENABLED(server.clientIdentifier) ? 1 : 0.4,
          }"
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
                      size="x-small"
                      variant="text"
                      :color="IS_PLEX_SERVER_ENABLED(server.clientIdentifier) ? 'primary' : 'grey'"
                      @click.prevent.stop="TOGGLE_SERVER_ENABLED(server.clientIdentifier)"
                    />
                  </div>

                  <div class="text-medium-emphasis text-caption">
                    v{{ server.productVersion }}
                  </div>

                  <div class="text-subtitle-2">
                    Owned by {{ ownerOfServer(server) }}
                  </div>

                  <div
                    v-if="!server.chosenConnection"
                    class="text-error"
                  >
                    Unable to connect.
                    Try disabling your adblocker
                  </div>

                  <div
                    v-if="!IS_PLEX_SERVER_ENABLED(server.clientIdentifier)"
                    class="text-caption text-medium-emphasis"
                  >
                    Disabled — not included in search
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
  }),

  computed: {
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
