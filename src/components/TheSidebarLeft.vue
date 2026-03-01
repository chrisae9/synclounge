<template>
  <v-navigation-drawer
    temporary
    :model-value="isLeftSidebarOpen"
    @update:model-value="SET_LEFT_SIDEBAR_OPEN"
  >
    <v-list-item v-if="GET_PLEX_USER">
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
    <v-divider />

    <v-list
      density="compact"
      nav
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
        :to="{ name: 'SignOut' }"
      >
        <template #prepend>
          <v-icon>cancel</v-icon>
        </template>

        <v-list-item-title>Sign out</v-list-item-title>
      </v-list-item>

      <v-list-subheader>About</v-list-subheader>

      <v-list-item
        :href="GET_RELEASE_URL"
        target="_blank"
      >
        <template #prepend>
          <v-icon>info</v-icon>
        </template>

        <v-list-item-title>v{{ version }}</v-list-item-title>
      </v-list-item>

      <v-list-item
        :href="discordUrl"
        target="_blank"
      >
        <template #prepend>
          <v-icon>chat</v-icon>
        </template>

        <v-list-item-title>Discord</v-list-item-title>
      </v-list-item>

      <v-list-item
        :href="repositoryUrl"
        target="_blank"
      >
        <template #prepend>
          <v-icon>code</v-icon>
        </template>

        <v-list-item-title>GitHub</v-list-item-title>
      </v-list-item>

      <DonateDialog v-slot="{ props }">
        <v-list-item
          v-bind="props"
        >
          <template #prepend>
            <v-icon>favorite</v-icon>
          </template>

          <v-list-item-title>Donate</v-list-item-title>
        </v-list-item>
      </DonateDialog>
    </v-list>
  </v-navigation-drawer>
</template>

<script>
import { defineAsyncComponent } from 'vue';
import { mapGetters, mapMutations, mapState } from 'vuex';

export default {
  name: 'TheSidebarLeft',

  components: {
    TheSettingsDialog: defineAsyncComponent(() => import('@/components/TheSettingsDialog.vue')),
    DonateDialog: defineAsyncComponent(() => import('@/components/DonateDialog.vue')),
  },

  computed: {
    ...mapState([
      'isLeftSidebarOpen',
      'version',
      'repositoryUrl',
      'discordUrl',
    ]),

    ...mapGetters([
      'GET_RELEASE_URL',
    ]),

    ...mapGetters('plex', [
      'GET_PLEX_USER',
    ]),
  },

  methods: {
    ...mapMutations([
      'SET_LEFT_SIDEBAR_OPEN',
    ]),
  },
};
</script>
