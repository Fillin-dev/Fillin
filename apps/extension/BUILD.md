# Building for Chrome Web Store

To create a production-ready build of the Fillin extension for submission to the Chrome Web Store, follow these exact steps:

1. **Open a terminal at the repository root.**

2. **Run the production build:**
   ```bash
   pnpm exec turbo run build --filter=@fillin/extension
   ```
   Run this command from the repository root. It builds the shared package first, then compiles the popup UI, background service worker, and content script (in IIFE format) into the extension's `dist/`, and packages its contents into `build/fillin-extension.zip`. The archive stays outside `dist/` so it cannot include itself on subsequent packaging runs. Building the extension does not modify the landing website.

3. **Verify the `dist/` directory:**
   Ensure your `dist/` directory contains:
   - `manifest.json`
   - `icon16.png`, `icon48.png`, `icon128.png`
   - `background.js`
   - `content.js`
   - `src/popup/index.html` (and associated assets)

4. **Verify the distribution archive:**
   The build creates `build/fillin-extension.zip` automatically, with `manifest.json` at its root, plus `build/release.json` containing its version, SHA-256, size, and file hashes. The package, source manifest, and built manifest versions must agree. To repackage an existing `dist/` without rebuilding, run `pnpm run package` from the extension directory.

5. **Upload to Chrome Web Store:**
   Upload `build/fillin-extension.zip` to the Chrome Developer Dashboard.

### Updating the website download

From the repository root, run:

```bash
pnpm release:extension
```

This repository-level release step builds the extension, validates its version and changelog entry, stages its archive and metadata into the website, builds the landing frontend, and verifies the resulting download. Ordinary extension and monorepo builds leave the website download unchanged.

Use `pnpm release:version <new-version>` to update the package and source manifest together, run `pnpm install --frozen-lockfile`, and add the version's notes to `CHANGELOG.md` before preparing a new release. A different archive cannot replace an existing version. See [the release guide](../../docs/development/releases.md) for the complete process.

### Security Notes
- No development URLs or secrets are bundled.
- We deliberately do not output source maps (`.map` files) to keep the extension footprint small and secure.
- The extension requests `storage` for local snippets, settings, and statistics, plus `clipboardWrite` for the Google Docs clipboard fallback. Its content script matches `<all_urls>` (including frames) so text expansion can work on websites. It does not request clipboard read access.
