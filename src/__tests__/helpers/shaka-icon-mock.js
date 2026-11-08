// Behavioral tests isolate Shaka's global polyfills. Dedicated icon tests and
// the browser harness exercise the real SVG implementation.
const iconUi = {
  Enums: {
    MaterialDesignSVGIcons: Object.fromEntries(
      ['SKIP_PREVIOUS', 'SKIP_NEXT', 'CLOSE', 'LOOP', 'REPLAY', 'REPLAY_FORWARD', 'CHECKMARK',
        'VIDEO_TYPE', 'RESOLUTION', 'CLOSED_CAPTIONS_SIZE',
        'CLOSED_CAPTIONS_FONT_COLOR', 'PLAYBACK_RATE', 'CLOSED_CAPTIONS_POSITION']
        .map((name) => [name, 'M0 0h1v1z']),
    ),
  },
  Icon: class {
    constructor(parent, path) {
      this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      this.svg.classList.add('shaka-ui-icon');
      this.svg.setAttribute('aria-hidden', 'true');
      const node = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      node.setAttribute('d', path);
      this.svg.appendChild(node);
      parent?.appendChild(this.svg);
    }

    getSvgElement() { return this.svg; }
  },
};

export default iconUi;
