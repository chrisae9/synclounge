<template>
  <v-dialog
    v-model="dialogOpen"
    max-width="400"
    :fullscreen="$vuetify.display.smAndDown"
    scrollable
  >
    <template #activator="{ props }">
      <slot
        :props="props"
      />
    </template>

    <v-card
      color="rgb(18, 18, 18)"
      class="settings-card"
    >
      <v-toolbar
        v-if="$vuetify.display.smAndDown"
        density="compact"
        color="surface"
      >
        <v-toolbar-title>Settings</v-toolbar-title>
        <v-spacer />
        <v-btn
          icon
          @click="dialogOpen = false"
        >
          <v-icon>close</v-icon>
        </v-btn>
      </v-toolbar>

      <v-list>
        <v-list-subheader>Playback</v-list-subheader>

        <v-list-item
          @click="SET_AUTO_SKIP_INTRO(!GET_AUTO_SKIP_INTRO)"
        >
          <v-list-item-title>Auto Skip Intro</v-list-item-title>
          <v-list-item-subtitle>
            Automatically skip intros when Plex markers are available
          </v-list-item-subtitle>

          <template #append>
            <v-switch
              hide-details
              color="primary"
              :model-value="GET_AUTO_SKIP_INTRO"
              @update:model-value="SET_AUTO_SKIP_INTRO"
              @click.stop
            />
          </template>
        </v-list-item>

        <v-list-item
          :disabled="GET_SLPLAYERFORCETRANSCODE"
          @click="!GET_SLPLAYERFORCETRANSCODE && SET_ALLOW_DIRECT_PLAY(!allowDirectPlay)"
        >
          <v-list-item-title>Prefer Original Quality</v-list-item-title>
          <v-list-item-subtitle>
            {{ GET_SLPLAYERFORCETRANSCODE
              ? 'Disabled while Force Transcode is enabled in Advanced'
              : 'Direct play or stream when your browser can handle it' }}
          </v-list-item-subtitle>

          <template #append>
            <v-switch
              hide-details
              color="primary"
              :model-value="allowDirectPlay"
              :disabled="GET_SLPLAYERFORCETRANSCODE"
              @update:model-value="SET_ALLOW_DIRECT_PLAY"
              @click.stop
            />
          </template>
        </v-list-item>

        <v-list-item>
          <v-list-item-title>Quality Limit</v-list-item-title>
          <v-list-item-subtitle>
            Maximum video quality SyncLounge should request from Plex
          </v-list-item-subtitle>

          <v-select
            density="compact"
            hide-details
            :model-value="GET_SLPLAYERQUALITY"
            :items="qualities"
            item-title="label"
            item-value="maxVideoBitrate"
            @update:model-value="SET_SLPLAYERQUALITY"
          >
            <template #selection="{ item }">
              <span class="text-body-2 text-medium-emphasis">
                {{ item.raw.label }}
              </span>
            </template>
          </v-select>
        </v-list-item>

        <v-divider />

        <v-list-subheader>Watch Party</v-list-subheader>

        <v-list-item
          @click="SET_AUTOPLAY(!GET_AUTOPLAY)"
        >
          <v-list-item-title>Follow Host Media</v-list-item-title>
          <v-list-item-subtitle>
            Automatically load what the host is watching
          </v-list-item-subtitle>

          <template #append>
            <v-switch
              hide-details
              color="primary"
              :model-value="GET_AUTOPLAY"
              @update:model-value="SET_AUTOPLAY"
              @click.stop
            />
          </template>
        </v-list-item>

        <v-list-item>
          <v-list-item-title>Disabled Servers</v-list-item-title>
          <v-list-item-subtitle>
            Exclude servers from search and automatic media matching
          </v-list-item-subtitle>

          <v-select
            v-model="BLOCKEDSERVERS"
            density="compact"
            hide-details
            multiple
            placeholder="None (all enabled)"
            :items="localServersList"
            item-value="id"
            item-title="name"
          >
            <template #selection="{ item }">
              <v-chip
                size="small"
                class="text-body-2 text-medium-emphasis"
              >
                <span>{{ item.raw.name }}</span>
              </v-chip>
            </template>
          </v-select>
        </v-list-item>

        <v-divider />

        <v-list-subheader>Chat</v-list-subheader>

        <v-list-item
          @click="isSecureContext ? CHANGE_NOTIFICATIONS_ENABLED(!ARE_NOTIFICATIONS_ENABLED) : null"
        >
          <v-list-item-title>Desktop Notifications</v-list-item-title>
          <v-list-item-subtitle>
            Display desktop notifications when a new message is received
          </v-list-item-subtitle>

          <template #append>
            <v-switch
              hide-details
              color="primary"
              :model-value="ARE_NOTIFICATIONS_ENABLED && isSecureContext"
              :disabled="!isSecureContext"
              @update:model-value="CHANGE_NOTIFICATIONS_ENABLED"
              @click.stop
            />

            <v-tooltip
              v-if="!isSecureContext"
              location="bottom"
              content-class="thumbnail-tooltip"
            >
              <template #activator="{ props }">
                <v-icon
                  color="warning"
                  class="mr-4 mt-1"
                  v-bind="props"
                >
                  info
                </v-icon>
              </template>

              <span>
                Desktop notifications are only available in secure contexts (HTTPS)
              </span>
            </v-tooltip>
          </template>
        </v-list-item>

        <v-list-item
          @click="SET_ARE_SOUND_NOTIFICATIONS_ENABLED(!ARE_SOUND_NOTIFICATIONS_ENABLED)"
        >
          <v-list-item-title>Sound Notifications</v-list-item-title>
          <v-list-item-subtitle>
            Play a sound when a new message is received
          </v-list-item-subtitle>

          <template #append>
            <v-switch
              hide-details
              color="primary"
              :model-value="ARE_SOUND_NOTIFICATIONS_ENABLED"
              @update:model-value="SET_ARE_SOUND_NOTIFICATIONS_ENABLED"
              @click.stop
            />
          </template>
        </v-list-item>

        <v-list-item>
          <v-list-item-title>Display Name</v-list-item-title>
          <v-list-item-subtitle>
            Your username in chat
          </v-list-item-subtitle>

          <v-text-field
            density="compact"
            hide-details
            class="text-body-2 text-medium-emphasis"
            :model-value="GET_ALTUSERNAME"
            :placeholder="username"
            @update:model-value="SET_ALTUSERNAME"
          />
        </v-list-item>

        <v-divider />
      </v-list>

      <v-expansion-panels
        variant="accordion"
        class="settings-advanced"
      >
        <v-expansion-panel>
          <v-expansion-panel-title>
            Advanced
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <v-list density="compact">
              <v-list-subheader>Advanced Playback</v-list-subheader>

              <v-list-item
                @click="SET_SLPLAYERFORCETRANSCODE(!GET_SLPLAYERFORCETRANSCODE)"
              >
                <v-list-item-title>Force Transcode</v-list-item-title>
                <v-list-item-subtitle>
                  Ask Plex to transcode everything; useful for troubleshooting only
                </v-list-item-subtitle>

                <template #append>
                  <v-switch
                    hide-details
                    color="primary"
                    :model-value="GET_SLPLAYERFORCETRANSCODE"
                    @update:model-value="SET_SLPLAYERFORCETRANSCODE"
                    @click.stop
                  />
                </template>
              </v-list-item>

              <v-list-item
                @click="SET_FORCE_BURN_SUBTITLES(!forceBurnSubtitles)"
              >
                <v-list-item-title>Force Burn Subtitles</v-list-item-title>
                <v-list-item-subtitle>
                  Ask Plex to burn all subtitles into the video
                </v-list-item-subtitle>

                <template #append>
                  <v-switch
                    hide-details
                    color="primary"
                    :model-value="forceBurnSubtitles"
                    @update:model-value="SET_FORCE_BURN_SUBTITLES"
                    @click.stop
                  />
                </template>
              </v-list-item>

              <v-list-item>
                <v-list-item-title>Streaming Protocol</v-list-item-title>
                <v-list-item-subtitle>
                  Override the browser playback protocol selected by SyncLounge
                </v-list-item-subtitle>

                <v-select
                  density="compact"
                  hide-details
                  :model-value="GET_STREAMING_PROTOCOL"
                  :items="streamingProtocols"
                  :rules="[v => !!v || 'Item is required']"
                  required
                  @update:model-value="SET_STREAMING_PROTOCOL"
                >
                  <template #selection="{ item }">
                    <span class="text-body-2 text-medium-emphasis">
                      {{ item.raw }}
                    </span>
                  </template>
                </v-select>
              </v-list-item>

              <v-divider />

              <v-list-subheader>Advanced Sync</v-list-subheader>

              <v-list-item>
                <v-list-item-title>Sync Flexibility</v-list-item-title>
                <v-list-item-subtitle>
                  Milliseconds of drift tolerated before SyncLounge seeks
                </v-list-item-subtitle>

                <v-slider
                  hide-details
                  color="primary"
                  :model-value="GET_SYNCFLEXIBILITY"
                  :min="0"
                  :max="10000"
                  thumb-label
                  @update:model-value="UPDATE_SYNC_FLEXIBILITY"
                />
              </v-list-item>

              <v-list-item>
                <v-list-item-title>Syncing Method</v-list-item-title>
                <v-list-item-subtitle>
                  Recovery behavior when a client drifts from the host
                </v-list-item-subtitle>

                <v-select
                  density="compact"
                  hide-details
                  :model-value="GET_SYNCMODE"
                  :items="syncMethods"
                  :rules="[v => !!v || 'Item is required']"
                  required
                  @update:model-value="SET_SYNCMODE"
                >
                  <template #selection="{ item }">
                    <span class="text-body-2 text-medium-emphasis">
                      {{ item.raw.title }}
                    </span>
                  </template>
                </v-select>
              </v-list-item>

              <v-list-item>
                <v-list-item-title>Client Poll Interval</v-list-item-title>
                <v-list-item-subtitle>
                  How often SyncLounge polls Plex clients for timeline updates
                </v-list-item-subtitle>

                <v-slider
                  hide-details
                  color="primary"
                  :model-value="GET_CLIENTPOLLINTERVAL"
                  :min="100"
                  :max="10000"
                  thumb-label
                  @update:model-value="SET_CLIENTPOLLINTERVAL"
                />
              </v-list-item>
            </v-list>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
    </v-card>
  </v-dialog>
