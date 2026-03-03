<template>
  <PlexMediaLayout
    :machine-identifier="metadata.machineIdentifier"
    :art="metadata.banner || metadata.art || metadata.thumb"
    :thumb="thumb"
    :title="title"
    :secondary-title="secondaryTitle"
    :subtitle="subtitle"
    :secondary-subtitle="secondarySubtitle"
    :children-header="childrenHeader"
    :children="children"
    child-full-title
    :child-cols="childCols"
    :child-sm="childSm"
    :child-md="childMd"
    :child-xl="childXl"
  >
    <template #actions>
      <v-row
        v-if="isPlaying"
        class="my-2"
        align="center"
      >
        <v-col
          cols="auto"
          class="text-medium-emphasis text-subtitle-2"
        >
          Now playing on {{ GET_CHOSEN_CLIENT.name }} from {{ server.name }}
        </v-col>

        <v-col cols="auto">
          <v-btn
            variant="flat"
            color="error"
            @click="PRESS_STOP"
          >
            <v-icon start>
              stop
            </v-icon>
            Stop
          </v-btn>
        </v-col>

        <v-col
          v-if="!AM_I_HOST"
          cols="auto"
        >
          <v-btn
            variant="flat"
            color="primary"
            class="text-white"
            @click="MANUAL_SYNC"
          >
            Manual sync
          </v-btn>
        </v-col>
      </v-row>

      <v-row
        v-else
        class="my-2"
      >
        <v-col>
          <PlexMediaPlayDialog
            v-if="metadata.Media.length > 1 || metadata.viewOffset"
            v-slot="{ props }"
            :key="combinedKey"
            :metadata="metadata"
          >
            <v-btn
              v-bind="props"
              block
              variant="flat"
              color="primary"
              class="text-white"
              size="large"
            >
              <v-icon start>
                play_arrow
              </v-icon>
              Play
            </v-btn>
          </PlexMediaPlayDialog>

          <v-btn
            v-else
            block
            variant="flat"
            color="primary"
            class="text-white"
            size="large"
            @click="playMedia(metadata, 0, 0)"
          >
            <v-icon start>
              play_arrow
            </v-icon>
            Play
          </v-btn>
        </v-col>
      </v-row>
    </template>

    <template #postTitle>
      <v-col
        cols="auto"
        class="ml-auto"
      >
        <v-chip
          v-if="
            metadata.Media && metadata.Media[0] && metadata.Media[0].videoResolution
          "
          variant="outlined"
          class="mr-2"
        >
          {{ metadata.Media[0].videoResolution.toUpperCase() }}
        </v-chip>

        <v-chip
          v-if="metadata.contentRating"
          color="grey-darken-2"
          size="small"
          label
          class="mr-2"
        >
          {{ metadata.contentRating }}
        </v-chip>

        <v-chip
          v-if="metadata.studio"
          color="grey-darken-2"
          size="small"
          label
        >
          {{ metadata.studio }}
        </v-chip>
      </v-col>

      <v-col
        cols="auto"
        class="ml-auto"
      >
        <v-menu>
          <template #activator="{ props }">
            <v-btn
              icon
              variant="text"
              v-bind="props"
            >
              <v-icon>more_vert</v-icon>
            </v-btn>
          </template>

          <v-list>
            <v-list-item @click="markWatched">
              <v-list-item-title>Mark as played</v-list-item-title>
            </v-list-item>

            <v-list-item
              :href="
                'https://app.plex.tv/desktop#!/server/'
                  + metadata.machineIdentifier
                  + '/details?key='
                  + metadata.key
              "
              target="_blank"
            >
              <v-list-item-title>Open in Plex Web</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-menu>
      </v-col>
    </template>

    <template #content>
      <v-row
        v-if="metadata.summary"
        class="text-high-emphasis text-body-2"
      >
        <v-col>
          <div
            ref="summaryText"
            :class="{ 'summary-clamped': !summaryExpanded }"
          >
            {{ metadata.summary }}
          </div>
          <v-btn
            v-if="summaryOverflows && !summaryExpanded"
            variant="text"
            size="small"
            class="px-0 mt-1 text-medium-emphasis"
            @click="summaryExpanded = true"
          >
            Show more
          </v-btn>
          <v-btn
            v-else-if="summaryExpanded"
            variant="text"
            size="small"
            class="px-0 mt-1 text-medium-emphasis"
            @click="summaryExpanded = false"
          >
            Show less
          </v-btn>
        </v-col>
      </v-row>

      <v-row
        v-if="metadata.type === 'movie'"
        class="d-none d-md-flex"
        justify="start"
        align="start"
      >
        <v-col
          v-if="metadata.Role && metadata.Role.length"
          cols="auto"
        >
          <v-list-subheader>Featuring</v-list-subheader>

          <div
            v-for="actor in metadata.Role.slice(0, 6)"
            :key="actor.tag"
          >
            {{ actor.tag }}
            <span class="text-medium-emphasis text-caption"> {{ actor.role }} </span>
          </div>
        </v-col>

        <v-col
          v-if="metadata.Director && metadata.Director.length"
          cols="auto"
        >
          <v-list-subheader>Director</v-list-subheader>

          <div
            v-for="director in metadata.Director.slice(0, 3)"
            :key="director.tag"
          >
            {{ director.tag }}
          </div>
        </v-col>

        <v-col
          v-if="metadata.Producer && metadata.Producer.length"
          cols="auto"
        >
          <v-list-subheader>Producers</v-list-subheader>

          <div
            v-for="producer in metadata.Producer.slice(0, 3)"
            :key="producer.tag"
          >
            {{ producer.tag }}
          </div>
        </v-col>

        <v-col
          v-if="metadata.Writer && metadata.Writer.length"
          cols="auto"
        >
          <v-list-subheader>Writers</v-list-subheader>

          <div
            v-for="writer in metadata.Writer.slice(0, 3)"
            :key="writer.tag"
          >
            {{ writer.tag }}
          </div>
        </v-col>
      </v-row>
    </template>
  </PlexMediaLayout>
