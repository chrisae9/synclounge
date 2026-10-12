<template>
  <v-list
    class="overflow-y-auto user-list"
    density="compact"
  >
    <v-list-item
      v-for="(user, id) in GET_USERS"
      :key="id"
      class="user-row px-3 py-2"
    >
      <div class="user-heading">
        <v-avatar
          size="28"
          class="user-avatar"
        >
          <img
            :src="user.thumb"
            alt=""
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
        <v-tooltip
          location="bottom"
          content-class="thumbnail-tooltip"
        >
          <template #activator="{ props }">
            <div
              v-bind="props"
              class="user-identity"
            >
              <div
                class="user-name"
                :title="user.username"
              >
                {{ user.username }}
                <span
                  v-if="id === GET_SOCKET_ID"
                  class="text-medium-emphasis"
                >(you)</span>
              </div>
              <span class="user-time">{{ getTimeFromMs(getAdjustedTime(user)) }}</span>
            </div>
          </template>
          {{ getTitle(user.media) }}
          <br>
          Watching on {{ user.playerProduct || 'Unknown Plex Client' }}
          <span v-if="user.media && GET_PLEX_SERVER(user.media.machineIdentifier)">
            <br>
            via {{ GET_PLEX_SERVER(user.media.machineIdentifier).name }}
          </span>
        </v-tooltip>
        <div class="user-actions">
          <v-chip
            v-if="id === GET_HOST_ID"
            size="small"
            color="primary"
            variant="tonal"
          >
            Host
          </v-chip>
          <v-menu v-if="AM_I_HOST && id !== GET_HOST_ID">
            <template #activator="{ props }">
              <v-btn
                v-bind="props"
                icon="more_vert"
                size="small"
                variant="text"
                :aria-label="`Actions for ${user.username}`"
                :title="`Actions for ${user.username}`"
              />
            </template>
            <v-list density="compact">
              <v-list-item
                title="Make host"
                prepend-icon="star_outline"
                @click="requestModeration(id, 'transfer')"
              />
              <v-list-item
                title="Remove from room"
                prepend-icon="person_remove"
                @click="requestModeration(id, 'remove')"
              />
            </v-list>
          </v-menu>
        </div>
      </div>
      <div class="user-status text-caption text-medium-emphasis">
        <span>{{ readinessLabel(user, id) }}</span>
        <span v-if="GET_ADVANCED_PARTY_MODE">{{ driftLabel(user) }}</span>
      </div>
      <ul
        v-if="user.health && GET_ADVANCED_PARTY_MODE"
        class="user-health text-caption text-medium-emphasis"
      >
        <li
          v-for="detail in healthDetails(user.health)"
          :key="detail"
        >
          {{ detail }}
        </li>
      </ul>
      <v-progress-linear
        class="pt-content-progress mt-2"
        :height="2"
        :model-value="percent(user)"
      />
    </v-list-item>
    <v-dialog
      :model-value="!!moderationTarget && AM_I_HOST"
      max-width="420"
      :aria-label="moderationTitle"
      :persistent="moderationPending"
      @update:model-value="!$event && (moderation = null)"
    >
      <v-card v-if="moderationTarget">
        <v-card-title class="moderation-title">
          {{ moderationTitle }}
        </v-card-title>
        <v-card-text>
          {{ moderation.action === 'remove'
            ? 'This disconnects them from the watch party. They can rejoin with the room link.'
            : 'They will control what the party watches and manage room settings.' }}
          <v-alert
            v-if="moderationError"
            type="error"
            class="mt-3"
          >
            {{ moderationError }}
          </v-alert>
        </v-card-text>
        <v-card-actions class="moderation-actions">
          <v-btn
            :disabled="moderationPending"
            @click="moderation = null"
          >
            Cancel
          </v-btn>
          <v-btn
            :loading="moderationPending"
            color="primary"
            variant="flat"
            @click="confirmModeration"
          >
            {{ moderation.action === 'remove' ? 'Remove from room' : 'Make host' }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
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
    moderation: null,
    moderationPending: false,
    moderationError: null,
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
    moderationTitle() {
      if (!this.moderationTarget) return '';
      return this.moderation.action === 'remove'
        ? `Remove ${this.moderationTarget.username}?`
        : `Make ${this.moderationTarget.username} the host?`;
    },
    moderationTarget() {
      if (!this.moderation || this.moderation.id === this.GET_HOST_ID) return null;
      return this.GET_USERS[this.moderation.id];
    },
    ...mapGetters('settings', ['GET_ADVANCED_PARTY_MODE']),
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

    requestModeration(id, action) {
      if (!this.AM_I_HOST || id === this.GET_HOST_ID || !this.GET_USERS[id]) return;
      this.moderationError = null;
      this.moderation = { id, action };
    },

    async confirmModeration() {
      if (!this.AM_I_HOST || !this.moderationTarget || this.moderationPending) return;
      this.moderationPending = true;
      try {
        const { id, action } = this.moderation;
        await (action === 'remove' ? this.KICK_USER(id) : this.TRANSFER_HOST(id));
        this.moderation = null;
      } catch {
        this.moderationError = 'Couldn’t update this participant. Try again.';
      } finally {
        this.moderationPending = false;
      }
    },

    readinessLabel(user, id) {
      if (!user.state) return 'Connecting';
      if (user.state === 'buffering') return 'Buffering';
      if (!user.media || user.state === 'stopped') return 'Not watching';
      if (id === this.GET_HOST_ID) return user.state === 'paused' ? 'Paused' : 'Playing';
      const timing = this.driftLabel(user);
      if (timing === 'Different media') return 'Different movie or episode';
      if (timing === 'Timing unavailable') return 'Sync status unavailable';
      const tolerance = Number.isFinite(user.syncFlexibility) ? user.syncFlexibility : 500;
      const difference = Math.abs(this.getAdjustedTime(user) - this.GET_ADJUSTED_HOST_TIME());
      if (difference <= tolerance) return user.state === 'paused' ? 'Paused · In sync' : 'In sync';
      return user.state === 'paused' ? 'Paused · Catching up' : 'Catching up';
    },

    driftLabel(user) {
      const hostMedia = this.GET_HOST_USER?.media;
      if (!hostMedia || !user.media) return 'Timing unavailable';
      const sameSource = user.media.machineIdentifier != null && hostMedia.machineIdentifier != null
        && user.media.ratingKey != null && hostMedia.ratingKey != null
        && String(user.media.machineIdentifier) === String(hostMedia.machineIdentifier)
        && String(user.media.ratingKey) === String(hostMedia.ratingKey);
      const matchingTitle = user.media.title && user.media.title === hostMedia.title
        && user.media.type === hostMedia.type
        && (hostMedia.type !== 'episode' || (user.media.grandparentTitle === hostMedia.grandparentTitle
          && user.media.parentIndex === hostMedia.parentIndex && user.media.index === hostMedia.index));
      if (!sameSource && !matchingTitle) return 'Different media';
      const drift = (this.getAdjustedTime(user) - this.GET_ADJUSTED_HOST_TIME()) / 1000;
      if (!Number.isFinite(drift)) return 'Timing unavailable';
      const timing = Math.abs(drift) < 0.5 ? 'In sync'
        : `${Math.abs(drift).toFixed(1)}s ${drift < 0 ? 'behind' : 'ahead'}`;
      return sameSource ? timing : `${timing} (estimated)`;
    },

    healthDetails(health) {
      if (this.nowTimestamp - health.updatedAt > 90000) return ['Playback details are stale'];
      const parts = [];
      if (health.height > 0) parts.push(`${health.height}p`);
      if (health.bitrate > 0) parts.push(`${(health.bitrate / 1000000).toFixed(1)} Mbps`);
      if (health.bufferAhead != null) parts.push(`${health.bufferAhead.toFixed(1)}s buffered`);
      parts.push(`${health.bufferingCount} buffering events`);
      return parts;
    },

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
.moderation-title { white-space: normal; overflow-wrap: anywhere; }
.moderation-actions { flex-wrap: wrap; }

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

.user-heading { display: flex; align-items: center; gap: 10px; min-width: 0; }
.user-avatar, .user-actions { flex-shrink: 0; }
.user-identity { flex: 1 1 auto; min-width: 0; }
.user-actions { display: flex; align-items: center; gap: 2px; }
.user-status, .user-health { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 6px; }
.user-health { list-style: none; padding: 0; }
.user-health li { overflow-wrap: anywhere; }
.user-row + .user-row { border-top: 1px solid rgba(255, 255, 255, 0.06); }

.user-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.user-time {
  font-size: 75%;
  opacity: 0.7;
  flex-shrink: 0;
}
</style>
