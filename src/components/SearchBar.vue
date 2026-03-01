<template>
  <v-autocomplete
    density="compact"
    :items="items"
    :loading="loading"
    v-model:search="query"
    prepend-icon="search"
    no-filter
    clearable
    hide-details
    hide-no-data
    variant="solo"
    :menu-props="{ maxHeight: '80vh', maxWidth: '500px' }"
  >
    <template
      v-if="query"
      #prepend-item
    >
      <v-list-item
        density="compact"
        :to="linkWithRoom({ name: 'PlexSearch', params: { query } })"
      >
        <v-list-subheader>
          Search all sources...
        </v-list-subheader>
      </v-list-item>
    </template>

    <template #item="{ item, props }">
      <template v-if="item.raw.serverHeader">
        <v-list-item
          class="secondary"
          density="compact"
          v-bind="props"
        >
          <v-list-subheader
            class="search-header"
          >
            {{ item.raw.serverHeader }}
          </v-list-subheader>
        </v-list-item>
      </template>

      <template v-else-if="item.raw.hubHeader">
        <v-list-item
          density="compact"
          v-bind="props"
          class="search-header"
        >
          <v-list-subheader
            class="text-overline search-header"
          >
            {{ item.raw.hubHeader }}
          </v-list-subheader>
        </v-list-item>
      </template>

      <template v-else>
        <v-list-item
          density="compact"
          v-bind="props"
          :to="contentLink(item.raw)"
          @click="clear"
        >
          <template #prepend>
            <v-avatar size="42" rounded="0">
              <v-img
                :src="getImgUrl(item.raw)"
              />
            </v-avatar>
          </template>

          <v-list-item-title> {{ getTitle(item.raw) }} </v-list-item-title>
          <v-list-item-subtitle> {{ getItemSecondaryTitle(item.raw) }} </v-list-item-subtitle>
        </v-list-item>
      </template>
    </template>
  </v-autocomplete>
</template>

<script>
import { mapActions, mapGetters } from 'vuex';
import { CAF } from 'caf';
import contentTitle from '@/mixins/contentTitle';
import linkwithroom from '@/mixins/linkwithroom';
import contentLink from '@/mixins/contentlink';

const debounceTime = 250;

export default {
  name: 'SearchBar',

  mixins: [
    contentTitle,
    contentLink,
    linkwithroom,
  ],

  props: {
    machineIdentifier: {
      type: String,
      default: '',
    },

    sectionId: {
      type: [String, Number],
      default: '',
    },
  },

  data: () => ({
    loading: false,
    items: [],
    query: null,
    abortController: null,
  }),

  computed: {
    ...mapGetters('plexservers', [
      'GET_CONNECTABLE_PLEX_SERVER_IDS',
      'GET_PLEX_SERVER',
      'GET_MEDIA_IMAGE_URL',
    ]),

    servers() {
      return this.machineIdentifier
        ? [this.machineIdentifier]
        : this.GET_CONNECTABLE_PLEX_SERVER_IDS;
    },

    searchParams() {
      return this.sectionId
        ? {
          sectionId: this.sectionId,
          contextual: 1,
        }
        : null;
    },
  },

  watch: {
    query() {
      return this.searchServers();
    },
  },

  beforeUnmount() {
    this.abortRequests();
  },

  methods: {
    ...mapActions('plexservers', [
      'SEARCH_PLEX_SERVER_HUB',
    ]),

    getItemSecondaryTitle(item) {
      return item.reason
        ? this.getReasonTitle(item)
        : this.getSecondaryTitle(item);
    },

    getItemThumb({ type, thumb, grandparentThumb }) {
      switch (type) {
        case 'movie':
          return thumb;

        case 'episode':
          return grandparentThumb;

        case 'series':
          return thumb;

        default:
          return thumb;
      }
    },

    getImgUrl(item) {
      return this.GET_MEDIA_IMAGE_URL({
        machineIdentifier: item.machineIdentifier,
        mediaUrl: this.getItemThumb(item),
        width: 28,
        height: 42,
      });
    },

    abortRequests() {
      if (this.abortController) {
        // Cancel outstanding request
        this.abortController.abort();
        this.abortController = null;
      }
    },

    clear() {
      this.abortRequests();
      this.query = null;
      this.items = [];
      this.loading = false;
    },

    async searchServersCriticalSection(signal) {
      await Promise.all(this.servers.map(async (machineIdentifier) => {
        const serverResults = await this.SEARCH_PLEX_SERVER_HUB({
          ...this.searchParams,
          query: this.query,
          machineIdentifier,
          signal,
        });

        if (serverResults.length) {
          const results = [{
            serverHeader: this.GET_PLEX_SERVER(machineIdentifier).name,
            disabled: true,
          }].concat(
            serverResults.flatMap(({ Metadata, title }) => [{
              hubHeader: title,
              disabled: true,
            }].concat(Metadata)),
          );

          this.items.push(...results);
        }
      }));

      this.loading = false;
    },

    async searchServersDebounced(signal) {
      await CAF.delay(signal, debounceTime);
      await this.searchServersCriticalSection(signal);
    },

    async searchServers() {
      this.abortRequests();

      this.items = [];
      if (!this.query || !this.query.trim()) {
        this.loading = false;
        return;
      }

      this.loading = true;

      const controller = new AbortController();
      this.abortController = controller;

      try {
        await this.searchServersDebounced(controller.signal);
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
.v-list-item.search-header,
.v-list-subheader.search-header {
  height: unset;
  min-height: unset;
}
</style>
