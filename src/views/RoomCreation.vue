<template>
  <v-container class="welcome-layout">
    <v-row
      align="center"
      justify="center"
    >
      <v-col>
        <v-card
          class="mx-auto welcome-card"
          max-width="480"
          :loading="loading"
          variant="flat"
        >
          <div class="welcome-heading">
            <img
              src="@/assets/images/logos/logo-long-light.png"
              alt="SyncLounge"
              class="welcome-logo"
            >
            <p class="eyebrow">
              YOUR NEXT MOVIE NIGHT
            </p>
            <h1 class="welcome-title">
              Start a watch party.
            </h1>
            <p class="welcome-description">
              Create a room, pick something to watch, and invite your friends with a link.
            </p>
          </div>

          <v-alert
            v-if="error"
            type="error"
          >
            {{ error }}
          </v-alert>

          <v-alert
            v-if="GET_SERVERS_HEALTH && Object.keys(GET_SERVERS_HEALTH).length === 0"
            prominent
            type="error"
          >
            <v-row align="center">
              <v-col class="grow">
                No connectable SyncLounge servers
              </v-col>
              <v-col class="shrink">
                <v-btn
                  variant="outlined"
                  color="white"
                  @click="fetchServersHealth"
                >
                  Refresh
                </v-btn>
              </v-col>
            </v-row>
          </v-alert>

          <v-card-actions class="welcome-actions justify-center flex-column ga-3">
            <v-btn
              variant="flat"
              color="primary"
              class="welcome-primary"
              size="large"
              block
              :disabled="!GET_SERVERS_HEALTH || Object.keys(GET_SERVERS_HEALTH).length === 0
                || loading"
              @click="createRoom"
            >
              Create a room
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script>
import { mapActions, mapGetters } from 'vuex';
import linkWithRoom from '@/mixins/linkwithroom';
import { getRandomRoomId } from '@/utils/random';
import mapErrorMessage from '@/utils/errorutils';

export default {
  name: 'RoomCreation',

  mixins: [
    linkWithRoom,
  ],

  data() {
    return {
      loading: false,
      error: null,
    };
  },

  computed: {
    ...mapGetters([
      'GET_CONFIG',
    ]),

    ...mapGetters('synclounge', [
      'GET_SERVERS_HEALTH',
      'GET_BEST_SERVER',
    ]),
  },

  async created() {
    await this.DISCONNECT_IF_CONNECTED();
    await this.fetchServersHealth();
  },

  methods: {
    ...mapActions('synclounge', [
      'FETCH_SERVERS_HEALTH',
      'SET_AND_CONNECT_AND_JOIN_ROOM',
      'DISCONNECT_IF_CONNECTED',
    ]),

    async fetchServersHealth() {
      try {
        await this.FETCH_SERVERS_HEALTH();
      } catch (e) {
        console.error(e);
        this.error = 'Unable to fetch servers health';
      }
    },

    async createRoom() {
      this.$store.commit('SET_RIGHT_SIDEBAR_OPEN', false);
      this.error = null;
      this.loading = true;

      try {
        await this.SET_AND_CONNECT_AND_JOIN_ROOM({
          server: this.GET_BEST_SERVER,
          room: getRandomRoomId(),
        });

        if (this.$route.name === 'RoomCreation') {
          this.$router.push(this.linkWithRoom({ name: 'PlexHome' }));
        }
      } catch (e) {
        this.DISCONNECT_IF_CONNECTED();
        console.error(e);

        this.error = mapErrorMessage(e);
        await this.fetchServersHealth();
      }

      this.loading = false;
    },
  },
};
</script>
