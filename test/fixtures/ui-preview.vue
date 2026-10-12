<template>
  <v-app>
    <TheSidebarLeft v-if="page === 'party'" />
    <TheSidebarRight v-if="page === 'party'" />
    <TheAppHeader v-if="page === 'header'" invite-url="https://fixture.invalid/room"
      show-extension @toggle-navigation="selectPage('room')" @copy-invite="inviteCopied = true">
      <template #search><v-text-field density="compact" prepend-inner-icon="search"
        placeholder="Search your libraries" variant="solo-filled" hide-details /></template>
      <template #navigation><TheAppBarCrumbs /></template>
      <template #party-button><v-btn icon="chat" aria-label="Open watch party" @click="selectPage('party')" /></template>
    </TheAppHeader>
    <TheUpnextDialog v-if="page === 'upnext' && $store.state.upNext" />
    <v-main>
      <nav
        aria-label="Visual fixture views"
        class="preview-nav"
      >
        <p class="preview-notice">
          UI preview · fake local data · no Plex connection
        </p>
        <div class="preview-tabs">
          <v-btn
            v-for="view in views"
            :key="view.id"
            :variant="page === view.id ? 'flat' : 'outlined'"
            color="primary"
            size="small"
            @click="selectPage(view.id)"
          >
            {{ view.name }}
          </v-btn>
        </div>
      </nav>
      <v-container v-if="['browse', 'search', 'library', 'server'].includes(page)">
        <v-select label="Preview scenario" :items="['empty', 'failure', 'disabled']"
          :model-value="$store.state.scenario" @update:model-value="$store.commit('SET_SCENARIO', $event)" />
      </v-container>
      <PlexHome v-if="page === 'browse'" :key="$store.state.scenario" />
      <PlexSearch v-else-if="page === 'search'" :key="$store.state.scenario" query="Sample missing movie" />
      <PlexLibrary v-else-if="page === 'library'" :key="$store.state.scenario" machine-identifier="sample" section-id="1" />
      <v-container v-else-if="page === 'settings'">
        <TheSettingsDialog v-slot="{ props }"><v-btn v-bind="props">Open settings</v-btn></TheSettingsDialog>
      </v-container>
      <v-container v-else-if="page === 'upnext'">
        <v-btn @click="previewNext">Show next episode</v-btn>
      </v-container>
      <v-container v-else-if="page === 'header'">
        <v-alert v-if="inviteCopied" type="success">Invite action activated</v-alert>
        <v-btn @click="$store.commit('SET_PREVIEW_METADATA', null)">Library home</v-btn>
        <v-btn @click="$store.commit('SET_PREVIEW_METADATA', {
          machineIdentifier: 'sample', ratingKey: '1', type: 'movie',
          title: 'A very long movie title to check compact navigation',
        })">Media navigation</v-btn>
        <MediaShelf :items="shelfItems" label="Continue watching">
          <template #header>Continue watching</template>
          <template #default="{ item }"><img :src="poster" alt="Sample poster" style="width: 100%; aspect-ratio: 16 / 9; object-fit: cover;"><p>{{ item.title }}</p></template>
        </MediaShelf>
      </v-container>
      <v-container v-else-if="page === 'shelf'">
        <MediaShelf :items="shelfItems" label="Continue watching">
          <template #header>Continue watching</template>
          <template #default="{ item }">
            <div style="aspect-ratio: 16 / 9; background: #354451; border-radius: 8px;" />
            <p>{{ item.title }}</p>
          </template>
        </MediaShelf>
        <MediaShelf :items="shelfItems" label="Recently added" posters>
          <template #header>Recently added</template>
          <template #default="{ item }">
            <img :src="poster" alt="Sample poster" style="width: 100%; aspect-ratio: 2 / 3;">
            <p>{{ item.title }}</p>
          </template>
        </MediaShelf>
      </v-container>
      <RoomCreation v-else-if="page === 'room'" />
      <AdvancedRoomJoin v-else-if="page === 'server'" />
      <PlexMediaLayout
        v-else-if="page === 'media'"
        machine-identifier="sample"
        :thumb="poster"
        title="The Last Light Beyond the Horizon: An Unexpected Journey Home"
        secondary-title="2026 · Adventure, science fiction"
        subtitle="A long subtitle that should stay readable on a narrow screen"
        secondary-subtitle="2 hours 8 minutes"
        children-header="Related movies"
        :children="[]"
      >
        <template #postTitle>
          <v-col class="d-flex flex-wrap ga-2">
            <v-chip>4K</v-chip>
            <v-chip>PG-13</v-chip>
            <v-chip>Sample Pictures</v-chip>
          </v-col>
        </template>
        <template #content>
          <p>
            Four friends follow the last signal from a distant lighthouse and discover a story
            that brings them closer to home. This sample synopsis demonstrates the actual media
            layout with a long title, a portrait poster, and several wrapping metadata labels.
          </p>
        </template>
        <template #actions>
          <v-btn
            class="mt-4"
            color="primary"
            size="large"
          >
            Play sample
          </v-btn>
        </template>
      </PlexMediaLayout>
      <v-container v-else>
        <h1 class="text-h4 mb-4">
          Watch party preview
        </h1>
        <p class="mb-4">
          Six sample participants. Messages and party controls stay in this fixture’s memory.
        </p>
        <v-btn
          color="primary"
          class="mb-4"
          @click="$store.commit('SET_RIGHT_SIDEBAR_OPEN', true)"
        >
          Open watch party
        </v-btn>
        <v-btn class="mb-4 ml-2" @click="$store.commit('SET_LEFT_SIDEBAR_OPEN', true)">
          Open navigation
        </v-btn>
        <v-btn class="mb-4" @click="$store.commit('synclounge/SET_PREVIEW_HOST', 'user-1')">Preview as viewer</v-btn>
        <v-btn class="mb-4" @click="$store.commit('synclounge/SET_PREVIEW_MESSAGES', [])">Empty chat</v-btn>
        <div class="preview-chat">
          <MessageList />
          <MessageInput />
        </div>
      </v-container>
    </v-main>
  </v-app>
