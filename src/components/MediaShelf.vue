<template>
  <section class="media-shelf">
    <div class="shelf-heading">
      <v-list-subheader><slot name="header" /></v-list-subheader>
      <div class="shelf-arrows">
        <v-btn
          icon="navigate_before"
          variant="text"
          aria-label="Previous items"
          :disabled="atStart"
          @click="move(-1)"
        />
        <v-btn
          icon="navigate_next"
          variant="text"
          aria-label="Next items"
          :disabled="atEnd"
          @click="move(1)"
        />
      </div>
    </div>
    <div
      ref="track"
      class="shelf-track"
      :class="{ 'shelf-track--posters': posters }"
      tabindex="0"
      role="region"
      :aria-label="label"
      @scroll.passive="updateEdges"
    >
      <div
        v-for="item in items"
        :key="item.key"
        class="shelf-item"
      >
        <slot :item="item" />
      </div>
    </div>
  </section>
</template>

<script>
export default {
  props: {
    items: { type: Array, required: true },
    posters: Boolean,
    label: { type: String, default: 'Media items' },
  },
  data: () => ({ atStart: true, atEnd: false, observer: null }),
  watch: {
    items() {
      this.$nextTick(() => {
        if (this.$refs.track) this.$refs.track.scrollLeft = 0;
        this.updateEdges();
      });
    },
  },
  mounted() {
    this.observer = new ResizeObserver(this.updateEdges);
    this.observer.observe(this.$refs.track);
    this.updateEdges();
  },
  beforeUnmount() {
    this.observer?.disconnect();
  },
  methods: {
    updateEdges() {
      const { track } = this.$refs;
      if (!track) return;
      this.atStart = track.scrollLeft <= 1;
      this.atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 1;
    },
    move(direction) {
      const { track } = this.$refs;
      track.scrollBy({
        left: direction * track.clientWidth * 0.9,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      });
    },
  },
};
</script>

<style scoped>
.media-shelf { min-width: 0; }
.shelf-heading { display: flex; align-items: center; justify-content: space-between; }
.shelf-arrows { display: flex; flex-shrink: 0; }
.shelf-track {
  display: flex;
  gap: 24px;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scroll-snap-type: x proximity;
  padding: 8px 0 16px;
  scrollbar-width: thin;
}
.shelf-item { flex: 0 0 calc((100% - 72px) / 4); min-width: 0; scroll-snap-align: start; }
.shelf-track--posters .shelf-item { flex-basis: calc((100% - 120px) / 6); }
@media (min-width: 1920px) {
  .shelf-item { flex-basis: calc((100% - 120px) / 6); }
  .shelf-track--posters .shelf-item { flex-basis: calc((100% - 264px) / 12); }
}
@media (max-width: 959px) {
  .shelf-item { flex-basis: calc((100% - 48px) / 3); }
  .shelf-track--posters .shelf-item { flex-basis: calc((100% - 72px) / 4); }
}
@media (max-width: 599px) {
  .shelf-arrows { display: none; }
  .shelf-track { gap: 12px; }
  .shelf-item { flex-basis: 72%; }
  .shelf-track--posters .shelf-item { flex-basis: 38%; }
}
</style>
