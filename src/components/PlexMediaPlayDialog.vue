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

    <v-card>
      <v-card-title class="text-h5">
        Playback Settings
      </v-card-title>

      <v-card-subtitle>
        <v-checkbox
          v-if="metadata.viewOffset"
          v-model="resumeFrom"
          hide-details
          :label="'Resume from ' + getDuration(metadata.viewOffset)"
        />
      </v-card-subtitle>

      <v-card-actions>
        <v-list>
          <v-list-item
            v-for="(media, index) in metadata.Media"
            :key="media.Part[0].key"
          >
            <v-list-item-title>
                {{ media.videoResolution }}p -
                <span class="text-medium-emphasis">{{ getDuration(media.duration) }}</span>
              </v-list-item-title>

              <v-list-item-subtitle>
                <span class="text-high-emphasis">Video Codec:</span>
                {{ media.videoCodec }} ({{ media.bitrate }}kbps)
              </v-list-item-subtitle>

              <v-list-item-subtitle class="wrap">
                <span class="text-high-emphasis">Audio Streams:</span>
                {{ audioStreams(media.Part[0].Stream) }}
              </v-list-item-subtitle>

              <v-list-item-subtitle class="wrap">
                <span class="text-high-emphasis">Subtitles:</span>
                {{ subtitleStreams(media.Part[0].Stream) }}
              </v-list-item-subtitle>

            <template #append>
              <v-btn
                color="primary"
                @click="playClicked(index)"
              >
                Play
              </v-btn>
            </template>
          </v-list-item>
        </v-list>
      </v-card-actions>
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
.wrap {
  white-space: normal !important;
}
</style>
