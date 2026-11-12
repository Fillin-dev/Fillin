import { describe, expect, it } from 'vitest';
import { backupManifestSchema, mediaArchivePath } from './backup.js';
const descriptor = {
  assetId: 'a'.repeat(64),
  mime: 'image/gif',
  width: 1,
  height: 1,
  frameCount: 2,
  byteSize: 85,
};
const snippet = {
  ...descriptor,
  kind: 'media',
  mediaVersion: 1,
  content: '',
  id: 'gif',
  trigger: '/gif',
  caption: 'Literal {{name}}',
  alt: 'A reaction',
  originalFilename: 'reaction.gif',
  createdAt: 1,
  updatedAt: 1,
};
const manifest = {
  format: 'fillin-backup',
  formatVersion: 1,
  minReaderVersion: 1,
  exportedAt: 1,
  snippets: [snippet],
  assets: [{ ...descriptor, path: mediaArchivePath(descriptor) }],
};
describe('versioned full backup metadata', () => {
  it('keeps complete media metadata and legacy text records', () => {
    expect(backupManifestSchema.parse(manifest)).toEqual(manifest);
  });
  it.each([
    { formatVersion: 2 },
    { minReaderVersion: 2 },
    { assets: [] },
    { snippets: [] },
    { snippets: [snippet, snippet] },
    { assets: [manifest.assets[0], manifest.assets[0]] },
    { assets: [{ ...manifest.assets[0], path: '../image.gif' }] },
    { assets: [{ ...manifest.assets[0], byteSize: 100 }] },
  ])('refuses unsupported or incomplete manifests: %j', (updates) => {
    expect(backupManifestSchema.safeParse({ ...manifest, ...updates }).success).toBe(false);
  });
});
