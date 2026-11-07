import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  buildArchive,
  extensionVersion,
  inspectArchive,
  readJSON,
  validateVersion,
  verifyArchive,
} from '../apps/extension/scripts/release-utils.mjs';
import { stageRelease } from './stage-extension.mjs';
import { verifyRelease } from './verify-release.mjs';
import { setExtensionVersion } from './set-extension-version.mjs';

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'fillin-release-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const extension = path.join(root, 'apps/extension');
  const website = path.join(root, 'apps/landing/frontend/public');
  for (const dir of [
    path.join(extension, 'public'),
    path.join(extension, 'dist'),
    path.join(extension, 'build'),
    website,
  ])
    mkdirSync(dir, { recursive: true });
  const manifest = {
    manifest_version: 3,
    name: 'Fillin',
    version: '0.0.2',
    background: { service_worker: 'background.js' },
    action: { default_popup: 'popup.html' },
    content_scripts: [{ matches: ['<all_urls>'], js: ['content.js'] }],
  };
  writeFileSync(
    path.join(extension, 'package.json'),
    JSON.stringify({ name: '@fillin/extension', version: '0.0.2' }, null, 2)
  );
  for (const directory of ['public', 'dist'])
    writeFileSync(
      path.join(extension, directory, 'manifest.json'),
      JSON.stringify(manifest)
    );
  for (const name of ['background.js', 'content.js', 'popup.html'])
    writeFileSync(path.join(extension, 'dist', name), `test ${name}`);
  writeFileSync(
    path.join(root, 'CHANGELOG.md'),
    '# Changelog\n\n## [0.0.2] - 2026-11-07\n\n- Fixed reliability.\n'
  );
  const pack = () => {
    const result = buildArchive(
      path.join(extension, 'dist'),
      extensionVersion(extension)
    );
    writeFileSync(
      path.join(extension, 'build/fillin-extension.zip'),
      result.bytes
    );
    writeFileSync(
      path.join(extension, 'build/release.json'),
      JSON.stringify(result.metadata)
    );
    return result;
  };
  return { root, extension, website, pack };
}

test('same build contents produce the same ZIP despite changed filesystem timestamps', (t) => {
  const { extension, pack } = fixture(t);
  const first = pack();
  utimesSync(path.join(extension, 'dist/content.js'), new Date(), new Date());
  const second = pack();
  assert.deepEqual(second.bytes, first.bytes);
  assert.equal(second.metadata.sha256, first.metadata.sha256);
  assert.ok(inspectArchive(first.bytes, '0.0.2').files['manifest.json']);
});

test('rejects manifest version drift and missing entry points', (t) => {
  const { extension, pack } = fixture(t);
  const manifest = readJSON(path.join(extension, 'dist/manifest.json'));
  writeFileSync(
    path.join(extension, 'dist/manifest.json'),
    JSON.stringify({ ...manifest, version: '0.0.1' })
  );
  assert.throws(pack, /manifest.*version/);
  writeFileSync(
    path.join(extension, 'dist/manifest.json'),
    JSON.stringify(manifest)
  );
  rmSync(path.join(extension, 'dist/background.js'));
  assert.throws(pack, /missing.*entry point/);
});

test('rejects tampered checksums and files that no longer match the built release', (t) => {
  const { extension, pack } = fixture(t);
  const { bytes, metadata } = pack();
  assert.throws(
    () =>
      verifyArchive(bytes, { ...metadata, sha256: '0'.repeat(64) }, '0.0.2'),
    /SHA-256/
  );
  writeFileSync(path.join(extension, 'dist/content.js'), 'unreleased change');
  assert.throws(
    () => verifyArchive(bytes, metadata, '0.0.2', path.join(extension, 'dist')),
    /stale/
  );
});

test('stages and verifies the exact website download, metadata, and deployment output', (t) => {
  const { root, website, pack } = fixture(t);
  const { bytes, metadata } = pack();
  stageRelease(root);
  cpSync(website, path.join(root, 'apps/landing/frontend/dist'), {
    recursive: true,
  });
  verifyRelease(root);
  assert.deepEqual(
    readFileSync(path.join(website, 'fillin-extension.zip')),
    bytes
  );
  const release = readJSON(path.join(website, 'fillin-extension-release.json'));
  assert.equal(release.sha256, metadata.sha256);
  assert.equal(release.notes, '- Fixed reliability.');
});

