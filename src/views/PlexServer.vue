<template>
  <v-container
    class="pt-0"
    fluid
  >
    <v-list-subheader>
      Libraries
    </v-list-subheader>

    <v-row dense>
      <v-col
        v-for="library in libraries"
        :key="library.name"
        cols="6"
        sm="6"
        md="3"
        lg="2"
      >
        <v-card
          variant="flat"
          rounded="lg"
          class="library-card"
          :to="linkWithRoom({
            name: 'PlexLibrary',
            params: {
              machineIdentifier: machineIdentifier,
              sectionId: library.key,
            },
          })"
        >
          <div class="library-card-content">
            <v-icon
              size="32"
              color="primary"
            >
              {{ libraryIcon(library.type) }}
            </v-icon>
            <div class="text-subtitle-1 font-weight-medium mt-2">
              {{ library.title }}
            </div>
            <div
              v-if="library.size"
              class="text-caption text-medium-emphasis"
            >
              {{ library.size }} items
            </div>
          </div>
        </v-card>
      </v-col>
    </v-row>

    <PlexOnDeck :machine-identifier="machineIdentifier">
      <template #preHeader>
        <v-divider
          class="mt-3 ma-2"
        />
      </template>
    </PlexOnDeck>

    <PlexRecentlyAdded :machine-identifier="machineIdentifier">
      <template #preHeader>
        <v-divider
          class="mt-3 ma-2"
        />
      </template>
    </PlexRecentlyAdded>
  </v-container>
</template>

<script>
import { defineAsyncComponent } from 'vue';
import { mapActions, mapGetters, mapMutations } from 'vuex';
import linkWithRoom from '@/mixins/linkwithroom';

export default {
  name: 'PlexServer',

  components: {
    PlexOnDeck: defineAsyncComponent(() => import('@/components/PlexOnDeck.vue')),
    PlexRecentlyAdded: defineAsyncComponent(() => import('@/components/PlexRecentlyAdded.vue')),
  },

  mixins: [
    linkWithRoom,
  ],

  props: {
    machineIdentifier: {
      type: String,
      required: true,
    },
  },

  data: () => ({
    abortController: null,
  }),

  computed: {
    ...mapGetters('plexservers', [
      'GET_PLEX_SERVER',
    ]),

    libraries() {
      return this.GET_PLEX_SERVER(this.machineIdentifier).libraries
        ? Object.values(this.GET_PLEX_SERVER(this.machineIdentifier).libraries)
          .filter((library) => library.type !== 'artist'
            || library.agent !== 'tv.plex.agents.music')
        : [];
    },
  },

  watch: {
    machineIdentifier: {
      handler() {
        this.setupCrumbs();
        return this.fetchRandomBackground();
      },
      immediate: true,
    },
  },

  beforeUnmount() {
    this.abortRequests();
  },

  methods: {
    ...mapActions('plexservers', [
      'FETCH_AND_SET_RANDOM_BACKGROUND_IMAGE',
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

    setupCrumbs() {
      this.SET_ACTIVE_METADATA({
        machineIdentifier: this.machineIdentifier,
      });
    },

    libraryIcon(type) {
      const icons = {
        movie: 'theaters',
        show: 'live_tv',
        artist: 'library_music',
        photo: 'photo_library',
      };
      return icons[type] || 'video_library';
    },

    async fetchRandomBackgroundCriticalSection(signal) {
      await this.FETCH_AND_SET_RANDOM_BACKGROUND_IMAGE({
        machineIdentifier: this.machineIdentifier,
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
.library-card {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04) !important;
}

.library-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgb(0 0 0 / 40%) !important;
  border-color: rgba(229, 160, 13, 0.3);
}

.library-card-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  text-align: center;
}
</style>
