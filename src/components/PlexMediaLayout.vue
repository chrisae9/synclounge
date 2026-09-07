<template>
  <v-container class="media-detail">
    <v-card
      :img="artUrl"
      class="media-detail-card"
      variant="flat"
    >
      <div class="media-layout-overlay">
        <div class="media-heading-layout">
          <div class="media-poster">
            <v-img
              :src="thumbUrl"
              :aspect-ratio="2 / 3"
              alt=""
              cover
              class="rounded-lg"
            />
            <slot name="belowImage" />
          </div>
          <div class="media-heading-content">
            <h1 class="media-title">
              {{ title }}
            </h1>
            <p class="media-secondary-title">
              {{ secondaryTitle }}
            </p>
            <p
              v-if="subtitle"
              class="text-body-1 mt-2"
            >
              {{ subtitle }}
            </p>
            <p
              v-if="secondarySubtitle"
              class="text-body-2 text-medium-emphasis mt-2"
            >
              {{ secondarySubtitle }}
            </p>
            <v-row
              dense
              class="media-meta mt-3"
            >
              <slot name="postTitle" />
            </v-row>
          </div>
        </div>
        <div class="media-summary">
          <slot name="content" />
        </div>
      </div>
    </v-card>

    <slot name="actions" />

    <template v-if="children.length">
      <v-list-subheader>{{ childrenHeader }}</v-list-subheader>

      <v-row>
        <v-col
          v-for="child in children"
          :key="child.key"
          :cols="childCols"
          :sm="childSm"
          :md="childMd"
          :lg="childLg"
          :xl="childXl"
        >
          <PlexThumbnail
            :content="child"
            type="thumb"
            :full-title="childFullTitle"
            :cols="childCols"
            :sm="childSm"
            :md="childMd"
            :lg="childLg"
            :xl="childXl"
          />
        </v-col>
      </v-row>
    </template>
  </v-container>
</template>

<script>
import { defineAsyncComponent } from 'vue';
import { mapGetters } from 'vuex';
import { getAppWidth, getAppHeight } from '@/utils/sizing';

const breakpoints = ['childSm', 'childMd', 'childLg', 'childXl'];
const breakpointProps = (() => breakpoints.reduce((props, val) => ({
  ...props,
  [val]: {
    type: [Boolean, String, Number],
    default: false,
  },
}), {}))();

export default {
  name: 'PlexSeries',

  components: {
    PlexThumbnail: defineAsyncComponent(() => import('@/components/PlexThumbnail.vue')),
  },

  props: {
    machineIdentifier: {
      type: String,
      required: true,
    },

    art: {
      type: String,
      default: null,
    },

    thumb: {
      type: String,
      default: null,
    },

    title: {
      type: String,
      required: true,
    },

    secondaryTitle: {
      type: String,
      required: true,
    },

    subtitle: {
      type: String,
      default: '',
    },

    secondarySubtitle: {
      type: String,
      default: '',
    },

    childrenHeader: {
      type: String,
      required: true,
    },

    children: {
      type: Array,
      required: true,
    },

    childCols: {
      type: [String, Number],
      default: 12,
    },

    childFullTitle: {
      type: Boolean,
      default: false,
    },

    ...breakpointProps,
  },

  computed: {
    ...mapGetters('plexservers', [
      'GET_MEDIA_IMAGE_URL',
    ]),

    artUrl() {
      if (!this.art) return null;
      return this.GET_MEDIA_IMAGE_URL({
        machineIdentifier: this.machineIdentifier,
        mediaUrl: this.art,
        width: getAppWidth(),
        height: getAppHeight(),
        blur: 2,
      });
    },

    thumbUrl() {
      if (!this.thumb) return null;
      return this.GET_MEDIA_IMAGE_URL({
        machineIdentifier: this.machineIdentifier,
        mediaUrl: this.thumb,
        width: getAppWidth(),
        height: getAppHeight(),
      });
    },
  },
};
</script>

<style scoped>
.media-detail {
  max-width: 1440px;
}

.media-detail-card {
  border: 1px solid var(--sl-border);
  border-radius: 20px;
  overflow: hidden;
}

.media-layout-overlay {
  padding: clamp(20px, 3vw, 40px);
  background: linear-gradient(to top, #101216 0%, rgba(8, 10, 14, 0.92) 50%, rgba(8, 10, 14, 0.74) 100%);
}

.media-heading-layout {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  gap: 32px;
  align-items: center;
}

.media-heading-content {
  min-width: 0;
}

.media-title {
  font-size: clamp(1.75rem, 3vw, 2.75rem);
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.025em;
  overflow-wrap: anywhere;
}

.media-secondary-title {
  margin-top: 12px;
  color: var(--sl-text-muted);
  font-size: 1rem;
}

.media-meta {
  align-items: center;
}

.media-summary {
  margin-top: 28px;
  line-height: 1.65;
}

@media (max-width: 599px) {
  .media-detail {
    padding: 4px;
  }

  .media-layout-overlay {
    padding: 16px;
  }

  .media-heading-layout {
    grid-template-columns: 84px minmax(0, 1fr);
    gap: 16px;
    align-items: start;
  }

  .media-title {
    font-size: 1.45rem;
  }

  .media-secondary-title {
    margin-top: 8px;
  }

  .media-summary {
    margin-top: 20px;
  }
}
</style>
