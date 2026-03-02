<template>
  <v-text-field
    v-model="messageToBeSent"
    append-icon="send"
    :label="chatboxLabel"
    hide-details
    single-line
    density="compact"
    variant="outlined"
    maxlength="500"
    counter
    class="mx-2 my-1 chat-input"
    @click:append="sendMessage"
    @keyup.enter="sendMessage"
  />
</template>

<script>

import { mapActions } from 'vuex';

export default {
  name: 'MessageInput',

  data: () => ({
    messageToBeSent: '',
  }),

  computed: {
    chatboxLabel() {
      return 'Message';
    },
  },

  methods: {
    ...mapActions('synclounge', [
      'SEND_MESSAGE',
    ]),

    async sendMessage() {
      const trimmed = this.messageToBeSent.trim();
      if (!trimmed) {
        return;
      }
      await this.SEND_MESSAGE(trimmed);
      this.messageToBeSent = '';
    },
  },
};
</script>

<style scoped>
.chat-input {
  font-size: 0.8rem;
}

.chat-input :deep(.v-field) {
  border-color: rgba(255, 255, 255, 0.15);
}

.chat-input :deep(.v-field__input) {
  font-size: 0.8rem;
  min-height: 32px;
  padding-top: 4px;
  padding-bottom: 4px;
}
</style>
