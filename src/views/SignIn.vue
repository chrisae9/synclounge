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
          <v-alert
            v-if="GET_PLEX_AUTH_TOKEN && IS_USER_AUTHORIZED === false"
            type="error"
          >
            You are not authorized to access this server
          </v-alert>

          <v-card-title>
            <v-img
              src="@/assets/images/logos/logo-long-light.png"
            />
          </v-card-title>

          <v-card-actions class="justify-center pa-4">
            <v-btn
              color="primary"
              size="x-large"
              variant="flat"
              class="text-white"
              block
              :disabled="allowSignIn"
              @click="signIn"
            >
              Sign in
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script>
import { mapActions, mapGetters, mapMutations } from 'vuex';

import getCookie from '@/utils/getcookie';

const PIN_STORAGE_KEY = 'plex_auth_pin';

export default {
  name: 'SignIn',

  data: () => ({
    loading: false,
    plexAuthResponse: null,
  }),

  computed: {
    ...mapGetters([
      'GET_CONFIG',
    ]),

    ...mapGetters('plex', [
      'GET_PLEX_AUTH_URL',
      'IS_USER_AUTHORIZED',
      'GET_PLEX_AUTH_TOKEN',
    ]),

    allowSignIn() {
      return this.loading || !this.plexAuthResponse
      || (!this.IS_USER_AUTHORIZED && !!this.GET_PLEX_AUTH_TOKEN);
    },
  },

  async created() {
    if (this.IS_USER_AUTHORIZED && this.GET_PLEX_AUTH_TOKEN) {
      this.redirect();
      return;
    }

    const cookieToken = getCookie('mpt');
    if (cookieToken) {
      await this.cookieAuth(cookieToken);
      return;
    }

    // Check if we're returning from a Plex auth redirect
    const savedPin = sessionStorage.getItem(PIN_STORAGE_KEY);
    if (savedPin) {
      sessionStorage.removeItem(PIN_STORAGE_KEY);
      await this.completeRedirectAuth(JSON.parse(savedPin));
      return;
    }

    await this.fetchInitialAuthCode();
  },

  methods: {
    ...mapActions('plex', [
      'FETCH_PLEX_INIT_AUTH',
      'REQUEST_PLEX_AUTH_TOKEN',
      'FETCH_PLEX_DEVICES_IF_NEEDED',
      'FETCH_PLEX_USER',
    ]),

    ...mapActions('plexservers', [
      'FETCH_AND_SET_RANDOM_BACKGROUND_IMAGE',
    ]),

    ...mapMutations('plex', [
      'SET_PLEX_AUTH_TOKEN',
    ]),

    async fetchInitialAuthCode() {
      this.loading = true;
      try {
        this.plexAuthResponse = await this.FETCH_PLEX_INIT_AUTH();
      } finally {
        this.loading = false;
      }
    },

    signIn() {
      if (!this.plexAuthResponse) return;

      // Save the PIN so we can retrieve the token after redirect
      sessionStorage.setItem(PIN_STORAGE_KEY, JSON.stringify({
        id: this.plexAuthResponse.id,
        redirect: this.$route.query.redirect || '/',
      }));

      const forwardUrl = window.location.origin + this.$route.fullPath;
      const authUrl = this.GET_PLEX_AUTH_URL(this.plexAuthResponse.code, forwardUrl);

      // Navigate to Plex auth in the same window — Plex will redirect back
      window.location.href = authUrl;
    },

    async completeRedirectAuth(savedPin) {
      this.loading = true;

      try {
        await this.REQUEST_PLEX_AUTH_TOKEN({ id: savedPin.id });
        await this.FETCH_PLEX_DEVICES_IF_NEEDED();
        this.FETCH_AND_SET_RANDOM_BACKGROUND_IMAGE();
        this.$router.push(savedPin.redirect || '/');
      } catch {
        // Token not ready yet or PIN expired — start fresh
        await this.fetchInitialAuthCode();
      }

      this.loading = false;
    },

    async cookieAuth(token) {
      this.loading = true;
      this.SET_PLEX_AUTH_TOKEN(token);
      try {
        await this.FETCH_PLEX_USER();
        this.redirect();
        await this.FETCH_PLEX_DEVICES_IF_NEEDED();
        this.FETCH_AND_SET_RANDOM_BACKGROUND_IMAGE();
      } catch (e) {
        console.error(e);
        this.SET_PLEX_AUTH_TOKEN(null);
        await this.fetchInitialAuthCode();
      } finally {
        this.loading = false;
      }
    },

    redirect() {
      this.$router.push(this.$route.query.redirect || '/');
    },
  },
};
</script>
