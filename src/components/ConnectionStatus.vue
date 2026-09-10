<template>
  <div
    v-if="connectionStatus.recovering"
    role="status"
    class="pa-2 text-center text-body-2"
  >
    Reconnecting to your watch party…
  </div>
</template>

<script setup>
import { connectionStatus } from '@/utils/connectionstatus';
</script>
