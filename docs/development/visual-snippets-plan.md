# Visual snippets: implementation plan

Status: phases 1–7 complete locally; release 0.2.0 prepared and verified. [Phase 2 results](visual-snippets-feasibility.md) confirm the browser foundations; [phase 3](visual-snippets-storage.md) adds storage; [phase 4](visual-snippets-editor.md) adds the editor and practice flow; [phases 5 and 6](visual-snippets-web-backups.md) add webpage previews and portable backups. See the [phase 7 release review](visual-snippets-release.md). GitHub publication and website deployment remain separate actions.
Prepared: 2026-11-12. Baseline: extension 0.1.0.

## Product outcome

A person can drop an image or GIF into Fillin, assign a shortcut, tags and an optional caption, practise using it, confirm insertion into a supported editor, and export/restore a backup containing the original media.

Success means the file survives a browser restart and a backup round trip, existing text snippets still work, and Fillin accurately distinguishes insertion, copying and downloading. A preview alone does not demonstrate successful delivery through another application.

## First-release scope and defaults

- Local PNG, JPEG and GIF files, one file per snippet. GIF originals retain their bytes and animation; only thumbnails may be static.
- Shared shortcut namespace with existing text snippets. Existing duplicate-trigger checks apply across both types.
- Optional plain-text caption below the image; alternative text is a separate field. Default alternative text is empty, with a prompt to describe instructional images.
- Captions and alternative text are literal in this release. Template fields, HTML captions, resizing originals, cropping, annotations, screenshots, remote image fetching, video and multiple-image snippets are deferred.
- All media stays in the extension until the user explicitly previews it on a page, inserts, copies, downloads or exports it. No hosting, accounts or network upload service.
- Use existing Ctrl+Space, command palette and opt-in suggestions. Media always requires an explicit preview confirmation, even when text expansion is immediate.
- A persistent extension editor tab supports file creation and practice so clicking back on a webpage does not destroy an unsaved popup draft. The compact popup remains the library entry point.
- No new Chrome permission is planned. If an essential capability requires one, revise this plan before implementation rather than silently expanding permissions.

Provisional product limits, to be confirmed by phase 2 measurements:

| Item | Initial limit |
| --- | --- |
| Original file | 10 MiB |
| Total referenced original media | 50 MiB |
| Dimensions | At most 8,192 pixels on either axis and 12 million pixels per frame |
| GIF decoding budget | At most 300 frames and 200 million cumulative frame pixels |
| Caption | 2,000 UTF-16 code units |
| Alternative text | 300 UTF-16 code units |
| Thumbnail | Longest side 256 pixels; at most 128 KiB |
| Imported backup | At most 80 MiB compressed and 80 MiB total expanded content, with per-entry limits |

These are application limits, not a promise of available disk quota. Preflight storage estimates and handle actual quota failures without changing saved data. Show size and actionable errors; never silently shrink or flatten an original.

## User journey

### Create and edit

1. Choose **Create snippet → Image or GIF** in the popup. Open/focus an extension editor tab.
2. Show a bordered drop zone with **Choose file** as an equivalent keyboard-accessible action. Accept one local file, not arbitrary dropped HTML or URLs.
3. Validate bytes, format, dimensions and decode budgets before previewing. Show a loading state and allow cancellation. Explain unsupported, damaged and oversized files separately.
4. Show a contained preview, original filename, format, dimensions and size. GIFs start paused in the editor; an explicit play control starts animation. Respect reduced motion.
5. Enter `/setup`, optional tags, caption and alternative text. Detect duplicate triggers as the person types.
6. **Save** commits only after file persistence and metadata persistence succeed. Prevent double submission. A failed save keeps the draft and old saved version available to retry.
7. **Save and try** moves to practice. Closing a dirty editor warns about discarding; no persistence of unsaved media is implied.

Changing a file creates a new immutable asset reference. Existing data remains intact until Save completes. Cancel discards only the draft.

### Library

- Text and media appear in one list with **All / Text / Images & GIFs** filters alongside existing tags.
- Media rows have a static thumbnail, trigger, format badge and shortened caption. Search matches trigger, tags, caption, alternative text and original filename.
- Lazy-load visible thumbnails; do not decode all originals or animate GIFs while scrolling.
- A missing asset affects that row only: **File unavailable — replace file or restore a backup**. It must not make the whole library appear empty.
- Show media usage and a backup action in the media editor/library details, without crowding the popup toolbar.

### Practice

