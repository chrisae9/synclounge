<template>
  <v-container
    :style="containerStyle"
    fluid
  >
    <v-row
      v-if="!IS_LIBRARY_LIST_VIEW"
      no-gutters
      align="center"
      class="mb-2 px-1"
    >
      <v-col cols="auto">
        <v-select
          v-model="gridSort"
          density="compact"
          hide-details
          variant="outlined"
          :items="sortOptions[library.type] || sortOptions.movie"
          item-title="title"
          item-value="value"
          style="min-width: 160px;"
        />
      </v-col>

      <v-col
        cols="auto"
        class="ml-2"
      >
        <v-btn
          :icon="gridSortDesc ? 'arrow_downward' : 'arrow_upward'"
          size="small"
          variant="text"
          @click="gridSortDesc = !gridSortDesc"
        />
      </v-col>

      <v-spacer />

      <v-col
        cols="auto"
        class="d-none d-sm-block"
      >
        <div class="d-flex align-center flex-wrap">
          <v-btn
            size="x-small"
            variant="text"
            :color="!activeFirstCharacter ? 'primary' : undefined"
            class="letter-btn"
            @click="setFirstCharacter(null)"
          >
            All
          </v-btn>

          <v-btn
            size="x-small"
            variant="text"
            :color="activeFirstCharacter === '#' ? 'primary' : undefined"
            class="letter-btn"
            @click="setFirstCharacter('#')"
          >
            #
          </v-btn>

          <v-btn
            v-for="letter in alphabet"
            :key="letter"
            size="x-small"
            variant="text"
            :color="activeFirstCharacter === letter ? 'primary' : undefined"
            class="letter-btn"
            @click="setFirstCharacter(letter)"
          >
            {{ letter }}
          </v-btn>
        </div>
      </v-col>
    </v-row>

    <v-row
      v-if="IS_LIBRARY_LIST_VIEW"
      no-gutters
      class="ma-n3"
    >
      <v-col>
        <v-data-table
          fixed-header
          :headers="headers[library.type]"
          :items="contents"
          v-model:sort-by="sortByArray"
          v-model:items-per-page="itemsPerPage"
          :server-items-length="totalItems"
          :loading="childrenAbortController != null"
          item-value="ratingKey"
          :must-sort="true"
          style="cursor: pointer;"
          @click:row="onRowClick"
        >
          <template #[`item.duration`]="{ item }">
            {{ getDuration(item.duration) }}
          </template>

          <template #[`item.viewedLeafCount`]="{ item }">
            {{ item.leafCount - item.viewedLeafCount }} unplayed
          </template>

          <template #[`item.viewOffset`]="{ item }">
            <span v-if="item.viewOffset">
              {{ getDuration(item.duration - item.viewOffset) }} left
            </span>

            <v-chip
              v-else
              color="yellow"
              pill
              class="pa-2"
              style="height: auto;"
            />
          </template>

          <template #bottom />
        </v-data-table>
      </v-col>
    </v-row>

    <v-row v-else>
      <v-col
        v-for="content in contents"
        :key="content.ratingKey"
        cols="4"
        sm="3"
        md="2"
        xl="1"
      >
        <PlexThumbnail
          :content="content"
          type="thumb"
          cols="4"
          sm="3"
          md="2"
          xl="1"
        />
      </v-col>

      <template v-if="childrenAbortController">
        <v-col
          v-for="n in 6"
          :key="`skeleton-${n}`"
          cols="4"
          sm="3"
          md="2"
          xl="1"
        >
          <v-skeleton-loader type="image, text" />
        </v-col>
      </template>
    </v-row>

    <v-row
      v-if="!stopNewContent"
      v-intersect="onIntersect"
      justify="center"
      class="py-4"
    >
      <v-progress-circular
        v-if="childrenAbortController"
        indeterminate
        color="primary"
      />
    </v-row>
  </v-container>
</template>

<script>
import { defineAsyncComponent } from 'vue';
import { mapActions, mapGetters, mapMutations } from 'vuex';
import { intervalToDuration } from 'date-fns';
import contentLink from '@/mixins/contentlink';

