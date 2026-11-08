<template>
  <v-list
    v-chat-scroll="latestOwnMessage"
    class="chat-message-list"
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
import chatScroll from '@/directives/chatScroll';

export default {
  name: 'MessageList',
  directives: { chatScroll },

  components: {
    MessageItem: defineAsyncComponent(() => import('@/components/MessageItem.vue')),
  },

  computed: {
    ...mapGetters('synclounge', [
      'GET_MESSAGES',
      'GET_SOCKET_ID',
    ]),
    latestOwnMessage() {
      const last = this.GET_MESSAGES[this.GET_MESSAGES.length - 1];
      return last?.senderId === this.GET_SOCKET_ID ? `${last.senderId}:${last.time}` : null;
    },
  },
};
</script>

<style scoped>
.chat-message-list { padding-block: 0; }
.chat-section-title { min-height: 28px; padding-inline: 16px; font-size: 12px; font-weight: 600; }
.chat-empty { margin: 0; padding: 4px 16px 12px; font-size: 13px; color: var(--sl-text-muted); }
</style>
