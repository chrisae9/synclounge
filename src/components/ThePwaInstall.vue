<template>
  <v-list-item
    v-if="!state.installed"
    title="Install SyncLounge"
    @click="dialog = 'install'"
  >
    <template #prepend>
      <v-icon>install_desktop</v-icon>
    </template>
  </v-list-item>
  <v-list-item
    v-if="state.updateAvailable"
    title="Update available"
    subtitle="Reload when you're ready"
    @click="dialog = 'update'"
  >
    <template #prepend>
      <v-icon color="primary">
        system_update_alt
      </v-icon>
    </template>
  </v-list-item>
  <v-dialog
    :model-value="!!dialog"
    :aria-label="dialog === 'update' ? 'Update SyncLounge' : 'Install SyncLounge'"
    max-width="440"
    @update:model-value="dialog = null"
  >
    <v-card
      class="pa-5"
      rounded="xl"
    >
      <v-card-title class="text-wrap">
        {{ dialog === 'update' ? 'A fresh SyncLounge is ready' : 'Your shortcut to movie night' }}
      </v-card-title>
      <v-card-text class="text-body-1">
        <template v-if="dialog === 'update'">
          Reload to use the latest version. This stops playback on this device, so choose a good moment.
        </template>
        <template v-else>
          <img
            class="install-icon"
            src="/icons/icon-192.png"
            width="64"
            height="64"
            alt=""
          >
          <p class="mb-4">
            Add SyncLounge to your home screen or desktop and open it in its own window.
          </p>
          <p v-if="!state.secure">
            Open SyncLounge over HTTPS to install it. You can keep using this browser tab.
          </p>
          <p v-else-if="state.ios">
            Open your browser’s Share menu, choose <strong>Add to Home Screen</strong>,
            then <strong>Add</strong>. Keep “Open as Web App” enabled if it appears.
          </p>
          <p v-else-if="!state.canPrompt">
            Look for <strong>Install</strong> in your browser’s address bar or menu.
            If it isn’t available, you can bookmark this page and keep watching here.
          </p>
          <p class="text-body-2 text-medium-emphasis mt-4">
            Watching and chatting still need an internet connection.
          </p>
        </template>
        <p
          v-if="error"
          role="alert"
          class="mt-3"
        >
          {{ error }}
        </p>
      </v-card-text>
      <v-card-actions class="flex-wrap ga-2">
        <v-spacer />
        <v-btn @click="dialog = null">
          {{ dialog === 'update' ? 'Later' : 'Close' }}
        </v-btn>
        <v-btn
          v-if="dialog === 'update'"
          variant="flat"
          color="primary"
          @click="applyUpdate"
        >
          Reload now
        </v-btn>
        <v-btn
          v-else-if="state.canPrompt"
          variant="flat"
          color="primary"
          @click="install"
        >
          Install
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup>
import { ref } from 'vue';
import { pwaState as state, installPwa, updatePwa } from '@/pwa';

const dialog = ref(null);
const error = ref('');
async function install() {
  error.value = '';
  try {
    await installPwa();
    dialog.value = null;
  } catch {
    error.value = 'Installation did not finish. Try the install option in your browser’s menu.';
  }
}
function applyUpdate() {
  if (!updatePwa()) error.value = 'This update is no longer waiting. Close and reopen SyncLounge to check again.';
}
</script>

<style scoped>
.install-icon { display: block; margin-bottom: 20px; border-radius: 16px; }
</style>