export default {
  name: 'PlexLibrary',

  components: {
    PlexThumbnail: defineAsyncComponent(() => import('@/components/PlexThumbnail.vue')),
  },

  mixins: [
    contentLink,
  ],

  props: {
    machineIdentifier: {
      type: String,
      required: true,
    },

    sectionId: {
      type: [String, Number],
      required: true,
    },
  },

  data: () => ({
    batchSize: 50,
    stopNewContent: false,
    contents: [],
    itemsPerPage: 0,
    sortByArray: [],
    backgroundAbortController: null,
    childrenAbortController: null,
    gridSort: 'titleSort',
    gridSortDesc: false,
    activeFirstCharacter: null,
    alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),

    sortOptions: {
      movie: [
        { title: 'Title', value: 'titleSort' },
        { title: 'Year', value: 'year' },
        { title: 'Date Added', value: 'addedAt' },
        { title: 'Rating', value: 'rating' },
        { title: 'Duration', value: 'duration' },
      ],

      show: [
        { title: 'Title', value: 'titleSort' },
        { title: 'Year', value: 'year' },
        { title: 'Date Added', value: 'addedAt' },
        { title: 'Rating', value: 'rating' },
        { title: 'Unplayed', value: 'unviewedLeafCount' },
      ],
    },

    headers: {
      show: [
        { title: 'Title', key: 'title' },
        { title: 'Year', key: 'year' },
        { title: 'Unplayed', key: 'viewedLeafCount' },
      ],

      movie: [
        { title: 'Title', key: 'title' },
        { title: 'Year', key: 'year' },
        { title: 'Duration', key: 'duration' },
        { title: 'Progress', key: 'viewOffset' },
      ],
    },
  }),

  computed: {
    ...mapGetters('plexservers', [
      'GET_MEDIA_IMAGE_URL',
      'GET_PLEX_SERVER',
      'GET_SERVER_LIBRARY_SIZE',
    ]),

    ...mapGetters([
      'IS_LIBRARY_LIST_VIEW',
    ]),

    // This exists so we can watch if either of these change
    combinedKey() {
      return {
        machineIdentifier: this.machineIdentifier,
        sectionId: this.sectionId,
      };
    },

    // This exists so we can watch if the sort changes
    combinedSortKey() {
      return {
        sortByArray: this.sortByArray,
        gridSort: this.gridSort,
        gridSortDesc: this.gridSortDesc,
        activeFirstCharacter: this.activeFirstCharacter,
      };
    },

    containerStyle() {
      return this.IS_LIBRARY_LIST_VIEW
        ? {
          'max-width': 'none',
          padding: 0,
        }
        : null;
    },

    sortParam() {
      if (this.IS_LIBRARY_LIST_VIEW) {
        if (this.sortByArray.length > 0) {
          const sortField = this.sortByArray[0].key === 'viewedLeafCount'
            ? 'unviewedLeafCount'
            : this.sortByArray[0].key;
          const isDesc = this.sortByArray[0].order === 'desc';
          return `${sortField}${isDesc ? ':desc' : ''}`;
        }
        return '';
      }

      return `${this.gridSort}${this.gridSortDesc ? ':desc' : ''}`;
    },

    library() {
      return this.GET_PLEX_SERVER(this.machineIdentifier)
        .libraries[this.sectionId.toString()];
    },

    totalItems() {
      return this.GET_SERVER_LIBRARY_SIZE({
        machineIdentifier: this.machineIdentifier,
        sectionId: this.sectionId,
      });
    },
  },

  watch: {
    combinedKey: {
      handler() {
        this.stopNewContent = false;
        this.contents = [];
        this.itemsPerPage = 0;
        this.activeFirstCharacter = null;
        this.gridSort = 'titleSort';
        this.gridSortDesc = false;
        this.setupCrumbs();
        return this.fetchRandomBackground();
      },
      immediate: true,
    },

    combinedSortKey: {
      handler() {
        return this.onSortChange();
      },
      deep: true,
    },

    IS_LIBRARY_LIST_VIEW() {
      this.stopNewContent = false;
      this.contents = [];
      this.itemsPerPage = 0;
      this.sortByArray = [];
      this.gridSort = 'titleSort';
      this.gridSortDesc = false;
      this.activeFirstCharacter = null;
      this.abortChildrenRequests();
    },
  },

  beforeUnmount() {
    this.abortBackgroundRequests();
    this.abortChildrenRequests();
  },

  methods: {
    ...mapActions('plexservers', [
      'FETCH_LIBRARY_CONTENTS',
      'FETCH_AND_SET_RANDOM_BACKGROUND_IMAGE',
    ]),

    ...mapMutations([
      'SET_ACTIVE_METADATA',
    ]),

    getDuration(end) {
      const duration = intervalToDuration({ start: 0, end });

      const hourPart = duration.hours > 0
        ? `${duration.hours} hr`
        : null;

      const minutePart = duration.minutes > 0
        ? `${duration.minutes} min`
        : null;

      const parts = [
        hourPart,
        minutePart,
      ];

      return parts.filter((part) => part).join(' ');
    },

    setupCrumbs() {
      this.SET_ACTIVE_METADATA({
        machineIdentifier: this.machineIdentifier,
        librarySectionID: this.sectionId,
        librarySectionTitle: this.library.title,
      });
    },

    async onIntersect(isIntersecting) {
      if (isIntersecting && !this.childrenAbortController) {
        await this.fetchMoreContent();
      }
    },

    onRowClick(event, { item }) {
      this.$router.push(this.contentLink(item));
    },

    setFirstCharacter(char) {
      this.activeFirstCharacter = char;
    },

    abortBackgroundRequests() {
      if (this.backgroundAbortController) {
        // Cancel outstanding request
        this.backgroundAbortController.abort();
        this.backgroundAbortController = null;
      }
    },

    abortChildrenRequests() {
      if (this.childrenAbortController) {
        // Cancel outstanding request
        this.childrenAbortController.abort();
        this.childrenAbortController = null;
      }
    },

    async onSortChange() {
      this.abortChildrenRequests();

      this.stopNewContent = false;
      // Reset items
      this.contents = [];
      this.itemsPerPage = 0;
      await this.fetchMoreContent();
    },

    async fetchMoreContentCriticalSection(signal) {
      const results = await this.FETCH_LIBRARY_CONTENTS({
        machineIdentifier: this.machineIdentifier,
        sectionId: this.sectionId,
        start: this.itemsPerPage,
        size: this.batchSize,
        sort: this.sortParam,
        firstCharacter: this.activeFirstCharacter,
        signal,
      });

      results.forEach((result) => {
        this.contents.push(result);
      });

      this.itemsPerPage += results.length;

      if (results.length < this.batchSize) {
        this.stopNewContent = true;
      }
    },

    async fetchMoreContent() {
      this.abortChildrenRequests();

      if (this.stopNewContent) {
        return;
      }

      const controller = new AbortController();
      this.childrenAbortController = controller;

      try {
        await this.fetchMoreContentCriticalSection(controller.signal);
        this.childrenAbortController = null;
      } catch (e) {
        if (!controller.signal.aborted) {
          throw e;
        }
      }
    },

    async fetchRandomBackgroundCriticalSection(signal) {
      await this.FETCH_AND_SET_RANDOM_BACKGROUND_IMAGE({
        machineIdentifier: this.machineIdentifier,
        sectionId: this.sectionId,
        signal,
      });
    },

    async fetchRandomBackground() {
      this.abortBackgroundRequests();

      const controller = new AbortController();
      this.backgroundAbortController = controller;

      try {
        await this.fetchRandomBackgroundCriticalSection(controller.signal);
        this.backgroundAbortController = null;
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
.v-data-table--fixed-header :deep(> .v-data-table__wrapper > table > thead > tr > th) {
  top: -12px;
}

.v-data-table :deep(.v-data-table__wrapper) {
  overflow: unset;
}

.letter-btn {
  min-width: 28px !important;
  padding: 0 2px !important;
}
</style>
