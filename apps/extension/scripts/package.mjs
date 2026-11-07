import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildArchive, extensionVersion } from './release-utils.mjs';

const extension = fileURLToPath(new URL('..', import.meta.url));
const output = path.join(extension, 'build');
const version = extensionVersion(extension);
const { bytes, metadata } = buildArchive(path.join(extension, 'dist'), version);
mkdirSync(output, { recursive: true });
writeFileSync(path.join(output, 'fillin-extension.zip'), bytes);
writeFileSync(
  path.join(output, 'release.json'),
  JSON.stringify(metadata, null, 2) + '\n'
);
console.log(`Packaged Fillin ${version}; SHA-256 ${metadata.sha256}`);
