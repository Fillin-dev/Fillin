# Fillin productivity features: implementation plan

Date: 2026-11-11. Status: phases 1–2 implemented locally; phases 3–5 remain planned.

## 1. Objective and phase discipline

Deliver, in the user's requested order:

1. Date and time evaluated at expansion time, starting with `/today`.
2. Optional suggestions beside the cursor.
3. Save selected webpage text through the browser context menu.
4. Templates with locally filled text fields and a preview.
5. Explicit cursor placement, followed by editable placeholder navigation.

Each phase ends with implementation, relevant automated and real-browser checks, and a short review of its behavior and limitations. Stop for the next phase instruction. Planning approval is not deployment approval. Building an extension does not refresh the website download; publishing remains a separate, explicitly requested release step.

Keep all features local. No accounts, AI generation, cloud synchronization, external template services, or telemetry. Keep extension, landing frontend, backend, and shared package independent. The website demo remains independent from extension runtime code.

## 2. Findings from the current code

- `SnippetService.ts` constructs `/today` with `new Date()` in the starter array. The resulting content is saved as a fixed string.
- `content/index.ts` and `content/CommandPalette.ts` insert `snippet.content` separately. Both must use the same resolver before any dynamic feature ships.
- `InputAdapter.replaceText()` returns `void`. It cannot currently report insertion success, clipboard fallback, or a requested cursor offset.
- The standard input adapter places the cursor after inserted text. ContentEditable operates on the current text node; arbitrary multi-node editor ranges are not a proven capability.
- Google Docs uses a short key buffer, direct insertion attempts, and an asynchronous clipboard fallback. A successful clipboard write is not proof that text was pasted into the document.
- The schema stores content, HTML mode, tags, IDs, and timestamps. There is no explicit template mode, suggestion setting, or cursor metadata.
- Stored libraries are validated, and snippet writes use the existing write lock. New entry points must preserve those protections.
- Imports explicitly copy selected fields when updating existing snippets. New metadata must be carried through import, creation, update, cache conversion, and export, not merely added to the schema.
- The extension currently requests `storage` and `clipboardWrite`; selection capture will additionally need `contextMenus`.
- Existing browser tests cover native popup sizing, first use, insertion adapters, and simultaneous windows. Extend these instead of relying exclusively on simulated DOM tests.

## 3. Shared behavior and contracts

### Explicit template mode

Add optional `templateVersion: 1` metadata. Absence means literal content, preserving existing snippets, code examples, and imported text containing braces. An editor control labeled “Use template values” enables this mode. Plain-text templates only initially; existing HTML snippets continue through their current literal path.

Proposed first-version syntax:

| Syntax | Meaning | Available |
| --- | --- | --- |
| `{{date}}` | Current local date | Phase 1 |
| `{{time}}` | Current local time | Phase 1 |
| `{{datetime}}` | Current local date and time | Phase 1 |
| `{{name}}` | A user-supplied text field | Phase 4 |
| `{{company}}` | Another user-supplied field | Phase 4 |
| `{{cursor}}` | Final caret location; inserts no text | Phase 5 |

Names are case-sensitive, trimmed, and restricted to letters, digits, and underscores, beginning with a letter. Dynamic names and `cursor` are reserved; a user-entered delivery date can be called `delivery_date`. Use `\{{name}}` to insert literal braces in an enabled template. No expressions, nested syntax, script evaluation, arbitrary date formatting languages, or recursive expansion of user-supplied values.

Unknown tokens are validation errors in enabled templates until their phase is implemented. They remain literal in ordinary snippets. Multiple `{{cursor}}` markers are an editor error once cursor support exists. Show errors inline without saving partially valid data.

### Pure parsing and resolution

Place token parsing, ordered field extraction, string rendering, and offset calculations in `packages/shared/src/templates/`. Pass the time, locale, and field values in explicitly. No Chrome, DOM, or React dependencies in shared. Obtain the user's locale and current time in the extension.

Capture one timestamp when expansion begins. Use it for every date/time token in that expansion, including the preview and final insertion. Repeated date tokens must not disagree if a dialog spans midnight.