</template>

<script>
import { defineAsyncComponent } from 'vue';
import { mapActions, mapGetters } from 'vuex';
import duration from '@/mixins/duration';
import playMedia from '@/mixins/playmedia';

export default {
  name: 'PlexItem',

  components: {
    PlexMediaLayout: defineAsyncComponent(() => import('@/components/PlexMediaLayout.vue')),
    PlexMediaPlayDialog: defineAsyncComponent(() => import('@/components/PlexMediaPlayDialog.vue')),
  },

  mixins: [
    duration,
    playMedia,
  ],

  props: {
    metadata: {
      type: Object,
      required: true,
    },
  },

  data: () => ({
    dialog: false,
    children: [],
    abortController: null,
    summaryExpanded: false,
    summaryOverflows: false,
  }),

  computed: {
    ...mapGetters('plexclients', [
      'GET_CHOSEN_CLIENT',
      'GET_CHOSEN_CLIENT_ID',
      'GET_ACTIVE_SERVER_ID',
      'GET_ACTIVE_MEDIA_METADATA',
    ]),

    ...mapGetters('plexservers', [
      'GET_MEDIA_IMAGE_URL',
      'GET_PLEX_SERVER',
    ]),

    ...mapGetters('synclounge', [
      'AM_I_HOST',
    ]),

    // This exists so we can watch if either of these change
    combinedKey() {
      return `${this.metadata.machineIdentifier}${this.metadata.ratingKey}`;
    },

    thumb() {
      return this.metadata.type === 'movie'
        ? this.metadata.thumb
        : this.metadata.parentThumb || this.metadata.grandparentThumb;
    },

    title() {
      return this.metadata.type === 'episode'
        ? this.metadata.grandparentTitle
        : this.metadata.title;
    },

    secondaryTitle() {
      return this.metadata.type === 'episode'
        ? this.metadata.parentTitle
        : this.metadata.year.toString();
    },

    subtitle() {
      return this.metadata.type === 'episode'
        ? `Episode ${this.metadata.index} - ${this.metadata.title}`
        : '';
    },

    secondarySubtitle() {
      return this.getDuration(this.metadata.duration);
    },

    childrenHeader() {
      return this.metadata.type === 'episode'
        ? `Also in ${this.metadata.parentTitle} of ${this.metadata.grandparentTitle}`
        : 'Related Movies';
    },

    childCols() {
      return this.metadata.type === 'episode'
        ? 6
        : 4;
    },

    childSm() {
      return this.metadata.type === 'episode'
        ? 4
        : 3;
    },

    childMd() {
      return this.metadata.type === 'episode'
        ? 3
        : 2;
    },

    childXl() {
      return this.metadata.type === 'episode'
        ? 2
        : 1;
    },

    server() {
      return this.GET_PLEX_SERVER(this.metadata.machineIdentifier);
    },

    isPlaying() {
      return this.GET_ACTIVE_MEDIA_METADATA?.machineIdentifier === this.metadata.machineIdentifier
      && this.GET_ACTIVE_MEDIA_METADATA?.ratingKey === this.metadata.ratingKey;
    },
  },

  watch: {
    combinedKey: {
      handler() {
        this.dialog = false;
        this.summaryExpanded = false;
        this.summaryOverflows = false;
        this.$nextTick(() => this.checkSummaryOverflow());
        return this.fetchRelated();
      },
      immediate: true,
    },
  },

  updated() {
    this.checkSummaryOverflow();
  },

  beforeUnmount() {
    this.abortRequests();
  },

  methods: {
    checkSummaryOverflow() {
      const el = this.$refs.summaryText;
      if (el) {
        this.summaryOverflows = el.scrollHeight > el.clientHeight + 1;
      }
    },
    ...mapActions('plexclients', [
      'PLAY_MEDIA',
      'PRESS_STOP',
    ]),

    ...mapActions('plexservers', [
      'FETCH_RELATED',
      'FETCH_MEDIA_CHILDREN',
      'MARK_WATCHED',
    ]),

    ...mapActions('synclounge', [
      'MANUAL_SYNC',
    ]),

    abortRequests() {
      if (this.abortController) {
        // Cancel outstanding request
        this.abortController.abort();
        this.abortController = null;
      }
    },

    async fetchRelatedCriticalSection(signal) {
      if (this.metadata.type === 'episode') {
        this.children = await this.FETCH_MEDIA_CHILDREN({
          machineIdentifier: this.metadata.machineIdentifier,
          ratingKey: this.metadata.parentRatingKey,
          start: this.metadata.index - 1,
          size: 6,
          excludeAllLeaves: 1,
          signal,
        });
      } else if (this.metadata.type === 'movie') {
        this.children = await this.FETCH_RELATED({
          machineIdentifier: this.metadata.machineIdentifier,
          ratingKey: this.metadata.ratingKey,
          count: 12,
          signal,
        });
      }
    },

    async fetchRelated() {
      this.abortRequests();

      const controller = new AbortController();
      this.abortController = controller;

      try {
        await this.fetchRelatedCriticalSection(controller.signal);
      } catch (e) {
        if (!controller.signal.aborted) {
          throw e;
        }
      }
    },

    async markWatched() {
      try {
        await this.MARK_WATCHED({
          machineIdentifier: this.metadata.machineIdentifier,
          ratingKey: this.metadata.ratingKey,
        });
      } catch (e) {
        console.error('Error marking as watched:', e);
      }
    },
  },
};
</script>

<style scoped>
.summary-clamped {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