</template>

<script>
import PlexHome from '@/views/PlexHome.vue';
import PlexSearch from '@/views/PlexSearch.vue';
import PlexLibrary from '@/views/PlexLibrary.vue';
import TheSettingsDialog from '@/components/TheSettingsDialog.vue';
import TheUpnextDialog from '@/components/TheUpnextDialog.vue';
import TheAppHeader from '@/components/TheAppHeader.vue';
import TheAppBarCrumbs from '@/components/TheAppBarCrumbs.vue';
import MediaShelf from '@/components/MediaShelf.vue';
import RoomCreation from '@/views/RoomCreation.vue';
import AdvancedRoomJoin from '@/views/AdvancedRoomJoin.vue';
import PlexMediaLayout from '@/components/PlexMediaLayout.vue';
import TheSidebarLeft from '@/components/TheSidebarLeft.vue';
import TheSidebarRight from '@/components/TheSidebarRight.vue';
import MessageInput from '@/components/MessageInput.vue';
import MessageList from '@/components/MessageList.vue';

export default {
  components: {
    PlexHome, PlexSearch, PlexLibrary, TheSettingsDialog, TheUpnextDialog,
    TheSidebarLeft, TheAppHeader, TheAppBarCrumbs, MediaShelf, RoomCreation, AdvancedRoomJoin, PlexMediaLayout, TheSidebarRight, MessageInput, MessageList,
  },
  props: { poster: { type: String, required: true } },
  data: () => ({
    page: 'room',
    inviteCopied: false,
    shelfItems: Array.from({ length: 12 }, (_, i) => ({ key: String(i), title: `Sample movie ${i + 1}` })),
    views: [
      { id: 'browse', name: 'Browse recovery' },
      { id: 'search', name: 'Search recovery' },
      { id: 'library', name: 'Library recovery' },
      { id: 'settings', name: 'Settings' },
      { id: 'upnext', name: 'Next episode' },
      { id: 'header', name: 'Library navigation' },
      { id: 'shelf', name: 'Media shelves' },
      { id: 'room', name: 'Create room' },
      { id: 'server', name: 'Server choice' },
      { id: 'media', name: 'Media detail' },
      { id: 'party', name: 'Party / chat' },
    ],
  }),
  watch: {
    '$route.name': function handleRoute(name) {
      if (name === 'AdvancedRoomJoin') this.page = 'server';
      if (name === 'RoomCreation') this.page = 'room';
      if (name === 'PlexHome') this.page = 'media';
    },
  },
  methods: {
    previewNext() {
      this.$store.commit('SET_UP_NEXT_POST_PLAY_DATA', {
        machineIdentifier: 'sample', type: 'episode', title: 'A New Beginning',
        grandparentTitle: 'Sample series', parentIndex: 1, index: 2, art: this.poster,
      });
    },
    async selectPage(page) {
      if (page === 'room') await this.$router.push({ name: 'RoomCreation' });
      if (page === 'server') await this.$router.push({ name: 'AdvancedRoomJoin' });
      this.page = page;
      if (page === 'upnext') this.previewNext();
      if (page === 'party') this.$store.commit('SET_RIGHT_SIDEBAR_OPEN', true);
    },
  },
};
</script>

<style scoped>
.preview-nav {
  padding: 12px;
  border-bottom: 1px solid var(--sl-border);
}

.preview-notice {
  font-size: 12px;
  margin-bottom: 8px;
  color: var(--sl-text-muted);
}

.preview-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.preview-chat {
  max-width: 560px;
  border: 1px solid var(--sl-border);
  border-radius: 16px;
  overflow: hidden;
}
</style>
