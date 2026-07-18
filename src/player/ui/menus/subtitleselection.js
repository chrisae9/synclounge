import shaka from 'shaka-player/dist/shaka-player.ui.debug';
import {
  setDisplay, getDescendantIfExists, removeAllChildren, focusOnTheChosenItem, checkmarkIcon,
} from '@/player/ui/utils';

// eslint-disable-next-line max-len
const subtitleIcon = 'M200-160q-33 0-56.5-23.5T120-240v-480q0-33 23.5-56.5T200-800h560q33 0 56.5 23.5T840-720v480q0 33-23.5 56.5T760-160H200Zm80-200h120q17 0 28.5-11.5T440-400v-20q0-9-6-15t-15-6h-18q-9 0-15 6t-6 15h-80v-120h80q0 9 6 15t15 6h18q9 0 15-6t6-15v-20q0-17-11.5-28.5T400-600H280q-17 0-28.5 11.5T240-560v160q0 17 11.5 28.5T280-360Zm400-240H560q-17 0-28.5 11.5T520-560v160q0 17 11.5 28.5T560-360h120q17 0 28.5-11.5T720-400v-20q0-9-6-15t-15-6h-18q-9 0-15 6t-6 15h-80v-120h80q0 9 6 15t15 6h18q9 0 15-6t6-15v-20q0-17-11.5-28.5T680-600Z';

export default (store) => {
  class SubtitleSelection extends shaka.ui.SettingsMenu {
    #watcherCancellers = [];

    constructor(parent, controls) {
      super(parent, controls, subtitleIcon);

      this.#watcherCancellers = [
        store.watch(
          (state, getters) => getters['slplayer/GET_SUBTITLE_STREAMS'],
          this.updateSubtitleSelection.bind(this),
        ),

        store.watch(
          (state, getters) => getters['slplayer/GET_SUBTITLE_STREAM_ID'],
          this.updateSubtitleSelection.bind(this),
        ),
      ];

      this.button.classList.add('shaka-subtitles-button');
      this.button.classList.add('shaka-tooltip-status');
      this.button.ariaLabel = 'Subtitles';
      this.menu.classList.add('shaka-subtitles');
      this.backButton.ariaLabel = parent.classList.contains('shaka-overflow-menu')
        ? 'Back'
        : 'Close';

      this.backSpan.textContent = 'Subtitles';
      this.nameSpan.textContent = 'Subtitles';

      this.updateSubtitleSelection();
    }

    updateSubtitleSelection() {
      const backButton = getDescendantIfExists(this.menu, 'shaka-back-to-overflow-button');
      Array.from(this.menu.getElementsByClassName('explicit-subtitle')).forEach((button) => {
        this.eventManager.unlisten(button, 'click');
      });
      removeAllChildren(this.menu);
      this.menu.appendChild(backButton);
      this.currentSelection.textContent = '';
      this.button.setAttribute('shaka-status', '');

      // Hide menu if there is only the None subtitle option
      if (store.getters['slplayer/GET_SUBTITLE_STREAMS'].length <= 1) {
        setDisplay(this.menu, false);
        setDisplay(this.button, false);
        return;
      }

      // Otherwise, restore it.
      setDisplay(this.button, true);

      this.addSubtitleSelection();
      this.button.setAttribute('shaka-status', this.currentSelection.textContent);

      focusOnTheChosenItem(this.menu);
    }

    addSubtitleSelection() {
      store.getters['slplayer/GET_SUBTITLE_STREAMS'].forEach((subtitle) => {
        const button = document.createElement('button');
        button.classList.add('explicit-subtitle');

        const span = document.createElement('span');
        span.textContent = subtitle.text;
        button.appendChild(span);

        this.eventManager.listen(
          button,
          'click',
          () => SubtitleSelection.onSubtitleClicked(subtitle.id),
        );

        if (subtitle.id === store.getters['slplayer/GET_SUBTITLE_STREAM_ID']) {
          button.setAttribute('aria-selected', 'true');
          button.appendChild(checkmarkIcon());
          span.classList.add('shaka-chosen-item');
          this.currentSelection.textContent = span.textContent;
        }

        this.menu.appendChild(button);
      });
    }

    static onSubtitleClicked(subtitleId) {
      store.dispatch('slplayer/CHANGE_SUBTITLE_STREAM', subtitleId);
    }

    release() {
      this.#watcherCancellers.forEach((canceller) => {
        canceller();
      });

      super.release();
    }
  }

  const factory = {
    create: (rootElement, controls) => new SubtitleSelection(rootElement, controls),
  };

  shaka.ui.OverflowMenu.registerElement('subtitle', factory);
  shaka.ui.Controls.registerElement('subtitle', factory);
};
