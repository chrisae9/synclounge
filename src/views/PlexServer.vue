<template>
  <v-container
    class="pt-0"
    fluid
  >
    <v-list-subheader>
      Libraries
    </v-list-subheader>

    <v-row>
      <v-col
        v-for="library in libraries"
        :key="library.name"
        cols="12"
        sm="6"
        md="3"
        lg="2"
      >
        <v-tooltip
          location="bottom"
        >
          <template #activator="{ props }">
            <v-card
              v-bind="props"
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
              <v-img
                :src="getComposite(library)"
                :aspect-ratio="16/9"
                cover
                class="library-card-img"
              >
                <div class="library-card-overlay d-flex align-end pa-3">
                  <v-icon
                    class="mr-2"
                    size="24"
                    color="primary"
                  >
                    {{ libraryIcon(library.type) }}
                  </v-icon>
                  <span class="text-subtitle-1 font-weight-medium">
                    {{ library.title }}
                  </span>
                  <v-spacer />
                  <span
                    v-if="library.size"
                    class="text-caption text-medium-emphasis"
                  >
                    {{ library.size }}
                  </span>
                </div>
              </v-img>
            </v-card>
          </template>

          <span>{{ library.title }}</span>
        </v-tooltip>
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
import { getAppWidth } from '@/utils/sizing';
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
      'GET_MEDIA_IMAGE_URL',
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

    getComposite(library) {
      return this.GET_MEDIA_IMAGE_URL({
        machineIdentifier: this.machineIdentifier,
        mediaUrl: library.composite,
        width: Math.round(getAppWidth() / 3),
        height: Math.round(getAppWidth() / 3 * (9 / 16)),
      });
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
}

.library-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgb(0 0 0 / 40%) !important;
}

.library-card-img {
  filter: brightness(0.85);
  transition: filter 0.2s ease;
}

.library-card:hover .library-card-img {
  filter: brightness(1);
}

.library-card-overlay {
  background: linear-gradient(to top, rgb(0 0 0 / 85%) 0%, rgb(0 0 0 / 20%) 60%, transparent 100%);
  position: absolute;
  inset: 0;
}
</style>
