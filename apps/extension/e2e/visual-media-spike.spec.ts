import { test as base, chromium, expect, type BrowserContext, type Page } from '@playwright/test';
import { cp, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

// Install a temporary copy of the real build with isolated experiment scripts.
// No spike code is copied into dist or included in the downloadable extension.
const test = base.extend<{ spike: { page: Page; context: BrowserContext; restart: () => Promise<Page> } }>({
  spike: async ({ headless }, use) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'fillin-media-spike-'));
    const extension = path.join(directory, 'extension');
    let context: BrowserContext | undefined;
    try {
      await cp(path.resolve(__dirname, '../dist'), extension, { recursive: true });
      await cp(path.join(__dirname, 'media-spike'), path.join(extension, 'media-spike'), { recursive: true });
      const manifestPath = path.join(extension, 'manifest.json');
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      manifest.content_scripts.push({ matches: ['http://127.0.0.1/*'], js: ['media-spike/content.js'] });
      await writeFile(manifestPath, JSON.stringify(manifest));
      const worker = path.join(extension, 'background.js');
      await writeFile(worker, (await readFile(worker, 'utf8')) + '\nimport "./media-spike/runtime.js";\n');
      await writeFile(path.join(extension, 'media-spike/index.html'), '<!doctype html><title>Media feasibility</title><script type="module" src="runtime.js"></script>');
      const launch = async () => {
        context = await chromium.launchPersistentContext(path.join(directory, 'profile'), {
          channel: 'chromium', headless,
          args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
        });
        const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
        const page = await context.newPage();
        await page.goto(new URL('media-spike/index.html', worker.url()).href);
        await expect(page.getByRole('button', { name: 'Download original' })).toBeVisible();
        return page;
      };
      const page = await launch();
      await use({ page, context: context!, restart: async () => { await context!.close(); return launch(); } });
    } finally {
      await context?.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
});

// A string passed to evaluate is an expression, not an automatically invoked
// function. Invoke our JS-only harness functions explicitly.
async function run<T = unknown>(page: Page, source: string, argument?: unknown): Promise<T> {
  return page.evaluate<T>(`(${source})(${JSON.stringify(argument) ?? ''})`);
}

async function seed(page: Page, format: string): Promise<string> {
  return run<string>(page, `async format => {
    const blob = await mediaSpike.original(format);
    await mediaSpike.put('selected', blob);
    return mediaSpike.hash(blob);
  }`, format);
}

test('spike: original Blobs and 50 MiB survive full browser restart; Web Locks coordinate contexts', async ({ spike }, testInfo) => {
  const hashes = await run(spike.page, `async () => {
    const hashes = {};
    for (const format of ['png', 'jpeg', 'gif']) {
      const blob = await mediaSpike.original(format);
      await mediaSpike.put(format, blob); hashes[format] = await mediaSpike.hash(blob);
    }
    // Synthetic bytes test storage capacity only, not image validation/decode.
    const bytes = new Uint8Array(10 * 1024 * 1024); bytes[0] = 42; bytes[bytes.length - 1] = 17;
    const large = new Blob([bytes]);
    for (let i = 0; i < 5; i++) await mediaSpike.put('large-' + i, large);
    hashes.large = await mediaSpike.hash(large);
    return hashes;
  }`);
  const page = await spike.restart();
  const restored = await run(page, `async () => {
    const hashes = {};
    for (const id of ['png', 'jpeg', 'gif', 'large-0', 'large-1', 'large-2', 'large-3', 'large-4']) {
      const blob = await mediaSpike.get(id);
      hashes[id] = { hash: await mediaSpike.hash(blob), size: blob.size };
    }
    return { hashes, locks: !!navigator.locks?.request, estimate: await navigator.storage.estimate() };
  }`) as { hashes: Record<string, { hash: string; size: number }>; locks: boolean; estimate: unknown };
  expect(restored.locks).toBe(true);
  const expected = hashes as Record<string, string>;
  for (const format of ['png', 'jpeg', 'gif']) expect(restored.hashes[format].hash).toBe(expected[format]);
  for (let i = 0; i < 5; i++) expect(restored.hashes['large-' + i]).toEqual({ hash: expected.large, size: 10 * 1024 * 1024 });
  // A second extension page must wait while the first owns the same lock.
  const other = await page.context().newPage(); await other.goto(page.url());
  await run(page, `() => { window.lockHeld = false; navigator.locks.request('spike-library', () => new Promise(resolve => { window.releaseLock = resolve; window.lockHeld = true; })); }`);
  await expect.poll(() => page.evaluate('window.lockHeld')).toBe(true);
  await run(other, `() => { window.acquired = false; navigator.locks.request('spike-library', () => { window.acquired = true; }); }`);
  expect(await other.evaluate('window.acquired')).toBe(false);
  await page.evaluate('window.releaseLock()');
  await expect.poll(() => other.evaluate('window.acquired')).toBe(true);
  await testInfo.attach('storage-evidence.json', { body: JSON.stringify(restored, null, 2), contentType: 'application/json' });
});