The resolver returns final text, required fields, and eventually a caret offset. Offsets use JavaScript UTF-16 units to agree with browser selection APIs. Rendering never reparses field values as template instructions.

### One extension expansion coordinator

Introduce `content/expansion/ExpansionCoordinator.ts` and route Ctrl+Space, palette selection, and later inline suggestions through it. Responsibilities:

1. Confirm the site and target are eligible.
2. Capture the target, insertion/replacement range, relevant text, and snippet revision.
3. Resolve dynamic values and, in phase 4, gather user fields.
4. Restore the target and confirm it is still valid and unchanged at the captured range.
5. Insert exactly once, then apply a supported caret instruction.
6. Record statistics only after an acknowledged insertion, using final rendered lengths.
7. Clear pending state on success, cancellation, navigation, target removal, or loss of eligibility.

Never delete a trigger when opening a dialog. Escape or cancellation must leave the page unchanged. Prevent duplicate submissions. If the site becomes blocked or the snippet changes while a dialog is open, cancel and ask the user to retry.

Give adapters explicit capabilities and an asynchronous insertion result: `inserted`, `copied`, or `failed`. For clipboard fallback, report “Copied—paste to finish,” do not count a confirmed expansion, and do not claim cursor placement. Audit the Docs deletion/fallback ordering before changing it so an insertion failure does not silently destroy the original trigger.

This foundation is introduced only as needed by the first phase; later phases extend it without adding duplicate insertion paths.

## 4. Phase 1 — dynamic date and time

### User behavior

- New starter `/today` stores `{{date}}` with template mode enabled.
- Provide optional `/time` and `/now` starters using `{{time}}` and `{{datetime}}`. Do not replace user triggers with the same names.
- Default date format remains the existing English abbreviated month/day/year convention for `/today`, avoiding an unexplained visual change. Offer a small explicit format choice: familiar date or ISO `YYYY-MM-DD`. Time uses a documented local format; stored format preferences must be validated.
- Format at insertion time through both Ctrl+Space and the palette. The saved template itself does not change when the day changes.
- The editor offers insert-token buttons and an example preview labeled with the current preview time. A preview is not the final insertion timestamp.

### Existing `/today` snippets

Do not infer ownership from the trigger or rewrite every saved date-shaped string. Existing `/today` content may be intentional. Offer a one-time, explicit “Make /today show the current date” action with before/after preview. Preserve the previous value for cancellation/undo of that action. Ordinary expansion does not silently migrate content. New starter loading still skips existing triggers.

### Implementation work

- Add and validate optional template metadata; wire it through service methods, hooks, editor state, caches, and imports/exports.
- Add the parser/resolver and the shared expansion coordinator for the two existing insertion entry points.
- Add adapter outcome reporting needed for accurate statistics and the existing Docs clipboard behavior.
- Validate unsupported template versions before schema stripping can discard their metadata. Never downgrade an unsupported template into apparently literal content silently.
- Existing JSON arrays remain importable. New exports retain template metadata. Document that old Fillin versions cannot interpret these new templates; do not promise backward behavior in an older installed extension.

### Verification and acceptance

- Fake-clock tests for consecutive days, month/year boundaries, leap day, local time zones, and daylight-saving boundaries where relevant.
- One captured timestamp produces consistent values across repeated tokens.
- Literal snippets and disabled template mode remain byte-for-byte literal.
- Actual installed-extension tests insert through both shortcut and palette, including an already open tab crossing midnight.
- Existing/custom `/today` is untouched until its explicit conversion action succeeds.
- Import/export round trips preserve mode and supported format settings; invalid data and failed reads/writes preserve the library.
- No statistics for cancellation, failed insertion, or copy-only fallback.

Stop after this phase for review.

## 5. Phase 2 — optional suggestions beside the cursor

### User behavior

