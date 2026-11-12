import { test, expect, waitForExtension } from './fixtures';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

test.beforeEach(async ({ extensionWorker, context, extensionId }) => {
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
  await editor.getByLabel('Caption optional').fill('Follow <these> steps.');
  await editor
    .getByLabel('Choose image or GIF')
    .setInputFiles(path.resolve(__dirname, '../public/icon48.png'));
  await expect(editor.getByRole('button', { name: 'Save image', exact: true })).toBeEnabled();
  await editor.getByRole('button', { name: 'Save image', exact: true }).click();
  await expect(
    editor.getByText('Saved on this device. Your shortcut is ready to try in practice.')
  ).toBeVisible();
  await editor.close();
});

test('media web: confirmed rich insertion preserves text, focus, caption and undo', async ({
  page,
  extensionWorker,
}) => {
  await page.goto('/');
  await page.bringToFront();
  await waitForExtension(page);
  const field = page.locator('#editor');
  await field.pressSequentially('Before /setup after');
  for (let i = 0; i < 6; i++) await field.press('ArrowLeft');
  await field.press('Control+Space');
  const host = page.locator('#fillin-media-host');
  await expect(host.getByRole('button', { name: 'Insert image', exact: true })).toBeEnabled();
  await expect(field.locator('img')).toHaveCount(0);
  await host.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(field).toHaveText('Before /setup after');
  await expect(field).toBeFocused();
  await field.press('Control+Space');
  await host.getByRole('button', { name: 'Insert image', exact: true }).click();
  await expect(host).toHaveCount(0);
  await expect(field.locator('img')).toHaveCount(1);
  await expect(field).toBeFocused();
  await page.keyboard.type('!');
  await expect(field).toHaveText('Before Follow <these> steps.! after');
  await page.keyboard.press('ControlOrMeta+z');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(field).toHaveText('Before /setup after');
  await expect(field.locator('img')).toHaveCount(0);
  expect(
    (await extensionWorker.evaluate(() => chrome.storage.local.get('fillin_stats'))).fillin_stats
  ).toBeUndefined();
});

test('media web: text fields keep triggers and offer byte-exact original downloads', async ({
  page,
}) => {
  await page.goto('/');
  await page.bringToFront();
  await waitForExtension(page);
  const input = page.getByLabel('Text input', { exact: true });
  await input.fill('/setup');
  await input.press('Control+Space');
  const host = page.locator('#fillin-media-host');
  await expect(host.getByRole('button', { name: 'Download original' })).toBeEnabled();
  await expect(host.getByRole('button', { name: 'Insert image', exact: true })).toHaveCount(0);
  const downloading = page.waitForEvent('download');
  await host.getByRole('button', { name: 'Download original' }).click();
  expect(await readFile((await (await downloading).path())!)).toEqual(
    await readFile(path.resolve(__dirname, '../public/icon48.png'))
  );
  await expect(host.getByRole('status')).toContainText('download requested');
  await expect(input).toHaveValue('/setup');
});

test('media web: palette and opt-in suggestions open media previews', async ({
  page,
  extensionWorker,
}) => {
  await page.goto('/');
  await page.bringToFront();
  await waitForExtension(page);
  const field = page.locator('#editor');
  await field.fill('Before ');
  await field.press('End');
  await page.keyboard.press('Control+Shift+K');
  const palette = page.locator('#fillin-command-palette-host');
  await palette.locator('input').fill('/setup');
  await palette.locator('input').press('Enter');
  const host = page.locator('#fillin-media-host');
  await expect(host.getByRole('button', { name: 'Insert image', exact: true })).toBeEnabled();
  await host.getByRole('button', { name: 'Cancel', exact: true }).click();
  await extensionWorker.evaluate(() =>
    chrome.storage.local.set({ fillin_suggestions_enabled: true })
  );
  await field.fill('/set');
  const suggestions = page.locator('#fillin-suggestions-host');
  await expect(suggestions.getByRole('button', { name: 'Insert /setup' })).toBeVisible();
  await suggestions.getByRole('button', { name: 'Insert /setup' }).click();
  await expect(host.getByRole('button', { name: 'Insert image', exact: true })).toBeEnabled();
  await host.getByRole('button', { name: 'Insert image', exact: true }).click();
  await expect(field.locator('img')).toHaveCount(1);
  await expect(field).toHaveText('Follow <these> steps.');
});

