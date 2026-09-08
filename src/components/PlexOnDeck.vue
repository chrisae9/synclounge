<template>
  <div v-if="onDeck.length">
    <slot name="preHeader" />
    <MediaShelf
      :items="onDeck"
      label="Continue watching"
    >
      <template #header>
        <slot name="header">
          On Deck
        </slot>
      </template>
      <template #default="{ item }">
        <PlexThumbnail
          :content="item"
          type="art"
          cols="6"
          sm="4"
          md="3"
          xl="2"
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
  name: 'PlexOnDeck',

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
    onDeck: [],
    abortController: null,
  }),

  watch: {
    machineIdentifier: {
      handler() {
        this.onDeck = [];
        return this.fetchOnDeck();
      },
      immediate: true,
    },
  },

  beforeUnmount() {
    this.abortRequests();
  },

  methods: {
    ...mapActions('plexservers', [
      'FETCH_ON_DECK',
    ]),

    abortRequests() {
      if (this.abortController) {
        // Cancel outstanding request
        this.abortController.abort();
        this.abortController = null;
      }
    },

    async fetchOnDeckCriticalSection(signal) {
      this.onDeck = await this.FETCH_ON_DECK({
        machineIdentifier: this.machineIdentifier,
        start: 0,
        size: 10,
        signal,
      });
    },

    async fetchOnDeck() {
      this.abortRequests();

      const controller = new AbortController();
      this.abortController = controller;

      try {
        await this.fetchOnDeckCriticalSection(controller.signal);
      } catch (e) {
        if (!controller.signal.aborted) {
          throw e;
        }
      }
    },
  },
};
</script>
