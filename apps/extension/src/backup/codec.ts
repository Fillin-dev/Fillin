import {
  BACKUP_LIMITS,
  backupManifestSchema,
  mediaArchivePath,
  mediaDescriptorSchema,
  type BackupManifest,
  type Snippet,
} from '@fillin/shared';
import { prepareMedia, type PreparedMedia } from '../media/prepareMedia';
import { validateSnippetLibrary } from '../storage/validateSnippetLibrary';
import { createBackupZip, inspectZip, extractZipEntry } from './zip';

export type PreparedBackup = {
  snippets: Snippet[];
  assets: PreparedMedia[];
  format: 'zip' | 'json';
};
const descriptorsEqual = (a: PreparedMedia, b: BackupManifest['assets'][number]) =>
  ['assetId', 'mime', 'byteSize', 'width', 'height', 'frameCount'].every(
    (key) => a[key as keyof PreparedMedia] === b[key as keyof typeof b]
  );

export async function decodeBackup(file: Blob): Promise<PreparedBackup> {
  if (!file.size || file.size > BACKUP_LIMITS.bytes)
    throw new Error('Choose a backup smaller than 80 MiB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    if (bytes.length > BACKUP_LIMITS.manifestBytes)
      throw new Error('The JSON backup exceeds 2 MiB.');
    const data: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    const snippets = validateSnippetLibrary(data);
    if (snippets.some((snippet) => snippet.kind === 'media'))
      throw new Error('Media records need a full ZIP backup containing their files.');
    return { snippets, assets: [], format: 'json' };
  }
  const entries = inspectZip(bytes);
  const manifestEntry = entries.find((entry) => entry.name === 'manifest.json')!;
  const value: unknown = JSON.parse(
    new TextDecoder('utf-8', { fatal: true }).decode(extractZipEntry(bytes, manifestEntry))
  );
  const manifest = backupManifestSchema.safeParse(value);
  if (!manifest.success)
    throw new Error(
      'This backup manifest is invalid or requires a newer Fillin version. Nothing has been changed.'
    );
  const snippets = validateSnippetLibrary(manifest.data.snippets);
  if (entries.length !== manifest.data.assets.length + 1)
    throw new Error('This backup has unexpected or missing files.');
  const assets: PreparedMedia[] = [];
  for (const descriptor of manifest.data.assets) {
    const entry = entries.find((entry) => entry.name === descriptor.path);
    if (!entry || entry.size !== descriptor.byteSize)
      throw new Error('A backup image is missing or has the wrong size.');
    const original = new Blob([extractZipEntry(bytes, entry)], { type: descriptor.mime });
    const asset = await prepareMedia(original);
    if (!descriptorsEqual(asset, descriptor))
      throw new Error('A backup image failed its checksum or dimensions check.');
    assets.push(asset);
  }
  return { snippets, assets, format: 'zip' };
}

export async function encodeBackup(snippets: Snippet[], assets: PreparedMedia[]): Promise<Blob> {
  if (!snippets.length) throw new Error('No snippets to export.');
  const manifest = backupManifestSchema.parse({
    format: 'fillin-backup',
    formatVersion: 1,
    minReaderVersion: 1,
    exportedAt: Date.now(),
    snippets,
    assets: assets.map((asset) => ({
      ...mediaDescriptorSchema.parse(asset),
      path: mediaArchivePath(asset),
    })),
  });
  const json = new TextEncoder().encode(JSON.stringify(manifest));
  if (json.length > BACKUP_LIMITS.manifestBytes)
    throw new Error('The backup manifest exceeds the supported size.');
  return createBackupZip([
    { name: 'manifest.json', blob: new Blob([json]) },
    ...assets.map((asset) => ({ name: mediaArchivePath(asset), blob: asset.original })),
  ]);
}
