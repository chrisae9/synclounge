import { test, expect } from '@playwright/test';

const preview = '/test/fixtures/ui-preview.html?view=party&presentation=1&longChat=1';
const gap = (chat) => chat.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop);
const incoming = (page, text) => page.evaluate((message) => {
  globalThis.dispatchEvent(new CustomEvent('fixture-chat-message', { detail: { text: message } }));
}, text);

test.beforeEach(async ({ page }) => {
  // This suite uses fake local data, public sample media and public font assets only.
  await page.route('**/*', (route) => {
    const { hostname } = new URL(route.request().url());
    return ['127.0.0.1', 'fonts.googleapis.com', 'fonts.gstatic.com', 'storage.googleapis.com'].includes(hostname)
      ? route.continue() : route.abort();
  });
});

test('chat follows tall messages, preserves scrollback and shows own sent messages', async ({ page }, testInfo) => {
  await page.goto(preview);
  const party = page.getByRole('navigation', { name: 'Watch party', exact: true });
  const chat = party.locator('.messages');
  await expect(chat.locator('.message-item')).toHaveCount(33);
  await page.evaluate(() => globalThis.document.fonts.ready);
  await expect.poll(() => gap(chat)).toBeLessThanOrEqual(2);
  await incoming(page, 'A tall incoming message checks wrapping and automatic following. '.repeat(7));
  await expect(chat.locator('.message-item')).toHaveCount(34);
  await expect.poll(() => gap(chat)).toBeLessThanOrEqual(2);
  await chat.hover();
  await page.mouse.wheel(0, -700);
  await expect.poll(() => gap(chat)).toBeGreaterThan(100);
  const before = await chat.evaluate((el) => el.scrollTop);
  await incoming(page, 'New message while the reader is looking at history.');
  await expect(chat.locator('.message-item')).toHaveCount(35);
  await expect.poll(async () => Math.abs(await chat.evaluate((el) => el.scrollTop) - before)).toBeLessThan(2);
  await party.getByRole('textbox', { name: 'Message', exact: true }).fill('My own local fixture message');
  await party.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(chat.locator('.message-item')).toHaveCount(36);
  await expect.poll(() => gap(chat)).toBeLessThanOrEqual(2);
  const rowHeights = await chat.locator('.message-item').evaluateAll((rows) => rows.slice(0, 6)
    .map((row) => row.getBoundingClientRect().height));
  expect(Math.max(...rowHeights)).toBeLessThan(110);
  await page.screenshot({ path: testInfo.outputPath('compact-chat.png') });
});

test('sidebar version remains readable and inside a short viewport', async ({ page }, testInfo) => {
  await page.goto(preview);
  await page.getByRole('button', { name: 'Close watch party sidebar', exact: true }).click();
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  const version = page.getByLabel('SyncLounge version', { exact: true });
  await expect(version).toHaveText(`Version ${process.env.npm_package_version}`);
  await expect(version).toBeInViewport();
  const bounds = await version.boundingBox();
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(page.viewportSize().height);
  await expect(version).toHaveCSS('color', 'rgb(183, 189, 200)');
  await page.screenshot({ path: testInfo.outputPath('sidebar-version.png') });
});

test('player starts without a central button and unmute stays inside the player', async ({ page }, testInfo) => {
  await page.goto('/test/fixtures/player-startup-preview.html?guest=1&tracks=1&unmute=1');
  await expect(page.locator('#result')).toContainText('PASS: real Shaka');
  await expect(page.locator('.shaka-big-buttons-container .shaka-play-button')).toHaveCount(0);
  await page.getByRole('button', { name: 'Load public sample', exact: true }).click();
  await expect(page.locator('#result')).toContainText('PASS: full startup and sample playback');
  const unmute = page.getByRole('button', { name: 'Click to unmute', exact: true });
  await expect(unmute).toBeVisible();
  const placement = await unmute.evaluate((el) => {
    const button = el.getBoundingClientRect();
    const player = globalThis.document.querySelector('#player').getBoundingClientRect();
    return { top: button.top - player.top, right: player.right - button.right, height: button.height };
  });
  expect(placement.top).toBe(12);
  expect(placement.right).toBe(12);
  expect(placement.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: testInfo.outputPath('unmute.png') });
  await unmute.click();
  await expect(unmute).toBeHidden();
  await expect.poll(() => page.locator('video').evaluate((video) => video.muted)).toBe(false);
  await expect.poll(() => page.locator('video').evaluate((video) => video.paused)).toBe(false);
});
