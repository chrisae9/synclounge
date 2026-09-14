<template>
  <v-list-item class="message-item">
    <template #prepend>
      <v-avatar size="32">
        <v-img
          :src="sender.thumb"
        />
      </v-avatar>
    </template>

    <div class="message-heading">
      <span class="message-sender">{{ sender.username }}</span>
      <span class="message-time text-disabled text-caption">{{ formattedTime }}</span>
    </div>

    <p
      class="message-content"
      v-text="message.text"
    />
  </v-list-item>
</template>

<script>
import { mapGetters } from 'vuex';

export default {
  name: 'MessageItem',

  props: {
    message: {
      type: Object,
      required: true,
    },
  },

  computed: {
    ...mapGetters('synclounge', [
      'GET_MESSAGES_USER_CACHE_USER',
    ]),

    sender() {
      return this.GET_MESSAGES_USER_CACHE_USER(this.message.senderId);
    },

    formattedTime() {
      if (!this.message.time) return '';
      const d = new Date(this.message.time);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    },
  },
};
</script>

<style scoped>
.message-item :deep(.v-list-item__prepend) {
  align-self: start;
  padding-top: 4px;
}

.message-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 8px;
}

.message-sender {
  min-width: 0;
  overflow-wrap: anywhere;
}

.message-time {
  flex-shrink: 0;
  white-space: nowrap;
}

.message-content {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-weight: normal;
  font-size: 0.875rem;
  line-height: 1.5;
  color: var(--sl-text-muted);
  margin-top: 4px;
}
</style>
