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

          <v-card-text
            v-if="loading"
            class="text-center"
          >
            <v-progress-circular
              indeterminate
              color="primary"
              class="mr-2"
            />
            Joining room...
          </v-card-text>

          <v-card-actions
            v-if="error"
            class="mt-2 justify-center"
          >
            <v-btn
              variant="flat"
              color="primary"
              class="text-white"
              block
              :disabled="loading"
              @click="joinInvite"
            >
              Retry
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script>
import { mapActions } from 'vuex';
import linkWithRoom from '@/mixins/linkwithroom';
import mapErrorMessage from '@/utils/errorutils';

export default {
  name: 'RoomJoin',

  mixins: [
    linkWithRoom,
  ],

  props: {
    room: {
      type: String,
      required: true,
    },

    server: {
      type: String,
      default: '',
    },
  },

  data: () => ({
    loading: false,
    error: null,
  }),

  async created() {
    await this.DISCONNECT_IF_CONNECTED();
    await this.joinInvite();
  },

  methods: {
    ...mapActions('synclounge', [
      'SET_AND_CONNECT_AND_JOIN_ROOM',
      'DISCONNECT_IF_CONNECTED',
    ]),

    getSafeRoomRedirect(redirect) {
      if (typeof redirect !== 'string' || !redirect.startsWith('/') || redirect.startsWith('//')) {
        return null;
      }

      const resolvedRedirect = this.$router.resolve(redirect);
      const isProtectedRoomRoute = resolvedRedirect.matched
        .some((route) => route.meta.protected)
        && resolvedRedirect.params.room === this.room
        && (this.server ? resolvedRedirect.params.server === this.server : !resolvedRedirect.params.server);

      return isProtectedRoomRoute ? resolvedRedirect.fullPath : null;
    },

    async joinInvite() {
      this.error = null;
      this.loading = true;

      const startedOnRoomJoin = this.$route.name === 'RoomJoin';
      const redirect = this.$route.query.redirect;
      const watching = this.$route.query.watching;
      const safeRedirect = this.getSafeRoomRedirect(redirect);
      const syncOnJoin = !safeRedirect || this.$router.resolve(safeRedirect).name === 'WebPlayer';

      try {
        await this.SET_AND_CONNECT_AND_JOIN_ROOM({
          server: this.server,
          room: this.room,
          syncOnJoin,
        });
        if (safeRedirect) {
          this.$router.push(safeRedirect);
          return;
        }

        if (this.$route.name === 'RoomJoin' && startedOnRoomJoin) {
          const destination = watching
            ? { name: 'WebPlayer' }
            : { name: 'PlexHome' };
          this.$router.push(this.linkWithRoom(destination));
        }
      } catch (e) {
        this.DISCONNECT_IF_CONNECTED();
        console.error(e);
        this.error = mapErrorMessage(e);
      }

      this.loading = false;
    },
  },
};
</script>
