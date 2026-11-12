# Visual snippets: phase 3 data foundation

Status: implemented locally, not released. The upload/editor interface is phase 4; webpage media insertion is phase 5; complete media backups are phase 6.

## What this phase adds

- A backward-compatible shared `Snippet` union: legacy text records remain valid without a `kind`; media records require `kind: 'media'` and `mediaVersion: 1`.
- Strict media metadata with an immutable SHA-256 asset reference, format, dimensions, frame count, size, safe filename, literal caption and alternative text. Media cannot enable HTML, template values or editable placeholders. Its compatibility `content` field must be empty, and every current text-entry path explicitly excludes media.
- An extension-only structural validator and decoder pipeline for PNG, JPEG and GIF originals, with bounded PNG CRC checks, JPEG marker inspection, GIF block/frame inspection and incremental GIF frame decoding. Original bytes remain unchanged; a separate static PNG thumbnail is generated.
- Extension-origin IndexedDB original/thumbnail storage, staged metadata commits, duplicate-file reuse, revision checks, locked snapshots, missing/damaged-file reconciliation and delayed cleanup.

No media message API, upload control, automatic startup cleanup, media insertion UI or release download is enabled in this phase. The storage service is intentionally not instantiated by the popup or worker until the next integration phase. No new dependencies or Chrome permissions were added.

## Data and limits

`packages/shared/src/models/media.ts` contains only framework-independent metadata rules and filename normalization. It has no Chrome, DOM, React, server or binary-storage dependencies.

Originals are capped at 10 MiB; distinct referenced original files at 50 MiB. Shared hashes count once. Dimensions are capped at 8,192 per axis and 12 million canvas pixels; GIFs at 300 frames and 200 million canvas-pixels across their decoded frames. Thumbnails have a maximum side of 256 pixels and a 128 KiB limit. Captions are at most 2,000 UTF-16 code units, alternative text 300.

File signatures and structure are checked before native decoding. A nonempty supplied MIME type must match the detected format. PNG CRC failures, unsupported APNG, oversized dimensions/animations, truncated structures, unsupported formats and decoder failures reject preparation without writing metadata. GIF validation requires Chrome's ImageDecoder; it does not silently validate only a first frame when that API is unavailable. Sequential frames and image bitmaps are closed after use. Cancellation is checked before and between asynchronous stages; UI integration should run preparation in a dedicated worker to keep synchronous structural inspection away from the editor's main thread.

These limits bound normal input work, not total native/GPU decoder memory. No universal protection against every malformed codec implementation or low-memory condition is claimed. The browser decoder is still responsible for decoding compressed pixels. Existing image metadata is preserved in originals; the feature does not claim to strip EXIF/location information. JPEGs whose decoded orientation changes their reported dimensions currently fail the dimension consistency check; broader orientation normalization needs explicit testing in phase 4.

## Safe write protocol

`MediaSnippetService` takes a metadata repository and a media asset repository. File preparation/hashing happens outside the write lock. All metadata-changing operations use the existing `fillin-snippets-write` Web Lock, shared with text creates, updates, imports and deletes.

Inside the lock, save re-reads/validates the entire metadata library, checks shortcut conflicts and expected edit revision, enforces deduplicated library size and preflights available browser storage when estimates are available. Originals and thumbnails are committed to IndexedDB before the new metadata array is written. IndexedDB requests resolve only after transaction completion. Existing originals are immutable and are never overwritten during a save.

If file staging fails, metadata is unchanged. If metadata commit fails or saving is cancelled after staging, the old library remains valid and the new asset is an unused orphan. Retrying can reuse that same staged file. Replacing an image keeps its previous original until a later cleanup. Concurrent edits require the last loaded `updatedAt` value; a losing editor receives a reload error rather than overwriting the winning change.

The real extension refuses snippet mutations if Web Locks are unavailable. Media operations also require Web Locks in the local preview. The existing in-memory queue remains available for text-only tests and preview environments without extension identity; media never silently falls back to it.

The raw IndexedDB repository is an internal implementation detail. Callers must not bypass the service/lock protocol. It does not expose a content-script or webpage write endpoint.

## Snapshots, cleanup and recovery

