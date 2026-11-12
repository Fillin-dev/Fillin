import { MEDIA_LIMITS, mediaDescriptorSchema, type Snippet } from '@fillin/shared';
import type { PreparedBackup } from './codec';
import type { MediaSnippetService } from '../services/MediaSnippetService';
import type { SnippetRepository } from '../storage/SnippetRepository';
import type { MediaAssetRepository } from '../storage/MediaAssetRepository';
import { withSnippetWriteLock } from '../storage/withSnippetWriteLock';
import { validateSnippetLibrary } from '../storage/validateSnippetLibrary';
import { mediaHash } from '../media/prepareMedia';

export type ImportPreview = { incoming: number; conflicts: string[]; revision: string };
export class BackupService {
  constructor(
    private snippets: SnippetRepository,
    private assets: MediaAssetRepository,
    private media: MediaSnippetService
  ) {}
  async preview(backup: PreparedBackup): Promise<ImportPreview> {
    const current = validateSnippetLibrary(await this.snippets.getAll());
    return {
      incoming: backup.snippets.length,
      conflicts: backup.snippets
        .filter((snippet) => current.some((existing) => existing.trigger === snippet.trigger))
        .map((snippet) => snippet.trigger),
      revision: JSON.stringify(current),
    };
  }
  async apply(
    backup: PreparedBackup,
    preview: ImportPreview,
    replace = false,
    signal?: AbortSignal,
    repair = false
  ): Promise<{ imported: number; updated: number; skipped: number }> {
    return withSnippetWriteLock(async () => {
      const check = () => {
        if (signal?.aborted)
          throw new Error('Import cancelled. Your library has not been changed.');
      };
      check();
      const current = validateSnippetLibrary(await this.snippets.getAll());
      if (JSON.stringify(current) !== preview.revision)
        throw new Error(
          'Your library changed while reviewing this backup. Review it again before importing.'
        );
      const incoming = validateSnippetLibrary(backup.snippets);
      const next = new Map(current.map((snippet) => [snippet.trigger, snippet]));
      const required = new Set<string>();
      let imported = 0,
        updated = 0,
        skipped = 0;
      for (const snippet of incoming) {
        const previous = next.get(snippet.trigger);
        if (previous && !replace) {
          skipped++;
          continue;
        }
        const id = previous?.id ?? crypto.randomUUID();
        next.set(snippet.trigger, {
          ...snippet,
          id,
          createdAt: previous?.createdAt ?? snippet.createdAt,
          updatedAt: Math.max(Date.now(), (previous?.updatedAt ?? 0) + 1),
        });
        if (snippet.kind === 'media') required.add(snippet.assetId);
        if (previous) updated++;
        else imported++;
      }
      const library = validateSnippetLibrary([...next.values()]);
      const mediaSnippets = library.filter((snippet) => snippet.kind === 'media');
      const unique = new Map(mediaSnippets.map((snippet) => [snippet.assetId, snippet.byteSize]));
      if ([...unique.values()].reduce((sum, bytes) => sum + bytes, 0) > MEDIA_LIMITS.libraryBytes)
        throw new Error('Restoring this backup would exceed the 50 MiB media library limit.');
      const supplied = new Map(backup.assets.map((asset) => [asset.assetId, asset]));
      if (repair)
        for (const snippet of mediaSnippets)
          if (supplied.has(snippet.assetId)) required.add(snippet.assetId);
      // Validate all required files before staging any. Existing unrelated
      // missing images stay as metadata; newly restored references must resolve.
      const pending: { asset: import('../media/prepareMedia').PreparedMedia; repair: boolean }[] =
        [];
      for (const id of required) {
        check();
        const asset = supplied.get(id);
        if (!asset || (await mediaHash(asset.original)) !== id)
          throw new Error('A restored image is missing or failed validation.');
        mediaDescriptorSchema.parse(asset);
        if (
          asset.byteSize !== asset.original.size ||
          asset.mime !== asset.original.type ||
          mediaSnippets.some(
            (snippet) =>
              snippet.assetId === id &&
              ['mime', 'byteSize', 'width', 'height', 'frameCount'].some(
                (key) => snippet[key as keyof typeof snippet] !== asset[key as keyof typeof asset]
              )
          )
        )
          throw new Error('Restored image metadata does not match its file.');
        let stored;
        try {
          stored = await this.assets.read(id);
        } catch (error) {
          if (!repair) throw error;
          pending.push({ asset, repair: true });
          continue;
        }
        if (stored) {
          if (repair) pending.push({ asset, repair: true });
          else if ((await mediaHash(stored.original)) !== id)
            throw new Error(
              'An existing image is damaged. Enable repair of matching originals to restore it from this verified backup.'
            );
        } else pending.push({ asset, repair: false });
      }
      if (navigator.storage?.estimate) {
        const { quota, usage } = await navigator.storage.estimate();
        const bytes = pending.reduce(
          (sum, item) => sum + item.asset.original.size + item.asset.thumbnail.size,
          0
        );
        if (quota !== undefined && usage !== undefined && quota - usage < bytes)
          throw new Error('There is not enough browser storage to restore this backup.');
      }
      for (const item of pending) {
        check();
        const record = { ...item.asset, createdAt: Date.now() };
        if (item.repair) {
          if (!this.assets.restore)
            throw new Error('Repair is unavailable in this storage environment.');
          await this.assets.restore(record);
        } else await this.assets.stage(record);
      }
      check();
      if (imported || updated) await this.snippets.save(library);
      return { imported, updated, skipped };
    }, true);
  }
  async snapshot<T>(
    write: (
      snippets: Snippet[],
      assets: Map<string, import('../storage/MediaAssetRepository').AssetRecord>
    ) => Promise<T>
  ) {
    return this.media.withSnapshot((snapshot) => write(snapshot.snippets, snapshot.assets));
  }
}
