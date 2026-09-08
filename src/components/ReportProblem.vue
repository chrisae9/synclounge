<template>
  <v-dialog
    v-model="open"
    max-width="640"
    scrollable
  >
    <template #activator="{ props }">
      <v-list-item
        v-bind="props"
        prepend-icon="bug_report"
        title="Report a problem"
        @click="capture"
      />
    </template>
    <v-card>
      <v-toolbar
        title="Report a problem"
        density="compact"
      >
        <v-btn
          icon="close"
          aria-label="Close problem report"
          @click="open = false"
        />
      </v-toolbar>
      <v-card-text>
        <p class="mb-3">
          Copy this report and send it to your host on Discord, along with what went wrong.
          No GitHub account is needed. It includes device, playback and connection details,
          plus session identifiers to find the matching server logs.
        </p>
        <v-textarea
          v-model="report"
          label="Report to copy"
          rows="10"
          readonly
          spellcheck="false"
        />
        <v-alert
          v-if="copyStatus"
          :type="copyFailed ? 'warning' : 'success'"
          class="mb-3"
        >
          {{ copyStatus }}
        </v-alert>
        <p class="text-body-2">
          Review the report before sharing. Tokens, passwords and chat are excluded.
        </p>
      </v-card-text>
      <v-card-actions class="flex-wrap">
        <v-btn
          color="primary"
          variant="flat"
          @click="copy"
        >
          Copy bug report
        </v-btn>
        <v-btn
          href="https://github.com/chrisae9/synclounge/issues/new?title=Playback%20or%20app%20problem"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open GitHub issue
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script>
import { buildProblemReport, formatProblemReport } from '@/utils/problemreport';
import { getPlaybackDiagnostics } from '@/player';
import { isConnected } from '@/socket';

export default {
  data: () => ({
    open: false, report: '', copyStatus: '', copyFailed: false,
  }),
  methods: {
    capture() {
      this.copyStatus = '';
      let playback;
      try { playback = getPlaybackDiagnostics(); } catch { playback = { attached: false }; }
      const { state, getters } = this.$store;
      this.report = formatProblemReport(buildProblemReport({
        version: import.meta.env.VITE_APP_VERSION,
        browser: getters.GET_BROWSER,
        view: String(this.$route.name || 'unknown'),
        connection: {
          connected: Boolean(isConnected()),
          inRoom: Boolean(state.synclounge.isInRoom),
          participants: Object.keys(state.synclounge.users).length,
        },
        playback,
        sessions: { plex: state.slplayer.xplexsessionId, transcode: state.slplayer.session },
      }));
    },
    async copy() {
      try {
        await navigator.clipboard.writeText(this.report);
        this.copyFailed = false;
        this.copyStatus = 'Copied. Paste it into a message to your host, or into a GitHub issue.';
      } catch {
        this.copyFailed = true;
        this.copyStatus = 'Clipboard unavailable. Select the report above and copy it manually.';
      }
    },
  },
};
</script>
