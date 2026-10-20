<template>
  <v-list
    v-chat-scroll
    density="compact"
  >
    <v-list-subheader class="chat-section-title">
      Chat
    </v-list-subheader>

    <p
      v-if="!GET_MESSAGES.length"
      class="chat-empty"
    >
      No messages yet. Say hello.
    </p>

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

<style scoped>
.chat-section-title { min-height: 36px; padding-inline: 16px; font-size: 12px; font-weight: 600; }
.chat-empty { margin: 0; padding: 4px 16px 12px; font-size: 13px; color: var(--sl-text-muted); }
</style>
