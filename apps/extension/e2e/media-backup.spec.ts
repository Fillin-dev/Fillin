import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { createHash } from 'node:crypto';

const gif = Buffer.from(
  '47494638396101000100800000ff00000000ff21ff0b4e45545343415045322e30030100000021f904000a0000002c000000000100010000020244010021f904000a0000002c00000000010001000002024c01003b',
  'hex'
);
const png = path.resolve(__dirname, '../public/icon48.png');
test('full backup: PNG, GIF, text and captions restore into a fresh browser profile with explicit conflict handling', async ({
  headless,
}) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'fillin-full-backup-'));
  let context: BrowserContext | undefined;
  const extension = path.resolve(__dirname, '../dist');
  const launch = async (profile: string, content: string) => {
    context = await chromium.launchPersistentContext(path.join(directory, profile), {
      channel: 'chromium',
      headless,
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    });
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await worker.evaluate(
      (content) =>
        chrome.storage.local.set({
          fillin_first_use: 'done',
          fillin_snippets: [
            { id: 'email', trigger: '/email', content, createdAt: 1, updatedAt: 1 },
          ],
        }),
      content
    );
    const id = new URL(worker.url()).host;
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/src/popup/index.html`);
    return { worker, id, popup };
  };
  try {
    const first = await launch('source', 'Exported text');
    for (const format of ['png', 'gif']) {
      const editor = await context!.newPage();
      await editor.goto(`chrome-extension://${first.id}/src/media/editor/index.html`);
      await editor.getByLabel('Shortcut', { exact: true }).fill('/' + format);
      await editor.getByLabel('Caption optional').fill('Literal {{name}} <caption>');
      await editor.getByLabel('Tags optional').fill('help, saved');
      await editor
        .getByLabel('Choose image or GIF')
        .setInputFiles(
          format === 'png' ? png : { name: 'reaction.gif', mimeType: 'image/gif', buffer: gif }
        );
      await expect(editor.getByRole('button', { name: 'Save image', exact: true })).toBeEnabled();
      await editor.getByRole('button', { name: 'Save image', exact: true }).click();
      await expect(
        editor.getByText('Saved on this device. Your shortcut is ready to try in practice.')
      ).toBeVisible();
      await editor.close();
    }
    await expect(
      first.popup.getByRole('button', { name: 'Export full backup', exact: true })
    ).toBeVisible();
    const downloading = first.popup.waitForEvent('download');
    await first.popup.getByRole('button', { name: 'Export full backup', exact: true }).click();
    const download = await downloading,
      backup = await readFile((await download.path())!);
    const zip = new AdmZip(backup),
      manifest = JSON.parse(zip.readAsText('manifest.json'));
    expect(manifest.formatVersion).toBe(1);
    expect(manifest.snippets).toHaveLength(3);
    expect(manifest.assets).toHaveLength(2);
    for (const asset of manifest.assets)
      expect(createHash('sha256').update(zip.readFile(asset.path)!).digest('hex')).toBe(
        asset.assetId
      );
    const gifAsset = manifest.assets.find((asset: { mime: string }) => asset.mime === 'image/gif');
    expect(zip.readFile(gifAsset.path)).toEqual(gif);
    await context!.close();
    context = undefined;
    const second = await launch('destination', 'Keep local text');
    const upload = async (bytes: Buffer) =>
      second.popup
        .getByLabel('Choose snippet backup')
        .setInputFiles({ name: 'library.zip', mimeType: 'application/zip', buffer: bytes });
    await upload(backup);
    let dialog = second.popup.getByRole('dialog', { name: 'Review backup' });
    await expect(dialog.getByLabel('Replace matching shortcuts')).not.toBeChecked();
    await second.popup.evaluate(() => {
      const original = chrome.storage.local.set.bind(chrome.storage.local);
      Object.assign(window, {
        restoreBackupWrite: () => {
          chrome.storage.local.set = original;
        },
      });
      chrome.storage.local.set = (() => {
        throw new Error('Simulated backup commit failure');
      }) as typeof chrome.storage.local.set;
    });
    await dialog.getByRole('button', { name: 'Import backup', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('Simulated backup commit failure');
    expect(
      (await second.worker.evaluate(() => chrome.storage.local.get('fillin_snippets')))
        .fillin_snippets
    ).toHaveLength(1);
    await second.popup.evaluate('window.restoreBackupWrite()');
    await dialog.getByRole('button', { name: 'Import backup', exact: true }).click();
    await expect(second.popup.getByText('/gif', { exact: true })).toBeVisible();
    let library = (await second.worker.evaluate(() => chrome.storage.local.get('fillin_snippets')))
      .fillin_snippets;
    expect(
      library.find((snippet: { trigger: string }) => snippet.trigger === '/email').content
    ).toBe('Keep local text');
    expect(library.filter((snippet: { kind?: string }) => snippet.kind === 'media')).toHaveLength(
      2
    );
    const opening = context!.waitForEvent('page');
    await second.popup.getByRole('button', { name: '/gif', exact: true }).click();
    const restored = await opening;
    await expect(restored.getByLabel('Caption optional')).toHaveValue('Literal {{name}} <caption>');
    const original = restored.waitForEvent('download');
    await restored.getByRole('button', { name: 'Download original', exact: true }).click();
    expect(await readFile((await (await original).path())!)).toEqual(gif);
    await restored.close();
    // A changed library must be reviewed again, not overwritten by old approval.
    await upload(backup);
    dialog = second.popup.getByRole('dialog', { name: 'Review backup' });
    await expect(dialog).toBeVisible();
    await second.worker.evaluate(async () => {
      const { fillin_snippets } = await chrome.storage.local.get('fillin_snippets');
      await chrome.storage.local.set({
        fillin_snippets: [
          ...fillin_snippets,
          { id: 'extra', trigger: '/extra', content: 'New edit', createdAt: 2, updatedAt: 2 },
        ],
      });
    });
    await dialog.getByRole('button', { name: 'Import backup', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('library changed');
    await dialog.getByRole('button', { name: 'Review latest library' }).click();
    await dialog.getByLabel('Replace matching shortcuts').check();
    await dialog.getByRole('button', { name: 'Import backup', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    library = (await second.worker.evaluate(() => chrome.storage.local.get('fillin_snippets')))
      .fillin_snippets;
    expect(
      library.find((snippet: { trigger: string }) => snippet.trigger === '/email').content
    ).toBe('Exported text');
    expect(
      library.find((snippet: { trigger: string }) => snippet.trigger === '/extra').content
    ).toBe('New edit');
    await second.worker.evaluate(async () => {
      const { fillin_snippets } = await chrome.storage.local.get('fillin_snippets');
      await chrome.storage.local.set({
        fillin_snippets: fillin_snippets.map(
          (snippet: { trigger: string; caption?: string; updatedAt: number }) =>
            snippet.trigger === '/gif'
              ? { ...snippet, caption: 'Keep local caption', updatedAt: snippet.updatedAt + 1 }
              : snippet
        ),
      });
    });
    await second.popup.evaluate(async (assetId) => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('fillin-media-v1', 1);
        request.onsuccess = () => {
          const db = request.result,
            tx = db.transaction('assets', 'readwrite'),
            store = tx.objectStore('assets');
          const record = store.get(assetId);
          record.onsuccess = () =>
            store.put({ ...record.result, original: new Blob(['damaged'], { type: 'image/gif' }) });
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
    }, gifAsset.assetId);
    await upload(backup);
    dialog = second.popup.getByRole('dialog', { name: 'Review backup' });
    await dialog.getByLabel('Repair damaged matching originals').check();
    await expect(dialog.getByLabel('Replace matching shortcuts')).not.toBeChecked();
    await dialog.getByRole('button', { name: 'Import backup', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    library = (await second.worker.evaluate(() => chrome.storage.local.get('fillin_snippets')))
      .fillin_snippets;
    expect(library.find((snippet: { trigger: string }) => snippet.trigger === '/gif').caption).toBe(
      'Keep local caption'
    );
    const repaired = await context!.newPage();
    await repaired.goto(
      `chrome-extension://${second.id}/src/media/editor/index.html?id=${library.find((snippet: { trigger: string }) => snippet.trigger === '/gif').id}`
    );
    const repairedDownload = repaired.waitForEvent('download');
    await repaired.getByRole('button', { name: 'Download original', exact: true }).click();
    expect(await readFile((await (await repairedDownload).path())!)).toEqual(gif);
    await repaired.close();
    // A valid GIF with altered pixels passes ZIP CRC but must fail the asset SHA.
    const before = JSON.stringify(library),
      corrupt = new AdmZip(backup),
      changed = Buffer.from(gif);
    changed[13] = 0;
    corrupt.updateFile(gifAsset.path, changed);
    await upload(corrupt.toBuffer());
    await expect(second.popup.getByRole('alert')).toContainText('checksum');
    expect(
      JSON.stringify(
        (await second.worker.evaluate(() => chrome.storage.local.get('fillin_snippets')))
          .fillin_snippets
      )
    ).toBe(before);
  } finally {
    await context?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
