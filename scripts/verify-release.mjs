import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extensionVersion,
  readJSON,
  sha256,
  verifyArchive,
} from '../apps/extension/scripts/release-utils.mjs';
import { releaseNotes, repositoryRoot } from './stage-extension.mjs';

export function verifyRelease(
  root = repositoryRoot,
  includeWebsiteBuild = true
) {
  const extension = path.join(root, 'apps/extension');
  const version = extensionVersion(extension);
  const metadata = readJSON(path.join(extension, 'build/release.json'));
  const builtZip = readFileSync(
    path.join(extension, 'build/fillin-extension.zip')
  );
  verifyArchive(builtZip, metadata, version, path.join(extension, 'dist'));
  const notes = releaseNotes(root, version);
  for (const directory of [
    'public',
    ...(includeWebsiteBuild ? ['dist'] : []),
  ]) {
    const website = path.join(root, 'apps/landing/frontend', directory);
    const bytes = readFileSync(path.join(website, 'fillin-extension.zip'));
    const release = readJSON(
      path.join(website, 'fillin-extension-release.json')
    );
    verifyArchive(bytes, release, version, path.join(extension, 'dist'));
    if (sha256(bytes) !== sha256(builtZip))
      throw new Error(
        `Website ${directory} ZIP does not match the packaged release.`
      );
    if (release.notes !== notes)
      throw new Error(
        `Website ${directory} release notes do not match CHANGELOG.md.`
      );
  }
  console.log(
    `Verified Fillin ${version}: package, manifest, changelog, website ZIP, and SHA-256 agree.`
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    verifyRelease();
  } catch (error) {
    console.error(
      `Release verification failed: ${error.message}\nRun pnpm release:extension to prepare the intended download.`
    );
    process.exitCode = 1;
  }
}
