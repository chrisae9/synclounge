<template>
  <v-app-bar-nav-icon
    v-if="!isRightSidebarOpen"
    aria-label="Open watch party"
    :aria-expanded="isRightSidebarOpen"
    @click="TOGGLE_RIGHT_SIDEBAR_OPEN"
  >
    <v-icon>
      forum
    </v-icon>
  </v-app-bar-nav-icon>
</template>

<script>
import { mapMutations, mapState } from 'vuex';

export default {
  computed: {
    ...mapState(['isRightSidebarOpen']),
  },

  methods: {
    ...mapMutations([
      'TOGGLE_RIGHT_SIDEBAR_OPEN',
    ]),
  },
};
</script>
