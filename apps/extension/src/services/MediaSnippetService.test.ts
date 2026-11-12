import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import { MediaSnippetService } from './MediaSnippetService';
import { SnippetService } from './SnippetService';
import { InMemoryRepository } from '../storage/InMemoryRepository';
import type {
  MediaAssetRepository,
  AssetRecord,
  AssetLease,
} from '../storage/MediaAssetRepository';
import { prepareMedia, mediaHash } from '../media/prepareMedia';
import { validateSnippetLibrary, SNIPPET_VERSION_ERROR } from '../storage/validateSnippetLibrary';
import { exportBackup } from '../utils/exportBackup';

vi.mock('../media/prepareMedia', async (original) => ({
  ...(await original<typeof import('../media/prepareMedia')>()),
  prepareMedia: vi.fn(),
}));

class MemoryAssets implements MediaAssetRepository {
  records = new Map<string, AssetRecord>();
  leases = new Map<string, AssetLease>();
  fail = false;
  collectCalls = 0;
  async read(id: string) {
    return this.records.get(id);
  }
  async stage(asset: AssetRecord) {
    if (this.fail) throw new Error('Quota exceeded');
    if (this.records.has(asset.assetId)) throw new Error('Immutable original');
    this.records.set(asset.assetId, asset);
  }
  async inventory() {
    return [...this.records.values()].map((asset) => ({
      descriptor: asset,
      createdAt: asset.createdAt,
    }));
  }
  async pin(lease: AssetLease) {
    this.leases.set(lease.id, lease);
  }
  async release(id: string) {
    this.leases.delete(id);
  }
  async collect(referenced: string[], cutoff: number, now: number) {
    this.collectCalls++;
    const keep = new Set(referenced);
    for (const lease of this.leases.values())
      if (lease.expiresAt > now) lease.assetIds.forEach((id) => keep.add(id));
    let count = 0;
    for (const asset of this.records.values())
      if (!keep.has(asset.assetId) && asset.createdAt < cutoff) {
        this.records.delete(asset.assetId);
        count++;
      }
    return count;
  }
}

