import { test, expect, chromium, type BrowserContext } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('visual library: create, restart Chrome, find the image and use its confirmed practice shortcut', async ({
  headless,
}) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'fillin-visual-ui-restart-'));
  const extension = path.resolve(__dirname, '../dist');
  let context: BrowserContext | undefined;
  const launch = async () => {
    context = await chromium.launchPersistentContext(directory, {
      channel: 'chromium',
      headless,
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    });
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    return new URL(worker.url()).host;
  };
  try {
    const id = await launch();
    const worker = context!.serviceWorkers()[0];
    await worker.evaluate(() =>
      chrome.storage.local.set({
        fillin_first_use: 'done',
        fillin_snippets: [],
      })
    );
    const editor = await context!.newPage();
    await editor.goto(`chrome-extension://${id}/src/media/editor/index.html`);
    await editor.getByLabel('Shortcut', { exact: true }).fill('/restart');
    await editor.getByLabel('Tags optional').fill('instructions');
    await editor.getByLabel('Caption optional').fill('Still here after restarting.');
    await editor
      .getByLabel('Choose image or GIF')
      .setInputFiles(path.resolve(__dirname, '../public/icon48.png'));
    await expect(editor.getByRole('button', { name: 'Save image', exact: true })).toBeEnabled();
    await editor.getByRole('button', { name: 'Save image', exact: true }).click();
    await expect(
      editor.getByText('Saved on this device. Your shortcut is ready to try in practice.')
    ).toBeVisible();
    await context!.close();
    context = undefined;
    const restartedId = await launch();
    expect(restartedId).toBe(id);
    const popup = await context!.newPage();
    await popup.goto(`chrome-extension://${id}/src/popup/index.html`);
    await popup.getByRole('searchbox', { name: 'Search snippets' }).fill('instructions');
    await expect(popup.getByText('/restart', { exact: true })).toBeVisible();
    await expect
      .poll(() =>
        popup.locator('.media-thumb img').evaluate((image: HTMLImageElement) => image.naturalWidth)
      )
      .toBeGreaterThan(0);
    const opening = context!.waitForEvent('page');
    await popup.getByRole('button', { name: '/restart', exact: true }).click();
    const reopened = await opening;
    await expect(reopened.getByLabel('Caption optional')).toHaveValue(
      'Still here after restarting.'
    );
    await reopened.getByRole('button', { name: 'Try /restart in practice', exact: false }).click();
    const field = reopened.getByRole('textbox', { name: 'Practice field' });
    await field.fill('/restart');
    const preview = reopened.getByRole('button', { name: 'Preview shortcut', exact: true });
    await preview.focus();
    await preview.press('Enter');
    await reopened
      .getByRole('dialog', { name: '/restart', exact: true })
      .getByRole('button', { name: 'Insert image + caption', exact: true })
      .click();
    await expect(field.locator('img')).toHaveCount(1);
    await expect(field).toHaveText('Still here after restarting.');
    await expect(field).toBeFocused();
    await reopened.keyboard.type('!');
    await expect(field).toHaveText('Still here after restarting.!');
  } finally {
    await context?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