- Provide a labelled rich-text practice editor inside Fillin with initial instructions and a reset button.
- Type the saved trigger and press Ctrl+Space. Open the same preview/confirmation controller used on webpages, adapted to the extension context.
- **Insert image** or **Insert image + caption** inserts only after confirmation. Show **Inserted in practice** and keep keyboard focus after the result.
- Escape/Cancel leaves the original trigger unchanged. Repeated invocation must not open duplicate previews.
- Practice never increments statistics, writes captions into settings or requests a clipboard write automatically.

### On a webpage

- Capture a target bookmark before opening the preview. Fetch only the selected asset, not the whole binary library.
- Place a bounded preview beside the caret when reliable geometry exists; otherwise use a small dialog inside the viewport. Keep actions visible on narrow screens and at browser zoom.
- Show a static GIF poster and an explicit Play/Pause control. Do not animate search results or suggestions by default.
- Primary action depends on verified destination support. Caption selection offers image only / image + caption when a caption exists.
- Recheck the target, original trigger/range, snippet revision, asset existence and site policy before mutation. Cancellation, navigation, target edits, snippet edits/deletion or newly blocked sites invalidate insertion.
- After successful insertion, place the caret after the inserted content, preserve surrounding content and verify the result. Disable repeat submission while processing.
- Do not automatically retry a possibly partial mutation or automatically copy after an uncertain result: explain the failure so retry cannot duplicate content.

## Capability and fallback policy

| Destination | Initial behavior |
| --- | --- |
| Fillin practice editor | Confirmed image/GIF and literal caption insertion; required release gate |
| Tested ordinary contenteditable | Direct insertion only after phase 2 validates persistence and undo behavior |
| Native input/textarea | Explain that images cannot be inserted here; offer download and, when present, explicit Copy caption |
| Gmail, Notion, chat applications and other managed editors | Unsupported until an application-specific adapter is manually verified; do not infer support merely from contenteditable |
| Google Docs canvas | Download original; optional explicit static-image copy only if verified; no destructive trigger replacement |
| Password, OTP, disabled/readonly fields and blocked sites | No media preview, asset retrieval or insertion |

- **Download original** preserves the actual image/GIF file, with a sanitized filename. It is not an attachment or insertion. No fake public link for local files.
- **Copy image** is optional and limited to a tested static PNG clipboard path. It requires an explicit click, awaits success and reports **Image copied — paste it in your editor**. Conversion must be labelled; never present a flattened GIF as an animated copy.
- Copy caption copies plain text only. No silent changes to the clipboard.
- Unknown editors get clear fallbacks. Never advertise universal compatibility. A locally visible data/blob URL is insufficient proof that an application will upload, send or persist the image.
- If even ordinary editable insertion cannot meet persistence/undo gates, return to review before implementation; do not quietly redefine the feature as downloading files.

## Architecture and storage

Preserve extension/landing/backend separation. No media storage, Chrome APIs, DOM code or React components enter the shared package.

### Shared model

- Retain acceptance of legacy text records without a type discriminator.
- Add an explicit media variant with `kind: 'media'`, existing identity/trigger/tag/timestamps, `assetId`, format, original filename, byte size, dimensions, caption and alternative text.
- Reject text-template, cursor and HTML options on media records. All consumers must branch on the variant before attempting text resolution.
- Validators must distinguish unsupported future versions from corrupt data; do not silently strip media fields and treat a media record as text.
- Pure schema, size rules, backup manifest models and normalization belong in shared. Byte decoding, hashing, IndexedDB, file downloads and DOM rendering belong in the extension.

### Asset repository

Keep canonical snippet metadata in the existing `chrome.storage.local` library. Store original Blobs and bounded thumbnails in extension-origin IndexedDB, keyed by a SHA-256 content ID; identical bytes can be shared by multiple snippets.

This avoids moving the existing text library or putting base64 originals into its JSON array. It also introduces two storage systems, so the write protocol must explicitly handle interruption:

1. Validate and hash a candidate outside the mutation lock.
2. Acquire the same library lock used by text writes, media writes, import, backup snapshot acquisition and cleanup. Re-read and validate the current library; recheck quota and conflicts.
3. Persist immutable originals/thumbnails, verify successful transaction completion, then commit the complete new metadata array in one storage write.
4. If blob writing fails, do not change metadata. If metadata writing fails, leave the previous metadata and assets untouched. An unreferenced new blob is recoverable garbage, not a broken saved snippet.
5. Deletion removes metadata first. Never delete an old original as part of replacing it before commit.
6. Cleanup runs separately under the same lock, only after a successful complete metadata read and after active export/insertion snapshots have released their asset leases. Age unreferenced assets for at least 24 hours. Never run cleanup after a read/validation error.
7. A crashed extension can leave unused assets; startup reconciliation reports missing references and schedules safe orphan cleanup. It must not delete valid snippets or reset the library.

