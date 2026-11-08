const cleanups = new WeakMap();

export default {
  mounted(el) {
    // Remember intent before content grows: measuring only after a tall message
    // arrives incorrectly treats a previously pinned reader as scrolled away.
    let following = true;
    const onScroll = () => {
      following = el.scrollHeight - el.scrollTop - el.clientHeight <= 50;
    };
    const follow = () => {
      if (following) el.scrollTop = el.scrollHeight;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    const observer = new MutationObserver(follow);
    observer.observe(el, { childList: true, subtree: true, characterData: true });
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(follow);
    resize?.observe(el);
    follow();
    cleanups.set(el, {
      followOwnMessage() { following = true; follow(); },
      destroy() {
        observer.disconnect();
        resize?.disconnect();
        el.removeEventListener('scroll', onScroll);
      },
    });
  },
  updated(el, { value, oldValue }) {
    if (value && value !== oldValue) cleanups.get(el)?.followOwnMessage();
  },
  unmounted(el) {
    cleanups.get(el)?.destroy();
    cleanups.delete(el);
  },
};
