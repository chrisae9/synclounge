<template>
  <v-menu
    v-model="menuOpen"
    :close-on-content-click="false"
    location="bottom start"
    offset="5"
    scroll-strategy="reposition"
    min-width="300"
  >
    <template #activator="{ props }">
      <v-text-field
        v-bind="props"
        v-model="query"
        density="compact"
        prepend-inner-icon="search"
        placeholder="Search..."
        hide-details
        variant="solo"
        clearable
        :loading="loading"
        @click:clear="clear"
      />
    </template>

    <v-list
      v-if="query || items.length"
      density="compact"
      class="py-0"
      style="max-height: 80vh; max-width: 500px; overflow-y: auto;"
    >
      <v-list-item
        v-if="query"
        :to="linkWithRoom({ name: 'PlexSearch', params: { query } })"
        @click="menuOpen = false"
      >
        <v-list-item-title class="text-caption text-disabled">
          Search all sources...
        </v-list-item-title>
      </v-list-item>

      <v-divider v-if="query && items.length" />

      <template
        v-for="(item, index) in items"
        :key="index"
      >
        <v-list-subheader
          v-if="item.serverHeader"
          class="search-header text-uppercase font-weight-bold"
        >
          {{ item.serverHeader }}
        </v-list-subheader>

        <v-list-subheader
          v-else-if="item.hubHeader"
          class="text-overline search-header"
        >
          {{ item.hubHeader }}
        </v-list-subheader>

        <v-list-item
          v-else
          :to="contentLink(item)"
          @click="clear"
        >
          <template #prepend>
            <v-avatar
              rounded="0"
              width="28"
              height="42"
              class="mr-3"
            >
              <v-img
                :src="getImgUrl(item)"
                cover
              />
            </v-avatar>
          </template>

          <v-list-item-title> {{ getTitle(item) }} </v-list-item-title>
          <v-list-item-subtitle> {{ getItemSecondaryTitle(item) }} </v-list-item-subtitle>
        </v-list-item>
      </template>
    </v-list>
  </v-menu>
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
    menuOpen: false,
  }),

  computed: {
    ...mapGetters('plexservers', [
      'GET_ENABLED_PLEX_SERVER_IDS',
      'GET_PLEX_SERVER',
      'GET_MEDIA_IMAGE_URL',
    ]),

    servers() {
      return this.machineIdentifier
        ? [this.machineIdentifier]
        : this.GET_ENABLED_PLEX_SERVER_IDS;
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
    query(newVal) {
      if (newVal && newVal.length > 0) {
        this.menuOpen = true;
      } else {
        this.menuOpen = false;
      }
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
      this.menuOpen = false;
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
  min-height: 32px;
}
</style>
