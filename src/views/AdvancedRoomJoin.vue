<template>
  <v-row
    justify="center"
  >
    <v-col
      cols="12"
      lg="10"
      style="background: rgb(0 0 0 / 10%); border-radius: 10px;"
      class="pa-4"
    >
      <v-row
        justify="center"
      >
        <v-col
          cols="12"
          md="8"
          lg="4"
          xl="6"
        >
          <v-img
            src="@/assets/images/logos/logo-long-light.png"
          />
        </v-col>
      </v-row>

      <v-row
        justify="center"
      >
        <v-col
          cols="12"
          class="pa-4"
        >
          <v-list-subheader>Select a server</v-list-subheader>

          <v-row
            justify="center"
            align="center"
          >
            <v-col
              v-for="server in GET_CONFIG.servers"
              :key="server.url"
              cols="12"
              md="3"
              lg="2"
            >
              <v-card>
                <v-img
                  height="125"
                  :src="server.image"
                  class="text-white align-end"
                  gradient="to bottom, rgba(0,0,0,.6), rgba(0,0,0,.9)"
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

                <v-card-actions>
                  <v-btn
                    block
                    color="primary"
                    :disabled="connectionPending"
                    @click="connect(server.url)"
                  >
                    Connect
                  </v-btn>
                </v-card-actions>
              </v-card>
            </v-col>

            <v-col
              class="pa-2"
              cols="12"
              md="3"
              lg="2"
            >
              <v-card>
                <v-img
                  height="125"
                  src="@/assets/images/synclounge-white.png"
                  class="text-white align-end"
                  gradient="to bottom, rgba(0,0,0,.6), rgba(0,0,0,.9)"
                >
                  <v-card-title>
                    Custom
                  </v-card-title>
                </v-img>

                <v-card-text>
                  <v-text-field
                    hide-details
                    :model-value="customServerUrl"
                    @update:model-value="SET_CUSTOM_SERVER_URL"
                  />
                </v-card-text>

                <v-card-actions>
                  <v-btn
                    block
                    color="primary"
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
            class="pt-3"
          >
            <v-col cols="12">
              <div style="width: 100%; text-align: center;">
                <v-progress-circular
                  indeterminate
                  :size="50"
                  class="text-amber"
                  style="display: inline-block;"
                />
              </div>
            </v-col>
          </v-row>

          <v-row
            v-if="serverError"
            class="pt-3 text-center"
          >
            <v-col
              cols="12"
              class="text-red"
            >
              <v-icon class="text-red">
                info
              </v-icon>
              {{ serverError }}
            </v-col>
          </v-row>
        </v-col>
      </v-row>
    </v-col>
  </v-row>
</template>

<script>
import {
  mapActions, mapGetters, mapMutations, mapState,
} from 'vuex';
import { getRandomRoomId } from '@/utils/random';
import linkWithRoom from '@/mixins/linkwithroom';

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
        this.serverError = e.message;
      }

      this.connectionPending = false;
    },
  },
};
</script>