describe('recoverable media writes and snapshots', () => {
  let snippets: InMemoryRepository,
    assets: MemoryAssets,
    media: MediaSnippetService,
    text: SnippetService,
    now: number;
  const file = (content = 'original') => new Blob([content], { type: 'image/png' });
  const draft = (trigger = '/image') => ({
    trigger,
    filename: '../../example.png',
    caption: 'Literal {{name}}',
    tags: ['help'],
  });
  beforeEach(() => {
    vi.stubGlobal('Blob', NodeBlob);
    vi.stubGlobal('crypto', webcrypto);
    let pending: Promise<unknown> = Promise.resolve();
    vi.stubGlobal('navigator', {
      locks: {
        request: (_key: string, run: () => Promise<unknown>) => {
          const next = pending.then(run);
          pending = next.catch(() => {});
          return next;
        },
      },
    });
    vi.mocked(prepareMedia).mockImplementation(async (original) => ({
      assetId: await mediaHash(original),
      original,
      thumbnail: new Blob(['poster'], { type: 'image/png' }),
      mime: 'image/png',
      byteSize: original.size,
      width: 1,
      height: 1,
      frameCount: 1,
    }));
    snippets = new InMemoryRepository();
    assets = new MemoryAssets();
    now = 1000;
    media = new MediaSnippetService(snippets, assets, () => now);
    text = new SnippetService(snippets);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('deduplicates original bytes while keeping independent snippet captions', async () => {
    const first = await media.save(draft(), file());
    const second = await media.save({ ...draft('/other'), caption: 'Different' }, file());
    expect(first.assetId).toBe(second.assetId);
    expect(assets.records.size).toBe(1);
    expect(first.originalFilename).toBe('example.png');
    expect(first.caption).toBe('Literal {{name}}');
    await text.deleteSnippet(first.id);
    now += 2 * 86_400_000;
    expect(await media.cleanup()).toBe(0);
    expect((await media.reconcile()).unavailable).toEqual([]);
  });
  it('never commits metadata after a failed blob write and allows retry', async () => {
    await text.createSnippet('/text', 'Keep me');
    const before = await snippets.getAll();
    assets.fail = true;
    await expect(media.save(draft(), file())).rejects.toThrow('Quota');
    expect(await snippets.getAll()).toEqual(before);
    assets.fail = false;
    await media.save(draft(), file());
    expect(await snippets.getAll()).toHaveLength(2);
  });
  it('leaves the previous file intact after metadata failure and ages the orphan before cleanup', async () => {
    const first = await media.save(draft(), file());
    vi.spyOn(snippets, 'save').mockRejectedValueOnce(new Error('Metadata write failed'));
    await expect(
      media.save(draft(), file('replacement'), { id: first.id, expectedUpdatedAt: first.updatedAt })
    ).rejects.toThrow('Metadata');
    expect(await snippets.getAll()).toEqual([first]);
    expect(assets.records.size).toBe(2);
    expect(await media.cleanup()).toBe(0);
    now += 2 * 86_400_000;
    expect(await media.cleanup()).toBe(1);
    expect(assets.records.has(first.assetId)).toBe(true);
  });
  it('serializes media and text creates with a shared trigger', async () => {
    const results = await Promise.allSettled([
      media.save(draft('/same'), file()),
      text.createSnippet('/same', 'Text'),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(await snippets.getAll()).toHaveLength(1);
  });
  it('rejects concurrent stale media edits without overwriting the winning change', async () => {
    const first = await media.save(draft(), file());
    const options = { id: first.id, expectedUpdatedAt: first.updatedAt };
    const results = await Promise.allSettled([
      media.save({ ...draft(), caption: 'First' }, undefined, options),
      media.save({ ...draft(), caption: 'Second' }, undefined, options),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect((await snippets.getAll())[0]).toMatchObject({ caption: 'First' });
  });
  it('keeps leased originals through deletion/cleanup and releases them after the snapshot', async () => {
    const snippet = await media.save(draft(), file());
    now += 2 * 86_400_000;
    await media.withSnapshot(async (snapshot) => {
      expect(assets.leases.size).toBe(1);
      await text.deleteSnippet(snippet.id);
      expect(await media.cleanup()).toBe(0);
      expect(await snapshot.assets.get(snippet.assetId)!.original.text()).toBe('original');
    });
    expect(assets.leases.size).toBe(0);
    expect(await media.cleanup()).toBe(1);
  });
  it('retains snapshot Blob handles even after a suspended lease expires', async () => {
    const snippet = await media.save(draft(), file());
    await media.withSnapshot(async (snapshot) => {
      await text.deleteSnippet(snippet.id);
      now += 2 * 86_400_000;
      expect(await media.cleanup()).toBe(1);
      expect(await snapshot.assets.get(snippet.assetId)!.original.text()).toBe('original');
    });
  });
  it('reports missing/corrupt files by snippet ID and never resets metadata', async () => {
    const first = await media.save(draft(), file());
    const second = await media.save(draft('/other'), file('other'));
    assets.records.delete(first.assetId);
    const record = assets.records.get(second.assetId)!;
    assets.records.set(second.assetId, { ...record, original: file('damaged') });
    expect((await media.reconcile()).unavailable).toEqual([first.id, second.id]);
    await expect(media.withSnapshot(async () => {})).rejects.toThrow('unavailable');
    expect(await snippets.getAll()).toHaveLength(2);
    expect(assets.leases.size).toBe(0);
  });
  it('never cleans up after a failed or invalid metadata read', async () => {
    await media.save(draft(), file());
    snippets.shouldFail = true;
    await expect(media.cleanup()).rejects.toThrow();
    snippets.shouldFail = false;
    vi.spyOn(snippets, 'getAll').mockResolvedValueOnce([{} as never]);
    await expect(media.cleanup()).rejects.toThrow();
    expect(assets.collectCalls).toBe(0);
    expect(assets.records.size).toBe(1);
  });
  it('checks shared originals once and reports every affected shortcut when a shared file is damaged', async () => {
    const first = await media.save(draft(), file());
    const library = Array.from({ length: 100 }, (_, index) => ({
      ...first,
      id: `shared-${index}`,
      trigger: `/shared${index}`,
    }));
    await snippets.save(library);
    const read = vi.spyOn(assets, 'read');
    expect((await media.reconcile()).unavailable).toEqual([]);
    expect(read).toHaveBeenCalledTimes(1);
    read.mockClear();
    assets.records.delete(first.assetId);
    expect((await media.reconcile()).unavailable).toEqual(library.map((snippet) => snippet.id));
    expect(read).toHaveBeenCalledTimes(1);
    expect(await snippets.getAll()).toEqual(library);
  });
  it('requires cross-context locks for media and fails before writing', async () => {
    vi.stubGlobal('navigator', {});
    await expect(media.save(draft(), file())).rejects.toThrow('write locks');
    expect(assets.records.size).toBe(0);
    expect(await snippets.getAll()).toEqual([]);
  });
  it('keeps media out of legacy text mutation/import/export paths', async () => {
    const snippet = await media.save(draft(), file());
    await expect(text.updateSnippet(snippet.id, { content: 'overwrite' })).rejects.toThrow(
      'media editor'
    );
    await expect(text.importSnippets([snippet])).rejects.toThrow('full backup');
    const collision = {
      id: 'text',
      trigger: snippet.trigger,
      content: 'Overwrite',
      createdAt: 1,
      updatedAt: 1,
    };
    expect(await text.importSnippets([collision])).toEqual({ imported: 0, updated: 0, skipped: 1 });
    expect(() => exportBackup([snippet])).toThrow('full backup');
    expect(await snippets.getAll()).toEqual([snippet]);
    expect(() => validateSnippetLibrary([{ ...snippet, mediaVersion: 2 }])).toThrow(
      SNIPPET_VERSION_ERROR
    );
  });
  it('cancelled preparation never commits an asset or metadata', async () => {
    const abort = new AbortController();
    abort.abort();
    await expect(media.save(draft(), file(), { signal: abort.signal })).rejects.toThrow(
      'cancelled'
    );
    expect(assets.records.size).toBe(0);
    expect(await snippets.getAll()).toEqual([]);
  });
  it('preflights browser quota without staging an asset', async () => {
    Object.assign(navigator, { storage: { estimate: async () => ({ quota: 1, usage: 1 }) } });
    await expect(media.save(draft(), file())).rejects.toThrow('enough browser storage');
    expect(assets.records.size).toBe(0);
    expect(await snippets.getAll()).toEqual([]);
  });
  it('enforces the 50 MiB referenced-library limit and deduplicates its accounting', async () => {
    for (let index = 0; index < 5; index++) {
      const bytes = new Uint8Array(10 * 1024 * 1024);
      bytes[0] = index;
      await media.save(draft('/large' + index), new Blob([bytes], { type: 'image/png' }));
    }
    const bytes = new Uint8Array(10 * 1024 * 1024);
    await media.save(draft('/samebytes'), new Blob([bytes], { type: 'image/png' }));
    expect(assets.records.size).toBe(5);
    bytes[0] = 99;
    await expect(
      media.save(draft('/overflow'), new Blob([bytes], { type: 'image/png' }))
    ).rejects.toThrow('50 MiB');
    expect(assets.records.size).toBe(5);
    expect(await snippets.getAll()).toHaveLength(6);
  });
});
