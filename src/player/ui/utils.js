import shaka from 'shaka-player/dist/shaka-player.ui';

/**
   * Depending on the value of display, sets/removes the css class of element to
   * either display it or hide it.
   *
   * @param {Element} element
   * @param {boolean} display
   */
export const setDisplay = (element, display) => {
  if (!element) {
    return;
  }

  if (display) {
    // Removing a non-existent class doesn't throw, so, even if
    // the element is not hidden, this should be fine.
    element.classList.remove('shaka-hidden');
  } else {
    element.classList.add('shaka-hidden');
  }
};

/**
   * @param {!HTMLElement} element
   * @param {string} className
   * @return {?HTMLElement}
   */
export const getDescendantIfExists = (element, className) => {
  const childrenWithClassName = element.getElementsByClassName(className);
  if (childrenWithClassName.length) {
    return /** @type {!HTMLElement} */ (childrenWithClassName[0]);
  }

  return null;
};

/**
   * Remove all of the child nodes of an element.
   * @param {!Element} element
   * @export
   */
export const removeAllChildren = (element) => {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
};

export const addControlIcon = (button, name, amount) => {
  const icon = new shaka.ui.Icon(button, shaka.ui.Enums.MaterialDesignSVGIcons[name]);
  if (amount) {
    const badge = document.createElement('span');
    badge.classList.add('shaka-seek-amount');
    badge.setAttribute('aria-hidden', 'true');
    badge.textContent = String(amount);
    button.appendChild(badge);
  }
  return icon.getSvgElement();
};

export const checkmarkIcon = () => {
  const icon = new shaka.ui.Icon(null, shaka.ui.Enums.MaterialDesignSVGIcons.CHECKMARK).getSvgElement();
  icon.classList.add('shaka-chosen-item');
  return icon;
};

/**
   * Finds a descendant of |menu| that has a 'shaka-chosen-item' class
   * and focuses on its' parent.
   *
   * @param {HTMLElement} menu
   */
export const focusOnTheChosenItem = (menu) => {
  if (!menu) {
    return;
  }

  const chosenItem = getDescendantIfExists(menu, 'shaka-chosen-item');
  if (chosenItem) {
    chosenItem.parentElement.focus();
  }
};
