<template>
  <v-navigation-drawer
    :model-value="isRightSidebarOpen"
    style="z-index: 6;"
    location="right"
    class="pa-0"
    width="300"
    @update:model-value="SET_RIGHT_SIDEBAR_OPEN"
  >
    <template #prepend>
      <v-list-item>
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
            @click="DISCONNECT_AND_NAVIGATE_HOME"
          >
            <v-icon>exit_to_app</v-icon>
          </v-btn>
        </template>
      </v-list-item>

      <v-list-item density="compact">
        <v-switch
          v-if="AM_I_HOST"
          hide-details
          class="pa-0 ma-0"
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
      >
        <template #activator="{ props }">
          <v-list-item
            density="compact"
            v-bind="props"
          >
            <v-switch
              class="pa-0 ma-0"
              hide-details
              label="Auto Host"
              :model-value="IS_AUTO_HOST_ENABLED"
              @update:model-value="SEND_SET_AUTO_HOST_ENABLED"
            />
          </v-list-item>
        </template>

        <span>Automatically transfers host to other users when they play something new</span>
      </v-tooltip>

      <v-list-item
        v-if="(!AM_I_HOST || usingPlexClient)
          && GET_HOST_USER && GET_HOST_USER.state !== 'stopped'"
        density="compact"
      >
        <v-tooltip
          location="bottom"
          color="rgb(44, 44, 49)"
        >
          <template #activator="{ props }">
            <v-btn
              v-bind="props"
              color="primary"
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
      style="height: 100%;"
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

import { slPlayerClientId } from '@/player/constants';

export default {
  name: 'TheSidebarRight',

  components: {
    MessageList: defineAsyncComponent(() => import('@/components/MessageList.vue')),
    MessageInput: defineAsyncComponent(() => import('@/components/MessageInput.vue')),
    UserList: defineAsyncComponent(() => import('@/components/UserList.vue')),
  },

  computed: {
    ...mapState(['isRightSidebarOpen']),

    ...mapGetters('plexclients', [
      'GET_CHOSEN_CLIENT_ID',
    ]),

    ...mapGetters('synclounge', [
      'IS_PARTY_PAUSING_ENABLED',
      'IS_AUTO_HOST_ENABLED',
      'GET_USERS',
      'GET_HOST_USER',
      'AM_I_HOST',
    ]),

    usingPlexClient() {
      return this.GET_CHOSEN_CLIENT_ID !== slPlayerClientId;
    },
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
}

.participant-count {
  font-size: 0.8em;
  color: rgb(255 255 255 / 70%);
}
</style>