test('does not overwrite an existing download when new release notes are missing', (t) => {
  const { root, extension, website, pack } = fixture(t);
  pack();
  stageRelease(root);
  const before = readFileSync(path.join(website, 'fillin-extension.zip'));
  writeFileSync(path.join(root, 'CHANGELOG.md'), '# Changelog\n');
  assert.throws(() => stageRelease(root), /no notes/);
  assert.deepEqual(
    readFileSync(path.join(website, 'fillin-extension.zip')),
    before
  );
  assert.equal(extensionVersion(extension), '0.0.2');
});

test('refuses different bytes under an already staged version', (t) => {
  const { root, extension, website, pack } = fixture(t);
  pack();
  stageRelease(root);
  const before = readFileSync(path.join(website, 'fillin-extension.zip'));
  writeFileSync(path.join(extension, 'dist/content.js'), 'changed code');
  pack();
  assert.throws(() => stageRelease(root), /Increase the version/);
  assert.deepEqual(
    readFileSync(path.join(website, 'fillin-extension.zip')),
    before
  );
});

test('detects a modified website ZIP and modified release notes', (t) => {
  const { root, website, pack } = fixture(t);
  pack();
  stageRelease(root);
  const archive = path.join(website, 'fillin-extension.zip');
  const before = readFileSync(archive);
  writeFileSync(archive, Buffer.concat([before, Buffer.from('changed')]));
  assert.throws(() => verifyRelease(root, false), /SHA-256/);
  writeFileSync(archive, before);
  const metadataPath = path.join(website, 'fillin-extension-release.json');
  writeFileSync(
    metadataPath,
    JSON.stringify({ ...readJSON(metadataPath), notes: 'wrong notes' })
  );
  assert.throws(() => verifyRelease(root, false), /release notes/);
});

test('detects a stale website production download even when public is correct', (t) => {
  const { root, website, pack } = fixture(t);
  pack();
  stageRelease(root);
  const deployed = path.join(root, 'apps/landing/frontend/dist');
  cpSync(website, deployed, { recursive: true });
  writeFileSync(path.join(deployed, 'fillin-extension.zip'), 'stale');
  assert.throws(() => verifyRelease(root));
});

test('updates package and manifest versions together and rejects downgrades', (t) => {
  const { root, extension } = fixture(t);
  setExtensionVersion('0.0.3', root);
  assert.equal(extensionVersion(extension), '0.0.3');
  assert.throws(() => setExtensionVersion('0.0.2', root), /greater/);
  assert.equal(extensionVersion(extension), '0.0.3');
  const manifestPath = path.join(extension, 'public/manifest.json');
  writeFileSync(
    manifestPath,
    JSON.stringify({ ...readJSON(manifestPath), version: '0.0.4' })
  );
  assert.throws(() => extensionVersion(extension), /versions differ/);
});

test('stages changed contents after a version increase and matching release notes', (t) => {
  const { root, extension, website, pack } = fixture(t);
  pack();
  stageRelease(root);
  setExtensionVersion('0.0.3', root);
  cpSync(
    path.join(extension, 'public/manifest.json'),
    path.join(extension, 'dist/manifest.json')
  );
  writeFileSync(path.join(extension, 'dist/content.js'), 'new release code');
  writeFileSync(
    path.join(root, 'CHANGELOG.md'),
    '# Changelog\n\n## [0.0.3]\n\n- New fixes.\n'
  );
  pack();
  stageRelease(root);
  verifyRelease(root, false);
  assert.equal(
    readJSON(path.join(website, 'fillin-extension-release.json')).version,
    '0.0.3'
  );
});

test('rejects versions that Chrome or the release convention cannot accept', () => {
  for (const version of [
    '0.0.0',
    '01.2.3',
    '1.2',
    '1.2.3-beta',
    '1.2.65536',
    undefined,
  ]) {
    assert.throws(() => validateVersion(version));
  }
  assert.equal(validateVersion('1.2.3'), '1.2.3');
});
