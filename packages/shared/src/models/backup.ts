import { z } from 'zod';
import { snippetSchema } from './snippet.js';
import { mediaDescriptorSchema } from './media.js';

export const BACKUP_LIMITS = Object.freeze({
  bytes: 80 * 1024 * 1024,
  manifestBytes: 2 * 1024 * 1024,
  entries: 10_001,
});
export function mediaArchivePath(asset: { assetId: string; mime: string }): string {
  return `media/${asset.assetId}.${asset.mime === 'image/jpeg' ? 'jpg' : asset.mime.slice(6)}`;
}
export const backupManifestSchema = z
  .object({
    format: z.literal('fillin-backup'),
    formatVersion: z.literal(1),
    minReaderVersion: z.literal(1),
    exportedAt: z.number().finite().nonnegative(),
    snippets: z.array(snippetSchema).max(10_000),
    assets: z
      .array(z.object({ ...mediaDescriptorSchema.shape, path: z.string() }).strict())
      .max(10_000),
  })
  .strict()
  .superRefine((manifest, context) => {
    const ids = new Set<string>(),
      triggers = new Set<string>(),
      assets = new Map<string, (typeof manifest.assets)[number]>();
    const fail = () =>
      context.addIssue({
        code: 'custom',
        message: 'The backup contains duplicate, missing or inconsistent entries.',
      });
    for (const asset of manifest.assets) {
      if (
        !mediaDescriptorSchema.safeParse(asset).success ||
        asset.path !== mediaArchivePath(asset) ||
        assets.has(asset.assetId)
      )
        fail();
      assets.set(asset.assetId, asset);
    }
    const used = new Set<string>();
    for (const snippet of manifest.snippets) {
      if (ids.has(snippet.id) || triggers.has(snippet.trigger)) fail();
      ids.add(snippet.id);
      triggers.add(snippet.trigger);
      if (snippet.kind !== 'media') continue;
      const asset = assets.get(snippet.assetId);
      used.add(snippet.assetId);
      if (
        !asset ||
        ['mime', 'byteSize', 'width', 'height', 'frameCount'].some(
          (key) => asset[key as keyof typeof asset] !== snippet[key as keyof typeof snippet]
        )
      )
        fail();
    }
    if (used.size !== assets.size) fail();
  });
export type BackupManifest = z.infer<typeof backupManifestSchema>;
