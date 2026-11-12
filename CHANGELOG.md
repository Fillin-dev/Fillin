# Changelog

## [0.1.0] - 2026-11-12

- Resolve enabled date/time templates on each expansion; new starter shortcuts include dynamic /today, /time, and /now without changing existing saved snippets.
- Add optional cursor-side shortcut suggestions, off by default, with explicit insertion and protected-field/site exclusions.
- Add Save selection to Fillin to the right-click menu, using temporary local drafts and a separate editor. This adds the contextMenus permission.
- Add local fill-in templates with repeated fields, a completed-message preview, safe cancellation, and explicit copying for unsupported editors.
- Add one final {{cursor}} marker with verified positioning in supported fields and clean copying for unstable rich-text positions and Google Docs.
- Add optional editing after insertion in supported text inputs and textareas, with independent placeholders, Tab/Shift+Tab navigation, native undo/redo, and safe cleanup.
- Preserve literal snippets and backup metadata, avoid counting copied or unconfirmed insertions, and count inline savings without placeholder labels or user typing.
- Expand automated checks to 246 shared/extension unit tests and 72 installed Chromium checks; retain website and release-integrity checks.

## [0.0.5] - 2026-11-10

- Fix the collapsed toolbar popup by giving its document an explicit width and intrinsic height, while fitting the content to the height Chrome provides.
- Add regression checks that open the real toolbar popup without an emulated viewport, covering first-use guidance, the saved library, and the editor's Save button.

## [0.0.4] - 2026-11-07

- Redesign the extension popup with a clearer library, labeled backup tools, visible edit and delete actions, readable rich-text previews, and improved search and tag filtering.
- Keep Save visible while editing, improve shortcut validation and field labels, and preserve the popup during successful saves.
- Add keyboard-safe dialogs with focus restoration, validate site-setting input, and preserve entered domains when a save fails.
- Refresh the first-use guide styling and add installed-browser checks for the redesigned library, editor, dialogs, and site settings.

## [0.0.3] - 2026-11-07

- Guide new users through creating a shortcut, practicing expansion with correct cursor placement, and exporting a restorable JSON backup.
- Resume unfinished guidance after saving a shortcut, remember skipped or completed setup, and keep existing libraries in their usual view.
- Handle guide storage and backup read failures with recoverable errors, and verify the complete first-use flow in the installed extension.

## [0.0.2] - 2026-11-07

- Preserve saved snippets when storage reads fail or saved data is invalid, with a retry action in the popup.
- Prevent concurrent snippet, statistics, and blocked-website updates from overwriting one another.
- Use the Google Docs clipboard fallback only after insertion fails, and confirm a successful copy before prompting to paste.
- Remove the waitlist and make the remaining health API independently deployable.
- Keep extension packaging independent of the website and compile the shared package before dependent builds.
- Add GitHub checks for typechecking, unit tests, production builds, and nine real-browser extension tests.
- Align extension versions and verify the website download using SHA-256 and the built extension's file contents.

## [0.0.1]

- Initial local-first extension with snippet management, text expansion, command palette, tags, local statistics, backups, and website pausing.
