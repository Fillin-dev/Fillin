# Cursor placement — phase 5A

Included in extension release 0.1.0. [Phase 5B now adds optional editable placeholder/Tab navigation](inline-placeholders.md), keeping this phase's final-cursor behavior.

## Using it

Enable **Use template values** on a plain-text snippet and save:

```text
Thanks for reaching out. {{cursor}}
Best, Samprati
```

Expanding in a supported native field removes the marker and places the cursor after the first sentence, before the newline. The popup includes a `{{cursor}}` token button that inserts it at the current text selection. Dates and fill-in fields can appear in the same template; answers are collected as usual, and the cursor offset is calculated from the completed text. In a supported native field, a marker-only template removes its trigger and leaves the cursor at that position. Rich-text whitespace boundaries use the safe-copy behavior described below.

Use at most one unescaped marker. Duplicate markers prevent saving an enabled template and fail stored-data validation. `\{{cursor}}` remains literal. Snippets without template mode preserve braces unchanged. Marker-looking text in a supplied answer remains literal and is never interpreted recursively. A template without a marker retains end-of-expansion behavior.

## Offsets and newlines

The shared resolver returns `{ text, cursorOffset }`, where the offset is a UTF-16 index or null when absent. It resolves repeated fields and automatic dates from the same expansion timestamp, removes the actual marker, then maps its location through CRLF/bare-CR normalization. CRLF pairs spanning field/literal boundaries normalize correctly. When a marker falls between CR and LF, the normalized cursor follows that line break. Emoji count as their actual UTF-16 code units.

Native textareas receive LF line endings. Single-line inputs strip line endings according to their field behavior, and remap the cursor relative to the text actually inserted. Statistics count the inserted length, excluding the marker and stripped line endings.

## Safe insertion

Cursor templates use target bookmarks even without fill-in fields. Before insertion, Fillin rechecks current snippet/site eligibility and the connected target's original text, selection and protected-field status. It never forces a cursor position into a field that rejected the inserted value or was replaced by a controlled-field handler.

Native adapters notify existing input/change listeners, confirm the resulting text, and then apply and verify the final selection. Standard types without a usable selection mapping offer copying when safe; password, readonly, disabled and protected autocomplete targets remain excluded.

Rich-text insertion initially requires one verified source text node and a collapsed original caret. Single-line text uses that node's direct UTF-16 mapping. Multiline text replaces only the trigger range with text nodes and real `<br>` elements, preserving surrounding elements and formatting. Raw LF characters alone are insufficient: Chrome can collapse them to spaces when typing resumes. Empty cursor lines and cursor positions within leading/trailing collapsible whitespace use copying instead: Chrome can move subsequent typing into neighboring formatting nodes and drop boundary spaces there. This conservative check happens before mutation, and is repeated after fill-in answers are resolved. After notifying the host, Fillin checks that inserted nodes, content, order and parents still match, then restores the final mapped caret. A host rerender that invalidates this mapping is not reported as a confirmed insertion.

Palette bookmarks are captured before search takes focus. If the original position is unanchorable but safe to copy, that interaction remains copy-only rather than upgrading a stale position after closing the palette.

## Unsupported positions and Google Docs

For a safe but unmappable target, Fillin opens a **Copy snippet** panel (or the normal field dialog when values are needed), explains that cursor placement is unavailable, and previews the completed text without the actual marker. Copy is an explicit action, waits for clipboard confirmation, and does not count as insertion. An empty-fields copy panel focuses its Copy button and supports Escape/Tab normally.

Google Docs cursor templates always use this path. Fillin never calls the existing canvas delete/direct-insert method for them, so it does not delete the original trigger or claim an arbitrary caret position worked. Select any original shortcut text you want to replace before pasting the copied message, then place the cursor manually. Date-only and literal snippets retain the older adapter behavior described in the dynamic-date documentation.

## Validation and review boundary

Shared checks cover marker absence/start/middle/end, marker-only templates, duplicates, escaping, repeated fields, dates, Unicode and CRLF boundaries. Extension unit checks cover normalized native insertion lengths, cursor positions after substitution, safe-copy policies, controlled-value rejection, rich-text mapping/rerenders, protected fields, literal compatibility and avoiding the destructive Google Docs method.

Installed Chromium checks cover native fields, emoji in both surrounding and inserted text, CRLF conversion, all cursor boundaries, fill-in answers plus dates, rich-text multiline insertion and continued typing, leading/trailing line breaks, palette/suggestion paths, unmappable-position explanations, controlled-value rejection and popup validation/token insertion.

Local validation passed: 39 shared tests (including New York daylight-saving behavior), 196 extension unit tests, all 52 installed Chromium tests, shared/extension typechecks, and shared/extension production builds. The rich-text boundary checks assert explicit copying before mutation when Chrome cannot keep a stable typing position.

Live Gmail, Notion, real Google Docs, screen readers and native undo history are not verified by these checks. Reload the unpacked extension and refresh existing tabs to try the local build. Shared remains free of Chrome/DOM/framework code; no permissions or landing/backend dependencies were added. Release 0.1.0 includes this feature in the website download.

Stop after phase 5A for review. Phase 5B must separately verify editing ranges, native undo behavior, and Tab-session cleanup before adding editable placeholders.
