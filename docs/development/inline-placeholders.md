# Editable placeholders — phase 5B

Included in extension release 0.1.0.

## Using it

Create or edit a plain-text snippet with fields, enable **Use template values**, then explicitly enable **Edit fields after insertion**:

```text
Hi {{name}}, thanks for contacting {{company}}. {{cursor}}
Best, Samprati
```

The new option defaults to off. With it off, the existing fill-in dialog still asks for values before insertion. With it on in a supported field, the message is inserted immediately using readable `‹name›` and `‹company›` labels. The first label is selected so typing replaces it. The website receives normal input events and can process the field as it would ordinary typing.

- Tab selects the next occurrence; Shift+Tab selects the previous one. Shift+Tab at the first occurrence stays there.
- Tab on the last occurrence ends navigation and places the cursor at the adjusted `{{cursor}}` position, or at the inserted message's end when no marker exists. The next Tab uses normal browser focus behavior.
- Escape ends navigation without changing or reverting the current text. Unfinished labels remain editable text on the webpage.
- A field may intentionally be cleared. Cursor affinity is preserved when a field becomes empty and is typed into again.
- Repeated names are independent occurrences in this mode. Editing one name does not update another occurrence. Use the default dialog when a single answer should fill every occurrence together.
- Native paste, multiline textarea edits, deletion and composition can update the current occurrence. Moving or selecting outside it, clicking another field, blurring, changing the target, blocking the site, changing the library, undo/redo or navigation ends the session safely.

Only the initial expansion uses the template parser. Marker-like text typed or pasted into a field is ordinary text and is not evaluated. Dates/time use one timestamp captured when expansion starts.

## Support and undo gate

Initial inline support is restricted to eligible standard `input[type=text]` and textarea elements in Chromium. Password, protected autocomplete, readonly, disabled and inert fields are excluded before field text is read. Other input types, contenteditable and Google Docs keep the normal fill-in dialog (and its explicit copy fallback where insertion is unsupported). The dialog explains when inline editing is unavailable for the current field.

The insertion path uses the browser's native `insertText` editing command, leaving the browser in control of its undo history. It never substitutes a JavaScript value setter for a failed inline command. The command API is deprecated but has a documented undo-preserving use case; see [MDN's editing-command reference](https://developer.mozilla.org/en-US/docs/Web/API/Document/execCommand). Feature detection, trusted native input receipts, final-value checks and installed Chromium undo/redo tests gate this mode. Native commands can emit multiple `insertText` events for one multiline insertion; they are verified as a complete operation.

If native editing is unavailable or a rejected command leaves the original value unchanged, Fillin restores the original selection and uses the regular dialog. A field that rejects a native command is disabled for inline editing for the current page lifetime. If the host changes the value or focus during insertion, Fillin leaves that result alone, does not start navigation, and asks the user to review the field. It does not replay the insertion through another method.

Undo/redo always ends an active session and is allowed to proceed normally. Redo restores native edit history without reactivating placeholder navigation. Chrome can group keystrokes differently in text inputs and textareas; the tests verify preservation of the earlier trigger and subsequent edits, without imposing an artificial grouping.

## Range tracking and limits

The shared compiler returns plain text, a range for each occurrence, the final cursor offset, and the number of occurrences before that cursor anchor. This last value preserves whether the cursor belongs before or after a placeholder even when its text becomes empty. Unicode uses UTF-16 offsets. CRLF/bare CR normalize to LF; single-line fields additionally strip line endings and remap every range.

An active session stores only the current field snapshot and occurrence ranges in memory. Native input events verify that text before and after the active occurrence remains unchanged, update its end, shift later occurrences, and adjust the final cursor anchor. They never overwrite the field to restore an old snapshot. Unsupported or out-of-range edits end navigation while leaving the browser's edit intact. Post-event checks run after host input handlers, so controlled-value replacement and target rerendering cannot leave stale Tab handlers active.

The existing limits remain: at most 20 unique field names and 100,000 rendered UTF-16 code units. Inline mode additionally allows at most 100 field occurrences and a 200,000-code-unit total target field, including surrounding text. A native maxlength that would truncate the insertion causes fallback before mutation. There are no per-keystroke storage writes or document polling loops.

One session may be active per frame; different tabs have independent sessions. Placeholder suggestions are suspended during editing. The hint announces field names and navigation instructions, not entered answers. Cleanup removes listeners/observers/hints and clears the snapshot and ranges.

## Storage and statistics

The per-template `editAfterInsert` flag is optional and defaults to off. It is valid only for an enabled plain-text template with user fields, survives create/update/backup/import, and is cleared when switching template mode off or importing a literal replacement. No schema migration rewrites existing snippets.

Inline answers remain on the target webpage; Fillin does not write them into snippets, settings, session drafts, statistics, URLs, logs or network requests. Like any normal field input, the host page can observe or save its own content. No Chrome permissions or landing/backend dependencies were added; the shared compiler remains free of DOM, Chrome and framework code.

One confirmed native insertion records one expansion. Keystroke savings count only automatic template text, excluding placeholder labels and later user typing; navigating or editing occurrences does not generate statistics writes.

## Validation and release boundary

Shared checks cover repeated occurrences, offsets, escaping, normalization, cursor affinity, metadata validation and occurrence limits. Extension checks cover unavailable/rejected commands, preserving changed host values, protected reads, metadata import/clearing, and opt-in editor behavior. Installed Chromium checks cover native history plus the real inline flow, repeated independent edits, changing lengths, empty/emoji fields, final anchors, native paste, IME composition, Escape/Tab behavior, target blur/selection/removal/value changes, blocked sites, separate tabs, unsupported-editor fallbacks, popup persistence, and all expansion entry points.

The composition test uses Chromium's native input protocol. OS keyboard candidate windows, screen readers and live Gmail/Notion/Google Docs compatibility still need manual review. Arbitrary host scripts can manage their own undo behavior; no universal guarantee is made for editors outside the tested native path.

Local verification passed: 43 shared tests, 203 extension unit tests, all 72 installed Chromium tests, shared/extension typechecks, and shared/extension production builds. The installed-browser suite includes 20 inline-mode and native-history checks; the existing feature checks also remain green.

Stop after phase 5B for review. Publishing is separate: follow the version/changelog/release ZIP verification process before GitHub/Vercel publication. Reload the unpacked extension and refresh existing webpage tabs to try this local build.
