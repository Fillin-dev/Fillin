# Fill-in templates — phase 4

Included in extension release 0.1.0. The default dialog behavior described here is unchanged; [phase 5B adds optional editing after insertion](inline-placeholders.md) for supported native text fields.

## Using templates

Create or edit a plain-text snippet, enable **Use template values**, and save:

```text
Hi {{name}}, thanks for contacting {{company}}. Your order {{order_number}} is ready.
```

Use the shortcut with Ctrl+Space, choose it from the palette, or select an optional inline suggestion. Fillin asks for the three values, shows a live plain-text preview, and inserts only after **Insert**. Repeated occurrences of a field share one answer. Enter submits when all fields are filled; Tab/Shift+Tab stay within the dialog. Escape, Cancel, or clicking the backdrop closes without inserting and restores a still-valid original position. Composition Enter does not submit.

The popup previews unanswered fields as `‹name›`. Token buttons include name/company; other field names can be typed directly. Turning template mode off keeps braces literal, including existing snippets that never enabled it.

## Syntax and limits

- Names start with a lowercase ASCII letter, followed by lowercase letters, numbers or underscores, at most 48 characters. Spaces around a name inside braces are ignored.
- Up to 20 unique user fields per template; each answer is required and at most 2,000 UTF-16 code units. Whitespace-only answers are rejected, while intentional surrounding spaces in nonempty answers are preserved.
- The completed output is limited to 100,000 UTF-16 code units, including repeated substitutions. Resolution checks the limit incrementally before building an oversized result.
- `{{date}}`, `{{time}}`, `{{datetime}}` are automatic. One timestamp is captured when expansion starts and remains fixed through the dialog. A later expansion uses a fresh timestamp.
- Escape a token as `\{{name}}` for literal braces. Supplied answers are never recursively parsed: entering `{{date}}` or `<b>text</b>` inserts that exact text.
- `clipboard`, `selection`, `constructor` and `prototype` are reserved. Invalid names and unclosed braces fail validation. Phase 5A adds [one final `{{cursor}}` marker](cursor-placement.md); it is not a user field. Inline editable placeholders remain a separate phase.
- Templates support plain text only. Saved template metadata and tokens travel with the normal backup JSON; answers do not. Older extension versions may reject enabled field templates, so restore them with a compatible version.

## Insertion safety

The coordinator opens one dialog per frame and closes suggestions/palette interactions before focusing its fields. Keyboard shortcuts do not expand snippets inside the template dialog. The palette also captures a target bookmark before its search field takes focus, so host edits while searching cannot produce a stale field-template insertion.

Native field bookmarks verify connected state, supported type, readonly/disabled/password/OTP exclusions, the original value and selection, and relevant attribute changes before reading/restoring. Contenteditable bookmarks retain the original text node/range and observe host changes; replacing the host's DOM invalidates them. Insertion rechecks the bookmark, current snippet revision and blocked-site policy immediately before changing the target. Surrounding rich-text nodes are preserved because supported templates replace only the bookmarked text segment with plain text. Initial contenteditable support requires a collapsed caret in one connected text node.

Changing/closing the page, removing the target, changing the snippet, or blocking the site cancels or prevents insertion. A host that changes the field during focus restoration also fails the checks. Successful insertion restores typing focus with the caret after the completed message; stats count its final length exactly once. Failed and copied outcomes do not count as insertions.

For the unanchorable Google Docs canvas adapter, field templates offer **Copy completed message** instead of attempting deletion/direct insertion. Copy requires an explicit action, waits for clipboard success, and displays **Message copied. Paste it in your editor.** A failed copy can be retried. The template flow never calls the destructive canvas replacement method, so it leaves the original trigger in place. This does not change the older date-only/literal Google Docs adapter behavior.

## Local values and lifecycle

Answers exist only in the current dialog and completed insertion/copy. Fillin writes no answers to snippets, settings, session drafts, statistics, URLs, logs or network requests. Statistics receive only lengths. Closing clears dialog inputs and preview content and releases bookmarks/listeners. Browser-window blur or page hiding cancels an idle dialog. The dialog runs in the current webpage's DOM using Shadow DOM for style isolation; it is not a separate security boundary from the host webpage.

No Chrome permissions, cloud features or landing/backend dependencies were added. The shared parser remains pure and framework-agnostic.

## Validation and compatibility

Shared checks cover unique field ordering, repetition, escaping, date values, Unicode/multiline/HTML-like answers, missing or inherited values, reserved/invalid names and output/field limits. Extension unit checks cover bookmarks, protected fields, host rerenders, keyboard focus, required values, IME, cancellation, duplicate submissions, clipboard errors, preserved triggers, fixed dates across midnight and confirmed-only statistics.

Installed Chromium checks cover popup creation, hotkey/palette/suggestion entry points, a 390 × 700 viewport, literal previews, repeated fields, native middle-of-field insertion, selected-text replacement, rich-text markup preservation, focus/Enter/Tab/Escape/composition behavior, stale palette targets, target edits/removal, changed snippets, newly blocked sites, password exclusions and storage without answers.

Local verification passed: 34 shared tests (including the New York daylight-saving case), 183 extension unit tests, all 37 installed Chromium tests, shared/extension typechecks, and the production shared/extension builds. The website ZIP was not staged or changed.

Live Gmail, Notion, Google Docs, and screen-reader testing are still manual compatibility checks; these automated tests do not claim those applications have been verified. Existing tabs need a refresh after reloading the unpacked extension.

Stop after phase 4 for review. Cursor placement and editable placeholders are separate phases. Publishing requires the existing version/changelog/ZIP release workflow; this implementation does not update the website download.
