<template>
  <v-btn
    variant="text"
    size="small"
    class="sidebar-close"
    prepend-icon="close"
    :aria-label="label"
  >
    Close
  </v-btn>
</template>

<script>
export default {
  props: {
    label: { type: String, required: true },
  },
};
</script>

<style scoped>
.sidebar-close {
  flex: 0 0 auto;
  min-height: 44px;
}
</style>
