# Dynamic date/time snippets (phase 1, local development)

Included in extension release 0.1.0.

## Using it

Create or edit a plain-text snippet and enable **Use template values**. Supported values are `{{date}}`, `{{time}}`, and `{{datetime}}`. Insert-token buttons place them at the text selection. The editor shows a current example; expansion recalculates from one fresh local timestamp.

- Date: English abbreviated month/day/year by default, matching the old starter's appearance. Choose ISO for local `YYYY-MM-DD`.
- Time: local hour/minute, using the browser's language convention.
- Date/time: the selected date format followed by local time.
- Escape a token with a backslash, for example `\{{date}}`, to insert literal braces in an enabled template.

New starter packs include dynamic `/today`, `/time`, and `/now`. Starter loading skips any existing trigger. Existing snippets, including old fixed-date `/today` values, stay unchanged.

To convert an old `/today`, edit it and choose **Make /today show the current date**. Inspect the changed content and preview, then save. Going back before saving discards the conversion. To return a template to literal behavior, uncheck **Use template values** and save.

## Compatibility

Only plain text supports dynamic values in this phase. Fill-in fields, `{{cursor}}`, suggestions, and selection capture are later phases. Unknown tokens are rejected only when template mode is enabled; literal snippets can contain braces or programming examples unchanged.

Phase 4 now adds [fill-in fields](template-fields.md) to enabled templates. Dates still use one timestamp per expansion, including time spent completing a dialog. The Google Docs field-template path explicitly copies without deleting the trigger; the older date-only fallback described below is unchanged.

Metadata (`templateVersion: 1`, optional `dateFormat`) survives storage, edits, backup JSON, and supported imports. Older Fillin versions do not understand it and can lose that metadata on import; use a version supporting templates to restore these backups. Unsupported future template versions are rejected by stored-library validation or skipped during import, preserving matching saved content.

Both keyboard and palette expansion use the same resolver. Statistics count final rendered text only after an adapter confirms insertion. Google Docs' existing clipboard fallback reports copied/failed outcomes; copying is not recorded as a confirmed insertion. Live Google Docs compatibility still needs a manual check before release; its existing deletion-before-insert fallback limitation is not solved by this phase.

## Validation

Shared tests cover leap day, year boundaries, repeated and escaped tokens, schema compatibility, and a New York daylight-saving jump (run the shared tests with `TZ=America/New_York`). Coordinator tests use a fake clock crossing midnight while the saved template remains unchanged.

Installed Chromium tests cover current-date insertion through the hotkey and palette, unchanged literal tokens, persistence, and the actual editor's template controls. The simulated clock test verifies midnight; the installed browser test uses real local time rather than claiming to override the content script's isolated-world clock.

Build and load `apps/extension/dist` for local review. A later release must choose a new extension version, update the changelog, explicitly stage the website ZIP, and verify it before deployment. The website archive for this release is 0.1.0; verify it using the published release metadata.