- A settings switch “Suggest shortcuts while typing” defaults to off. Explain it operates locally on the active field.
- With it enabled, typing at least two characters after `/`, such as `/mee`, opens a compact panel with up to five prefix matches, content previews, and an explicit insert action.
- Opening suggestions does not expand text or steal focus. Normal typing continues in the original editor.
- Arrow keys choose a result only while the panel is open. Enter inserts only an explicitly keyboard-selected row; an initially displayed panel does not consume ordinary Enter. Tab keeps its usual focus behavior in this phase.
- Escape dismisses the panel for the current token until the token changes or the user moves elsewhere. Pointer selection preserves the original caret and cannot submit a surrounding form.
- Ctrl+Space and the existing palette continue working when suggestions are disabled or dismissed.

### Scope and privacy

- Initial support: eligible standard inputs, textareas, and contenteditable editors for which a reliable caret/range can be captured.
- Password, disabled/read-only fields, blocked sites, and Fillin's own UI are excluded before reading field text. Restrict supported input types explicitly; unknown field types fail closed.
- Canvas-based Google Docs retains the existing hotkey/palette path. Do not guess caret coordinates or suggest using an unverified key buffer there.
- Read only a bounded token context around the caret; do not retain full field content, build typing histories, read the clipboard, or send network requests.
- Suspend during IME composition. Recheck on composition end, input, selection changes, and deletion. No suggestions inside URLs or email addresses when the existing trigger boundary rules reject them.

### Implementation work

- Add validated local settings with a serialized background mutation path. Missing settings mean off; read failure does not become permission to enable the feature.
- Add `SuggestionController` and a Shadow DOM panel per eligible frame, sharing the expansion coordinator and snippet cache.
- Rank exact matches before prefix matches with a stable tie-breaker. Defer fuzzy matching and usage ranking.
- Reuse actual range rectangles for contenteditable. Use an isolated text mirror for textarea/input caret geometry, matching font, padding, scroll position, direction, wrapping, and zoom. Never clone input values into page-visible elements.
- Clamp the panel to the viewport and flip it above the caret when needed. Reposition while open on scroll/resize; clean up observers and listeners on close.
- Keep the original editor focus. Give the suggestion list accessible names and announcements without overwriting the host site's existing combobox semantics. Verify the chosen ARIA pattern with keyboard and screen-reader checks before claiming accessibility support.
- Close immediately when disabled, blacklisted, invalidated, blurred outside the interaction, or superseded by the command palette/template dialog.

### Verification and acceptance

- Off by default, persists after reload, and changes propagate to open tabs.
- `/mee` matches `/meeting`; insertion replaces only the token before the caret and preserves surrounding text.
- Enter, Tab, Escape, arrow keys, pointer selection, and composition do not break normal editing or form submission.
- Check multiline wrapping, horizontal/vertical field scroll, page zoom, viewport edges, Shadow DOM, and iframe coordinates.
- Blocked/password/read-only fields never open the panel or contribute cached text.
- Two open browser windows keep independent suggestion sessions and share settings without lost writes.
- No per-keystroke storage writes, full-library DOM rendering, persistent mirror values, or document-wide mutation polling.

Stop after this phase for review.

## 6. Phase 3 — Save selection to Fillin

### User behavior

1. Select webpage text and choose “Save selection to Fillin” from the browser context menu.
2. Open a dedicated extension editor window with the selected plain text already filled in.
3. Focus the trigger field; tags are optional. Offer a suggested trigger, but let the user choose it.
4. Save through the existing validated, locked snippet service. Confirm success only after persistence succeeds.
5. Cancel or close without adding a snippet.

Use an extension-owned editor window, not an injected webpage form. It works when the content script cannot render a dialog and reuses the existing `SnippetForm`. A separate window avoids the native toolbar popup closing when focus changes.

### Implementation work

