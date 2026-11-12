import { test as base, chromium, expect, type BrowserContext, type Page } from '@playwright/test';
import { build } from 'vite';
import { cp, mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

const test = base.extend<{ foundation: { page: Page; context: BrowserContext; restart: () => Promise<Page> } }>({
  foundation: async ({ headless }, use) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'fillin-media-foundation-'));
    let context: BrowserContext | undefined;
    try {
      const extension = path.join(directory, 'extension');
      await cp(path.resolve(__dirname, '../dist'), extension, { recursive: true });
      const bundled = await build({ configFile: false, logLevel: 'error', build: {
        write: false, minify: false, lib: { entry: path.join(__dirname, 'media-foundation-entry.ts'), name: 'Foundation', formats: ['iife'] },
      } });
      const outputs = Array.isArray(bundled) ? bundled : [bundled];
      if (!('output' in outputs[0])) throw new Error('Expected a bundled foundation entry');
      const script = outputs[0].output.find(item => item.type === 'chunk');
      if (!script || script.type !== 'chunk') throw new Error('Missing foundation entry');
      await writeFile(path.join(extension, 'media-foundation.js'), script.code);
      await writeFile(path.join(extension, 'media-foundation.html'), '<!doctype html><meta charset="utf-8"><body><script defer src="media-foundation.js"></script>');
      const launch = async () => {
        context = await chromium.launchPersistentContext(path.join(directory, 'profile'), {
          channel: 'chromium', headless, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
        });
        const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
        const page = await context.newPage(); await page.goto(new URL('media-foundation.html', worker.url()).href);
        await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
        return page;
      };
      const page = await launch();
      await use({ page, context: context!, restart: async () => { await context!.close(); return launch(); } });
    } finally { await context?.close(); await rm(directory, { recursive: true, force: true }); }
  },
});

const run = <T = unknown>(page: Page, source: string) => page.evaluate<T>(`(${source})()`);

test('media foundation: real validated originals and thumbnails survive full browser restart', async ({ foundation }) => {
  const before = await run(foundation.page, `async () => {
    const { media, file, assets, mediaHash, text } = foundation;
    await text.createSnippet('/text', 'Existing text');
    const results = [];
    for (const format of ['png', 'jpeg', 'gif']) {
      const snippet = await media.save({ trigger: '/' + format, filename: format + '.wrong', caption: '<literal> {{name}}' }, await file(format));
      const record = await assets.read(snippet.assetId);
      const poster = await createImageBitmap(record.thumbnail);
      results.push({ id: snippet.id, hash: await mediaHash(record.original), poster: [poster.width, poster.height], mime: record.original.type });
      poster.close();
    }
    return results;
  }`);
  const page = await foundation.restart();
  const after = await run(page, `async () => {
    const { snippets, assets, mediaHash } = foundation;
    const results = [];
    for (const snippet of (await snippets.getAll()).filter(s => s.kind === 'media')) {
      const record = await assets.read(snippet.assetId);
      const poster = await createImageBitmap(record.thumbnail);
      results.push({ id: snippet.id, hash: await mediaHash(record.original), poster: [poster.width, poster.height], mime: record.original.type }); poster.close();
    }
    return results;
  }`);
  expect(after).toEqual(before);
  expect(await run(page, 'async () => foundation.media.reconcile()')).toMatchObject({ unavailable: [], orphaned: 0 });
  expect(await run(page, 'async () => (await foundation.snippets.getAll()).find(s => s.trigger === "/text").content')).toBe('Existing text');
});

test('media foundation: interrupted metadata commit preserves old originals and cleans only aged orphans', async ({ foundation }) => {
  const result = await run(foundation.page, `async () => {
    const { media, snippets, assets, file, setNow } = foundation;
    const original = await media.save({ trigger: '/image', filename: 'first.png' }, await file('png'));
    const save = snippets.save.bind(snippets); snippets.save = async () => { throw new Error('Simulated commit failure'); };
    let failed = false;
    try { await media.save({ trigger: '/image', filename: 'replacement.jpg' }, await file('jpeg'), { id: original.id, expectedUpdatedAt: original.updatedAt }); }
    catch { failed = true; }
    snippets.save = save;
    const before = await media.reconcile(); const immediate = await media.cleanup();
    setNow(Date.now() + 2 * 86400000);
    const cleaned = await media.cleanup();
    return { failed, before, immediate, cleaned, library: await snippets.getAll(), originalExists: !!await assets.read(original.assetId) };
  }`) as { library: { originalFilename: string }[] };
  expect(result).toMatchObject({ failed: true, before: { unavailable: [], orphaned: 1 }, immediate: 0, cleaned: 1, originalExists: true });
  expect(result.library).toHaveLength(1); expect(result.library[0].originalFilename).toBe('first.png');
});

test('media foundation: real transactions abort duplicate writes; snapshots protect shared originals', async ({ foundation }) => {
  const result = await run(foundation.page, `async () => {
    const { media, assets, text, file, setNow } = foundation;
    const a = await media.save({ trigger: '/first', filename: 'image.png' }, await file('png'));
    const b = await media.save({ trigger: '/second', filename: 'image.png' }, await file('png'));
    const record = await assets.read(a.assetId); let duplicateRejected = false;
    try { await assets.stage(record); } catch { duplicateRejected = true; }
    setNow(Date.now() + 2 * 86400000);
    const during = await media.withSnapshot(async snapshot => {
      await text.deleteSnippet(a.id); await text.deleteSnippet(b.id);
      return { cleaned: await media.cleanup(), bytes: snapshot.assets.get(a.assetId).original.size };
    });
    return { duplicateRejected, inventory: (await assets.inventory()).length, during, after: await media.cleanup() };
  }`);
  expect(result).toMatchObject({ duplicateRejected: true, inventory: 1, during: { cleaned: 0 }, after: 1 });
});

test('media foundation: headers, checksums, animation budgets, decode and cancellation validate before saving', async ({ foundation }) => {
  const result = await run<string[]>(foundation.page, `async () => {
    const { prepareMedia, file } = foundation;
    const png = new Uint8Array(await (await file('png')).arrayBuffer()); png[20] ^= 1;
    const gif = new Uint8Array(await (await file('gif')).arrayBuffer()); gif[6] = 255; gif[7] = 255;
    const failures = [];
    for (const candidate of [new Blob([png], { type: 'image/png' }), new Blob([gif], { type: 'image/gif' }),
      new Blob(['<svg></svg>'], { type: 'image/svg+xml' }), new Blob([await file('png')], { type: 'image/gif' }),
      (await file('gif')).slice(0, 40)]) {
      try { await prepareMedia(candidate); failures.push('accepted'); } catch { failures.push('rejected'); }
    }
    const controller = new AbortController(); controller.abort();
    try { await prepareMedia(await file('png'), controller.signal); failures.push('accepted'); } catch { failures.push('rejected'); }
    return failures;
  }`);
  expect(result).toEqual(Array(6).fill('rejected'));
});

test('media foundation: text and media writes across extension tabs share one lock', async ({ foundation }) => {
  const other = await foundation.context.newPage(); await other.goto(foundation.page.url());
  await expect(other.locator('body')).toHaveAttribute('data-ready', 'true');
  const results = await Promise.allSettled([
    run(foundation.page, 'async () => foundation.media.save({ trigger: "/same", filename: "image.png" }, await foundation.file("png"))'),
    run(other, 'async () => foundation.text.createSnippet("/same", "Text")'),
  ]);
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  expect(await run(foundation.page, 'async () => (await foundation.snippets.getAll()).length')).toBe(1);
});
