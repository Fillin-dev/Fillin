import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import { BackupService } from './BackupService';
import { InMemoryRepository } from '../storage/InMemoryRepository';
import { MediaSnippetService } from '../services/MediaSnippetService';
import { mediaHash } from '../media/prepareMedia';
import type {
  AssetRecord,
  AssetLease,
  MediaAssetRepository,
} from '../storage/MediaAssetRepository';
import type { PreparedBackup } from './codec';
import type { MediaSnippet } from '@fillin/shared';

class Assets implements MediaAssetRepository {
  records = new Map<string, AssetRecord>();
  leases = new Map<string, AssetLease>();
  fail = false;
  async read(id: string) {
    return this.records.get(id);
  }
  async stage(asset: AssetRecord) {
    if (this.fail) throw new Error('Quota exceeded');
    this.records.set(asset.assetId, asset);
  }
  async restore(asset: AssetRecord) {
    if (this.fail) throw new Error('Quota exceeded');
    this.records.set(asset.assetId, asset);
  }
  async inventory() {
    return [...this.records.values()].map((record) => ({
      descriptor: record,
      createdAt: record.createdAt,
    }));
  }
  async pin(lease: AssetLease) {
    this.leases.set(lease.id, lease);
  }
  async release(id: string) {
    this.leases.delete(id);
  }
  async collect() {
    return 0;
  }
}
const text = { id: 'saved', trigger: '/saved', content: 'Keep me', createdAt: 1, updatedAt: 1 };
describe('backup restore commit protection', () => {
  let snippets: InMemoryRepository, assets: Assets, service: BackupService;
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
    snippets = new InMemoryRepository();
    assets = new Assets();
    service = new BackupService(snippets, assets, new MediaSnippetService(snippets, assets));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  const backup = async (): Promise<PreparedBackup> => {
    const original = new Blob(['validated-original-fixture'], { type: 'image/png' });
    const assetId = await mediaHash(original);
    const asset = {
      original,
      assetId,
      thumbnail: new Blob(['poster'], { type: 'image/png' }),
      mime: 'image/png' as const,
      byteSize: original.size,
      width: 1,
      height: 1,
      frameCount: 1,
    };
    const snippet: MediaSnippet = {
      kind: 'media',
      mediaVersion: 1,
      content: '',
      id: 'incoming',
      trigger: '/image',
      createdAt: 1,
      updatedAt: 1,
      assetId,
      mime: asset.mime,
      byteSize: asset.byteSize,
      width: 1,
      height: 1,
      frameCount: 1,
      originalFilename: 'image.png',
      caption: 'Caption',
      alt: '',
    };
    return { format: 'zip', snippets: [snippet], assets: [asset] };
  };
  it('merges imports, preserves existing IDs on explicit replacement and defaults to keeping conflicts', async () => {
    await snippets.save([text]);
    const incoming: PreparedBackup = {
      format: 'json',
      snippets: [{ ...text, content: 'Changed' }],
      assets: [],
    };
    const preview = await service.preview(incoming);
    expect(preview.conflicts).toEqual(['/saved']);
    expect(await service.apply(incoming, preview)).toEqual({ imported: 0, updated: 0, skipped: 1 });
    expect(await snippets.getAll()).toEqual([text]);
    expect(await service.apply(incoming, preview, true)).toEqual({
      imported: 0,
      updated: 1,
      skipped: 0,
    });
    expect((await snippets.getAll())[0]).toMatchObject({ id: 'saved', content: 'Changed' });
  });
  it('refuses changed libraries and cancelled imports before staging', async () => {
    const incoming = await backup(),
      preview = await service.preview(incoming);
    await snippets.save([text]);
    await expect(service.apply(incoming, preview)).rejects.toThrow('library changed');
    expect(assets.records.size).toBe(0);
    const controller = new AbortController();
    controller.abort();
    await expect(
      service.apply(incoming, await service.preview(incoming), false, controller.signal)
    ).rejects.toThrow('cancelled');
  });
  it('preserves the old library when asset writes or metadata commits fail', async () => {
    await snippets.save([text]);
    const incoming = await backup(),
      preview = await service.preview(incoming);
    assets.fail = true;
    await expect(service.apply(incoming, preview)).rejects.toThrow('Quota');
    expect(await snippets.getAll()).toEqual([text]);
    assets.fail = false;
    vi.spyOn(snippets, 'save').mockRejectedValueOnce(new Error('Commit failed'));
    await expect(service.apply(incoming, preview)).rejects.toThrow('Commit failed');
    expect(await snippets.getAll()).toEqual([text]);
    expect(assets.records.size).toBe(1);
    expect(await service.apply(incoming, preview)).toEqual({ imported: 1, updated: 0, skipped: 0 });
    expect(await snippets.getAll()).toHaveLength(2);
  });
  it('rejects missing, corrupt or inconsistent originals without committing metadata', async () => {
    const incoming = await backup(),
      preview = await service.preview(incoming);
    const missing = { ...incoming, assets: [] };
    await expect(service.apply(missing, preview)).rejects.toThrow('missing');
    incoming.assets[0].original = new Blob(['corrupt'], { type: 'image/png' });
    await expect(service.apply(incoming, preview)).rejects.toThrow('validation');
    expect(await snippets.getAll()).toEqual([]);
    expect(assets.records.size).toBe(0);
  });
  it('fails full snapshots if an original is missing instead of creating partial backups', async () => {
    const incoming = await backup();
    await snippets.save(incoming.snippets);
    await expect(service.snapshot(async () => 'incomplete')).rejects.toThrow('unavailable');
    expect(assets.leases.size).toBe(0);
  });
  it('explicit repair restores correct bytes while keeping the existing caption', async () => {
    const incoming = await backup(),
      original = incoming.snippets[0] as MediaSnippet;
    await snippets.save([{ ...original, caption: 'Keep this local edit' }]);
    assets.records.set(original.assetId, {
      ...incoming.assets[0],
      createdAt: 1,
      original: new Blob(['damaged'], { type: 'image/png' }),
    });
    const preview = await service.preview(incoming);
    await service.apply(incoming, preview, false, undefined, true);
    expect((await snippets.getAll())[0]).toMatchObject({ caption: 'Keep this local edit' });
    expect(await mediaHash(assets.records.get(original.assetId)!.original)).toBe(original.assetId);
  });
});
