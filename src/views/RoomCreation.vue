<template>
  <v-container class="fill-height">
    <v-row
      align="center"
      justify="center"
    >
      <v-col>
        <v-card
          class="mx-auto"
          max-width="550"
          :loading="loading"
          variant="outlined"
          color="rgba(255, 255, 255, 0.12)"
        >
          <v-card-title>
            <v-img
              src="@/assets/images/logos/logo-long-light.png"
            />
          </v-card-title>

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

          <v-card-actions class="mt-2 justify-center flex-column ga-2">
            <v-btn
              variant="flat"
              color="primary"
              class="text-white"
              block
              :disabled="!GET_SERVERS_HEALTH || Object.keys(GET_SERVERS_HEALTH).length === 0
                || loading"
              @click="createRoom"
            >
              Connect
            </v-btn>

            <v-btn
              variant="outlined"
              color="primary"
              :to="{ name: 'AdvancedRoomJoin' }"
            >
              Advanced
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
