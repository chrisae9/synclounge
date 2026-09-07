<template>
  <v-app-bar-nav-icon
    :aria-label="isRightSidebarOpen ? 'Close watch party' : 'Open watch party'"
    :aria-expanded="isRightSidebarOpen"
    @click="TOGGLE_RIGHT_SIDEBAR_OPEN"
  >
    <v-icon>
      {{
        isRightSidebarOpen ? 'close' : 'forum'
      }}
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
