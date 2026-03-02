<template>
  <v-card
    :to="contentLink(content)"
    variant="flat"
    rounded="lg"
    class="thumbnail-card"
    color="transparent"
    @mouseover="hovering = true"
    @mouseout="hovering = false"
  >
    <div class="thumbnail-img-wrapper">
      <v-img
        data-tilt
        :aspect-ratio="1 / inverseAspectRatio"
        :src="imgUrl"
        :srcset="srcset"
        :sizes="sizes"
        cover
      >
        <div class="thumbnail-badges">
          <small
            v-if="showServer"
            class="server-name"
          >
            {{ GET_PLEX_SERVER(content.machineIdentifier).name }}
          </small>

          <div
            v-if="showWatchedFlag && !showServer"
            class="watched-badge"
          >
            <v-icon size="14">
              check
            </v-icon>
          </div>

          <div
            v-if="showUnwatchedFlag && !showServer"
            class="unwatched-badge"
          >
            {{ unwatchedCount }}
          </div>

          <div
            v-if="content.Media && content.Media.length > 1 && !showServer"
            class="multi-version-badge"
          >
            {{ content.Media.length }}
          </div>
        </div>
      </v-img>

      <v-progress-linear
        v-if="showProgressBar"
        class="progress-bar"
        height="3"
        color="primary"
        :model-value="unwatchedPercent"
      />
    </div>

    <v-tooltip
      location="bottom"
      offset="10"
      content-class="thumbnail-tooltip"
    >
      <template #activator="{ props }">
        <div
          v-bind="props"
          class="pt-2 pb-1 px-1"
          style="max-width: 100%;"
        >
          <div class="text-subtitle-2 text-truncate">
            {{ getTitle(content, fullTitle) }}
          </div>

          <div class="text-caption text-truncate text-medium-emphasis">
            {{ getSecondaryTitle(content, fullTitle) }}
          </div>

          <div
            v-if="content.reason"
            class="text-caption text-truncate text-medium-emphasis"
          >
            {{ getReasonTitle(content) }}
          </div>
        </div>
      </template>

      <div class="text-white">
        {{ getTitle(content, fullTitle) }}
      </div>

      <div class="text-caption text-grey-lighten-1">
        {{ getSecondaryTitle(content, fullTitle) }}
      </div>

      <div
        v-if="content.reason"
        class="text-caption text-grey-lighten-1"
      >
        {{ getReasonTitle(content) }}
      </div>
    </v-tooltip>
  </v-card>
</template>

<script>
import { mapGetters } from 'vuex';
import VanillaTilt from 'vanilla-tilt';
import contentTitle from '@/mixins/contentTitle';
import { getAppWidth, getAppHeight } from '@/utils/sizing';
import contentLink from '@/mixins/contentlink';

const imageWidths = [
  100, 200, 300, 400, 600, 800, 1000, 2000, 4000, 8000,
];

// This order is important (biggest to smallest)
const breakpoints = ['xl', 'lg', 'md', 'sm'];
const breakpointProps = (() => breakpoints.reduce((props, val) => ({
  ...props,
  [val]: {
    type: [Boolean, String, Number],
    default: false,
  },
}), {}))();

const getSizeValue = (cols) => `calc((100vw - 24px) / (12 / ${cols}) - 24px)`;

const getSrcSize = (minWidth, cols) => `(min-width: ${minWidth}px) ${getSizeValue(cols)}`;

