<template>
  <v-container class="fill-height">
    <v-row
      align="center"
      justify="center"
    >
      <v-col>
        <v-card
          class="mx-auto advanced-card"
          max-width="700"
          :loading="connectionPending"
          variant="outlined"
          color="rgba(255, 255, 255, 0.12)"
        >
          <v-card-title>
            <v-img
              src="@/assets/images/logos/logo-long-light.png"
            />
          </v-card-title>

          <v-card-text class="pt-2">
            <div class="section-header">
              Select a server
            </div>

            <v-row class="mt-2">
              <v-col
                v-for="server in GET_CONFIG.servers"
                :key="server.url"
                cols="12"
                sm="6"
              >
                <v-card
                  color="rgb(18, 18, 18)"
                  class="server-card"
                >
                  <v-img
                    height="140"
                    :src="server.image"
                    class="text-white align-end"
                    gradient="to bottom, rgba(0,0,0,.4), rgba(0,0,0,.85)"
                    cover
                  >
                    <v-card-title v-text="server.name" />
                    <v-card-subtitle v-text="server.location" />
                  </v-img>

                  <v-card-text>
                    <template v-if="GET_SERVER_HEALTH(server.url)">
                      <div>
                        Ping:
                        <span
                          class="font-weight-bold"
                          :class="connectionQualityClass(GET_SERVER_HEALTH(server.url).latency)"
                        >
                          {{ GET_SERVER_HEALTH(server.url).latency }}ms
                        </span>
                      </div>

                      <div>
                        Load:
                        <span
                          class="font-weight-bold"
                          :class="loadQualityClass(GET_SERVER_HEALTH(server.url).load)"
                        >
                          {{ GET_SERVER_HEALTH(server.url).load }}
                        </span>
                      </div>
                    </template>

                    <div
                      v-else
                      class="text-center text-red"
                    >
                      error
                    </div>
                  </v-card-text>

                  <v-card-actions class="px-4 pb-4">
                    <v-btn
                      block
                      variant="flat"
                      color="primary"
                      class="text-white"
                      :disabled="connectionPending"
                      @click="connect(server.url)"
                    >
                      Connect
                    </v-btn>
                  </v-card-actions>
                </v-card>
              </v-col>

              <v-col
                cols="12"
                sm="6"
              >
                <v-card
                  color="rgb(18, 18, 18)"
                  class="server-card"
                >
                  <v-img
                    height="140"
                    src="@/assets/images/synclounge-white.png"
                    class="text-white align-end"
                    gradient="to bottom, rgba(0,0,0,.4), rgba(0,0,0,.85)"
                    cover
                  >
                    <v-card-title>
                      Custom Server
                    </v-card-title>
                  </v-img>

                  <v-card-text>
                    <v-text-field
                      hide-details
                      variant="outlined"
                      density="compact"
                      placeholder="https://"
                      :model-value="customServerUrl"
                      @update:model-value="SET_CUSTOM_SERVER_URL"
                    />
                  </v-card-text>

                  <v-card-actions class="px-4 pb-4">
                    <v-btn
                      block
                      variant="flat"
                      color="primary"
                      class="text-white"
                      :disabled="connectionPending"
                      @click="connect(customServerUrl)"
                    >
                      Connect
                    </v-btn>
                  </v-card-actions>
                </v-card>
              </v-col>
            </v-row>

            <v-row
              v-if="connectionPending && !serverError"
              justify="center"
              class="pt-3"
            >
              <v-col cols="auto">
                <v-progress-circular
                  indeterminate
                  :size="50"
                  color="primary"
                />
              </v-col>
            </v-row>

            <v-alert
              v-if="serverError"
              type="error"
              class="mt-4"
            >
              {{ serverError }}
            </v-alert>
          </v-card-text>

          <v-card-actions class="justify-center pb-4">
            <v-btn
              variant="text"
              :to="{ name: 'RoomCreation' }"
            >
              Back
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script>
import {
  mapActions, mapGetters, mapMutations, mapState,
} from 'vuex';
import { getRandomRoomId } from '@/utils/random';
import linkWithRoom from '@/mixins/linkwithroom';
import mapErrorMessage from '@/utils/errorutils';

export default {
  name: 'AdvancedRoomJoin',

  mixins: [
    linkWithRoom,
  ],

  data: () => ({
    serverError: null,
    connectionPending: false,
    testConnectionInterval: null,
  }),

  computed: {
    ...mapGetters([
      'GET_CONFIG',
    ]),

    ...mapGetters('synclounge', [
      'GET_SERVER_HEALTH',
    ]),

    ...mapState('settings', [
      'customServerUrl',
    ]),
  },

  beforeUnmount() {
    clearInterval(this.testConnectionInterval);
  },

  async created() {
    await this.FETCH_SERVERS_HEALTH();

    this.testConnectionInterval = setInterval(
      () => this.FETCH_SERVERS_HEALTH(),
      5000,
    );
  },

  methods: {
    ...mapMutations('settings', [
      'SET_CUSTOM_SERVER_URL',
    ]),

    ...mapActions('synclounge', [
      'FETCH_SERVERS_HEALTH',
      'SET_AND_CONNECT_AND_JOIN_ROOM',
      'DISCONNECT_IF_CONNECTED',
    ]),

    connectionQualityClass(value) {
      if (value < 50) {
        return ['text-green-lighten-1'];
      }
      if (value < 150) {
        return ['text-lime'];
      }
      if (value < 250) {
        return ['text-orange'];
      }
      return ['text-red'];
    },

    loadQualityClass(value) {
      if (value === 'low') {
        return ['text-green-lighten-1'];
      }
      if (value === 'medium') {
        return ['text-orange'];
      }
      if (value === 'high') {
        return ['text-red'];
      }
      return ['text-white'];
    },

    async connect(server) {
      this.serverError = null;
      this.connectionPending = true;

      try {
        await this.SET_AND_CONNECT_AND_JOIN_ROOM({
          server,
          room: getRandomRoomId(),
        });

        if (this.$route.name === 'AdvancedRoomJoin') {
          this.$router.push(this.linkWithRoom({ name: 'PlexHome' }));
        }
      } catch (e) {
        this.DISCONNECT_IF_CONNECTED();
        console.error(e);
        this.serverError = mapErrorMessage(e);
      }

      this.connectionPending = false;
    },
  },
};
</script>

<style scoped>
.advanced-card {
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.section-header {
  color: rgb(var(--v-theme-primary));
  font-weight: 600;
  text-transform: uppercase;
  font-size: 0.75rem;
  letter-spacing: 0.08em;
}

.server-card {
  border: 1px solid rgba(255, 255, 255, 0.1);
  height: 100%;
  display: flex;
  flex-direction: column;
}

.server-card :deep(.v-card-text) {
  flex: 1;
}
</style>
