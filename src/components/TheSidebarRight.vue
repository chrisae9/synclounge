<template>
  <v-navigation-drawer
    :model-value="isRightSidebarOpen"
    location="right"
    class="pa-0 sidebar-blur"
    :width="$vuetify.display.xs ? Math.min($vuetify.display.width, 360) : 340"
    aria-label="Watch party"
    :temporary="$vuetify.display.mdAndDown"
    @update:model-value="SET_RIGHT_SIDEBAR_OPEN"
  >
    <template #prepend>
      <v-list-item
        class="px-2 py-1"
        density="compact"
      >
        <template #prepend>
          <v-btn
            icon
            size="default"
            aria-label="Close watch party"
            variant="text"
            @click="SET_RIGHT_SIDEBAR_OPEN(false)"
          >
            <v-icon size="small">
              chevron_right
            </v-icon>
          </v-btn>
        </template>

        <v-list-item-title class="font-weight-bold mb-1">
          Watch party
        </v-list-item-title>

        <v-list-item-subtitle
          v-if="Object.keys(GET_USERS).length != 1"
          class="participant-count"
        >
          {{ Object.keys(GET_USERS).length }} people
        </v-list-item-subtitle>

        <v-list-item-subtitle
          v-else
          class="participant-count"
        >
          It's just you, invite some friends
        </v-list-item-subtitle>

        <template #append>
          <v-btn
            icon
            size="default"
            variant="text"
            aria-label="Leave watch party"
            @click="DISCONNECT_AND_NAVIGATE_HOME"
          >
            <v-icon>exit_to_app</v-icon>
          </v-btn>
        </template>
      </v-list-item>
    </template>

    <div class="party-body">
      <section
        class="party-controls"
        aria-label="Watch party controls"
      >
        <v-switch
          class="px-3"
          label="Advanced controls"
          hide-details
          density="compact"
          :model-value="GET_ADVANCED_PARTY_MODE"
          @update:model-value="SET_ADVANCED_PARTY_MODE"
        />
        <v-list-item
          density="compact"
          class="px-3 py-0 switch-item"
        >
          <v-switch
            v-if="AM_I_HOST"
            hide-details
            density="compact"
            class="pa-0 ma-0 sidebar-switch"
            color="primary"
            label="Party Pausing"
            :model-value="IS_PARTY_PAUSING_ENABLED"
            @update:model-value="SEND_SET_PARTY_PAUSING_ENABLED"
          />

          <v-list-item-subtitle
            v-if="!AM_I_HOST && GET_HOST_USER && GET_HOST_USER.state === 'stopped'"
          >
            Waiting for {{ GET_HOST_USER ? GET_HOST_USER.username : 'host' }} to start
          </v-list-item-subtitle>
        </v-list-item>

        <v-tooltip
          v-if="AM_I_HOST && GET_ADVANCED_PARTY_MODE"
          location="bottom"
          content-class="thumbnail-tooltip"
        >
          <template #activator="{ props }">
            <v-list-item
              density="compact"
              class="px-3 py-0 switch-item"
              v-bind="props"
            >
              <v-switch
                class="pa-0 ma-0 sidebar-switch"
                hide-details
                density="compact"
                color="primary"
                label="Auto Host"
                :model-value="IS_AUTO_HOST_ENABLED"
                @update:model-value="SEND_SET_AUTO_HOST_ENABLED"
              />
            </v-list-item>
          </template>

          <span>Automatically transfers host to other users when they play something new</span>
        </v-tooltip>

        <v-list-item
          v-if="!AM_I_HOST
            && GET_HOST_USER && GET_HOST_USER.state !== 'stopped'"
          density="compact"
          class="px-3 py-0"
        >
          <div class="d-flex ga-2">
            <v-tooltip
              location="bottom"
              content-class="thumbnail-tooltip"
            >
              <template #activator="{ props }">
                <v-btn
                  v-bind="props"
                  size="small"
                  variant="flat"
                  color="primary"
                  :aria-label="GET_HOST_USER.state === 'playing' ? 'Pause party' : 'Resume party'"
                  :disabled="!IS_PARTY_PAUSING_ENABLED"
                  @click="sendPartyPause(GET_HOST_USER.state === 'playing')"
                >
                  <v-icon v-if="GET_HOST_USER.state === 'playing'">
                    pause
                  </v-icon>

                  <v-icon v-else>
                    play_arrow
                  </v-icon>
                </v-btn>
              </template>

              <span>Party Pausing is currently {{
                IS_PARTY_PAUSING_ENABLED ? 'enabled' : 'disabled' }} by the host</span>
            </v-tooltip>
          </div>
        </v-list-item>

        <div
          v-if="syncPreset && GET_ADVANCED_PARTY_MODE"
          class="px-3 py-2"
        >
          <v-select
            :model-value="syncPreset"
            :items="syncPresets"
            label="Room synchronization"
            density="compact"
            :disabled="!AM_I_HOST"
            hide-details
            @update:model-value="SEND_SYNC_PRESET"
          />
          <p class="text-caption mt-2">
            Relaxed allows up to 7 seconds of drift to reduce corrective seeks.
            It cannot fix a slow stream.
          </p>
        </div>
      </section>
      <v-divider />
      <UserList class="party-users" />
      <v-divider />

      <MessageList class="messages" />
    </div>

    <template #append>
      <MessageInput />
    </template>
  </v-navigation-drawer>