export default {
  name: 'PlexThumbnail',

  mixins: [
    contentTitle,
    contentLink,
  ],

  props: {
    showServer: {
      type: Boolean,
    },

    content: {
      type: Object,
      required: true,
    },

    type: {
      type: String,
      default: '',
    },

    fullTitle: {
      type: Boolean,
    },

    cols: {
      type: [String, Number],
      default: 12,
    },
    ...breakpointProps,
  },

  data: () => ({
    hovering: false,
  }),

  computed: {
    ...mapGetters('plexservers', [
      'GET_MEDIA_IMAGE_URL',
      'GET_PLEX_SERVER',
    ]),

    mediaUrl() {
      return this.type === 'art'
        ? (this.content.art || this.content.thumb)
        : (this.content.thumb || this.content.art);
    },

    // 1 / aspect ratio
    inverseAspectRatio() {
      // Movie posters have 2:3 aspect ratio
      return this.type === 'art' || this.content.type === 'episode'
        ? 9 / 16
        : 3 / 2;
    },

    imgUrl() {
      return this.GET_MEDIA_IMAGE_URL({
        machineIdentifier: this.content.machineIdentifier,
        mediaUrl: this.mediaUrl,
        width: getAppWidth(),
        height: getAppHeight(),
      });
    },

    srcset() {
      return imageWidths.map((width) => `${this.getImageUrl(width)} ${width}w`).join(' ,');
    },

    // Object with keys of breakpoint codes and values of their minumum width
    breakpointMins() {
      const {
        sm, md, lg, xl,
      } = this.$vuetify.display.thresholds;

      return {
        xl,
        lg,
        md,
        sm,
      };
    },

    sizes() {
      const usedBreakpointSrcSizes = breakpoints.filter((code) => this[code])
        .map((code) => getSrcSize(this.breakpointMins[code], this[code]));

      const srcSizes = [
        ...usedBreakpointSrcSizes,
        getSizeValue(this.cols),
      ];

      return srcSizes.join(', ');
    },

    showWatchedFlag() {
      if (this.content.type === 'movie' || this.content.type === 'episode') {
        return this.content.viewCount > 0 && !this.showProgressBar;
      }

      if (this.content.type === 'season' || this.content.type === 'show') {
        return this.content.leafCount > 0
          && this.content.leafCount === this.content.viewedLeafCount;
      }

      return false;
    },

    showUnwatchedFlag() {
      if (this.content.type === 'movie' || this.content.type === 'episode') {
        return (!this.content.viewCount || this.content.viewCount === 0) && !this.showProgressBar;
      }

      if (this.content.type === 'season' || this.content.type === 'show') {
        return this.content.leafCount !== this.content.viewedLeafCount;
      }

      return false;
    },

    showProgressBar() {
      if (this.content.type === 'movie' || this.content.type === 'episode') {
        return this.content.viewOffset && this.content.viewOffset > 0;
      }

      if (this.content.type === 'season' || this.content.type === 'show') {
        return (
          this.content.leafCount !== this.content.viewedLeafCount
          && this.content.viewedLeafCount !== 0
        );
      }

      return false;
    },

    unwatchedCount() {
      if (this.content.type === 'show' || this.content.type === 'season') {
        return this.content.leafCount - this.content.viewedLeafCount;
      }
      return '';
    },

    unwatchedPercent() {
      if (this.content.type === 'movie' || this.content.type === 'episode') {
        return (this.content.viewOffset / this.content.duration) * 100;
      }
      return (this.content.viewedLeafCount / this.content.leafCount) * 100;
    },
  },

  mounted() {
    if (this.type === 'thumb') {
      if (window.matchMedia('(hover: hover)').matches
        && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        VanillaTilt.init(this.$el, {
          reverse: true,
          max: 4,
          perspective: 1200,
          scale: 1,
          speed: 200,
          transition: true,
          reset: true,
          easing: 'cubic-bezier(.03,.98,.52,.99)',
          glare: false,
        });
      }
    }
  },

  beforeUnmount() {
    if (this.$el.vanillaTilt) {
      this.$el.vanillaTilt.destroy();
    }
  },

  methods: {
    getImageUrl(width) {
      return this.GET_MEDIA_IMAGE_URL({
        machineIdentifier: this.content.machineIdentifier,
        mediaUrl: this.mediaUrl,
        width,
        height: Math.round(width * this.inverseAspectRatio),
      });
    },
  },
};
</script>

<style scoped>
.thumbnail-card {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.thumbnail-card:hover {
  transform: scale(1.03);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.7);
}

@media (prefers-reduced-motion: reduce) {
  .thumbnail-card:hover {
    transform: none;
    box-shadow: none;
  }
}

.thumbnail-img-wrapper {
  position: relative;
  border-radius: inherit;
  overflow: hidden;
}

.thumbnail-badges {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.watched-badge {
  position: absolute;
  bottom: 6px;
  right: 6px;
  background: rgb(var(--v-theme-primary));
  color: #000;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}

.unwatched-badge {
  position: absolute;
  top: 6px;
  left: 6px;
  background: rgba(0, 0, 0, 0.6);
  color: rgb(var(--v-theme-primary));
  font-size: 0.7rem;
  font-weight: 700;
  min-width: 22px;
  text-align: center;
  padding: 2px 7px;
  border-radius: 10px;
}

.multi-version-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  background: rgba(0, 0, 0, 0.6);
  color: rgba(255, 255, 255, 0.8);
  font-size: 0.7rem;
  font-weight: 600;
  min-width: 22px;
  text-align: center;
  padding: 2px 7px;
  border-radius: 10px;
}

.server-name {
  position: absolute;
  top: 6px;
  right: 6px;
  background: rgba(0, 0, 0, 0.6);
  color: rgba(255, 255, 255, 0.7);
  padding: 2px 8px;
  font-size: 0.65rem;
  border-radius: 10px;
}

.progress-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
}
</style>