`withSnapshot` acquires the library lock, validates metadata, verifies original hashes and descriptors, captures Blob handles and persists a ten-minute lease for the referenced asset IDs. It then releases the library lock before invoking the consumer so a future backup can coexist with normal library edits. A missing/damaged original rejects a full snapshot rather than returning an apparently complete backup.

Blob handles in a snapshot remain valid even if a suspended operation outlives its timed lease and an otherwise eligible orphan is deleted from IndexedDB. The consumer retains those handles, not just IDs requiring later database lookup. Cleanup never removes a current metadata reference or an unexpired leased original. The lease is released when the consumer finishes; failed release expires naturally and does not overwrite the consumer's result/error.

`cleanup` re-reads/validates metadata under the lock and atomically checks leases and removes only unreferenced originals older than 24 hours. A failed or invalid metadata read prevents cleanup. Unknown or invalid lease state aborts the cleanup transaction. No cleanup runs automatically during this phase.

`reconcile` reports unavailable files by snippet ID, orphan count and deduplicated referenced bytes. It does not delete snippets, repair an unreadable library, run garbage collection or turn an error into an empty library. Missing files can be replaced using Save with a valid file and expected revision. A checksum collision with an already damaged stored original fails closed; restoring the same corrupted asset in place will need an explicit repair operation rather than silently overwriting it.

Phase 4 must call reconciliation on media-library initialization, surface the report and provide explicit retry/replacement actions. It must not interpret a missing file as a missing snippet.

## Compatibility guards while the feature is incomplete

- Existing text APIs can still read the mixed metadata array and enforce one shortcut namespace. Text editing refuses media IDs.
- Legacy JSON import refuses incoming media records because it contains no original files. A text import that collides with an existing media shortcut skips that collision rather than changing its type or losing its asset reference.
- Legacy JSON export refuses a mixed library; it cannot create a misleading partial full backup.
- Current popup result rows, the content-script trigger cache, palette and suggestions exclude media; the expansion coordinator also explicitly refuses media before text replacement. This prevents an empty compatibility `content` from erasing a typed trigger.
- Unsupported future snippet kinds/versions raise a recoverable update-required error and block writes. Invalid mixed metadata is preserved, not partially loaded and rewritten.
- Full media-aware backup import/export remains phase 6. This local foundation must not be published as a finished visual-snippet release before that work is complete.

## Tests and validation

Shared model tests cover legacy records, media round trips, invalid type/version, MIME/hash/filename limits, pixel/frame budgets, incompatible text options and literal captions. Unit tests cover structural file checks, every truncated prefix of a GIF fixture, invalid subblocks, PNG CRC corruption, concurrent creates/edits, interrupted saves, quota/library limits, deduplication, snapshot cleanup, failed reads, corruption reports, missing locks, cancellation and legacy import/export protection. A content-script regression confirms that an unfinished media trigger remains unchanged.

Five installed-browser tests bundle the actual foundation code into a temporary copy of the extension. They exercise real IndexedDB transactions, validated PNG/JPEG/GIF originals and static thumbnails across a full browser restart, interrupted metadata commits, age-based orphan cleanup, duplicate-write transaction aborts, leased snapshots, malformed files and simultaneous text/media writes from separate extension pages. Test globals exist only in this temporary fixture, never the production bundle.

Local verification completed: 66 shared unit tests passed in the default timezone, with the single timezone-specific test additionally passing in the New York date-test run; 225 extension unit tests passed across the full run and the final targeted content-script regression run; shared/extension typechecks and production builds passed; all 86 installed Chromium tests passed. Versions and staged website download files were not changed.

Reproduction from the repository root:

```sh
corepack pnpm --filter @fillin/shared build
corepack pnpm --filter @fillin/shared typecheck
corepack pnpm --filter @fillin/shared test
corepack pnpm --filter @fillin/extension typecheck
corepack pnpm --filter @fillin/extension test
corepack pnpm --filter @fillin/extension build
corepack pnpm --filter @fillin/extension exec playwright test
```

The existing shared daylight-saving test requires `TZ=America/New_York`; run that date test under the named timezone when the default local run skips it.

Stop after this phase for review. Phase 4 will add the persistent extension editor tab, accessible file input/drop zone, media form, thumbnails and practice flow. Publishing and website ZIP staging remain separate steps.
