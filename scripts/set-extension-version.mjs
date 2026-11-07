import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compareVersions,
  readJSON,
  validateVersion,
} from '../apps/extension/scripts/release-utils.mjs';
import { repositoryRoot } from './stage-extension.mjs';

export function setExtensionVersion(version, root = repositoryRoot) {
  validateVersion(version);
  const packagePath = path.join(root, 'apps/extension/package.json');
  const manifestPath = path.join(root, 'apps/extension/public/manifest.json');
  const pkg = readJSON(packagePath);
  const manifest = readJSON(manifestPath);
  if (
    compareVersions(version, pkg.version) <= 0 ||
    compareVersions(version, manifest.version) <= 0
  ) {
    throw new Error(
      'The new release version must be greater than the current package and manifest versions.'
    );
  }
  for (const file of [packagePath, manifestPath]) {
    const text = readFileSync(file, 'utf8');
    writeFileSync(
      file,
      text.replace(
        /("version"\s*:\s*")[^"]+("\s*[,}])/,
        (_match, prefix, suffix) => `${prefix}${version}${suffix}`
      )
    );
  }
  console.log(
    `Set extension package and manifest to ${version}. Run pnpm install --frozen-lockfile, add CHANGELOG.md notes, then run pnpm release:extension.`
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    setExtensionVersion(process.argv[2]);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