test('spike: 10 MiB JSON chunk transfer is byte-exact in an installed content script', async ({ spike, baseURL }, testInfo) => {
  const expected = await run<string>(spike.page, `async () => {
    const bytes = new Uint8Array(10 * 1024 * 1024);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251;
    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    await mediaSpike.put('selected', blob); return mediaSpike.hash(blob);
  }`);
  const page = await spike.context.newPage(); await page.goto(baseURL!);
  await page.locator('#spike-preview').click();
  await expect(page.locator('#spike-status')).toHaveText('ready');
  expect(await page.locator('#spike-status').getAttribute('data-hash')).toBe(expected);
  expect(await page.locator('#spike-status').getAttribute('data-bytes')).toBe(String(10 * 1024 * 1024));
  const cdp = await spike.context.newCDPSession(page);
  const heap = await cdp.send('Runtime.getHeapUsage');
  await testInfo.attach('transfer-evidence.json', { body: JSON.stringify({ elapsedMs: Number(await page.locator('#spike-status').getAttribute('data-ms')), ...heap }), contentType: 'application/json' });
});

for (const format of ['png', 'jpeg', 'gif']) {
  test(`spike: ${format} confirms trigger-only insertion, caret, one-step undo and serialized persistence`, async ({ spike, baseURL }, testInfo) => {
    const hash = await seed(spike.page, format);
    const page = await spike.context.newPage(); await page.goto(baseURL!);
    const editor = page.locator('#editor');
    await editor.evaluate(element => { element.innerHTML = '<b>Before </b><span>/media</span><i> after</i>'; });
    await expect(editor).toHaveText('Before /media after');
    await editor.locator('span').evaluate(element => {
      (element.parentElement as HTMLElement).focus();
      const range = document.createRange(); range.setStart(element.firstChild!, element.textContent!.length); range.collapse(true);
      const selection = getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    });
    const original = await editor.innerHTML();
    await page.locator('#spike-preview').click();
    await expect(page.locator('#spike-status')).toHaveText('ready');
    expect(await page.locator('#spike-status').getAttribute('data-selection')).toBe(JSON.stringify({ text: '/media', end: 6, collapsed: true, editor: true, nodeType: 3 }));
    await expect(page.locator('#spike-confirm')).toBeVisible();
    expect(await page.locator('#spike-status').getAttribute('data-hash')).toBe(hash);
    expect(await editor.innerHTML()).toBe(original); // Preview alone never inserts.
    await page.locator('#spike-confirm').click();
    await expect(page.locator('#spike-status')).toHaveText('inserted');
    await expect(editor.locator('img')).toHaveCount(1);
    await expect(editor.locator('b')).toHaveText('Before ');
    await expect(editor.locator('i')).toHaveText(' after');
    await expect(editor).toContainText('A literal <caption>');
    await expect.poll(() => editor.locator('img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    const inserted = await editor.innerHTML();
    await page.keyboard.type('!');
    await expect(editor).toContainText('A literal <caption>! after');
    // Undo only the inserted typing before testing the media edit transaction.
    await page.keyboard.press('ControlOrMeta+z');
    expect(await editor.innerHTML()).toBe(inserted);
    await page.keyboard.press('ControlOrMeta+z');
    expect(await editor.innerHTML()).toBe(original);
    // A separate fresh document can decode serialized data; no extension Blob URL dependency.
    const restored = await spike.context.newPage(); await restored.goto(baseURL!);
    await restored.locator('#editor').evaluate((element, html) => { element.innerHTML = html; }, inserted);
    await expect.poll(() => restored.locator('#editor img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    await testInfo.attach('serialized-result.html', { body: inserted, contentType: 'text/html' });
  });
}

test('spike: GIF retains two different decoded frames and downloads byte-for-byte', async ({ spike }, testInfo) => {
  const hash = await seed(spike.page, 'gif');
  const decoded = await run(spike.page, `async () => {
    const blob = await mediaSpike.get('selected');
    const decoder = new ImageDecoder({ data: await blob.arrayBuffer(), type: blob.type });
    await decoder.tracks.ready;
    const pixels = [];
    for (let i = 0; i < 2; i++) {
      const { image } = await decoder.decode({ frameIndex: i });
      const canvas = new OffscreenCanvas(1, 1); const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0); pixels.push([...context.getImageData(0, 0, 1, 1).data]); image.close();
    }
    const frames = decoder.tracks.selectedTrack.frameCount; decoder.close();
    return { frames, pixels };
  }`) as { frames: number; pixels: number[][] };
  expect(decoded.frames).toBe(2);
  expect(decoded.pixels).toEqual([[255, 0, 0, 255], [0, 0, 255, 255]]);
  const downloading = spike.page.waitForEvent('download');
  await spike.page.getByRole('button', { name: 'Download original' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('spike-original.gif');
  const bytes = await readFile((await download.path())!);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(hash);
  await testInfo.attach('gif-frame-evidence.json', { body: JSON.stringify(decoded), contentType: 'application/json' });
});

test('spike: explicit PNG clipboard write completes successfully with existing permissions', async ({ spike }) => {
  await seed(spike.page, 'png');
  await spike.page.bringToFront();
  await spike.page.getByRole('button', { name: 'Copy PNG' }).click();
  await expect(spike.page.locator('output')).toHaveText('copied');
});

test('spike: stale target is refused; a managed editor can reject locally inserted media', async ({ spike, baseURL }) => {
  await seed(spike.page, 'png');
  const page = await spike.context.newPage(); await page.goto(baseURL!);
  const editor = page.locator('#editor');
  const prepare = async () => {
    await editor.fill('/media');
    await editor.press('End');
    await page.locator('#spike-preview').click();
    await expect(page.locator('#spike-confirm')).toBeVisible();
  };
  await prepare();
  await editor.evaluate(element => { element.textContent = 'New host content'; });
  await page.locator('#spike-confirm').click();
  await expect(page.locator('#spike-status')).toHaveText('stale');
  await expect(editor).toHaveText('New host content');
  await expect(editor.locator('img')).toHaveCount(0);
  await prepare();
  // Simulate a managed editor's synchronous sanitization. Merely having a
  // contenteditable attribute cannot promise that its application accepts media.
  await editor.evaluate(element => {
    element.addEventListener('input', () => element.querySelectorAll('img').forEach(image => image.remove()));
  });
  await page.locator('#spike-confirm').click();
  await expect(page.locator('#spike-status')).toHaveText('failed');
  await expect(editor.locator('img')).toHaveCount(0);
  // A partial host mutation must not cause automatic retry/copy or false success.
  await expect(editor).toHaveText('A literal <caption>');
});

test('spike: 12-megapixel static originals create bounded posters; a 300-frame GIF decodes incrementally', async ({ spike }, testInfo) => {
  const evidence = await run<{ static: { mime: string; bytes: number; decodeMs: number; posterBytes: number }[]; gif: { frames: number; elapsedMs: number } }>(spike.page, `async () => {
    const results = [];
    const canvas = new OffscreenCanvas(4000, 3000);
    canvas.getContext('2d').fillRect(0, 0, 4000, 3000);
    for (const mime of ['image/png', 'image/jpeg']) {
      const original = await canvas.convertToBlob({ type: mime });
      const start = performance.now(); const image = await createImageBitmap(original);
      const poster = new OffscreenCanvas(256, 192);
      poster.getContext('2d').drawImage(image, 0, 0, 256, 192); image.close();
      const thumbnail = await poster.convertToBlob({ type: 'image/png' });
      results.push({ mime, bytes: original.size, decodeMs: performance.now() - start, posterBytes: thumbnail.size });
    }
    const small = new Uint8Array(await (await mediaSpike.original('gif')).arrayBuffer());
    const header = small.slice(0, 38); // Header, palette and loop extension.
    const frame = small.slice(38, 61); // First graphic-control extension + image.
    const parts = [header]; for (let i = 0; i < 300; i++) parts.push(frame);
    parts.push(new Uint8Array([0x3b]));
    const gif = new Blob(parts, { type: 'image/gif' });
    const start = performance.now();
    const decoder = new ImageDecoder({ data: await gif.arrayBuffer(), type: gif.type });
    await decoder.tracks.ready;
    for (let frameIndex = 0; frameIndex < 300; frameIndex++) {
      const { image } = await decoder.decode({ frameIndex }); image.close();
    }
    const frames = decoder.tracks.selectedTrack.frameCount; decoder.close();
    return { static: results, gif: { frames, elapsedMs: performance.now() - start } };
  }`);
  expect(evidence.static.map(image => image.mime)).toEqual(['image/png', 'image/jpeg']);
  for (const image of evidence.static) {
    expect(image.bytes).toBeLessThan(10 * 1024 * 1024);
    expect(image.posterBytes).toBeLessThanOrEqual(128 * 1024);
  }
  expect(evidence.gif.frames).toBe(300);
  await testInfo.attach('decode-evidence.json', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
});
