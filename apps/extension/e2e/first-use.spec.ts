import { readFile } from 'node:fs/promises';
import { test, expect, openExtensionWindow, waitForExtension } from './fixtures';

test.beforeEach(async ({ extensionWorker }) => {
  await extensionWorker.evaluate(() => chrome.storage.local.clear());
});

test('guides a new user through a saved shortcut, practice, and a restorable backup', async ({ context, extensionWorker, extensionId, page }, testInfo) => {
  const popup = await openExtensionWindow(context, extensionWorker, extensionId, 'Save shortcut');
  await popup.locator('body').screenshot({ path: testInfo.outputPath('create.png') });
  await popup.getByLabel('Shortcut', { exact: true }).fill('email');
  await popup.getByLabel('Expanded text', { exact: true }).fill('hello@example.com');
  await popup.getByRole('button', { name: 'Save shortcut', exact: true }).click();
  await expect(popup.getByRole('heading', { name: 'Try your shortcut' })).toBeVisible();

  // Closing or reloading midway must retain the shortcut and resume the guide.
  await popup.reload();
  const practice = popup.getByLabel('Practice field');
  await expect(practice).toBeVisible();
  await practice.pressSequentially('Hi /email end');
  for (let i = 0; i < 4; i++) await practice.press('ArrowLeft');
  await practice.press('Control+Space');
  await expect(practice).toHaveValue('Hi hello@example.com end');
  await practice.pressSequentially('!');
  await expect(practice).toHaveValue('Hi hello@example.com! end');
  await popup.locator('body').screenshot({ path: testInfo.outputPath('practice.png') });
  await popup.getByRole('button', { name: 'Continue to backup' }).click();

  const downloaded = popup.waitForEvent('download');
  await popup.getByRole('button', { name: 'Export backup', exact: true }).click();
  const backup = await downloaded;
  await popup.locator('body').screenshot({ path: testInfo.outputPath('backup.png') });
  expect(backup.suggestedFilename()).toMatch(/^fillin-snippets-\d{4}-\d{2}-\d{2}\.json$/);
  const saved = (await extensionWorker.evaluate(() => chrome.storage.local.get('fillin_snippets'))).fillin_snippets;
  expect(JSON.parse(await readFile((await backup.path())!, 'utf8'))).toEqual(saved);
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ trigger: '/email', content: 'hello@example.com' });
  expect((await extensionWorker.evaluate(() => chrome.storage.local.get('fillin_stats'))).fillin_stats).toBeUndefined();

  await popup.getByRole('button', { name: 'Finish setup' }).click();
  await expect(popup.getByRole('button', { name: 'Create Snippet', exact: true })).toBeVisible();
  await popup.reload();
  await expect(popup.getByText('/email', { exact: true })).toBeVisible();
  await expect(popup.getByText('Welcome to Fillin')).toHaveCount(0);

  // The practice shortcut must also work through the installed content script.
  await page.goto('/');
  await waitForExtension(page);
  const input = page.getByLabel('Text input', { exact: true });
  await input.pressSequentially('/email');
  await input.press('Control+Space');
  await expect(input).toHaveValue('hello@example.com');

  // The guide's JSON uses the same import format as the normal library.
  await extensionWorker.evaluate(() => chrome.storage.local.remove('fillin_snippets'));
  await popup.reload();
  await expect(popup.getByText('No snippets yet')).toBeVisible();
  await popup.locator('input[type="file"]').setInputFiles({
    name: backup.suggestedFilename(),
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(saved)),
  });
  await expect(popup.getByText('/email', { exact: true })).toBeVisible();
  await expect(popup.getByText('hello@example.com', { exact: true })).toBeVisible();
});

test('lets a new user skip guidance without creating data and remembers the choice', async ({ context, extensionWorker, extensionId }) => {
  const popup = await openExtensionWindow(context, extensionWorker, extensionId, 'Save shortcut');
  await popup.getByRole('button', { name: 'Skip guide' }).click();
  await expect(popup.getByText('No snippets yet')).toBeVisible();
  await popup.reload();
  await expect(popup.getByText('No snippets yet')).toBeVisible();
  expect((await extensionWorker.evaluate(() => chrome.storage.local.get('fillin_snippets'))).fillin_snippets).toBeUndefined();
});
