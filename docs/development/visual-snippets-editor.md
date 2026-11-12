# Visual snippets: phase 4 editor and practice

Status: phase 4 implemented locally, not released. This document records the phase 4 checkpoint. Website insertion and full media backups have since been implemented in [phases 5 and 6](visual-snippets-web-backups.md), which supersede the restrictions below.

## Try the local build

Build the extension, reload the unpacked extension on Chrome's extensions page, then open Fillin and choose **Image / GIF** beside **Create Snippet**. This opens a dedicated extension tab; switching back to a webpage does not close the draft.

1. Drop one PNG, JPEG or GIF onto the file panel, or use **Choose file**. The native file input is keyboard accessible. Remote URLs, dropped HTML and multiple-file drops are not accepted.
2. Enter a unique shortcut, optional comma-separated tags, literal caption and optional image description. Captions do not resolve template fields in this release.
3. Choose **Save image** or **Save and try**. Saving uses the phase 3 staged-commit protocol; a failed save leaves the draft and previous saved snippet intact.
4. In the practice field, type the shortcut with the caret immediately after it. Use **Ctrl + Space** or **Preview shortcut**, review the image/caption and explicitly choose Insert. Cancel/Escape leaves the typed trigger intact.
5. Keep typing after the inserted content, or use normal browser undo. **Reset field** clears only practice. Practice does not write statistics or change saved captions.

Open a media row from the popup to edit it or return to practice. The popup updates when another extension page saves/deletes a snippet. Type filters separate text from images/GIFs; search also matches captions, descriptions, filenames and tags.

## Presentation and interaction

- The editor uses the existing ink/blue styling, light panels, restrained yellow local-storage badges and consistent focus rings. Desktop uses two columns; narrow windows stack the panels. It has independent root dimensions and scrolling, preserving the toolbar popup's fixed sizing.
- Library thumbnails load when rows enter view and remain still. The popup does not decode/animate every original while searching.
- GIF previews use the generated still poster until **Play GIF** is chosen. Pause switches back to that still. Playback stops when the document is hidden or reduced-motion preference is enabled.
- The confirmation dialog offers image-only versus image-plus-caption insertion. GIFs additionally offer animation or a still preview; reduced-motion users default to the still. Selecting a still never changes the original saved GIF.
- Confirmation dialogs contain keyboard focus, support Escape/Cancel and ignore composition Escape. The practice field regains typing focus after insertion, including when the preview was opened from its keyboard-focused button.
- Descriptions populate the inserted image's alternative text; captions are constructed as text nodes, so HTML-like strings stay literal. Dialog statuses and failures have accessible status/alert roles.
- Dirty editor close/reload actions ask before discarding changes. A native before-unload prompt is installed only while a draft is dirty or work is pending; browser limitations mean this is not an autosave guarantee.

## Preparation and file lifecycle

File inspection, pixel decoding and thumbnail generation run in a dedicated extension Web Worker. Cancelling or replacing a preparation request terminates its worker. A 30-second timeout and worker error/message failure handling leave the previous preview/draft intact. A WeakMap caches a validated result for the same immutable file, avoiding a second decode when saving it; entries are not retained after the file is otherwise unreachable.

Workers transport Blobs through the normal Web Worker structured-clone channel. This is distinct from phase 5's future Chrome runtime JSON message transport. No content-script media API or external upload service was added.

Preview object URLs are released when their Blob changes or the preview unmounts. Original downloads use a temporary URL and sanitized filename, await source validation and report a download start rather than a completed disk write or insertion. Downloading a GIF preserves its original bytes.

Media usage and unavailable-file checks run when the editor opens. After successful reconciliation, the editor makes one best-effort age-based orphan cleanup attempt using the existing lock, fresh metadata validation, leases and 24-hour grace. A failed cleanup leaves unused assets for a later visit and does not change snippet metadata.

## Safety and concurrent changes

- Duplicate triggers are checked against both text and media records, with another check inside the mutation lock.
- The editor keeps the loaded record revision as its save precondition. An external edit/deletion displays a reload notice and disables saving; reloading a dirty draft requires confirmation.
- Metadata read failures block saving without clearing the form. Missing originals keep the metadata/form visible and allow selecting a replacement. The phase 3 restriction on repairing an already corrupted same-hash original in place remains; the service never silently overwrites an immutable stored asset.
- The practice preview captures a bookmark before asynchronous file loading. It checks the original target and saved revision again before insertion. Changed/removed content cancels insertion; uncertain partial results produce an error and no automatic retry or clipboard fallback.
- Practice insertion uses one native rich edit transaction with an exact trigger range, known image/caption nodes and postcondition checks. It then places the caret after the result. This technique is not activated for arbitrary webpage editors in phase 4.
- Text shortcut expansion, palette and suggestions continue to exclude media. No media shortcut can be mistaken for empty text and erase a website trigger while the website insertion feature is incomplete.

## Backup boundary

This is a local review build. The editor and popup explicitly state that media works in practice and full image backups are not available yet. Users can download original files individually. Legacy JSON export refuses a mixed library instead of pretending to back up media; JSON import cannot overwrite media shortcuts. Media deletion tells users to keep the original from its editor first.

Do not stage or publish this as the completed visual-snippet release before phase 6 adds the full archive/restore flow. No extension version, manifest permission, landing frontend/backend or staged website ZIP was changed.

## Validation

- Installed-browser UI checks cover file selection, actual file drops, multiple-file rejection, invalid uploads, duplicate shortcuts, literal captions, description text, preview/cancel/confirm, cursor placement, undo, original download hashes, static/animated GIF controls, reduced-motion insertion, popup thumbnails/search/type filters, failed-save retry, concurrent editors, dirty reload confirmation, dialog keyboard navigation, stale targets and missing-file replacement.
- A separate installed-browser check creates media through the real UI, fully closes/reopens Chromium with the same profile, finds the image in the popup, reopens it and uses its confirmed practice shortcut.
- Worker unit checks cover cancellation/late messages, invalid results, timeout cleanup and reuse of already validated files.
- Desktop and 390-pixel screenshots were inspected. Tests assert no horizontal document overflow in the narrow layout. This does not replace manual VoiceOver/NVDA review, which remains a release check.

Local checks passed: 229 extension unit tests, extension/browser-test typechecks and the production extension build. The complete installed-browser run passed 93 tests; the additional full UI/browser-restart check passed, and all eight media UI/restart checks passed again after the final keyboard-focus correction. That covers 94 distinct browser checks. The existing toolbar sizing and text/template regression checks remained green. The website download was not staged or published.

Build and check from the repository root:

```sh
corepack pnpm --filter @fillin/shared build
corepack pnpm --filter @fillin/extension typecheck
corepack pnpm --filter @fillin/extension test
corepack pnpm --filter @fillin/extension build
corepack pnpm --filter @fillin/extension exec playwright test
```

Stop after phase 4 for review. Phase 5 will add selected-asset messaging, caret-adjacent webpage previews, verified destination adapters and explicit fallbacks. It must reuse the confirmation rules and validate every supported destination rather than infer support from contenteditable.
