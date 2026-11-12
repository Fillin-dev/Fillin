import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const png = path.resolve(__dirname, '../public/icon48.png');
const gif = Buffer.from(
  '47494638396101000100800000ff00000000ff21ff0b4e45545343415045322e30030100000021f904000a0000002c000000000100010000020244010021f904000a0000002c00000000010001000002024c01003b',
  'hex'
);

test.beforeEach(async ({ extensionWorker }) => {
  await extensionWorker.evaluate(async () => {
    await chrome.storage.local.clear();
    await chrome.storage.local.set({
      fillin_first_use: 'done',
      fillin_snippets: [
        {
          id: 'email',
          trigger: '/email',
          content: 'test@example.com',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });
  });
});

async function fill(editor: Page, trigger = '/setup') {
  await editor.getByLabel('Shortcut', { exact: true }).fill(trigger);
  await editor.getByLabel('Choose image or GIF').setInputFiles(png);
  await expect(editor.locator('.media-file-details strong')).toBeVisible();
  if (trigger !== '/email')
    await expect(editor.getByRole('button', { name: 'Save and try', exact: true })).toBeEnabled();
}

test('creates a visual snippet, previews before insertion, preserves caret/undo, and downloads the original', async ({
  popup,
  context,
  extensionWorker,
}, testInfo) => {
  const opening = context.waitForEvent('page');
  await popup.getByRole('button', { name: 'Create image or GIF' }).click();
  const editor = await opening;
  await expect(
    editor.getByRole('heading', { name: 'Your image. One shortcut away.' })
  ).toBeVisible();
  await fill(editor);
  await editor.getByLabel('Tags optional').fill('support, setup');
  await editor.getByLabel('Caption optional').fill('Follow <these> steps, {{name}}.');
  await editor.getByLabel('Image description optional').fill('Reset button highlighted');
  await editor.getByRole('button', { name: 'Save and try', exact: true }).click();
  const field = editor.getByRole('textbox', { name: 'Practice field' });
  await expect(field).toBeVisible();
  await field.fill('Before /setup after');
  await field.evaluate((element) => {
    (element as HTMLElement).focus();
    const range = document.createRange();
    range.setStart(element.firstChild!, 13);
    range.collapse(true);
    const selection = getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await field.press('Control+Space');
  let dialog = editor.getByRole('dialog', { name: '/setup', exact: true });
  await expect(dialog).toBeVisible();
  await expect(field.locator('img')).toHaveCount(0);
  await expect(dialog).toContainText('Follow <these> steps, {{name}}.');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(field).toHaveText('Before /setup after');
  await expect(field).toBeFocused();
  await field.press('Control+Space');
  dialog = editor.getByRole('dialog', { name: '/setup', exact: true });
  await dialog.getByRole('button', { name: 'Insert image + caption', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(field.locator('img')).toHaveCount(1);
  await expect(field.locator('img')).toHaveAttribute('alt', 'Reset button highlighted');
  await expect(field).toHaveText('Before Follow <these> steps, {{name}}. after');
  await editor.keyboard.type('!');
  await expect(field).toHaveText('Before Follow <these> steps, {{name}}.! after');
  await editor.keyboard.press('ControlOrMeta+z');
  await editor.keyboard.press('ControlOrMeta+z');
  await expect(field).toHaveText('Before /setup after');
  await expect(field.locator('img')).toHaveCount(0);
  expect(
    (await extensionWorker.evaluate(() => chrome.storage.local.get('fillin_stats'))).fillin_stats
  ).toBeUndefined();
  const downloading = editor.waitForEvent('download');
  await editor.getByRole('button', { name: 'Download original' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('icon48.png');
  expect(
    createHash('sha256')
      .update(await readFile((await download.path())!))
      .digest('hex')
  ).toBe(
    createHash('sha256')
      .update(await readFile(png))
      .digest('hex')
  );
  await editor.reload();
  await expect(editor.getByLabel('Shortcut', { exact: true })).toHaveValue('/setup');
  await expect(editor.getByLabel('Caption optional')).toHaveValue(
    'Follow <these> steps, {{name}}.'
  );
  await expect(popup.getByText('/setup', { exact: true })).toBeVisible();
  await popup.locator('.media-thumb').scrollIntoViewIfNeeded();
  await expect(popup.locator('.media-thumb img')).toBeVisible();
  const filters = popup.getByRole('group', { name: 'Filter snippet types' });
  await filters.getByRole('button', { name: 'Text', exact: true }).click();
  await expect(popup.getByText('/setup', { exact: true })).toHaveCount(0);
  await filters.getByRole('button', { name: 'Images & GIFs', exact: true }).click();
  await popup.getByRole('searchbox', { name: 'Search snippets' }).fill('Reset button');
  await expect(popup.getByText('/setup', { exact: true })).toBeVisible();
  const fullBackup = popup.waitForEvent('download');
  await popup.getByRole('button', { name: 'Export full backup', exact: true }).click();
  expect((await fullBackup).suggestedFilename()).toMatch(/^fillin-backup-.*\.zip$/);
  const desktop = testInfo.outputPath('media-editor-desktop.png');
  await editor.screenshot({ path: desktop, fullPage: true });
  await testInfo.attach('media-editor-desktop', {
    path: desktop,
    contentType: 'image/png',
  });
});

test('GIF previews start still, play only on request, and reduced-motion practice can insert a still', async ({
  context,
  extensionId,
}, testInfo) => {
  const editor = await context.newPage();
  await editor.emulateMedia({ reducedMotion: 'reduce' });
  await editor.goto(`chrome-extension://${extensionId}/src/media/editor/index.html`);
  await editor.getByLabel('Shortcut', { exact: true }).fill('/celebrate');
  await editor.getByLabel('Choose image or GIF').setInputFiles({
    name: 'celebrate.gif',
    mimeType: 'image/gif',
    buffer: gif,
  });
  await expect(editor.getByRole('button', { name: 'Play GIF', exact: true })).toBeVisible();
  const previewType = () =>
    editor
      .locator('.media-file-panel img')
      .evaluate(async (image: HTMLImageElement) =>
        (await fetch(image.src)).blob().then((blob) => blob.type)
      );
  expect(await previewType()).toBe('image/png');
  await editor.getByRole('button', { name: 'Play GIF', exact: true }).click();
  await expect.poll(previewType).toBe('image/gif');
  await editor.getByRole('button', { name: 'Pause GIF', exact: true }).click();
  await expect.poll(previewType).toBe('image/png');
  await editor.getByRole('button', { name: 'Save and try', exact: true }).click();
  const field = editor.getByRole('textbox', { name: 'Practice field' });
  await field.fill('/celebrate');
  await field.press('Control+Space');
  const dialog = editor.getByRole('dialog', {
    name: '/celebrate',
    exact: true,
  });
  await expect(dialog.getByLabel('Keep animation when inserting')).not.toBeChecked();
  await dialog.getByRole('button', { name: 'Insert still preview', exact: true }).click();
  await expect(field.locator('img')).toHaveAttribute('src', /^data:image\/png/);
  await expect(
    editor.getByText('Inserted a still preview in practice. Your saved GIF is unchanged.')
  ).toBeVisible();
  const downloading = editor.waitForEvent('download');
  await editor.getByRole('button', { name: 'Download original' }).click();
  expect(await readFile((await (await downloading).path())!)).toEqual(gif);
  await editor.setViewportSize({ width: 390, height: 760 });
  expect(await editor.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true
  );
  const mobile = testInfo.outputPath('media-editor-mobile.png');
  await editor.screenshot({ path: mobile, fullPage: true });
  await testInfo.attach('media-editor-mobile', {
    path: mobile,
    contentType: 'image/png',
  });
});

test('invalid uploads preserve the current file and duplicate triggers cannot be saved', async ({
  context,
  extensionId,
}) => {
  const editor = await context.newPage();
  await editor.goto(`chrome-extension://${extensionId}/src/media/editor/index.html`);
  await fill(editor, '/email');
  await expect(editor.getByText('This shortcut already exists. Choose another.')).toBeVisible();
  await expect(editor.getByRole('button', { name: 'Save image', exact: true })).toBeDisabled();
  await editor.getByLabel('Shortcut', { exact: true }).fill('/new');
  await editor.getByLabel('Caption optional').fill('Keep this draft');
  await editor.getByLabel('Choose image or GIF').setInputFiles({
    name: 'bad.png',
    mimeType: 'image/png',
    buffer: Buffer.from('<svg onload="alert(1)"></svg>'),
  });
  await expect(editor.getByRole('alert')).toContainText('damaged');
  await expect(editor.getByLabel('Caption optional')).toHaveValue('Keep this draft');
  await expect(editor.locator('.media-file-details strong')).toHaveText('icon48.png');
  await editor.getByRole('button', { name: 'Save image', exact: true }).click();
  await expect(
    editor.getByText('Saved on this device. Your shortcut is ready to try in practice.')
  ).toBeVisible();
});

test('failed saves retain the complete draft and a later retry succeeds', async ({
  context,
  extensionId,
}) => {
  const editor = await context.newPage();
  await editor.goto(`chrome-extension://${extensionId}/src/media/editor/index.html`);
  await fill(editor);
  await editor.getByLabel('Caption optional').fill('Keep my caption');
  await editor.evaluate(() => {
    const original = chrome.storage.local.set.bind(chrome.storage.local);
    Object.assign(window, {
      restoreWrite: () => {
        chrome.storage.local.set = original;
      },
    });
    chrome.storage.local.set = (() => {
      throw new Error('Simulated save failure');
    }) as typeof chrome.storage.local.set;
  });
  await editor.getByRole('button', { name: 'Save image', exact: true }).click();
  await expect(editor.getByRole('alert')).toContainText('Simulated save failure');
  await expect(editor.getByLabel('Caption optional')).toHaveValue('Keep my caption');
  await expect(editor.locator('.media-file-details strong')).toHaveText('icon48.png');
  await editor.evaluate('window.restoreWrite()');
  await editor.getByRole('button', { name: 'Save image', exact: true }).click();
  await expect(
    editor.getByText('Saved on this device. Your shortcut is ready to try in practice.')
  ).toBeVisible();
});

test('simultaneous editor changes require reload and dirty reload asks before discarding', async ({
  context,
  extensionId,
}) => {
  const first = await context.newPage();
  await first.goto(`chrome-extension://${extensionId}/src/media/editor/index.html`);
  await fill(first);
  await first.getByRole('button', { name: 'Save image', exact: true }).click();
  await expect(
    first.getByText('Saved on this device. Your shortcut is ready to try in practice.')
  ).toBeVisible();
  const second = await context.newPage();
  await second.goto(first.url());
  await expect(second.getByLabel('Shortcut', { exact: true })).toHaveValue('/setup');
  await first.getByLabel('Caption optional').fill('Unsaved first window');
  await second.getByLabel('Caption optional').fill('Saved second window');
  await second.getByRole('button', { name: 'Save image', exact: true }).click();
  await expect(first.getByRole('button', { name: 'Reload latest' })).toBeVisible();
  await expect(first.getByLabel('Caption optional')).toHaveValue('Unsaved first window');
  await first.getByRole('button', { name: 'Reload latest' }).click();
  const dialog = first.getByRole('dialog', {
    name: 'Discard your unsaved changes?',
  });
  await dialog.getByRole('button', { name: 'Keep editing' }).click();
  await expect(first.getByLabel('Caption optional')).toHaveValue('Unsaved first window');
  await first.getByRole('button', { name: 'Reload latest' }).click();
  await first.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(first.getByLabel('Caption optional')).toHaveValue('Saved second window');
});

test('accepts a file drop, rejects multiple dropped files and keeps a keyboard-accessible stale preview safe', async ({
  context,
  extensionId,
}) => {
  const editor = await context.newPage();
  await editor.goto(`chrome-extension://${extensionId}/src/media/editor/index.html`);
  await editor.getByLabel('Shortcut', { exact: true }).fill('/dropped');
  const bytes = [...(await readFile(png))];
  const dropping = await editor.evaluateHandle((bytes) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(bytes)], 'dropped.png', { type: 'image/png' }));
    return transfer;
  }, bytes);
  await editor.locator('.media-drop-zone').dispatchEvent('drop', { dataTransfer: dropping });
  await dropping.dispose();
  await expect(editor.locator('.media-file-details strong')).toHaveText('dropped.png');
  const multiple = await editor.evaluateHandle((bytes) => {
    const transfer = new DataTransfer();
    for (const name of ['first.png', 'second.png'])
      transfer.items.add(new File([new Uint8Array(bytes)], name, { type: 'image/png' }));
    return transfer;
  }, bytes);
  await editor.locator('.media-drop-zone').dispatchEvent('drop', { dataTransfer: multiple });
  await multiple.dispose();
  await expect(editor.getByRole('alert')).toContainText('one PNG, JPEG or GIF');
  await expect(editor.locator('.media-file-details strong')).toHaveText('dropped.png');
  await editor.getByRole('button', { name: 'Save and try', exact: true }).click();
  const field = editor.getByRole('textbox', { name: 'Practice field' });
  await field.fill('/dropped');
  await field.press('Control+Space');
  const dialog = editor.getByRole('dialog', { name: '/dropped', exact: true });
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await editor.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Insert image', exact: true })).toBeFocused();
  await editor.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await editor.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Insert image', exact: true })).toBeFocused();
  await field.evaluate((element) => {
    element.textContent = 'Changed while preview was open';
  });
  await dialog.getByRole('button', { name: 'Insert image', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('practice field changed');
  await expect(field).toHaveText('Changed while preview was open');
  await expect(field.locator('img')).toHaveCount(0);
  await editor.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('shows a recoverable missing-file error without deleting the saved shortcut', async ({
  context,
  extensionId,
  extensionWorker,
}) => {
  const editor = await context.newPage();
  await editor.goto(`chrome-extension://${extensionId}/src/media/editor/index.html`);
  await fill(editor);
  await editor.getByRole('button', { name: 'Save image', exact: true }).click();
  await expect(
    editor.getByText('Saved on this device. Your shortcut is ready to try in practice.')
  ).toBeVisible();
  await editor.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('fillin-media-v1', 1);
      request.onsuccess = () => {
        const db = request.result,
          tx = db.transaction('assets', 'readwrite');
        tx.objectStore('assets').clear();
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error);
        };
      };
      request.onerror = () => reject(request.error);
    });
  });
  await editor.reload();
  await expect(editor.getByRole('alert')).toContainText('unavailable');
  await expect(editor.getByLabel('Shortcut', { exact: true })).toHaveValue('/setup');
  await expect(editor.getByRole('button', { name: 'Save image', exact: true })).toBeDisabled();
  const library = (
    await extensionWorker.evaluate(() => chrome.storage.local.get('fillin_snippets'))
  ).fillin_snippets;
  expect(library.some((snippet: { trigger: string }) => snippet.trigger === '/setup')).toBe(true);
  await editor.getByLabel('Choose image or GIF').setInputFiles(png);
  await expect(editor.getByRole('button', { name: 'Save image', exact: true })).toBeEnabled();
  await editor.getByRole('button', { name: 'Save image', exact: true }).click();
  await expect(
    editor.getByText('Saved on this device. Your shortcut is ready to try in practice.')
  ).toBeVisible();
});
