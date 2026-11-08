<template>
  <article
    class="message-item"
    role="listitem"
  >
    <v-avatar
      size="24"
      class="message-avatar"
    >
      <v-img
        :src="sender.thumb"
      />
    </v-avatar>

    <div class="message-body">
      <div class="message-heading">
        <span class="message-sender">{{ sender.username }}</span>
        <span class="message-time text-disabled text-caption">{{ formattedTime }}</span>
      </div>

      <p
        class="message-content"
        v-text="message.text"
      />
    </div>
  </article>
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
.message-item {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  gap: 8px;
  padding: 4px 12px;
}
.message-avatar { align-self: start; margin-top: 1px; }
.message-body { min-width: 0; }

.message-heading {
  min-height: 18px;
  line-height: 18px;
  font-size: 12px;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 8px;
}

.message-sender {
  font-weight: 600;
  min-width: 0;
  overflow-wrap: anywhere;
}

.message-time {
  font-variant-numeric: tabular-nums;
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
  margin: 2px 0 0;
}
</style>
