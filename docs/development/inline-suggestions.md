# Inline suggestions (phase 2, local development)

Included in extension release 0.1.0.

## Enable and use

Reload the unpacked extension from `apps/extension/dist`. In the popup, enable **Suggest shortcuts while typing**. It defaults to off and is saved locally. Updates synchronize to existing tabs and other open extension windows.

Type a slash and at least two trigger characters, for example `/mee`. Up to five matching shortcuts appear with previews. Exact matches rank first; other prefix matches sort consistently by trigger.

- Click an Insert row to replace the token before the caret.
- Up/Down selects a row while focus stays in the editor. Enter inserts only after an explicit selection.
- Enter without a selected row retains normal editing/form behavior.
- Tab retains normal focus navigation.
- Escape dismisses suggestions for the current token. Editing that token or moving elsewhere allows suggestions again.
- Ctrl+Space and the command palette continue working regardless of this setting.

Insertion preserves surrounding text and uses the same coordinator as keyboard/palette expansion. Dynamic date/time previews are examples; the final value is recalculated when inserting. Changes to saved snippets invalidate an open panel.

## Boundaries and privacy

Supports eligible standard text inputs, textareas, reliably anchored text nodes in contenteditable editors, open Shadow DOM inputs, and independently injected frames. The panel is constrained to its own frame's viewport and flips above the caret when necessary.

Password fields, password/one-time-code autocomplete targets, disabled/read-only fields, blocked sites, existing combobox widgets, Fillin UI, and Google Docs canvas targets are excluded. IME composition temporarily suppresses suggestions. Native input types without usable selection APIs do not show suggestions.

The matcher retains only the current trigger/range, not a typed-text history. Input caret positioning uses an invisible, temporary mirror in the extension's Shadow DOM, cleared immediately after measurement. Geometry work is capped at 10,000 field characters; unsupported writing modes and scaled/transformed input geometry fail closed. Contenteditable anchoring is limited to a verified collapsed text-node range. Existing hotkeys/palette remain available where inline geometry is unsupported.

The feature makes no network requests, does not read the clipboard, adds no permissions, and writes no typing data. The only persisted new value is the boolean `fillin_suggestions_enabled`, written through the serialized background settings path. A failed/malformed settings read does not enable suggestions or overwrite the stored setting. Save failure restores the popup's previous displayed choice and reports an error.

## Lifecycle and accessibility

Panels close on blur, dismissal, composition, preference/snippet/blacklist changes, incompatible field-attribute changes, or activation of another Fillin interaction. Positioning is scheduled only while a panel is open; temporary mirrors, observers, and animation frames are cleaned up on close. The controller also has a destruction path for listener cleanup.

The panel uses native insertion buttons, a separately named region, and concise status announcements, preserving the original editor's ARIA attributes. Keyboard tests do not substitute for manual screen-reader verification; that remains a release check. Live Gmail/Notion compatibility and browser zoom/RTL edge cases should also receive a manual pass before broad compatibility claims. Google Docs retains its existing hotkey/palette path.

## Validation

Automated checks cover disabled defaults, persisted/cross-window settings, queued and failed storage writes, privacy exclusions before value reads, optimistic-toggle rollback, keyboard insertion/dismissal, middle-of-text replacement, composition, URL boundaries, read-only changes, blocking, rich-text editors, Shadow DOM, frames, and small-viewport caret positioning.

Publishing requires a new extension version, release notes, explicit staging of the website ZIP, and release verification. Release 0.1.0 includes this feature in the website download.
