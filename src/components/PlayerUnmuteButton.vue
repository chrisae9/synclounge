<template>
  <v-fade-transition>
    <v-btn
      v-show="visible"
      size="large"
      variant="flat"
      color="primary"
      class="unmute-banner"
      @click.stop="$emit('unmute')"
    >
      <svg
        class="unmute-icon"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d="M11 5 6 9H3v6h3l5 4V5Z" />
        <path d="m16 9 6 6m0-6-6 6" />
      </svg>
      Click to unmute
    </v-btn>
  </v-fade-transition>
</template>

<script>
export default {
  props: { visible: Boolean },
  emits: ['unmute'],
};
</script>

<style scoped>
.v-btn.unmute-banner {
  z-index: 2;
  position: absolute;
  top: 12px;
  right: 12px;
  max-width: calc(100% - 24px);
  min-height: 44px;
  white-space: normal;
}
.unmute-icon {
  width: 24px;
  height: 24px;
  margin-inline-end: 8px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2px;
  stroke-linecap: round;
  stroke-linejoin: round;
  flex-shrink: 0;
}
</style>
