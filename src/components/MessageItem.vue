<template>
  <v-list-item>
    <template #prepend>
      <v-avatar size="32">
        <v-img
          :src="sender.thumb"
        />
      </v-avatar>
    </template>

    <v-list-item-title>
      {{ sender.username }}
      <span class="text-disabled text-caption ml-1">{{ formattedTime }}</span>
    </v-list-item-title>

    <v-list-item-subtitle
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
.message-content {
  white-space: normal !important;
  font-weight: normal !important;
  font-size: 0.75rem !important;
  line-height: 1.3 !important;
}
</style>