test('media web: protected and blocked fields are excluded; stale targets and managed editors are safe', async ({
  page,
  extensionWorker,
}) => {
  await page.goto('/');
  await page.bringToFront();
  await waitForExtension(page);
  const password = page.getByLabel('Password', { exact: true });
  await password.fill('/setup');
  await password.press('Control+Space');
  await expect(page.locator('#fillin-media-host')).toHaveCount(0);
  await expect(password).toHaveValue('/setup');
  const field = page.locator('#editor');
  await field.fill('/setup');
  await field.press('Control+Space');
  const host = page.locator('#fillin-media-host');
  await expect(host.getByRole('button', { name: 'Insert image', exact: true })).toBeEnabled();
  await field.evaluate((element) => {
    element.textContent = 'Changed';
  });
  await host.getByRole('button', { name: 'Insert image', exact: true }).click();
  await expect(host.getByRole('alert')).toContainText('changed');
  await expect(field).toHaveText('Changed');
  await host.getByRole('button', { name: 'Cancel', exact: true }).click();
  await field.evaluate((element) => element.classList.add('ProseMirror'));
  await field.fill('/setup');
  await field.press('Control+Space');
  await expect(host.getByRole('button', { name: 'Download original' })).toBeEnabled();
  await expect(host.getByRole('button', { name: 'Insert image', exact: true })).toHaveCount(0);
  await extensionWorker.evaluate(() =>
    chrome.storage.local.set({ fillin_blacklist: ['127.0.0.1'] })
  );
  await expect(host).toHaveCount(0);
  await field.press('Control+Space');
  await expect(host).toHaveCount(0);
  await expect(field).toHaveText('/setup');
});

test('media web: page scripts cannot trigger previews or confirm insertion', async ({ page }) => {
  await page.goto('/');
  await page.bringToFront();
  await waitForExtension(page);
  const field = page.locator('#editor');
  await field.fill('/setup');
  await field.evaluate((element) =>
    element.dispatchEvent(
      new KeyboardEvent('keydown', { key: ' ', code: 'Space', ctrlKey: true, bubbles: true })
    )
  );
  await expect(page.locator('#fillin-media-host')).toHaveCount(0);
  await field.press('Control+Space');
  const host = page.locator('#fillin-media-host');
  const insert = host.getByRole('button', { name: 'Insert image', exact: true });
  await expect(insert).toBeEnabled();
  await insert.evaluate((element) => (element as HTMLButtonElement).click());
  await expect(field.locator('img')).toHaveCount(0);
  await expect(field).toHaveText('/setup');
  await insert.click();
  await expect(field.locator('img')).toHaveCount(1);
});

test('media web: restrictive page policies preserve the trigger and report blocked clipboard writes', async ({
  page,
}) => {
  await page.goto('/restricted');
  await page.bringToFront();
  await waitForExtension(page);
  const field = page.locator('#editor');
  await field.fill('/setup');
  await field.press('Control+Space');
  const host = page.locator('#fillin-media-host');
  await expect(host).toBeVisible();
  await expect(host.getByRole('button', { name: 'Copy caption', exact: true })).toBeEnabled();
  await host.getByRole('button', { name: 'Copy caption', exact: true }).click();
  await expect(host.getByRole('alert')).not.toBeEmpty();
  await expect(host.getByRole('alert')).not.toContainText('Caption copied');
  await expect(field).toHaveText('/setup');
  await expect(field.locator('img')).toHaveCount(0);
});