</template>

<script>
import {
  mapActions, mapGetters, mapMutations, mapState,
} from 'vuex';
import { streamingProtocols } from '@/utils/streamingprotocols';
import qualities from '@/store/modules/slplayer/qualities';

export default {
  name: 'TheSettingsDialog',

  data: () => ({
    dialogOpen: false,

    syncMethods: [
      { title: 'Clean Seek', value: 'cleanseek' },
      { title: 'Skip Ahead', value: 'skipahead' },
    ],

    streamingProtocols,
    qualities,
  }),

  computed: {
    ...mapGetters('settings', [
      'GET_AUTOPLAY',
      'GET_SLPLAYERFORCETRANSCODE',
      'GET_CLIENTPOLLINTERVAL',
      'GET_SYNCFLEXIBILITY',
      'GET_SYNCMODE',
      'GET_AUTO_SKIP_INTRO',
      'GET_ALTUSERNAME',
      'GET_SLPLAYERQUALITY',
    ]),

    ...mapGetters('slplayer', [
      'GET_STREAMING_PROTOCOL',
    ]),

    ...mapGetters('synclounge', [
      'ARE_NOTIFICATIONS_ENABLED',
      'ARE_SOUND_NOTIFICATIONS_ENABLED',
    ]),

    ...mapGetters('plexservers', [
      'GET_PLEX_SERVERS',
      'GET_BLOCKED_SERVER_IDS',
    ]),

    ...mapGetters('plex', [
      'GET_PLEX_USER',
    ]),

    ...mapState('slplayer', [
      'forceBurnSubtitles',
      'allowDirectPlay',
    ]),

    username() {
      return this.GET_PLEX_USER?.username;
    },

    isSecureContext() {
      return window.isSecureContext;
    },

    BLOCKEDSERVERS: {
      get() {
        return this.GET_BLOCKED_SERVER_IDS;
      },

      set(value) {
        this.SET_BLOCKED_SERVER_IDS(value);
      },
    },

    localServersList() {
      return this.GET_PLEX_SERVERS.map((server) => ({
        name: server.name,
        id: server.clientIdentifier,
      }));
    },
  },

  methods: {
    ...mapActions('synclounge', [
      'UPDATE_SYNC_FLEXIBILITY',
      'CHANGE_NOTIFICATIONS_ENABLED',
    ]),

    ...mapMutations('settings', [
      'SET_AUTOPLAY',
      'SET_SLPLAYERFORCETRANSCODE',
      'SET_CLIENTPOLLINTERVAL',
      'SET_SYNCMODE',
      'SET_AUTO_SKIP_INTRO',
      // TODO: potentially add system for announcing username changes
      'SET_ALTUSERNAME',
      'SET_SLPLAYERQUALITY',
    ]),

    ...mapMutations('slplayer', [
      'SET_STREAMING_PROTOCOL',
      'SET_FORCE_BURN_SUBTITLES',
      'SET_ALLOW_DIRECT_PLAY',
    ]),

    ...mapMutations('synclounge', [
      'SET_ARE_SOUND_NOTIFICATIONS_ENABLED',
    ]),

    ...mapMutations('plexservers', [
      'SET_BLOCKED_SERVER_IDS',
    ]),
  },
};
</script>

<style scoped>
.settings-card {
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.settings-card :deep(.v-list-subheader__text) {
  color: rgb(var(--v-theme-primary));
  font-weight: 600;
  text-transform: uppercase;
  font-size: 0.7rem;
  letter-spacing: 0.05em;
}

.settings-advanced {
  background: transparent;
}
</style>
