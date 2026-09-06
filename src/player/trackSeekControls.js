import { clearSeekIntent, recordSeekIntent } from './seekIntent';

// Track actual UI requests rather than native seeking/seeked events, which are
// also emitted by decoder recovery and automatic synchronization.
export default ({
  container, getPlayer, controls, mediaSession = navigator.mediaSession,
}) => {
  let tracking = true;
  let scrubBar = null;
  const onScrubStart = (event) => {
    if (container.contains(event.target)
      && event.target?.matches?.('.shaka-seek-bar') && !event.target.disabled) {
      scrubBar = event.target;
      recordSeekIntent(true);
    }
  };
  const onScrubMove = () => {
    if (scrubBar) recordSeekIntent(true);
  };
  const onScrubEnd = (event) => {
    if (event.type === 'blur' && event.target !== scrubBar) return;
    // Shaka performs a final seek even when its debounce timer already fired.
    if (scrubBar) {
      const bar = scrubBar;
      const video = getPlayer()?.getMediaElement();
      const beforeTime = video?.currentTime;
      const intent = recordSeekIntent(true);
      queueMicrotask(() => {
        // Shaka's final setter runs synchronously in the target handler. Local
        // media exposes seeking immediately; Cast may update its time later.
        // An unchanged/cancelled gesture must not label a later recovery seek.
        if (tracking && !video?.seeking && video?.currentTime === beforeTime
          && (!controls.getCastProxy?.().isCasting() || Number(bar.value) === beforeTime)) {
          clearSeekIntent(intent);
        }
      });
    }
    scrubBar = null;
  };
  const scrubEvents = [
    ['mousedown', onScrubStart], ['touchstart', onScrubStart],
    ['mousemove', onScrubMove], ['touchmove', onScrubMove],
    ['mouseup', onScrubEnd], ['touchend', onScrubEnd],
    ['touchcancel', onScrubEnd], ['blur', onScrubEnd],
  ];
  // RangeElement handles mouse/touch gestures without emitting input events.
  // Capture on document also sees release outside the bar and stopped events.
  scrubEvents.forEach(([type, handler]) => document.addEventListener(type, handler, true));
  const onTouchEnd = (event) => {
    const target = event.target?.closest?.(
      '.shaka-fast-forward-container, .shaka-rewind-container',
    );
    if (!target) return;
    queueMicrotask(() => {
      // Shaka updates the displayed offset before its delayed double-tap seek.
      if (tracking && Number.parseInt(target.querySelector('span')?.textContent, 10)) {
        recordSeekIntent(true);
      }
    });
  };
  const onInput = (event) => {
    if (event.target?.matches?.('.shaka-seek-bar')
      && Number(event.target.value) !== getPlayer()?.getMediaElement()?.currentTime) {
      recordSeekIntent(true);
    }
  };
  const onKeyDown = (event) => {
    const active = document.activeElement;
    const isPlayerContext = container.contains(active) || document.fullscreenElement === container;
    if (!isPlayerContext) return;
    const seekKeys = ['ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown'];
    // Shaka prevents the default only when it handles these seek shortcuts.
    if ((seekKeys.includes(event.key) && event.defaultPrevented)
      || (['Home', 'End'].includes(event.key) && container.querySelector('.shaka-seek-bar'))) {
      recordSeekIntent(true);
    }
  };
  container.addEventListener('input', onInput, true);
  container.addEventListener('touchend', onTouchEnd, { capture: true, passive: true });
  window.addEventListener('keydown', onKeyDown);

  // Shaka installs system media actions during construction. Own just the three
  // seek actions so lock-screen/PiP seeks also carry explicit user intent.
  const installed = [];
  if (mediaSession) {
    ['seekto', 'seekbackward', 'seekforward'].forEach((action) => {
      try {
        mediaSession.setActionHandler(action, (details) => {
          const player = getPlayer();
          const video = player?.getMediaElement();
          if (!video || !player.getAssetUri()) return;
          const range = player.seekRange();
          let target;
          if (action === 'seekto') {
            if (!Number.isFinite(details.seekTime)) return;
            target = range.start + details.seekTime;
          } else {
            const offset = details.seekOffset ?? controls.getConfig().keyboardSeekDistance;
            if (!Number.isFinite(offset) || offset <= 0) return;
            target = video.currentTime + (action === 'seekforward' ? offset : -offset);
          }
          const clamped = Math.max(range.start, Math.min(range.end, target));
          if (clamped === video.currentTime) return;
          recordSeekIntent(true);
          try { video.currentTime = clamped; } catch (error) {
            recordSeekIntent();
            throw error;
          }
        });
        installed.push(action);
      } catch {
        // Some browsers implement only part of the Media Session API.
      }
    });
  }

  return () => {
    tracking = false;
    scrubEvents.forEach(([type, handler]) => document.removeEventListener(type, handler, true));
    scrubBar = null;
    container.removeEventListener('touchend', onTouchEnd, true);
    container.removeEventListener('input', onInput, true);
    window.removeEventListener('keydown', onKeyDown);
    installed.forEach((action) => {
      try { mediaSession.setActionHandler(action, null); } catch { /* Unsupported action. */ }
    });
    recordSeekIntent();
  };
};
