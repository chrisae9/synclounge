<template>
  <div v-if="recentlyAdded.length">
    <slot name="preHeader" />
    <MediaShelf
      :items="recentlyAdded"
      posters
      label="Recently Added"
    >
      <template #header>
        Recently Added
      </template>
      <template #default="{ item }">
        <PlexThumbnail
          :content="item"
          type="thumb"
          full-title
          cols="4"
          sm="3"
          md="2"
          xl="1"
        />
      </template>
    </MediaShelf>
  </div>
</template>

<script>
import { defineAsyncComponent } from 'vue';
import { mapActions } from 'vuex';
import MediaShelf from './MediaShelf.vue';

export default {
  name: 'PlexRecentlyAdded',

  components: {
    MediaShelf,
    PlexThumbnail: defineAsyncComponent(() => import('@/components/PlexThumbnail.vue')),
  },

  props: {
    machineIdentifier: {
      type: String,
      required: true,
    },
  },

  data: () => ({
    recentlyAdded: [],
    abortController: null,
  }),

  watch: {
    machineIdentifier: {
      handler() {
        this.recentlyAdded = [];
        return this.fetchRecentlyAdded();
      },
      immediate: true,
    },
  },

  beforeUnmount() {
    this.abortRequests();
  },

  methods: {
    ...mapActions('plexservers', [
      'FETCH_RECENTLY_ADDED_MEDIA',
    ]),

    abortRequests() {
      if (this.abortController) {
        // Cancel outstanding request
        this.abortController.abort();
        this.abortController = null;
      }
    },

    async fetchRecentlyAddedCriticalSection(signal) {
      this.recentlyAdded = await this.FETCH_RECENTLY_ADDED_MEDIA({
        machineIdentifier: this.machineIdentifier,
        signal,
      });
    },

    async fetchRecentlyAdded() {
      this.abortRequests();

      const controller = new AbortController();
      this.abortController = controller;

      try {
        await this.fetchRecentlyAddedCriticalSection(controller.signal);
      } catch (e) {
        if (!controller.signal.aborted) {
          throw e;
        }
      }
    },
  },
};
</script>
