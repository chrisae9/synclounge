<template>
  <v-container class="welcome-layout">
    <v-row
      align="center"
      justify="center"
    >
      <v-col>
        <v-card
          class="mx-auto welcome-card advanced-card"
          max-width="800"
          :loading="connectionPending"
          variant="flat"
        >
          <div class="welcome-heading">
            <img
              src="@/assets/images/logos/logo-long-light.png"
              alt="SyncLounge"
              class="welcome-logo"
            >
            <p class="eyebrow">
              CONNECTION OPTIONS
            </p>
            <h1 class="welcome-title">
              Watch-party connection.
            </h1>
            <p class="welcome-description">
              This service keeps your group in sync. It does not choose your Plex media library.
              Normally, use the service provided by this website.
            </p>
          </div>

          <v-card-text class="pt-2 welcome-body">
            <h2 class="section-header">
              Available watch-party services
            </h2>

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
                      {{ healthChecking ? 'Checking availability…' : 'Unavailable' }}
                    </div>
                    <p
                      v-if="!GET_SERVER_HEALTH(server.url) && !healthChecking"
                      class="text-caption mt-2"
                    >
                      This service did not respond. Retry the availability check or choose another service.
                    </p>
                  </v-card-text>

                  <v-card-actions class="px-4 pb-4">
                    <v-btn
                      block
                      variant="flat"
                      color="primary"
                      class="welcome-primary"
                      :disabled="connectionPending || !GET_SERVER_HEALTH(server.url)"
                      :aria-label="`Connect to ${server.name}`"
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
                      Another SyncLounge service
                    </v-card-title>
                  </v-img>

                  <v-card-text>
                    <v-text-field
                      hide-details="auto"
                      :error-messages="customServerTouched ? customServerError : ''"
                      hint="Use a complete http:// or https:// address."
                      persistent-hint
                      variant="outlined"
                      density="compact"
                      label="SyncLounge service address"
                      type="url"
                      autocomplete="url"
                      placeholder="https://"
                      :model-value="customServerUrl"
                      @update:model-value="SET_CUSTOM_SERVER_URL"
                      @blur="customServerTouched = true"
                    />
                  </v-card-text>

                  <v-card-actions class="px-4 pb-4">
                    <v-btn
                      block
                      variant="flat"
                      color="primary"
                      class="welcome-primary"
                      :disabled="connectionPending || !!customServerError"
                      aria-label="Connect to custom SyncLounge service"
                      @click="connect(customServerUrl, true)"
                    >
                      Connect
                    </v-btn>
                  </v-card-actions>
                </v-card>
              </v-col>
            </v-row>

            <v-btn
              class="mt-4"
              :loading="healthChecking"
              :disabled="connectionPending"
              @click="refreshHealth"
            >
              Retry availability check
            </v-btn>

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

          <v-card-actions class="welcome-actions justify-center">
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
    customServerTouched: false,
    healthChecking: true,
    healthRequestPending: false,
    connectionPending: false,
    testConnectionInterval: null,
  }),

  computed: {
    customServerError() {
      try {
        const address = new URL(this.customServerUrl.trim());
        if (!['http:', 'https:'].includes(address.protocol) || !address.hostname
          || address.username || address.password || address.search || address.hash) {
          return 'Enter an http:// or https:// service address without credentials, query, or fragment.';
        }
        return '';
      } catch {
        return 'Enter a complete address, such as https://lounge.example.com.';
      }
    },
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

  created() {
    this.refreshHealth();

    this.testConnectionInterval = setInterval(
      () => this.refreshHealth(),
      5000,
    );
  },

  methods: {
    async refreshHealth() {
      if (this.healthRequestPending) return;
      this.healthRequestPending = true;
      this.healthChecking = true;
      try {
        await this.FETCH_SERVERS_HEALTH();
      } catch {
        this.serverError = 'Couldn’t check service availability. Try again.';
      } finally {
        this.healthChecking = false;
        this.healthRequestPending = false;
      }
    },
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

    async connect(server, custom = false) {
      if (this.connectionPending) return;
      if (server === this.customServerUrl && this.customServerError) return;
      if (!custom && this.GET_CONFIG.servers.some((configured) => configured.url === server)
        && !this.GET_SERVER_HEALTH(server)) return;
      this.serverError = null;
      this.connectionPending = true;

      try {
        await this.SET_AND_CONNECT_AND_JOIN_ROOM({
          server: server.trim(),
          room: getRandomRoomId(),
        });

        if (this.$route.name === 'AdvancedRoomJoin') {
          this.$router.push(this.linkWithRoom({ name: 'PlexHome' }));
        }
      } catch (e) {
        if (e.name !== 'AbortError') {
          await this.DISCONNECT_IF_CONNECTED();
          console.error(e);
          this.serverError = mapErrorMessage(e);
        }
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

.server-card :deep(.v-card-title) { white-space: normal; overflow-wrap: anywhere; line-height: 1.35; }

.server-card {
  border: 1px solid rgba(255, 255, 255, 0.1);
  height: 100%;
  display: flex;
  flex-direction: column;
}

.server-card :deep(.v-card-text) {
  flex: 1;
}

.server-card :deep(.v-img) { flex: 0 0 140px; height: 140px; }
</style>
