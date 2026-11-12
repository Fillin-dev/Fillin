# Visual snippets: phase 2 feasibility results

Status: browser experiment complete; production implementation has not started.
Date: 2026-11-12. Environment: headless Chromium on macOS, with the current built extension installed into a fresh temporary profile.

## Decision

Proceed to phase 3's data foundation when instructed. Local original-file storage, bounded JSON transfers and confirmed insertion into a controlled ordinary rich-text editor are feasible without adding Chrome permissions.

Keep the compatibility boundary narrow. Gmail, Notion, Google Docs and chat applications are **not verified for direct media insertion**. An image appearing in a contenteditable does not prove the application will retain, upload or deliver it.

## What was tested

The tests copy the real extension build into a temporary directory and add experimental worker/content scripts there. They do not modify `dist`, production source, permissions, the website download or the user's installed extension. The temporary profile and extension are removed after each test. The fixtures are only candidates for evaluating browser behavior; they are not a production asset API or a finished media editor.

| Experiment | Result | Scope of evidence |
| --- | --- | --- |
| IndexedDB original Blobs | Passed | PNG, JPEG and animated GIF hashes survived closing and relaunching the entire browser using the same profile |
| Media capacity | Passed | Five 10 MiB synthetic Blobs (50 MiB total), plus small image originals, survived the restart byte-for-byte; synthetic bytes are not claims about image decoding |
| Cross-context Web Locks | Passed | A second extension page waited while the first page held the named lock; both continued after release |
| Content-script transfer | Passed | 10 MiB synthetic payload delivered through the real worker messaging API in 256 KiB base64/JSON chunks; SHA-256 and length matched |
| Ordinary rich-text insertion | Passed | PNG, JPEG and GIF replaced only `/media` between existing bold/italic content after an explicit confirmation |
| Preview safety | Passed in fixture | Preview alone left the original editor HTML unchanged |
| Caption and caret | Passed | HTML-like caption remained literal; the next typed character appeared after the caption and before surrounding text |
| Undo | Passed | One native undo removed subsequent typing; the next single undo reversed the image/caption insertion and restored the exact original HTML |
| Serialized persistence | Passed in fixture | Image HTML restored into a separate fresh page decoded successfully without an extension Blob URL; this is not an external application's save/send test |
| GIF animation data | Passed | A hand-authored two-frame GIF decoded into distinct red and blue frames after storage; downloading preserved the original SHA-256 |
| PNG clipboard | Passed | An explicit click completed `Clipboard.write` successfully using the existing `clipboardWrite` permission; no clipboard-read permission or OS paste compatibility claim |
| Stale target | Passed in fixture | Replacing the target while preview was open refused insertion and preserved the new host content |
| Managed-editor rejection | Confirmed limitation | A fixture that synchronously removed images caused an explicit failed result; part of the edit could still remain, so automatic retry/fallback would be unsafe |
| Large static decode | Passed | 4,000 × 3,000 PNG and JPEG originals decoded and generated 256 × 192 PNG posters below 128 KiB |
| GIF frame count | Passed for small frames | A 300-frame, 1 × 1 GIF decoded incrementally with frames closed; this does not validate 300 large frames or the full proposed cumulative-pixel budget |

Timing and heap samples are attached to the Playwright report as `transfer-evidence.json` and `decode-evidence.json`; storage evidence and serialized insertion HTML are attached as well. These are local observations, not device-independent latency targets. CDP heap is a point-in-time JS heap sample, not peak memory or total native/GPU decoder allocation. A 12-million-pixel RGBA frame alone represents roughly 48 MB of pixel data before additional copies and decoder overhead.

## Implementation decisions confirmed or refined

