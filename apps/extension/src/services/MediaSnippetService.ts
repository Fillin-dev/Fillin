import {
  MEDIA_LIMITS,
  mediaFilename,
  mediaSnippetSchema,
  type MediaSnippet,
  type Snippet,
} from '@fillin/shared';
import { prepareMedia, mediaHash, type PreparedMedia } from '../media/prepareMedia';
import type { MediaAssetRepository, AssetRecord } from '../storage/MediaAssetRepository';
import type { SnippetRepository } from '../storage/SnippetRepository';
import { validateSnippetLibrary } from '../storage/validateSnippetLibrary';
import { withSnippetWriteLock } from '../storage/withSnippetWriteLock';

type Draft = { trigger: string; tags?: string[]; caption?: string; alt?: string; filename: string };
const GRACE = 24 * 60 * 60 * 1000;
const LEASE = 10 * 60 * 1000;
const missing = () =>
  new Error(
    'This saved image is unavailable or damaged. Replace the file or restore a full backup.'
  );

function mediaOnly(snippets: Snippet[]): MediaSnippet[] {
  return snippets.filter((s): s is MediaSnippet => s.kind === 'media');
}
function sameAsset(snippet: MediaSnippet, asset: AssetRecord): boolean {
  return (
    snippet.assetId === asset.assetId &&
    snippet.byteSize === asset.byteSize &&
    snippet.mime === asset.mime &&
    snippet.width === asset.width &&
    snippet.height === asset.height &&
    snippet.frameCount === asset.frameCount
  );
}

/** Extension-only service. Content-script access is a separate capability. */
export class MediaSnippetService {
  constructor(
    private snippets: SnippetRepository,
    private assets: MediaAssetRepository,
    private now = () => Date.now(),
    private prepare = prepareMedia
  ) {}

  async save(
    draft: Draft,
    file?: Blob,
    options: { id?: string; expectedUpdatedAt?: number; signal?: AbortSignal } = {}
  ): Promise<MediaSnippet> {
    const prepared = file ? await this.prepare(file, options.signal) : undefined;
    const check = () => {
      if (options.signal?.aborted) throw new Error('Saving the image was cancelled.');
    };
    return withSnippetWriteLock(async () => {
      check();
      const library = validateSnippetLibrary(await this.snippets.getAll());
      const existing = options.id ? library.find((s) => s.id === options.id) : undefined;
      if (options.id && (!existing || existing.kind !== 'media'))
        throw new Error('This media snippet no longer exists. Reload the library.');
      if (
        existing &&
        (options.expectedUpdatedAt === undefined ||
          existing.updatedAt !== options.expectedUpdatedAt)
      )
        throw new Error('This snippet changed in another window. Reload it before saving.');
      const old = existing?.kind === 'media' ? existing : undefined;
      let asset: PreparedMedia;
      if (prepared) asset = prepared;
      else {
        const record = old ? await this.assets.read(old.assetId) : undefined;
        if (
          !record ||
          !old ||
          !sameAsset(old, record) ||
          (await mediaHash(record.original)) !== record.assetId
        )
          throw missing();
        asset = record;
      }
      const timestamp = Math.max(this.now(), (old?.updatedAt ?? 0) + 1);
      const snippet = mediaSnippetSchema.parse({
        kind: 'media',
        mediaVersion: 1,
        content: '',
        id: old?.id ?? crypto.randomUUID(),
        trigger: draft.trigger,
        tags: draft.tags?.length ? draft.tags : undefined,
        caption: draft.caption ?? '',
        alt: draft.alt ?? '',
        originalFilename: mediaFilename(draft.filename, asset.mime),
        assetId: asset.assetId,
        mime: asset.mime,
        byteSize: asset.byteSize,
        width: asset.width,
        height: asset.height,
        frameCount: asset.frameCount,
        createdAt: old?.createdAt ?? timestamp,
        updatedAt: timestamp,
      });
      if (library.some((s) => s.trigger === snippet.trigger && s.id !== snippet.id))
        throw new Error(`Snippet with trigger "${snippet.trigger}" already exists.`);
      const next = validateSnippetLibrary([...library.filter((s) => s.id !== snippet.id), snippet]);
      const referenced = new Map(mediaOnly(next).map((s) => [s.assetId, s.byteSize]));
      if ([...referenced.values()].reduce((sum, size) => sum + size, 0) > MEDIA_LIMITS.libraryBytes)
        throw new Error(
          'Your media library would exceed 50 MiB. Remove unused images or choose a smaller file.'
        );
      const saved = await this.assets.read(asset.assetId);
      if (saved) {
        if (!sameAsset(snippet, saved) || (await mediaHash(saved.original)) !== asset.assetId)
          throw missing();
      } else {
        if (navigator.storage?.estimate) {
          const { quota, usage } = await navigator.storage.estimate();
          if (
            quota !== undefined &&
            usage !== undefined &&
            quota - usage < asset.original.size + asset.thumbnail.size
          )
            throw new Error(
              'There is not enough browser storage to save this image. Nothing has been changed.'
            );
        }
        check();
        await this.assets.stage({ ...asset, createdAt: this.now() });
      }
      // IndexedDB completes before metadata commit. On failure the previous
      // library still points at its original assets; new blobs become orphans.
      check();
      await this.snippets.save(next);
      return snippet;
    }, true);
  }

