# Extension releases

The extension package and source manifest use the same three-part numeric version. The website displays the version from its generated release metadata and downloads `fillin-extension-<version>.zip`.

## Prepare the next release

From the repository root, using the pinned pnpm version:

```bash
corepack pnpm release:version 0.2.0
corepack pnpm install --frozen-lockfile
```

The version command updates `apps/extension/package.json` and `apps/extension/public/manifest.json` together. Choose a version greater than the existing one; prerelease suffixes, leading zeros, and components above 65535 are rejected. Refresh the workspace installation after changing the package version.

Add a matching version entry such as `## [0.2.0] - YYYY-MM-DD` to the root `CHANGELOG.md`, with bullet points describing what changed. Then run:

```bash
corepack pnpm release:extension
```

This single preparation command:

1. Builds the shared package and extension from source, bypassing old build caches.
2. Packages `apps/extension/dist` into `apps/extension/build/fillin-extension.zip` and writes `build/release.json` with the version, size, SHA-256, and hashes of all archived files.
3. Validates the manifest version, required entry points, file contents, and changelog before replacing the website download.
4. Copies the ZIP and release metadata into `apps/landing/frontend/public`, including the release notes.
5. Builds the landing frontend and verifies both its public files and deployment output.

Normal extension builds write only inside the extension. The repository-level release command coordinates copying the download to the website; the extension has no dependency on either landing app.

Commit the version changes, changelog, website ZIP, and `public/fillin-extension-release.json` together. This prepares files for deployment; it does not publish a GitHub release, push a commit, or deploy the website.

## Verify a release

After production builds, run:

```bash
corepack pnpm verify:release
```

Verification compares package and manifest versions, release notes, archive checksums, all archived file contents, and the website's built download. CI runs this check on every pull request and push to `main`. Changes to extension build contents require a version increase and a refreshed website download before CI can pass. A different ZIP cannot replace an already staged release under the same version.

ZIP entries are sorted and use fixed timestamps and file permissions, so changing filesystem modification times does not change the archive checksum.

## Check a downloaded ZIP

The website's **Release notes & SHA-256** link opens `/fillin-extension-release.json`, which records the intended version and checksum. On macOS, calculate the downloaded archive's checksum with:

```bash
shasum -a 256 ~/Downloads/fillin-extension-0.0.2.zip
```

Compare that output with the metadata's `sha256` value. Use the appropriate filename for the version downloaded. The ZIP's root `manifest.json` must report the same version.
