<template>
  <v-dialog
    v-model="dialog"
    width="500"
  >
    <template #activator="{ props }">
      <slot
        :props="props"
      />
    </template>

    <v-card
      color="rgb(18, 18, 18)"
      class="playback-card"
    >
      <v-card-title class="text-h5">
        Playback Settings
      </v-card-title>

      <v-card-text class="playback-options">
        <v-checkbox
          v-if="metadata.viewOffset"
          v-model="resumeFrom"
          class="resume-option"
          hide-details
          color="primary"
          :label="'Resume from ' + getDuration(metadata.viewOffset)"
        />
        <div
          v-for="(media, index) in metadata.Media"
          :key="media.Part[0].key"
          class="playback-option"
        >
          <div class="playback-details">
            <p class="text-subtitle-1 font-weight-medium">
              {{ media.videoResolution }}p · {{ getDuration(media.duration) }}
            </p>
            <p class="text-body-2 text-medium-emphasis">
              <span class="text-high-emphasis">Video:</span>
              {{ media.videoCodec }} · {{ media.bitrate }} kbps
            </p>
            <p class="text-body-2 text-medium-emphasis">
              <span class="text-high-emphasis">Audio:</span>
              {{ audioStreams(media.Part[0].Stream) || 'None' }}
            </p>
            <p class="text-body-2 text-medium-emphasis">
              <span class="text-high-emphasis">Subtitles:</span>
              {{ subtitleStreams(media.Part[0].Stream) || 'None' }}
            </p>
          </div>
          <v-btn
            :ref="index === 0 ? 'playBtn' : undefined"
            variant="flat"
            color="primary"
            class="playback-option-action"
            @click="playClicked(index)"
          >
            {{ metadata.viewOffset && resumeFrom ? 'Resume' : 'Play' }}
          </v-btn>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script>
import duration from '@/mixins/duration';
import playMedia from '@/mixins/playmedia';

export default {
  name: 'PlexMediaPlayDialog',

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
    resumeFrom: true,
  }),

  computed: {
    offset() {
      return this.resumeFrom
        ? this.metadata.viewOffset
        : 0;
    },
  },

  watch: {
    dialog(open) {
      if (open) {
        this.$nextTick(() => {
          setTimeout(() => {
            const button = Array.isArray(this.$refs.playBtn)
              ? this.$refs.playBtn[0] : this.$refs.playBtn;
            button?.$el?.focus();
          }, 300);
        });
      }
    },
  },

  methods: {
    getStreamCount(streams, type) {
      let count = 0;
      streams.forEach((stream) => {
        if (stream.streamType === type) {
          count += 1;
        }
      });
      return count;
    },

    formatStreams(streams) {
      return streams.map(({ displayTitle }) => displayTitle)
        .join(', ');
    },

    audioStreams(media) {
      return this.formatStreams(media.filter(({ streamType }) => streamType === 2));
    },

    subtitleStreams(media) {
      return this.formatStreams(media.filter(({ streamType }) => streamType === 3));
    },

    async playClicked(mediaIndex) {
      this.dialog = false;
      await this.playMedia(this.metadata, mediaIndex, this.offset);
    },
  },
};
</script>

<style scoped>
.playback-options { padding-top: 8px !important; }
.resume-option { margin-bottom: 12px; }
.playback-option {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  padding: 16px 0;
}
.playback-option + .playback-option { border-top: 1px solid rgba(255, 255, 255, 0.1); }
.playback-details { flex: 1 1 240px; min-width: 0; overflow-wrap: anywhere; }
.playback-details p + p { margin-top: 6px; }
.playback-option-action { flex: 0 0 auto; min-width: 96px; min-height: 44px; }

.playback-card {
  border: 1px solid rgba(255, 255, 255, 0.1);
}
</style>
