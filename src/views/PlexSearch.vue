<template>
  <v-container
    fluid
  >
    <v-progress-linear
      :active="loading"
      :indeterminate="true"
      color="primary"
    />

    <v-alert
      v-if="!loading && !GET_ENABLED_PLEX_SERVER_IDS.length"
      type="info"
      variant="tonal"
      class="recovery-panel"
      :title="hasEnabledServers ? 'Couldn’t reach your libraries' : 'No libraries enabled'"
    >
      {{ hasEnabledServers ? 'Your Plex servers are unavailable. Check their connection in Browse libraries.'
        : 'Enable a Plex server in Browse libraries or Settings to include its libraries in search.' }}
      <div class="mt-3">
        <v-btn

          :to="linkWithRoom({ name: 'PlexHome' })"
        >
          Browse libraries
        </v-btn>
      </div>
    </v-alert>
    <v-alert
      v-else-if="searchFailed"
      type="warning"
      variant="tonal"
      class="recovery-panel"
      title="Couldn’t search all libraries"
    >
      Some libraries did not respond. Any available results are shown below.
      <div class="mt-3">
        <v-btn

          :disabled="loading"
          @click="searchServers"
        >
          Retry search
        </v-btn>
      </div>
    </v-alert>
    <v-alert
      v-else-if="!loading && !hasResults"
      type="info"
      variant="tonal"
      class="recovery-panel"
      title="No matches"
    >
      No results for “{{ query }}”. Try another title or clear your search.
      <div class="mt-3">
        <v-btn

          :to="linkWithRoom({ name: 'PlexHome' })"
        >
          Clear search
        </v-btn>
      </div>
    </v-alert>

    <div
      v-for="(hub, id) in hubs"
      :key="id"
    >
      <v-list-subheader>{{ hub.title }}</v-list-subheader>

      <v-row>
        <v-col
          v-for="item in hub.Metadata"
          :key="item.ratingKey + item.machineIdentifier"
          :cols="getHubCols(hub)"
          :sm="getHubSm(hub)"
          :md="getHubMd(hub)"
          :xl="getHubXl(hub)"
        >
          <PlexThumbnail
            :content="item"
            show-server
            type="thumb"
            :cols="getHubCols(hub)"
            :sm="getHubSm(hub)"
            :md="getHubMd(hub)"
            :xl="getHubXl(hub)"
          />
        </v-col>
      </v-row>
    </div>
  </v-container>
</template>

<script>
import { defineAsyncComponent, markRaw } from 'vue';
import linkWithRoom from '@/mixins/linkwithroom';
import { mapActions, mapGetters, mapMutations } from 'vuex';

export default {
  name: 'PlexSearch',

  components: {
    PlexThumbnail: defineAsyncComponent(() => import('@/components/PlexThumbnail.vue')),
  },

  mixins: [linkWithRoom],

  props: {
    query: {
      type: String,
      required: true,
    },
  },

  data: () => ({
    loading: false,
    searchFailed: false,
    hubs: {},
    abortController: null,
  }),

  computed: {
    hasResults() {
      return Object.values(this.hubs).some((hub) => hub.Metadata?.length);
    },
    hasEnabledServers() {
      return this.GET_PLEX_SERVERS.some((server) => this.IS_PLEX_SERVER_ENABLED(server.clientIdentifier));
    },
    ...mapGetters('plexservers', [
      'GET_ENABLED_PLEX_SERVER_IDS',
      'GET_PLEX_SERVERS',
      'IS_PLEX_SERVER_ENABLED',
      'GET_PLEX_SERVER',
      'GET_MEDIA_IMAGE_URL',
    ]),
  },

  watch: {
    GET_ENABLED_PLEX_SERVER_IDS: {
      handler() { return this.searchServers(); },
      deep: true,
    },
    query: {
      handler() {
        this.updateCrumbs();
        return this.searchServers();
      },
      immediate: true,
    },
  },

  beforeUnmount() {
    this.abortRequests();
  },

  methods: {
    ...mapActions('plexservers', [
      'SEARCH_PLEX_SERVER_HUB',
    ]),

    ...mapMutations([
      'SET_ACTIVE_METADATA',
    ]),

    abortRequests() {
      if (this.abortController) {
        // Cancel outstanding request
        this.abortController.abort();
        this.abortController = null;
      }
    },

    updateCrumbs() {
      this.SET_ACTIVE_METADATA({
        query: this.query,
      });
    },

    addHubs(newHubs) {
      newHubs.forEach((hub) => {
        if (!this.hubs[hub.hubIdentifier]) {
          this.hubs[hub.hubIdentifier] = hub;
        } else {
          this.hubs[hub.hubIdentifier].Metadata.push(...hub.Metadata);
        }
      });
    },

    async searchServersCriticalSection(signal) {
      const results = await Promise.allSettled(this.GET_ENABLED_PLEX_SERVER_IDS.map((machineIdentifier) => (
        this.SEARCH_PLEX_SERVER_HUB({
          query: this.query, machineIdentifier, limit: 30, signal,
        })
      )));
      if (signal.aborted) return;
      results.forEach((result) => {
        if (result.status === 'fulfilled') this.addHubs(result.value);
      });
      this.searchFailed = results.some((result) => result.status === 'rejected');
    },

    async searchServers() {
      this.abortRequests();

      this.searchFailed = false;
      this.hubs = {};
      this.loading = true;

      const controller = markRaw(new AbortController());
      this.abortController = controller;

      try {
        await this.searchServersCriticalSection(controller.signal);
      } catch (e) {
        if (!controller.signal.aborted) {
          this.searchFailed = true;
        }
      } finally {
        if (this.abortController === controller) {
          this.loading = false;
          this.abortController = null;
        }
      }
    },

    getHubCols({ type }) {
      return type === 'episode'
        ? 6
        : 4;
    },

    getHubSm({ type }) {
      return type === 'episode'
        ? 4
        : 3;
    },

    getHubMd({ type }) {
      return type === 'episode'
        ? 3
        : 2;
    },

    getHubXl({ type }) {
      return type === 'episode'
        ? 2
        : 1;
    },
  },
};
</script>
