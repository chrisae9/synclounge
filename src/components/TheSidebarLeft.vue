<template>
  <v-navigation-drawer
    temporary
    :model-value="isLeftSidebarOpen"
    class="sidebar-blur"
    @update:model-value="SET_LEFT_SIDEBAR_OPEN"
  >
    <v-list-item
      v-if="GET_PLEX_USER"
      class="py-4"
    >
      <template #prepend>
        <v-avatar>
          <v-img
            :src="GET_PLEX_USER.thumb"
          />
        </v-avatar>
      </template>

      <v-list-item-title style="font-weight: bold;">
        {{ GET_PLEX_USER.username }}
      </v-list-item-title>
    </v-list-item>

    <v-list
      density="compact"
      nav
      class="pt-2"
    >
      <TheSettingsDialog v-slot="{ props }">
        <v-list-item
          v-bind="props"
        >
          <template #prepend>
            <v-icon>settings</v-icon>
          </template>

          <v-list-item-title>Settings</v-list-item-title>
        </v-list-item>
      </TheSettingsDialog>

      <v-list-item
        href="https://github.com/chrisae9/synclounge"
        target="_blank"
      >
        <template #prepend>
          <v-icon>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              width="24"
              height="24"
              fill="currentColor"
            ><!-- eslint-disable-next-line max-len -->
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
          </v-icon>
        </template>

        <v-list-item-title>GitHub</v-list-item-title>
      </v-list-item>

      <v-list-item
        :to="{ name: 'SignOut' }"
      >
        <template #prepend>
          <v-icon>cancel</v-icon>
        </template>

        <v-list-item-title>Sign out</v-list-item-title>
      </v-list-item>
    </v-list>

    <div class="sidebar-version">
      v{{ appVersion }}
    </div>
  </v-navigation-drawer>
</template>

<script>
import { defineAsyncComponent } from 'vue';
import { mapGetters, mapMutations, mapState } from 'vuex';

export default {
  name: 'TheSidebarLeft',

  components: {
    TheSettingsDialog: defineAsyncComponent(() => import('@/components/TheSettingsDialog.vue')),
  },

  computed: {
    ...mapState([
      'isLeftSidebarOpen',
    ]),

    ...mapGetters('plex', [
      'GET_PLEX_USER',
    ]),

    appVersion() {
      return import.meta.env.VITE_APP_VERSION || 'dev';
    },
  },

  methods: {
    ...mapMutations([
      'SET_LEFT_SIDEBAR_OPEN',
    ]),
  },
};
</script>

<style scoped>
.sidebar-blur {
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  background: rgba(0, 0, 0, 0.85) !important;
}

.sidebar-version {
  position: absolute;
  bottom: 12px;
  left: 16px;
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.3);
}
</style>
