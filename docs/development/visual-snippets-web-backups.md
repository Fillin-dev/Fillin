# Visual snippets: webpage insertion and portable backups

Status: phases 5 and 6 implemented locally, November 12, 2026. This document records that checkpoint. [Phase 7](visual-snippets-release.md) has since prepared and verified release 0.2.0; its version and website download changes supersede this checkpoint. No new Chrome permission was added.

## Use a visual shortcut on a webpage

Save an image or GIF in Fillin's full-page editor. In a supported field, type its shortcut and press **Ctrl + Space** (Control on Mac too), choose it in the command palette, or select it from opt-in cursor suggestions. Each route opens a preview and requires an explicit action. Cancel and Escape preserve the original trigger. GIF previews start still and play only when requested; reduced motion defaults insertion to a still poster, with a visible choice to retain animation.

The preview offers a literal caption, alternative text, and only the actions appropriate for the destination. Inserting into native rich text preserves surrounding text, positions the caret after the result, and supports native undo. Media insertion does not increment text keystroke statistics.

| Destination | Behavior verified or deliberately restricted |
| --- | --- |
| Fillin practice | Confirmed insertion, caption, caret placement and undo |
| Ordinary native contenteditable | Confirmed insertion in the installed Chromium fixture; inspect the result before sending |
| Input and textarea | Preview, original download, explicit image/caption copy; trigger stays unchanged |
| Known managed editors, including Google Docs, Notion, Slack and ProseMirror | Manual download/paste/attachment fallback; no promise of direct insertion or remote persistence |
| Password, OTP, read-only, disabled fields and blocked sites | No media preview or retrieval |

**Download original** preserves bytes, including animated GIFs. **Copy still image** for GIFs explicitly copies the static poster. JPEG clipboard output is PNG. Clipboard writes are awaited and errors are displayed; insertion never silently writes to the clipboard. A download request is labelled as such, rather than reported as an insertion.

The preview is isolated for styling with Shadow DOM. Media shown on a page is visible to that page; Shadow DOM is not a privacy boundary. Script-generated keyboard/click events cannot initiate media previews or confirm media actions.

## Selected-file transport and lifecycle

The content script requests one selected snippet, not an asset ID or the whole library. Chrome runtime messages carry bounded 256 KiB base64 chunks. Both original and poster receive end-to-end SHA-256 checks. The worker checks extension identity, HTTP(S) tab/frame ownership, document identity, current metadata revision, and blocked-site settings. Parent URL policy is checked when Chrome supplies it.

Tokens expire after two minutes, are limited to eight active or pending previews, and are removed on close or tab removal. Policy is checked again after asynchronous reads. Transfer cancellation, expired worker state, changed snippets, changed original fields, navigation and blocked-site changes produce recoverable outcomes. Temporary object URLs and listeners are released when the preview closes.

Only constructed image and literal-caption nodes enter the document. No uploaded HTML, SVG, remote image URL or template expansion is accepted as a visual snippet. The insertion path probes image decoding before changing the trigger, verifies the inserted nodes, and never automatically repeats an uncertain mutation.

## Export and restore

With media in the library, **Export** creates `fillin-backup-YYYY-MM-DD.zip`. **Backup options** also offers full ZIP export for text-only libraries and an explicitly labelled text-only JSON export. JSON excludes images and GIFs; the normal mixed-library export never silently omits them.

The ZIP contains a strict versioned `manifest.json` and each unique original under `media/<sha256>.<png|jpg|gif>`. It includes shortcuts, tags, literal captions, alternative text and file metadata. Posters are regenerated during import. Original GIF bytes are preserved.

Import checks all files in a cancellable dedicated worker before asking to apply them. The review defaults to **Keep existing** matching shortcuts. **Replace matching shortcuts** is explicit. A changed library requires another review; imports and normal saves share the same library write lock. Legacy text JSON remains accepted, including the existing one-click path for nonconflicting text imports.

Optional **Repair damaged matching originals** restores verified original bytes and derived posters without replacing current captions or tags. It is separate from replacing shortcut metadata. Full export fails clearly if an original is missing or corrupt; it never presents an incomplete archive as a complete backup.

Limits are 80 MiB for the archive and aggregate extracted data, 2 MiB for the manifest, 10 MiB per original, and 50 MiB of referenced originals after merging. Archive checks reject duplicate or unexpected paths, traversal, symlinks, encryption, ZIP64, unsupported compression, missing references, unknown versions, invalid CRCs and oversized declared or actual inflation. Every original is checked against its hash and decoded format/dimension/frame limits before staging.

Restore validates the entire import, stages originals, then commits one complete metadata array. Failed staging or metadata writes preserve the old library. Staged unreferenced originals remain recoverable for retry and are eligible for the existing delayed orphan cleanup. Correctly repaired bytes may remain repaired even if a later metadata commit fails.

## Verification

Final local checks: 101 installed Chromium tests passed; 245 extension unit tests passed; 75 shared tests passed with the timezone-specific test skipped in the local timezone and separately passed in an America/New_York run (15 template tests). All workspace typechecks and the shared and extension production builds passed. Existing dependency deprecation/annotation warnings remain nonfatal.

Automated checks cover actual installed Chromium hotkey/palette/suggestion routes, confirmation and cancellation, caret and undo, protected/blocked/stale fields, managed-editor fallbacks, original downloads and script-generated event exclusion. Worker tests additionally cover sender/frame/document ownership, transfer bounds, policy changes, expiry and parallel preview limits.

Backup tests cover bounded ZIP extraction, malformed archives, conflict defaults, failed writes/retry, changed-library review, and explicit repair. The fresh-profile Chromium round trip restores PNG, GIF, text, captions and tags; it compares original hashes and exact GIF bytes, injects a failed metadata commit, repairs a damaged original while keeping a locally edited caption, and rejects an altered archive without changing metadata.

Live Gmail, Notion, chat services and Google Docs have not been verified for direct media insertion and remain fallback-only. See [phase 7](visual-snippets-release.md) for the completed accessibility/performance/release pass and its limits.
