import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compareVersions,
  extensionVersion,
  inspectArchive,
  readJSON,
  sha256,
  verifyArchive,
} from '../apps/extension/scripts/release-utils.mjs';

export const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));

export function releaseNotes(root, version) {
  const changelog = readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
  const heading = `## [${version}]`;
  const lines = changelog.split('\n');
  const start = lines.findIndex(
    (line) => line === heading || line.startsWith(heading + ' - ')
  );
  if (start < 0)
    throw new Error(
      `CHANGELOG.md has no notes for ${version}. Add a release entry before staging.`
    );
  const next = lines.findIndex(
    (line, index) => index > start && line.startsWith('## ')
  );
  const notes = lines
    .slice(start + 1, next < 0 ? undefined : next)
    .join('\n')
    .trim();
  if (!notes || !notes.split('\n').some((line) => line.startsWith('- ')))
    throw new Error(`Release ${version} needs changelog notes.`);
  return notes;
}

export function stageRelease(root = repositoryRoot) {
  const extension = path.join(root, 'apps/extension');
  const version = extensionVersion(extension);
  const source = path.join(extension, 'build/fillin-extension.zip');
  if (!existsSync(source))
    throw new Error('Extension archive not found. Run pnpm release:extension.');
  const bytes = readFileSync(source);
  const metadata = readJSON(path.join(extension, 'build/release.json'));
  verifyArchive(bytes, metadata, version, path.join(extension, 'dist'));
  const notes = releaseNotes(root, version);
  const destination = path.join(root, 'apps/landing/frontend/public');
  const zipPath = path.join(destination, 'fillin-extension.zip');
  const metadataPath = path.join(destination, 'fillin-extension-release.json');
  if (existsSync(zipPath)) {
    const previous = readFileSync(zipPath);
    const oldVersion = inspectArchive(previous).manifest.version;
    const comparison = compareVersions(version, oldVersion);
    if (
      comparison < 0 ||
      (comparison === 0 && sha256(previous) !== metadata.sha256)
    ) {
      throw new Error(
        `Download ${oldVersion} already exists with different bytes. Increase the version before replacing it.`
      );
    }
  }
  mkdirSync(destination, { recursive: true });
  try {
    writeFileSync(zipPath + '.tmp', bytes);
    writeFileSync(
      metadataPath + '.tmp',
      JSON.stringify({ ...metadata, notes }, null, 2) + '\n'
    );
    renameSync(zipPath + '.tmp', zipPath);
    renameSync(metadataPath + '.tmp', metadataPath);
  } finally {
    rmSync(zipPath + '.tmp', { force: true });
    rmSync(metadataPath + '.tmp', { force: true });
  }
  console.log(`Staged Fillin ${version}; SHA-256 ${metadata.sha256}`);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    stageRelease();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
