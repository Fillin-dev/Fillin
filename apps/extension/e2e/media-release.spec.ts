import AxeBuilder from '@axe-core/playwright';
import { test, expect, waitForExtension } from './fixtures';
import path from 'node:path';

test.beforeEach(async ({ context, extensionWorker, extensionId }) => {
  await extensionWorker.evaluate(() =>
    chrome.storage.local.set({
      fillin_first_use: 'done',
      fillin_snippets: [
        {
          id: 'email',
          trigger: '/email',
          content: 'hello@example.com',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    })
  );
  const editor = await context.newPage();
  await editor.goto(`chrome-extension://${extensionId}/src/media/editor/index.html`);
  await editor.getByLabel('Shortcut', { exact: true }).fill('/setup');
  await editor.getByLabel('Caption optional').fill('Follow the highlighted steps.');
  await editor.getByLabel('Image description optional').fill('Settings button highlighted');
  await editor
    .getByLabel('Choose image or GIF')
    .setInputFiles(path.resolve(__dirname, '../public/icon48.png'));
  await editor.getByRole('button', { name: 'Save image', exact: true }).click();
  await expect(
    editor.getByText('Saved on this device. Your shortcut is ready to try in practice.')
  ).toBeVisible();
  await editor.close();
});

test('release: media editor and backup dialog meet automated WCAG AA checks at narrow widths', async ({
  context,
  extensionId,
}) => {
  const editor = await context.newPage();
  await editor.setViewportSize({ width: 390, height: 760 });
  await editor.goto(`chrome-extension://${extensionId}/src/media/editor/index.html`);
  await expect(editor.getByRole('heading', { level: 1 })).toBeVisible();
  const scan = () =>
    new AxeBuilder({ page: editor }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect((await scan()).violations).toEqual([]);
  await editor.getByRole('button', { name: 'Backup options', exact: true }).click();
  const dialog = editor.getByRole('dialog', { name: 'Back up your library' });
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await editor.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Export full backup (.zip)' })).toBeFocused();
  await editor
    .locator('.dialog-backdrop')
    .evaluate((element) =>
      Promise.all(element.getAnimations().map((animation) => animation.finished))
    );
  expect((await scan()).violations).toEqual([]);
  await editor.keyboard.press('Escape');
  await expect(editor.getByRole('button', { name: 'Backup options', exact: true })).toBeFocused();
  await editor.setViewportSize({ width: 640, height: 450 }); // effective desktop space at 200% zoom
  expect(await editor.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true
  );
});

test('release: webpage media preview fits a narrow viewport, traps keyboard focus and returns it on Escape', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 640 });
  await page.goto('/');
  await page.bringToFront();
  await waitForExtension(page);
  const field = page.locator('#editor');
  await field.fill('/setup');
  await field.press('Control+Space');
  const host = page.locator('#fillin-media-host');
  await expect(host.getByRole('button', { name: 'Insert image', exact: true })).toBeEnabled();
  const panel = host.getByRole('dialog');
  const bounds = await panel.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(640);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations
  ).toEqual([]);
  for (let index = 0; index < 12; index++) {
    await page.keyboard.press('Tab');
    expect(
      await host.evaluate(
        (element) => element.shadowRoot?.activeElement?.closest('[role="dialog"]') !== null
      )
    ).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(host).toHaveCount(0);
  await expect(field).toBeFocused();
  await expect(field).toHaveText('/setup');
});

test('release: ordinary typing transfers no media and repeated preview cancellation releases every object URL', async ({
  page,
  context,
  extensionId,
}, testInfo) => {
  await page.goto('/');
  await page.bringToFront();
  await waitForExtension(page);
  const session = await context.newCDPSession(page);
  const worlds: { id: number; origin: string; name: string }[] = [];
  session.on('Runtime.executionContextCreated', (event) => worlds.push(event.context));
  await session.send('Runtime.enable');
  const world = worlds.find(
    (world) =>
      world.origin === `chrome-extension://${extensionId}` || world.name.includes(extensionId)
  );
  expect(world, 'extension content-script world').toBeTruthy();
  await session.send('Runtime.evaluate', {
    contextId: world!.id,
    expression: `(() => {
    const active = new Set(), messages = [], create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL), send = chrome.runtime.sendMessage;
    URL.createObjectURL = blob => { const url = create(blob); active.add(url); return url; };
    URL.revokeObjectURL = url => { active.delete(url); revoke(url); };
    chrome.runtime.sendMessage = function (...args) { if (args[0]?.type === 'FILLIN_MEDIA') messages.push(args[0].action); return Reflect.apply(send, this, args); };
    globalThis.mediaReleaseProbe = { active, messages };
  })()`,
  });
  const probe = async () =>
    (
      await session.send('Runtime.evaluate', {
        contextId: world!.id,
        returnByValue: true,
        expression:
          '({ urls: mediaReleaseProbe.active.size, messages: [...mediaReleaseProbe.messages] })',
      })
    ).result.value as { urls: number; messages: string[] };
  const field = page.locator('#editor');
  await field.pressSequentially('Ordinary typing without a shortcut.');
  expect((await probe()).messages).toEqual([]);
  const start = Date.now();
  for (let index = 0; index < 6; index++) {
    await field.fill('/setup');
    await field.press('Control+Space');
    const host = page.locator('#fillin-media-host');
    await expect(host.getByRole('button', { name: 'Insert image', exact: true })).toBeEnabled();
    expect((await probe()).urls).toBe(2);
    await page.keyboard.press('Escape');
    await expect(host).toHaveCount(0);
    expect((await probe()).urls).toBe(0);
  }
  const result = await probe();
  expect(result.messages.filter((action) => action === 'begin')).toHaveLength(6);
  await testInfo.attach('preview-lifecycle', {
    body: JSON.stringify({
      cycles: 6,
      elapsedMs: Date.now() - start,
      remainingObjectURLs: result.urls,
      mediaRequests: result.messages.length,
    }),
    contentType: 'application/json',
  });
});