1. Keep original files immutable in extension-origin IndexedDB; thumbnails are derived. Do not re-encode GIF originals through canvas.
2. Retain 10 MiB per original and 50 MiB referenced-library limits as initial product caps. They do not guarantee available quota; production still needs quota-failure handling and the shared write protocol.
3. Use bounded, cancellable JSON chunk transfers. The experiment proves exact byte delivery, not the final security, timeout, revision, cancellation or lease implementation.
4. Use static posters for browsing. Explicit playback uses the original animation; do not try to pause an animated `<img>` by merely hiding a control.
5. A locally embedded data URL can outlive the transfer page and avoids revoking a Blob URL still used by inserted content. It increases serialized HTML size and remains subject to destination CSP and application sanitization. Do not apply this method to arbitrary managed editors.
6. A single native rich insertion operation preserved undo in tested Chromium. The candidate uses deprecated `execCommand('insertHTML')`, which the existing extension also uses for rich text. Keep this behind a small adapter contract, verify actual postconditions, and revisit it if Chromium behavior changes. The return value alone is insufficient.
7. Make stale-target refusal and uncertain-partial-insertion outcomes explicit. Never report a partial mutation as success or trigger an automatic second insertion/clipboard write.
8. Offer Copy PNG only after explicit action, awaiting completion. Original GIF download is the verified animation-preserving fallback. Animated GIF clipboard copying is not part of the first version.
9. Retain proposed dimension/frame budgets provisionally. Production parsing must reject excessive dimensions and work before decoding. Large complex GIFs, pathological files and low-memory behavior still require phase 3/4 validation; small-frame success does not justify decoding every frame concurrently.
10. The first supported direct destination is Fillin's future controlled practice editor. Ordinary webpage rich-text support must remain bounded and opt into a verified adapter contract; no broad application compatibility claim follows from this spike.

## Compatibility matrix for the first implementation

| Destination | Phase-2 evidence | Planned first behavior |
| --- | --- | --- |
| Controlled ordinary contenteditable | PNG/JPEG/GIF insertion, caret, surrounding markup, undo and reserialization passed | Use the proven technique in Fillin practice, then test the integrated controller again |
| Native input / textarea | Not a media container; no new native-field media experiment | Download original / explicitly copy caption; never remove the typed trigger for an image |
| Managed editor that strips inline images | Simulated rejection demonstrated | Fail accurately; no automatic retry; use explicit download/copy options |
| Gmail / Notion / messaging sites | Not manually tested | Fallback until a specific adapter's draft persistence and send/delivery behavior are verified |
| Google Docs canvas | Not tested for media | Download original; no image-trigger deletion or animation claim |
| Password / protected fields / blocked websites | Production exclusions remain unchanged; spike is not a production guard | Preserve exclusions in the integrated media branch and add dedicated installed-browser regression coverage |

## Verification and reproduction

From the repository root, with dependencies and the current production extension build available:

```sh
corepack pnpm --filter @fillin/extension typecheck
corepack pnpm --filter @fillin/extension exec playwright test visual-media-spike.spec.ts
```

The isolated suite contains nine tests. Running the normal installed-extension suite also includes these tests. It launches Chromium and a localhost fixture server; it requires no logged-in websites or remote media service.

Verification completed locally: extension and browser-test typechecks passed; all nine isolated media checks passed; the complete installed-extension suite passed all 81 tests (72 existing plus nine new) in approximately 1.2 minutes. These results validate the experiment against the existing build, not a completed production media feature.

Retained code:

- `apps/extension/e2e/visual-media-spike.spec.ts`: temporary-install fixture, restart, storage, transport, insertion, failure, GIF, clipboard and decode probes.
- `apps/extension/e2e/media-spike/runtime.js`: experimental IndexedDB helpers, local-fixture-only chunk reader and explicit download/copy controls.
- `apps/extension/e2e/media-spike/content.js`: experimental preview and single confirmed rich insertion candidate.

The spike uses fixed test assets and simplified bookmarks. Do not import these helpers into production as-is. Phase 3 must implement actual schemas, file validation, recovery and authorization; phase 5 must reuse hardened bookmarks and site policies.

## References and remaining gates

- [Chrome messaging](https://developer.chrome.com/docs/extensions/develop/concepts/messaging): browser message serialization; the spike deliberately transports JSON/base64 rather than Blobs.
- [MDN execCommand](https://developer.mozilla.org/en-US/docs/Web/API/Document/execCommand): deprecation and undo-history considerations.
- [MDN ImageDecoder](https://developer.mozilla.org/en-US/docs/Web/API/ImageDecoder): incremental frame decoding; not the sole future file validator.

Complete media backups, corrupted-file defense, interrupted writes/imports, editor accessibility, peak-memory limits, worker restarts during transfer and real application compatibility remain later-phase work. No feature has been published and no website release ZIP has changed.

Stop here for phase review. Phase 3 is the next authorized implementation checkpoint.
