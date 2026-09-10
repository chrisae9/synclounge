<template>
  <v-app-bar
    color="black"
    elevation="0"
    class="app-header"
    :height="$vuetify.display.smAndDown ? 56 : 64"
    :extension-height="showExtension ? 92 : 0"
  >
    <v-app-bar-nav-icon
      :aria-label="navigationOpen ? 'Close navigation' : 'Open navigation'"
      :aria-expanded="navigationOpen"
      @click="$emit('toggle-navigation')"
    />
    <router-link
      :to="{ name: 'RoomCreation' }"
      class="app-header-logo"
    >
      <picture>
        <source
          srcset="@/assets/images/logos/logo-small-light.png"
          media="(max-width: 599px)"
        >
        <img
          alt="SyncLounge home"
          height="36"
          src="@/assets/images/logos/logo-long-light.png"
        >
      </picture>
    </router-link>
    <v-spacer />
    <v-btn
      v-if="inviteUrl"
      color="primary"
      variant="flat"
      height="44"
      rounded="lg"
      class="app-header-invite"
      prepend-icon="person_add"
      aria-label="Copy room invite link"
      @click="$emit('copy-invite')"
    >
      Invite
    </v-btn>
    <slot name="party-button" />
    <template
      v-if="showExtension"
      #extension
    >
      <div class="header-extension">
        <div class="header-search">
          <slot name="search" />
        </div>
        <slot name="navigation" />
      </div>
      <slot name="extra" />
    </template>
  </v-app-bar>
</template>

<script>
export default {
  props: {
    navigationOpen: Boolean,
    inviteUrl: { type: String, default: '' },
    showExtension: Boolean,
  },
  emits: ['toggle-navigation', 'copy-invite'],
};
</script>

<style scoped>
.app-header {
  margin-top: env(safe-area-inset-top);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
  background: #000 !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  z-index: 5 !important;
}
.app-header-logo { display: flex; align-items: center; flex-shrink: 0; }
.app-header-logo img { display: block; max-width: 210px; object-fit: contain; }
.app-header-invite { text-transform: none; letter-spacing: 0; font-weight: 600; margin-right: 4px; }
.header-extension { display: flex; flex-direction: column; width: 100%; min-width: 0; padding: 0 12px; }
.header-search { width: 100%; max-width: 600px; margin: 0 auto; }
</style>
