import { expect, it } from 'vitest';
import { addControlIcon, checkmarkIcon } from '@/player/ui/utils';

const icons = ['SKIP_PREVIOUS', 'SKIP_NEXT', 'CLOSE', 'LOOP', 'REPLAY', 'REPLAY_FORWARD'];

it.each(icons)('renders %s as a hidden SVG, without exposing icon-font ligature text', (name) => {
  const button = document.createElement('button');
  button.setAttribute('aria-label', 'Player action');
  addControlIcon(button, name);
  expect(button.querySelector('svg.shaka-ui-icon path')).not.toBeNull();
  expect(button.querySelector('svg').getAttribute('aria-hidden')).toBe('true');
  expect(button.textContent).toBe('');
  expect(button.getAttribute('aria-label')).toBe('Player action');
});

it('keeps seek amounts visible without including them in accessible button names', () => {
  const button = document.createElement('button');
  addControlIcon(button, 'REPLAY', 10);
  const badge = button.querySelector('.shaka-seek-amount');
  expect(badge.textContent).toBe('10');
  expect(badge.getAttribute('aria-hidden')).toBe('true');
});

it('uses an SVG selection checkmark instead of the literal word done', () => {
  const icon = checkmarkIcon();
  expect(icon.tagName.toLowerCase()).toBe('svg');
  expect(icon.classList.contains('shaka-chosen-item')).toBe(true);
  expect(icon.querySelector('path')).not.toBeNull();
  expect(icon.textContent).toBe('');
});