- Add only `contextMenus` to permissions. Use the context-menu selection payload; do not add clipboard-read or broad new site permissions.
- Create the menu idempotently during extension install/update. Recheck current blocked-site policy on click, not just when the menu was shown. Do not capture on blocked sites; show a clear extension-owned explanation.
- Treat selected text as untrusted plain text. Do not preserve executable HTML or automatically enable template syntax.
- Exclude password/editable sensitive targets when an eligible frame can be verified. For editable selections where eligibility cannot be verified, refuse capture rather than guess. General selected webpage text remains supported.
- Put each pending capture in `chrome.storage.session` under a random opaque ID and open an extension URL containing only that ID. Never put selected text, page URLs, or field values in query strings or logs.
- Add a short expiry, explicit cleanup, draft size validation consistent with editor limits, and a cap on pending drafts. Preserve whitespace and Unicode without silently truncating selection text.
- Restrict draft storage to trusted extension contexts. Validate message senders and payloads; content scripts cannot retrieve arbitrary drafts.
- Scope drafts to their own editor window, handle service-worker restarts and repeated clicks, and keep a draft recoverable after a save error. Clear only after successful save or explicit discard/expiry.
- Trigger conflicts use the existing form validation and suggestions. Multiple editor windows must not overwrite one another's snippets.
- Update permission and privacy documentation. Existing users may see a browser permission change at release; accurately document it.

### Verification and acceptance

- Installed-extension context-menu check selects real text and saves it through the new editor.
- Unit tests cover payload validation, duplicate menu registration, blocked sites, missing/expired IDs, oversized selections, and worker restarts.
- HTML-like text renders literally; braces remain literal unless template mode is explicitly enabled.
- Closing without saving creates nothing. Save errors preserve the draft and existing library.
- Simultaneous capture windows remain independent; selected text never appears in the editor URL.

Stop after this phase for review.

## 7. Phase 4 — templates with fill-in fields

### User behavior

An enabled template containing `Hi {{name}}, thanks for contacting {{company}}. Your order {{order_number}} is ready.` prompts for exactly three text values in first-appearance order.

- Repeated `{{name}}` occurrences share one input and one value.
- A live plain-text preview shows the completed message as the user types. Label it “Preview”; never modify the target field while previewing.
- Empty values are initially required; show inline errors for empty/whitespace-only input. Defer optional fields, defaults, dropdowns, and conditional sections.
- Enter submits from a single-line field when valid; an explicit Insert button is always available. Escape cancels, restores focus, and leaves text untouched.
- Values exist only for that expansion session. Do not store them in snippets, statistics, URLs, logs, or a “last used” cache.

### Implementation work

- Extend shared parsing to extract unique field names and render their values without recursive token evaluation.
- Add an extension-owned Shadow DOM `TemplateDialog` in the originating frame. Use text nodes/controlled inputs for user content; no HTML interpolation.
- Reuse the coordinator's target bookmark across dialog focus changes. Keep only one active Fillin interaction per frame; opening the template dialog closes suggestions and the palette cleanly.
- Validate connected target, unchanged replacement text/range, eligibility, and snippet revision immediately before insertion. Do not apply offsets captured before a host page changed the editor.
- For supported rich-text targets, preserve surrounding markup while inserting plain template text. Never reinterpret field values as HTML.
- On unsupported editors, provide a deliberate Copy completed message action with accurate feedback. Clipboard success does not imply insertion success. Do not delete the original trigger on this path.
- Handle Tab/Shift+Tab focus containment, initial focus, focus restoration, accessible dialog title, validation messages, and reduced motion. Preview updates should not repeatedly announce the entire message.

### Verification and acceptance

- Repeated names, token escaping, unknown/reserved names, Unicode, multiline template content, empty fields, very long field values, and values containing `{{...}}`.
- Dates remain consistent throughout a dialog; reopening a new expansion captures a fresh timestamp.
- Cancel, double-submit, navigation, target removal, text changes, and newly blocked sites never insert into the wrong place.
- Browser tests start templates through hotkey, palette, and suggestions. All entry points produce the same completed text and statistics behavior.
- No storage/network record contains entered field values after the session is closed.

Stop after this phase for review.

## 8. Phase 5 — cursor placement, then editable placeholders

### Phase 5A: one final cursor marker

For `Thanks for reaching out. {{cursor}}\nBest, Samprati`, remove the marker and place the caret after the first sentence, before the newline. Do this only after insertion succeeds.