</template>

<script>
import { defineAsyncComponent } from 'vue';
import {
  mapActions, mapGetters, mapMutations, mapState,
} from 'vuex';

export default {
  name: 'TheSidebarRight',

  components: {
    MessageList: defineAsyncComponent(() => import('@/components/MessageList.vue')),
    MessageInput: defineAsyncComponent(() => import('@/components/MessageInput.vue')),
    UserList: defineAsyncComponent(() => import('@/components/UserList.vue')),
  },

  data: () => ({
    syncPresets: [
      { title: 'Strict · 0.5 seconds', value: 'strict' },
      { title: 'Balanced · 3 seconds', value: 'balanced' },
      { title: 'Relaxed · 7 seconds', value: 'relaxed' },
      { title: 'Use each viewer’s setting', value: 'personal' },
    ],
  }),

  computed: {
    ...mapGetters('settings', ['GET_ADVANCED_PARTY_MODE']),
    ...mapState('synclounge', ['syncPreset']),
    ...mapState(['isRightSidebarOpen']),

    ...mapGetters('synclounge', [
      'IS_PARTY_PAUSING_ENABLED',
      'IS_AUTO_HOST_ENABLED',
      'GET_USERS',
      'GET_HOST_USER',
      'AM_I_HOST',
    ]),
  },

  methods: {
    ...mapMutations('settings', ['SET_ADVANCED_PARTY_MODE']),
    ...mapActions('synclounge', [
      'SEND_SYNC_PRESET',
      'SEND_SET_PARTY_PAUSING_ENABLED',
      'SEND_SET_AUTO_HOST_ENABLED',
      'sendPartyPause',
      'DISCONNECT_AND_NAVIGATE_HOME',
    ]),

    ...mapMutations([
      'SET_RIGHT_SIDEBAR_OPEN',
    ]),

  },
};
</script>

<style scoped>
.party-body {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

.party-controls,
.party-users {
  flex: 0 0 auto;
}

.messages {
  overflow-y: auto;
  flex: 1 0 180px;
  max-height: 60dvh;
  min-height: 180px;
}

.participant-count {
  font-size: 0.8em;
  color: rgb(255 255 255 / 70%);
}

.switch-item :deep(.v-list-item__content) {
  overflow: visible;
}

.sidebar-switch :deep(.v-selection-control) {
  min-height: 44px;
}

.sidebar-switch :deep(.v-switch__track) {
  width: 30px;
  height: 14px;
}

.sidebar-switch :deep(.v-switch__thumb) {
  width: 18px;
  height: 18px;
}

.sidebar-switch :deep(.v-label) {
  font-size: 0.875rem;
  opacity: 0.85;
  padding-inline-start: 8px;
}

.sidebar-blur {
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  background: rgba(12, 14, 18, 0.96) !important;
  border-left: 1px solid var(--sl-border);
  /* Override pa-0 so the party header clears the standalone status bar/notch. */
  padding-top: env(safe-area-inset-top) !important;
  padding-right: env(safe-area-inset-right) !important;
}

.sidebar-blur :deep(.v-navigation-drawer__content) {
  overscroll-behavior: contain;
}
</style>
