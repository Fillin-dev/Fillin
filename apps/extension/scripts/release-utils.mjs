import AdmZip from 'adm-zip';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export const sha256 = (bytes) =>
  createHash('sha256').update(bytes).digest('hex');
export const readJSON = (file) => JSON.parse(readFileSync(file, 'utf8'));

export function validateVersion(version) {
  if (
    typeof version !== 'string' ||
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version) ||
    version.split('.').some((part) => Number(part) > 65535) ||
    version === '0.0.0'
  ) {
    throw new Error(
      'Use a three-part Chrome-compatible version, such as 0.0.2 (integers 0–65535, no leading zeros).'
    );
  }
  return version;
}

export function compareVersions(left, right) {
  const a = validateVersion(left).split('.').map(Number);
  const b = validateVersion(right).split('.').map(Number);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return Math.sign(a[i] - b[i]);
  return 0;
}

export function extensionVersion(directory) {
  const version = validateVersion(
    readJSON(path.join(directory, 'package.json')).version
  );
  if (
    readJSON(path.join(directory, 'public/manifest.json')).version !== version
  ) {
    throw new Error(
      'Extension package and source manifest versions differ. Run pnpm release:version <new-version>.'
    );
  }
  return version;
}

export function directoryFiles(directory, prefix = '') {
  const files = Object.create(null);
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort(
    (a, b) => a.name.localeCompare(b.name, 'en')
  )) {
    const name = prefix + entry.name;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory())
      Object.assign(files, directoryFiles(file, name + '/'));
    else if (entry.isFile()) files[name] = readFileSync(file);
    else throw new Error(`Unexpected non-file in extension build: ${name}`);
  }
  return files;
}

export function fileHashes(files) {
  return Object.fromEntries(
    Object.keys(files)
      .sort()
      .map((name) => [name, sha256(files[name])])
  );
}

function sameFiles(actual, expected) {
  return (
    JSON.stringify(fileHashes(actual)) === JSON.stringify(fileHashes(expected))
  );
}

export function inspectArchive(bytes, version) {
  const files = Object.create(null);
  for (const entry of new AdmZip(bytes).getEntries()) {
    const name = entry.entryName;
    if (entry.isDirectory) continue;
    if (
      Object.hasOwn(files, name) ||
      name.startsWith('/') ||
      name.includes('\\') ||
      name.split('/').includes('..')
    ) {
      throw new Error(`Unsafe or duplicate archive entry: ${name}`);
    }
    files[name] = entry.getData();
  }
  if (!files['manifest.json'])
    throw new Error('Archive must contain manifest.json at its root.');
  const manifest = JSON.parse(files['manifest.json'].toString('utf8'));
  validateVersion(manifest.version);
  if (version && manifest.version !== version)
    throw new Error(
      'Archive manifest does not match the intended release version.'
    );
  const required = [
    manifest.background?.service_worker,
    manifest.action?.default_popup,
    ...Object.values(manifest.icons || {}),
    ...(manifest.content_scripts || []).flatMap((script) => script.js || []),
  ];
  for (const name of required)
    if (!name || !files[name])
      throw new Error(`Archive is missing a manifest entry point: ${name}`);
  return { manifest, files };
}

export function buildArchive(directory, version) {
  const files = directoryFiles(directory);
  const zip = new AdmZip();
  for (const name of Object.keys(files).sort()) {
    zip.addFile(name, files[name], '', 0o644);
    // Stable ZIP metadata: identical build contents produce identical archives.
    zip.getEntry(name).header.time = new Date(2000, 0, 1, 0, 0, 0);
  }
  const bytes = zip.toBuffer();
  const inspected = inspectArchive(bytes, version);
  if (!sameFiles(inspected.files, files))
    throw new Error('Packaged files do not match the extension build.');
  return {
    bytes,
    metadata: {
      version,
      archive: 'fillin-extension.zip',
      sha256: sha256(bytes),
      size: bytes.length,
      files: fileHashes(files),
    },
  };
}

export function verifyArchive(bytes, metadata, version, directory) {
  const inspected = inspectArchive(bytes, version);
  if (
    metadata.version !== version ||
    metadata.archive !== 'fillin-extension.zip' ||
    metadata.sha256 !== sha256(bytes) ||
    metadata.size !== bytes.length ||
    JSON.stringify(metadata.files) !==
      JSON.stringify(fileHashes(inspected.files))
  ) {
    throw new Error('Release metadata or SHA-256 does not match the ZIP.');
  }
  if (directory && !sameFiles(inspected.files, directoryFiles(directory))) {
    throw new Error(
      'The download is stale: its files differ from the current extension build. Run pnpm release:extension.'
    );
  }
  return inspected;
}