- No marker means the current end-of-expansion behavior.
- More than one marker is invalid; an escaped marker stays literal.
- Resolve field values and dynamic tokens first, then calculate the marker's final UTF-16 offset. Emoji, repeated fields, newlines, and CRLF normalization need explicit tests.
- Standard input/textarea adapters apply the offset within the inserted range and notify controlled fields as before.
- Contenteditable requires verified range-to-text offset mapping. Preserve existing nodes and formatting outside the insertion range. If mapping is unreliable, offer the completed plain text instead of guessing.
- Google Docs cannot currently guarantee an arbitrary final caret position. Explain that limitation before insertion and offer copying final text; never leave `{{cursor}}` visible or pretend caret placement worked.

### Phase 5B: editable placeholder navigation

Treat this as a separate review gate within phase 5, after final cursor placement is stable.

- Scope initially to standard input/textarea fields. Do not promise reliable linked editing across arbitrary rich editors or Docs.
- Add a deliberate per-template “Edit fields after insertion” option. The default phase-4 dialog flow remains unchanged.
- Insert readable placeholder labels, select the first placeholder, then use Tab/Shift+Tab to select subsequent placeholder ranges only while this explicit session is active.
- Finish at `{{cursor}}` if present, otherwise at the end. After the last placeholder, end the session and let the next Tab use normal browser focus behavior.
- Escape ends navigation without reverting text the user has typed. A click outside the active placeholder, target blur, unsupported edit, undo/redo, navigation, or target removal also ends it safely.
- Track edits using actual input events and verified selection ranges. Preserve all edits while adjusting subsequent offsets. Never globally capture Tab when no placeholder session is active.
- Repeated fields are distinct editable occurrences in this initial inline mode; do not imply linked updates. Explain this distinction in the editor. Linked editing is a separate future feature.
- Test native undo behavior; if the host input's edit history cannot be preserved, document the limitation and keep the inline option disabled for that host.

### Acceptance

- Final caret is exact for surrounding text, emoji, multiline content, substitutions of varying lengths, and middle-of-field insertion.
- Placeholder navigation never escapes its insertion session or changes unrelated form fields.
- Real-browser checks cover keyboard-only use, IME, paste, deletion, host rerenders, and two independent editing sessions in separate tabs.
- Unsupported surfaces show an honest fallback, and no raw markers leak into inserted text.

Stop after 5A and after 5B for review.

## 9. Test and release gates

For each phase:

- Shared parser/schema tests when changed; extension services, storage, UI, and adapter tests relevant to the phase.
- Extension and shared typechecks, production extension build, and installed Chromium tests. Exercise concurrency and storage failures for every new write path.
- Manual compatibility review in Gmail, a representative Notion editor, and real Google Docs before claiming support there. Simulated Docs tests are necessary but insufficient proof of current live Docs compatibility.
- Verify keyboard focus, readable previews, small-window layout, reduced motion, cancellation, and blocked/password exclusions.
- Check the permission delta and document behavior. Do not expose implementation details in normal user flows.
- Verify no landing/backend dependencies or Chrome/DOM usage were added to shared.

When the user requests publishing: choose a consistent extension version, update manifest/package/changelog, build the extension independently, deliberately stage the website archive using the existing release workflow, verify ZIP contents/version/SHA-256, and then publish GitHub/Vercel artifacts. Changing source alone does not update an already installed extension. Provide the reload/reinstall instructions appropriate to the release.

Do not invent completion dates. Relative complexity: phase 1 medium (migration and integration), phase 2 high (caret geometry and event handling), phase 3 medium (permissions and draft lifecycle), phase 4 high (focus/selection safety), phase 5A medium-to-high by editor, phase 5B high. Reassess after each phase's browser results.

## 10. Explicitly deferred work

No cloud sharing, accounts, AI replies, background clipboard reading, arbitrary JavaScript macros, full HTML template editing, nested snippets, linked placeholder synchronization, general form autofill, or automatic suggestion support on unanchorable canvas editors. These are not prerequisites for the five requested improvements.

Phases 1–5, including both 5A and 5B review gates, are implemented locally. See `../development/dynamic-dates.md`, `../development/inline-suggestions.md`, `../development/selection-capture.md`, `../development/template-fields.md`, `../development/cursor-placement.md`, and `../development/inline-placeholders.md` for usage, compatibility, and validation details. Stop for phase 5B review. No publishing is included in these implementation phases.