  async readSelected(expected: MediaSnippet): Promise<AssetRecord> {
    return withSnippetWriteLock(async () => {
      const library = validateSnippetLibrary(await this.snippets.getAll());
      const current = library.find((snippet) => snippet.id === expected.id);
      if (
        !current ||
        current.kind !== 'media' ||
        current.updatedAt !== expected.updatedAt ||
        current.assetId !== expected.assetId
      ) {
        throw new Error('This snippet changed or was removed. Reload it before trying again.');
      }
      const asset = await this.assets.read(current.assetId);
      if (
        !asset ||
        !sameAsset(current, asset) ||
        (await mediaHash(asset.original)) !== current.assetId
      )
        throw missing();
      return asset;
    }, true);
  }

  /** Snapshot Blobs remain usable even if a page is suspended beyond its lease. */
  async withSnapshot<T>(
    consume: (snapshot: { snippets: Snippet[]; assets: Map<string, AssetRecord> }) => Promise<T>
  ): Promise<T> {
    const id = crypto.randomUUID();
    const snapshot = await withSnippetWriteLock(async () => {
      const snippets = validateSnippetLibrary(await this.snippets.getAll());
      const assets = new Map<string, AssetRecord>();
      for (const snippet of mediaOnly(snippets)) {
        let asset = assets.get(snippet.assetId);
        if (!asset) {
          asset = await this.assets.read(snippet.assetId);
          if (!asset || (await mediaHash(asset.original)) !== snippet.assetId) throw missing();
          assets.set(snippet.assetId, asset);
        }
        if (!sameAsset(snippet, asset)) throw missing();
      }
      await this.assets.pin({ id, assetIds: [...assets.keys()], expiresAt: this.now() + LEASE });
      return { snippets, assets };
    }, true);
    try {
      return await consume(snapshot);
    } finally {
      // A release failure must not replace a successful export or mask its error.
      // The abandoned lease expires; cleanup still observes the 24-hour grace.
      await withSnippetWriteLock(() => this.assets.release(id), true).catch(() => {});
    }
  }

  async reconcile(): Promise<{ unavailable: string[]; orphaned: number; referencedBytes: number }> {
    return withSnippetWriteLock(async () => {
      const snippets = mediaOnly(validateSnippetLibrary(await this.snippets.getAll()));
      const records = await this.assets.inventory();
      const referenced = new Set(snippets.map((s) => s.assetId));
      const unavailable: string[] = [];
      // Shared originals are checked once per reconciliation, rather than once
      // per shortcut. Retain failed checks too so damaged files cannot cause
      // repeated large reads in a library with many references.
      const checked = new Map<string, AssetRecord | undefined>();
      for (const snippet of snippets) {
        try {
          if (!checked.has(snippet.assetId)) {
            checked.set(snippet.assetId, undefined);
            const asset = await this.assets.read(snippet.assetId);
            if (asset && (await mediaHash(asset.original)) === snippet.assetId)
              checked.set(snippet.assetId, asset);
          }
          const asset = checked.get(snippet.assetId);
          if (!asset || !sameAsset(snippet, asset)) unavailable.push(snippet.id);
        } catch {
          unavailable.push(snippet.id);
        }
      }
      return {
        unavailable,
        orphaned: records.filter((r) => !referenced.has(r.descriptor.assetId)).length,
        referencedBytes: [...new Map(snippets.map((s) => [s.assetId, s.byteSize])).values()].reduce(
          (sum, value) => sum + value,
          0
        ),
      };
    }, true);
  }

  async cleanup(): Promise<number> {
    return withSnippetWriteLock(async () => {
      const snippets = validateSnippetLibrary(await this.snippets.getAll());
      const now = this.now();
      return this.assets.collect(
        mediaOnly(snippets).map((s) => s.assetId),
        now - GRACE,
        now
      );
    }, true);
  }
}
