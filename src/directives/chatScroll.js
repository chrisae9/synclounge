const cleanups = new WeakMap();

export default {
  mounted(el) {
    // Remember intent before content grows: measuring only after a tall message
    // arrives incorrectly treats a previously pinned reader as scrolled away.
    let following = true;
    let lastTop = el.scrollTop;
    const onScroll = () => {
      // A resized viewport can emit scroll without user movement. Preserve intent
      // until the resize observer has moved a pinned reader to the new bottom.
      if (Math.abs(el.scrollTop - lastTop) <= 1) return;
      following = el.scrollHeight - el.scrollTop - el.clientHeight <= 50;
      lastTop = el.scrollTop;
    };
    const onWheel = ({ deltaY }) => { if (deltaY < 0 && el.scrollTop > 0) following = false; };
    const follow = () => {
      if (following) {
        el.scrollTop = el.scrollHeight;
        lastTop = el.scrollTop;
      }
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('wheel', onWheel, { passive: true });
    const observer = new MutationObserver(follow);
    observer.observe(el, { childList: true });
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(follow);
    resize?.observe(el);
    const fonts = el.ownerDocument?.fonts;
    fonts?.addEventListener('loadingdone', follow);
    follow();
    cleanups.set(el, {
      followOwnMessage() { following = true; follow(); },
      destroy() {
        observer.disconnect();
        resize?.disconnect();
        el.removeEventListener('scroll', onScroll);
        el.removeEventListener('wheel', onWheel);
        fonts?.removeEventListener('loadingdone', follow);
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
