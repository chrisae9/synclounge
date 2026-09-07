<template>
  <form
    class="chat-composer"
    aria-label="Room chat"
    @submit.prevent="sendMessage"
  >
    <v-text-field
      v-model="messageToBeSent"
      :label="chatboxLabel"
      hide-details
      single-line
      variant="outlined"
      maxlength="500"
      autocomplete="off"
      class="chat-input"
      @keydown.enter="handleEnter"
    >
      <template #append-inner>
        <v-btn
          icon="send"
          type="submit"
          variant="text"
          color="primary"
          aria-label="Send message"
          :disabled="!messageToBeSent.trim() || sending"
          :loading="sending"
          @click.prevent="sendMessage"
        />
      </template>
    </v-text-field>
  </form>
</template>

<script>

import { mapActions } from 'vuex';

export default {
  name: 'MessageInput',

  data: () => ({
    messageToBeSent: '',
    sending: false,
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

    handleEnter(event) {
      event.preventDefault();
      if (!event.isComposing) this.sendMessage();
    },

    async sendMessage() {
      const trimmed = this.messageToBeSent.trim();
      if (!trimmed || this.sending) {
        return;
      }
      this.sending = true;
      const submittedMessage = this.messageToBeSent;
      try {
        await this.SEND_MESSAGE(trimmed);
        if (this.messageToBeSent === submittedMessage) this.messageToBeSent = '';
      } finally {
        this.sending = false;
      }
    },
  },
};
</script>

<style scoped>
.chat-composer {
  padding: 12px;
  padding-bottom: max(12px, env(safe-area-inset-bottom));
  border-top: 1px solid var(--sl-border);
  background: rgba(16, 18, 22, 0.94);
}

.chat-input :deep(.v-field) {
  border-radius: 12px;
}

.chat-input :deep(.v-field__input) {
  font-size: 1rem;
  min-height: 48px;
  padding-top: 12px;
  padding-bottom: 12px;
}

.chat-input :deep(.v-field__append-inner) {
  padding-top: 0;
  align-items: center;
}
</style>
