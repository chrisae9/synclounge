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

    <v-card>
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
        <v-list-subheader>Web Player</v-list-subheader>

        <v-list-item
          @click="SET_AUTO_SKIP_INTRO(!GET_AUTO_SKIP_INTRO)"
        >
          <v-list-item-title>Auto Skip Intro</v-list-item-title>
          <v-list-item-subtitle>
            Automatically skip the intros of media when available
          </v-list-item-subtitle>

          <template #append>
            <v-switch
              hide-details
              :model-value="GET_AUTO_SKIP_INTRO"
              @update:model-value="SET_AUTO_SKIP_INTRO"
              @click.stop
            />
          </template>
        </v-list-item>

        <v-list-item
          @click="SET_ALLOW_DIRECT_PLAY(!allowDirectPlay)"
        >
          <v-list-item-title>Allow Direct Play</v-list-item-title>
          <v-list-item-subtitle>
            Allow direct play when available
          </v-list-item-subtitle>

          <template #append>
            <v-switch
              hide-details
              :model-value="allowDirectPlay"
              @update:model-value="SET_ALLOW_DIRECT_PLAY"
              @click.stop
            />
          </template>
        </v-list-item>

        <v-list-item
          @click="SET_SLPLAYERFORCETRANSCODE(!GET_SLPLAYERFORCETRANSCODE)"
        >
          <v-list-item-title>Force Transcode</v-list-item-title>
          <v-list-item-subtitle>
            Force Plex to transcode all media and never direct play or stream
          </v-list-item-subtitle>

          <template #append>
            <v-switch
              hide-details
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
            Force Plex to burn all subtitles.
          </v-list-item-subtitle>

          <template #append>
            <v-switch
              hide-details
              :model-value="forceBurnSubtitles"
              @update:model-value="SET_FORCE_BURN_SUBTITLES"
              @click.stop
            />
          </template>
        </v-list-item>

        <v-list-item>
          <v-list-item-title>Streaming Protocol</v-list-item-title>

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
              :model-value="ARE_NOTIFICATIONS_ENABLED && isSecureContext"
              :disabled="!isSecureContext"
              @update:model-value="CHANGE_NOTIFICATIONS_ENABLED"
              @click.stop
            />

            <v-tooltip
              v-if="!isSecureContext"
              location="bottom"
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

        <v-list-subheader>Synchronization</v-list-subheader>

        <v-list-item
          @click="SET_AUTOPLAY(!GET_AUTOPLAY)"
        >
          <v-list-item-title>Autoplay</v-list-item-title>
          <v-list-item-subtitle>
            Automatically play the same content as the host
          </v-list-item-subtitle>

          <template #append>
            <v-switch
              hide-details
              :model-value="GET_AUTOPLAY"
              @update:model-value="SET_AUTOPLAY"
              @click.stop
            />
          </template>
        </v-list-item>

        <v-list-item>
          <v-list-item-title>Sync Flexibility</v-list-item-title>
          <v-list-item-subtitle>
            Time difference threshold for synchronization
          </v-list-item-subtitle>

          <v-slider
            hide-details
            :model-value="GET_SYNCFLEXIBILITY"
            :min="0"
            :max="10000"
            thumb-label
            @update:model-value="UPDATE_SYNC_FLEXIBILITY"
          />
        </v-list-item>

        <v-list-item>
          <v-list-item-title>Syncing Method</v-list-item-title>

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

        <v-divider />

        <v-list-subheader>Plex</v-list-subheader>

        <v-list-item>
          <v-list-item-title>Client Poll Interval</v-list-item-title>
          <v-list-item-subtitle>
            How often Plex clients are polled for new information
          </v-list-item-subtitle>

          <v-slider
            hide-details
            :model-value="GET_CLIENTPOLLINTERVAL"
            :min="100"
            :max="10000"
            thumb-label
            @update:model-value="SET_CLIENTPOLLINTERVAL"
          />
        </v-list-item>

        <v-list-item>
          <v-list-item-title>Disabled Servers</v-list-item-title>

          <v-list-item-subtitle>
            Disabled servers are excluded from search and autoplay
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
      </v-list>
    </v-card>
  </v-dialog>
</template>

<script>
import {
  mapActions, mapGetters, mapMutations, mapState,
} from 'vuex';
import { streamingProtocols } from '@/utils/streamingprotocols';

export default {
  name: 'TheSettingsDialog',

  data: () => ({
    dialogOpen: false,

    syncMethods: [
      { title: 'Clean Seek', value: 'cleanseek' },
      { title: 'Skip Ahead', value: 'skipahead' },
    ],

    streamingProtocols,
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
