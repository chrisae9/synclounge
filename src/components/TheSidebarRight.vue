<template>
  <v-navigation-drawer
    :model-value="isRightSidebarOpen"
    location="right"
    class="pa-0 sidebar-blur"
    width="300"
    :temporary="$vuetify.display.mdAndDown"
    @update:model-value="SET_RIGHT_SIDEBAR_OPEN"
  >
    <template #prepend>
      <v-list-item
        class="pa-1"
        density="compact"
      >
        <template #prepend>
          <v-btn
            icon
            size="x-small"
            variant="text"
            @click="SET_RIGHT_SIDEBAR_OPEN(false)"
          >
            <v-icon size="small">
              chevron_right
            </v-icon>
          </v-btn>
        </template>

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
            size="small"
            variant="text"
            @click="DISCONNECT_AND_NAVIGATE_HOME"
          >
            <v-icon>exit_to_app</v-icon>
          </v-btn>
        </template>
      </v-list-item>

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
          v-if="!AM_I_HOST && GET_HOST_USER.state === 'stopped'"
        >
          Waiting for {{ GET_HOST_USER ? GET_HOST_USER.username : 'host' }} to start
        </v-list-item-subtitle>
      </v-list-item>

      <v-tooltip
        v-if="AM_I_HOST"
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
      >
        <v-tooltip
          location="bottom"
          content-class="thumbnail-tooltip"
        >
          <template #activator="{ props }">
            <v-btn
              v-bind="props"
              variant="flat"
              color="primary"
              class="text-white"
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
      </v-list-item>

      <v-divider />
    </template>

    <div
      style="height: 100%; overflow: hidden;"
      class="d-flex flex-column"
    >
      <UserList />
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

  computed: {
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
    ...mapActions('synclounge', [
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
.messages {
  overflow-y: auto;
  flex: 1 1 0;
  min-height: 0;
}

.participant-count {
  font-size: 0.8em;
  color: rgb(255 255 255 / 70%);
}

.switch-item :deep(.v-list-item__content) {
  overflow: visible;
}

.sidebar-switch :deep(.v-selection-control) {
  min-height: 28px;
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
  font-size: 0.8rem;
  opacity: 0.85;
  padding-inline-start: 8px;
}

.sidebar-blur {
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  background: rgba(0, 0, 0, 0.85) !important;
}

.sidebar-blur :deep(.v-navigation-drawer__content) {
  overscroll-behavior: contain;
}
</style>
