<template>
  <v-list-item>
    <template #prepend>
      <v-avatar size="32">
        <v-img
          :src="sender.thumb"
        />
      </v-avatar>
    </template>

    <v-list-item-title v-text="sender.username" />

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
  },
};
</script>

<style scoped>
.message-content {
  white-space: normal !important;
  font-weight: normal !important;
}
</style>
