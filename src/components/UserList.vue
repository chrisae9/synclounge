<template>
  <v-list
    class="overflow-y-auto user-list"
    density="compact"
  >
    <v-list-item
      v-for="(user, id) in GET_USERS"
      :key="id"
      class="py-0"
    >
      <template #prepend>
        <v-avatar size="28">
          <img
            :src="user.thumb"
            class="avatar-img"
            :class="getSyncBorderClass(user)"
          >

          <v-icon
            v-if="user.state !== 'playing'"
            class="avatar-icon"
          >
            {{ stateIcons[user.state] }}
          </v-icon>
        </v-avatar>
      </template>

      <v-tooltip
        location="bottom"
        content-class="thumbnail-tooltip"
      >
        <template #activator="{ props }">
          <div
            v-bind="props"
          >
            <v-list-item-title>
              {{ user.username }}
              <span
                v-if="id === GET_SOCKET_ID"
                class="text-medium-emphasis"
              >
                (you)
              </span>
              <span class="user-time">
                {{ getTimeFromMs(getAdjustedTime(user)) }}
              </span>
            </v-list-item-title>
          </div>
        </template>

        {{ getTitle(user.media) }}
        <br>
        Watching on {{ user.playerProduct || `Unknown Plex Client` }}
        <span v-if="user.media && GET_PLEX_SERVER(user.media.machineIdentifier)">
          <br>
          via {{ GET_PLEX_SERVER(user.media.machineIdentifier).name }}
        </span>
      </v-tooltip>

      <v-progress-linear
        class="pt-content-progress"
        :height="2"
        :model-value="percent(user)"
      />

      <template #append>
        <v-tooltip
          v-if="id === GET_HOST_ID || AM_I_HOST"
          location="bottom"
          content-class="thumbnail-tooltip"
        >
          <template #activator="{ props }">
            <v-icon
              color="primary"
              v-bind="props"
              @click="AM_I_HOST && id !== GET_HOST_ID ? TRANSFER_HOST(id) : null"
            >
              {{ getHostIconName(id === GET_HOST_ID) }}
            </v-icon>
          </template>

          <span>{{ getHostActionText(id === GET_HOST_ID) }}</span>
        </v-tooltip>

        <v-tooltip
          v-if="id !== GET_HOST_ID && AM_I_HOST"
          location="bottom"
          content-class="thumbnail-tooltip"
        >
          <template #activator="{ props }">
            <v-icon
              v-bind="props"
              @click="KICK_USER(id)"
            >
              clear
            </v-icon>
          </template>

          <span>Kick</span>
        </v-tooltip>
      </template>
    </v-list-item>
  </v-list>
</template>

<script>
import { mapActions, mapGetters } from 'vuex';
import contentTitle from '@/mixins/contentTitle';

export default {
  name: 'UserList',

  mixins: [
    contentTitle,
  ],

  data: () => ({
    stateIcons: {
      stopped: 'stop',
      paused: 'pause',
      playing: 'play_arrow',
      buffering: 'av_timer',
    },
    timeUpdateIntervalId: null,

    // This is updated periodically and is what makes the player times advance (if playing)
    nowTimestamp: Date.now(),
  }),

  computed: {
    ...mapGetters([
      'GET_CONFIG',
    ]),

    ...mapGetters('synclounge', [
      'GET_USERS',
      'GET_ADJUSTED_HOST_TIME',
      'GET_HOST_USER',
      'GET_SOCKET_ID',
      'GET_HOST_ID',
      'AM_I_HOST',
    ]),

    ...mapGetters('plexservers', [
      'GET_PLEX_SERVER',
    ]),

  },

  created() {
    this.timeUpdateIntervalId = setInterval(() => {
      this.nowTimestamp = Date.now();
    }, this.GET_CONFIG.sidebar_time_update_interval);
  },

  beforeUnmount() {
    clearInterval(this.timeUpdateIntervalId);
  },

  methods: {
    ...mapActions('synclounge', [
      'TRANSFER_HOST',
      'KICK_USER',
    ]),

    getAdjustedTime({
      updatedAt, state, time, playbackRate,
    }) {
      return state === 'playing'
        ? time + (this.nowTimestamp - updatedAt) * playbackRate
        : time;
    },

    getSyncBorderClass({ syncFlexibility, ...rest }) {
      if (!this.GET_HOST_USER) {
        return 'border-error';
      }

      const difference = Math.abs(this.getAdjustedTime(rest) - this.GET_ADJUSTED_HOST_TIME());

      return difference > syncFlexibility
        ? 'border-desync'
        : 'border-sync';
    },

    getTitle(media) {
      return media
        ? this.getCombinedTitle(media)
        : 'Nothing';
    },

    getTimeFromMs(timeMs) {
      const displayTime = Math.round(timeMs / 1000);

      const h = Math.floor(displayTime / 3600);
      const m = Math.floor((displayTime / 60) % 60);
      let s = Math.floor(displayTime % 60);
      if (s < 10) {
        s = `0${s}`;
      }

      let text = `${m}:${s}`;
      if (displayTime > 3600) {
        if (m < 10) {
          text = `0${text}`;
        }
        text = `${h}:${text}`;
      }
      return text;
    },

    percent({ duration, ...rest }) {
      const perc = (this.getAdjustedTime(rest) / duration) * 100;
      if (Number.isNaN(perc)) {
        return 0;
      }

      return perc;
    },

    getHostIconName(isHost) {
      return isHost
        ? 'star'
        : 'star_outline';
    },

    getHostActionText(isHost) {
      return isHost
        ? 'Host'
        : 'Transfer host';
    },
  },
};
</script>

<style scoped>
.user-list {
  max-height: calc(50vh - 100px);
}

.avatar-img {
  border: 2px solid;
  border-radius: 50%;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-icon {
  font-size: 16px;
  opacity: 0.8;
  position: absolute;
  background-color: rgb(0 0 0 / 70%);
  border-radius: 50%;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.border-error {
  border-color: #f44336;
}

.border-desync {
  border-color: #ffb300;
}

.border-sync {
  border-color: #0de47499;
}

.user-time {
  font-size: 75%;
  opacity: 0.7;
  margin-left: 4px;
}
</style>