All asset deletion/mutation paths must honor this protocol. The lock must coordinate extension tabs and the worker; the in-memory fallback alone is insufficient across contexts. Check Web Locks availability in the actual installed extension before enabling mutations. Never silently bypass the lock.

The local development preview uses its own origin's IndexedDB and never pretends to share the installed extension's library.

### Content-script access

- Content scripts request one selected asset from the worker; they do not open IndexedDB on the webpage's origin.
- Use validated JSON messages with bounded chunked byte transfer (initial target 256 KiB chunks), transfer IDs, declared lengths, timeouts, cancellation and final hash verification. Do not assume Chrome messages transport Blobs.
- Validate sender extension ID, tab/frame, operation, snippet revision and current block policy. No page `postMessage` bridge, external messaging API or arbitrary asset-ID enumeration.
- Trusted extension editor pages may create/update assets; content-script messages are read-only and limited to the explicitly selected snippet. No binary library broadcast through storage-change listeners.
- Release temporary URLs, buffers, listeners and bookmarks on close/failure/navigation. Avoid persistent data URLs in metadata and never log original bytes or captions.
- Preview UI in page Shadow DOM is style isolation, not a security boundary. The host can observe content presented or inserted in its document. Do not promise hidden media after previewing on that page.

### Insertion coordinator

- Add a media branch to the existing expansion coordinator, before template/text processing. Hotkey, palette and suggestions share it.
- Add explicit media capabilities/results to adapters rather than passing arbitrary saved HTML to `replaceText`.
- Construct only known image/caption nodes from validated assets; use `textContent` for captions/alternative text and sanitize filenames. Never accept SVG, uploaded HTML, remote URLs or event handlers as media content.
- Verify support through an adapter contract and tests, not `execCommand`'s boolean alone. Prove trigger-only replacement, caret placement, surrounding formatting, host acceptance and one-step undo where direct insertion is claimed.
- Continue existing text statistics unchanged. Do not count file bytes, base64 length or caption characters as keystrokes saved for media. A separate insertion counter can be considered later.

## Portable backup and restore

- New **Export full backup** creates `fillin-backup-YYYY-MM-DD.zip` containing a versioned `manifest.json` and originals under `media/<sha256>.<ext>`. Thumbnails are derived and can be regenerated.
- Manifest declares format version, minimum reader version, all snippet metadata and each asset's type, size, dimensions and SHA-256. It includes no local absolute paths, object URLs or preview state.
- Use a browser-compatible ZIP library with bounded streaming extraction; do not bundle a Node-only ZIP implementation into the extension.
- Snapshot metadata and acquire asset leases under the library lock, then read/validate originals outside it. A missing/corrupt file fails full export clearly; no incomplete backup presented as complete.
- Preserve legacy text-only JSON import/export. An explicitly labelled text-only export warns that it excludes media and never includes broken asset references.
- Import detects old JSON versus the versioned ZIP. Unknown versions fail without mutation.
- Preflight every entry before commit: paths, duplicate names, declared/actual lengths, aggregate expanded limits, MIME/bytes, decode limits, hashes, IDs, trigger conflicts and complete asset references. Reject traversal, unexpected entries, symlinks, nested archives and decompression bombs.
- Show import counts and conflicts before applying. Default conflicts to **Keep existing**, with explicit **Replace matching shortcuts**; re-evaluate against the latest library while holding the write lock.
- Stage all valid originals, then commit one validated merged metadata array. Any failure preserves the old library; unused staged files can be cleaned later.
- Backup round-trip must reproduce exact original GIF bytes, captions, tags and asset references in a fresh browser profile. A checksum proves byte integrity, not trust or safety of the content.

## Build phases and review gates

Stop after each phase and wait for the next phase instruction, as required by AGENTS.md.

| Phase | Work | Required review evidence |
| --- | --- | --- |
| 1 — Plan (this change) | Inspect current model, storage, insertion and backups; settle scope and failure policies | This document; no runtime changes |
| 2 — Feasibility (complete) | Isolated installed-extension spike: Blob persistence, JSON chunk messaging, GIF preservation, direct rich-text insertion, undo, original download and static clipboard if feasible | Nine browser checks; [results, measurement limits and compatibility matrix](visual-snippets-feasibility.md) |
| 3 — Data foundation (implemented locally) | Media schema, IndexedDB assets, shared mutation lock, validation, staged commits, leases and cleanup | [Storage design and validation](visual-snippets-storage.md); no media exposed in public UI yet |
| 4 — Create and practise (implemented locally) | Editor tab, drop/file chooser, thumbnails, media form, library filters, practice field and confirmation UI | [Editor usage and validation](visual-snippets-editor.md); keyboard, reduced motion and saved-file recovery checks |
| 5 — Web insertion (implemented locally) | Shared coordinator, safe bookmarks, cursor preview, palette/suggestions, supported adapters and honest fallbacks | Installed Chromium checks for native rich-text fields and safe fallbacks; no managed application is claimed as directly supported |
| 6 — Portable backups (implemented locally) | ZIP export/import, legacy compatibility, preflight/conflicts and atomic metadata commit | Fresh-profile restore, byte-for-byte originals, malformed/oversized archive, interrupted restore and explicit repair tests |
| 7 — Release verification (complete locally) | Integrated regression, accessibility/performance pass, usage docs and release notes | 104 installed-extension and 40 website browser checks passed; 0.2.0 ZIP and website copy verified; [review and limits](visual-snippets-release.md) |

