/**
 * SyncLounge Chaos Monkey — Browser Console Stress Test
 *
 * Paste this into the browser console while in a SyncLounge room to stress test
 * the sync mechanism. Monitors for deadlocked tokens, stuck grace periods, and
 * other state corruption.
 *
 * Usage:
 *   1. Join a room at lounge.chis.dev
 *   2. Start playing media
 *   3. Open browser console (F12)
 *   4. Paste this entire script
 *   5. Run: chaosMonkey.start()
 *   6. Stop: chaosMonkey.stop()
 *   7. Check results: chaosMonkey.report()
 */

/* eslint-disable no-console */
(function chaosMonkeyIIFE() {
  // Get Vuex store from Vue 3 app
  const app = document.querySelector('#app').__vue_app__;
  const store = app.config.globalProperties.$store;

  if (!store) {
    console.error('Could not find Vuex store. Are you on the SyncLounge page?');
    return;
  }

  const state = {
    running: false,
    intervals: [],
    timeouts: [],
    results: {
      operations: 0,
      errors: [],
      deadlocks: 0,
      graceTraps: 0,
      pollLosses: 0,
      tokenStuckSince: null,
      graceStuckSince: null,
    },
  };

  // ─── Health Monitor ───────────────────────────────────────────────

  function checkHealth() {
    const syncToken = store.state.synclounge.syncCancelToken;
    const gracePeriod = store.state.synclounge.isHostGracePeriod;
    const pollId = store.state.synclounge.syncPollIntervalId;
    const inRoom = store.state.synclounge.isInRoom;
    const now = Date.now();

    // Check for deadlocked sync token (stuck non-null for >10s)
    if (syncToken) {
      if (!state.results.tokenStuckSince) {
        state.results.tokenStuckSince = now;
      } else if (now - state.results.tokenStuckSince > 10000) {
        state.results.deadlocks += 1;
        state.results.errors.push({
          time: new Date().toISOString(),
          type: 'DEADLOCK',
          msg: `syncCancelToken stuck non-null for ${Math.round((now - state.results.tokenStuckSince) / 1000)}s`,
        });
        console.error('🔴 DEADLOCK: syncCancelToken stuck for >10s — all syncs are blocked');
        state.results.tokenStuckSince = null; // reset to detect again
      }
    } else {
      state.results.tokenStuckSince = null;
    }

    // Check for stuck grace period (>15s)
    if (gracePeriod) {
      if (!state.results.graceStuckSince) {
        state.results.graceStuckSince = now;
      } else if (now - state.results.graceStuckSince > 15000) {
        state.results.graceTraps += 1;
        state.results.errors.push({
          time: new Date().toISOString(),
          type: 'GRACE_TRAP',
          msg: 'isHostGracePeriod stuck true for >15s',
        });
        console.error('🟠 GRACE TRAP: isHostGracePeriod stuck for >15s');
        state.results.graceStuckSince = null;
      }
    } else {
      state.results.graceStuckSince = null;
    }

    // Check for lost poll interval
    if (inRoom && !pollId) {
      state.results.pollLosses += 1;
      if (state.results.pollLosses === 1 || state.results.pollLosses % 10 === 0) {
        state.results.errors.push({
          time: new Date().toISOString(),
          type: 'POLL_LOST',
          msg: 'syncPollIntervalId is null while in room',
        });
        console.warn('🟡 POLL LOST: sync poll interval missing while in room');
      }
    }
  }

  // ─── Chaos Operations ────────────────────────────────────────────

  function sleep(ms) {
    return new Promise((resolve) => {
      const id = setTimeout(resolve, ms);
      state.timeouts.push(id);
    });
  }

  async function rapidPlayPause(count = 20, intervalMs = 100) {
    console.log(`▶ rapidPlayPause: ${count} toggles, ${intervalMs}ms apart`);
    for (let i = 0; i < count && state.running; i += 1) {
      try {
        if (i % 2 === 0) {
          await store.dispatch('plexclients/PRESS_PAUSE', null, { root: true });
        } else {
          await store.dispatch('plexclients/PRESS_PLAY', null, { root: true });
        }
        state.results.operations += 1;
      } catch (e) {
        state.results.errors.push({
          time: new Date().toISOString(),
          type: 'PLAY_PAUSE_ERROR',
          msg: e.message,
        });
      }
      await sleep(intervalMs);
    }
    console.log('✓ rapidPlayPause complete');
  }

  async function seekSpam(count = 15, intervalMs = 200) {
    console.log(`▶ seekSpam: ${count} random seeks, ${intervalMs}ms apart`);
    for (let i = 0; i < count && state.running; i += 1) {
      try {
        const duration = store.state.plexclients.activeMediaMetadata?.duration || 120000;
        const offset = Math.floor(Math.random() * duration);
        await store.dispatch('plexclients/SEEK_TO', { offset }, { root: true });
        state.results.operations += 1;
      } catch (e) {
        state.results.errors.push({
          time: new Date().toISOString(),
          type: 'SEEK_ERROR',
          msg: e.message,
        });
      }
      await sleep(intervalMs);
    }
    console.log('✓ seekSpam complete');
  }

  async function hammerConcurrentSyncs(count = 20) {
    console.log(`▶ hammerConcurrentSyncs: ${count} simultaneous dispatches`);
    const promises = [];
    for (let i = 0; i < count; i += 1) {
      promises.push(
        store.dispatch('synclounge/SYNC_PLAYER_STATE').catch((e) => {
          state.results.errors.push({
            time: new Date().toISOString(),
            type: 'SYNC_RACE_ERROR',
            msg: e.message,
          });
        }),
      );
      state.results.operations += 1;
    }
    await Promise.all(promises);

    // After all settle, token must be null
    const token = store.state.synclounge.syncCancelToken;
    if (token) {
      console.error('🔴 Token stuck after concurrent sync hammer!');
      state.results.errors.push({
        time: new Date().toISOString(),
        type: 'POST_HAMMER_DEADLOCK',
        msg: 'syncCancelToken non-null after all concurrent syncs resolved',
      });
    } else {
      console.log('✓ hammerConcurrentSyncs complete — token is clean');
    }
  }

  async function toggleVisibility(count = 10, intervalMs = 500) {
    console.log(`▶ toggleVisibility: ${count} toggles, ${intervalMs}ms apart`);
    for (let i = 0; i < count && state.running; i += 1) {
      const event = new Event('visibilitychange');
      document.dispatchEvent(event);
      state.results.operations += 1;
      await sleep(intervalMs);
    }
    console.log('✓ toggleVisibility complete');
  }

  async function manualSyncSpam(count = 10, intervalMs = 150) {
    console.log(`▶ manualSyncSpam: ${count} manual syncs, ${intervalMs}ms apart`);
    for (let i = 0; i < count && state.running; i += 1) {
      try {
        await store.dispatch('synclounge/MANUAL_SYNC');
        state.results.operations += 1;
      } catch (e) {
        state.results.errors.push({
          time: new Date().toISOString(),
          type: 'MANUAL_SYNC_ERROR',
          msg: e.message,
        });
      }
      await sleep(intervalMs);
    }
    console.log('✓ manualSyncSpam complete');
  }

  // ─── Main Runner ─────────────────────────────────────────────────

  async function start() {
    if (state.running) {
      console.warn('Chaos monkey is already running');
      return;
    }

    state.running = true;
    state.results = {
      operations: 0,
      errors: [],
      deadlocks: 0,
      graceTraps: 0,
      pollLosses: 0,
      tokenStuckSince: null,
      graceStuckSince: null,
    };

    console.log('=== CHAOS MONKEY STARTED ===');
    console.log('Run chaosMonkey.stop() to halt, chaosMonkey.report() for results');

    // Start health monitor
    const healthInterval = setInterval(checkHealth, 500);
    state.intervals.push(healthInterval);

    try {
      // Phase 1: Concurrent sync hammer (tests token deadlock)
      await hammerConcurrentSyncs(20);
      if (!state.running) return;
      await sleep(2000);

      // Phase 2: Rapid play/pause (tests state transitions)
      await rapidPlayPause(15, 100);
      if (!state.running) return;
      await sleep(2000);

      // Phase 3: Seek spam (tests seek + sync interaction)
      await seekSpam(10, 200);
      if (!state.running) return;
      await sleep(2000);

      // Phase 4: Manual sync spam (tests MANUAL_SYNC token handling)
      await manualSyncSpam(10, 150);
      if (!state.running) return;
      await sleep(2000);

      // Phase 5: Visibility toggles (tests tab focus/blur handling)
      await toggleVisibility(10, 300);
      if (!state.running) return;
      await sleep(2000);

      // Phase 6: Combined chaos — everything at once
      console.log('▶ COMBINED CHAOS: all operations simultaneously');
      await Promise.all([
        rapidPlayPause(5, 200),
        seekSpam(5, 300),
        hammerConcurrentSyncs(10),
        toggleVisibility(5, 400),
      ]);

      console.log('=== CHAOS MONKEY COMPLETE ===');
    } finally {
      stop();
      report();
    }
  }

  function stop() {
    state.running = false;
    state.intervals.forEach(clearInterval);
    state.timeouts.forEach(clearTimeout);
    state.intervals = [];
    state.timeouts = [];
    console.log('Chaos monkey stopped');
  }

  function report() {
    const r = state.results;
    console.log('\n=== CHAOS MONKEY REPORT ===');
    console.log(`Operations executed: ${r.operations}`);
    console.log(`Deadlocks detected:  ${r.deadlocks}`);
    console.log(`Grace traps:         ${r.graceTraps}`);
    console.log(`Poll losses:         ${r.pollLosses}`);
    console.log(`Errors:              ${r.errors.length}`);

    if (r.errors.length > 0) {
      console.log('\nError details:');
      r.errors.forEach((e, i) => {
        console.log(`  ${i + 1}. [${e.type}] ${e.time}: ${e.msg}`);
      });
    }

    // Current state snapshot
    const token = store.state.synclounge.syncCancelToken;
    const grace = store.state.synclounge.isHostGracePeriod;
    const poll = store.state.synclounge.syncPollIntervalId;
    const inRoom = store.state.synclounge.isInRoom;

    console.log('\nCurrent state:');
    console.log(`  syncCancelToken: ${token ? 'NON-NULL (BAD)' : 'null (OK)'}`);
    console.log(`  isHostGracePeriod: ${grace ? 'true (check if expected)' : 'false (OK)'}`);
    console.log(`  syncPollIntervalId: ${poll ? 'set (OK)' : 'null (BAD if in room)'}`);
    console.log(`  isInRoom: ${inRoom}`);
    console.log('===========================\n');

    return r;
  }

  // Expose globally
  window.chaosMonkey = { start, stop, report };
  console.log('Chaos monkey loaded. Run chaosMonkey.start() to begin.');
}());
