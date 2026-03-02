<template>
  <v-list
    v-chat-scroll
    density="compact"
  >
    <v-list-subheader class="md-4">
      Chat
    </v-list-subheader>

    <MessageItem
      v-for="msg in GET_MESSAGES"
      :key="`${msg.senderId}-${msg.time}`"
      :message="msg"
    />
  </v-list>
</template>

<script>
import { defineAsyncComponent } from 'vue';
import { mapGetters } from 'vuex';

export default {
  name: 'MessageList',

  components: {
    MessageItem: defineAsyncComponent(() => import('@/components/MessageItem.vue')),
  },

  computed: {
    ...mapGetters('synclounge', [
      'GET_MESSAGES',
    ]),
  },
};
</script>