Do not publish phases 3–5 as a finished feature before media backup/restore is complete. Publishing to GitHub and the live website remains a separate explicitly authorized release step.

## Test and acceptance checklist

- Model: legacy text, media variants, invalid combinations, conflicting triggers and unsupported backup versions.
- Files: valid PNG/JPEG/GIF, spoofed extensions/MIME, truncation, zero bytes, excessive dimensions/frame budgets, cancelled decoding and thumbnail failures. Validate before expensive decode; bound parser loops.
- Storage: failed reads never become empty libraries; failed writes retain originals; concurrent text/media saves, replacements, deletions and exports; shared assets; worker restart; quota denial; cleanup cannot collect in-flight assets.
- Editor: mouse/keyboard file selection, drop, duplicate trigger, literal caption, replacement/cancel, failed save/retry, persisted original and bounded static library thumbnails.
- Practice/insertion: hotkey/palette/suggestion routes, confirmation-only mutation, cancel, IME, double click, focus restoration, middle-of-text insertion, surrounding formatting, undo, stale range, target removal, changed snippet and changed site block policy.
- Protection: password/OTP/readonly/disabled fields, blocked domains/subdomains, frames and hostile/invalid messages. No media reading in excluded fields.
- Outcomes: copied only after successful clipboard completion; download-started rather than inserted; unavailable formats have a visible explanation; no accidental GIF flattening.
- Backups: media/text mix, shared original deduplication, exact GIF hash round-trip, legacy JSON, conflicts, missing entries, invalid paths/hashes, bounded extraction, storage failure halfway through restore and concurrent library edits.
- Accessibility: labelled file input and practice editor, visible focus, screen-reader status/errors, modal focus containment/restoration, reduced motion, GIF Play/Pause and 390-pixel viewport/zoom.
- Performance: no binary payloads during typing/search, no mass original decoding, bounded transfers/decodes, no leaked object URLs after repeated previews, and responsive save/import progress at the proposed limits.
- Regression/release: shared/extension typechecks and unit tests, installed Chromium suite, production builds, website theme tests if touched, then existing release checksum verification. Do not alter release versions or staged website downloads during implementation phases.

## Current code integration points

- `packages/shared/src/models/snippet.ts`: backward-compatible schema and explicit media variant.
- `apps/extension/src/services/SnippetService.ts`: creation/edit/import semantics and shared trigger uniqueness.
- `apps/extension/src/storage/`: asset repository, coordinated writes, recovery and validation.
- `apps/extension/src/background/index.ts`: validated media request handling.
- `apps/extension/src/components/SnippetForm.tsx`, `SnippetList.tsx` and popup: editor entry point, filters and thumbnails.
- New extension editor entry point alongside `apps/extension/vite.config.ts` inputs; no landing app dependency.
- `apps/extension/src/content/expansion/ExpansionCoordinator.ts`, adapter contracts, bookmarks and caret geometry: media preview and confirmed insertion.
- `apps/extension/src/utils/exportBackup.ts`, import hook/list flow and first-use guide: complete media-aware backups without breaking legacy text workflows.
- `apps/extension/e2e/`: installed-browser fixtures, persistence and restoration checks.

## API references checked during planning

- [Chrome storage](https://developer.chrome.com/docs/extensions/reference/api/storage): JSON metadata and storage failures/quotas.
- [Extension storage contexts](https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies): IndexedDB, estimates and content-script origin behavior.
- [Chrome message passing](https://developer.chrome.com/docs/extensions/develop/concepts/messaging): JSON-serializable messages and cross-context transfer.
- [Clipboard.write](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/write): asynchronous writes, permissions and supported image representations; animated GIF clipboard preservation is not assumed.
- [IndexedDB transactions](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB): Blob storage transaction lifecycle; no cross-store atomicity with chrome.storage is implied.
