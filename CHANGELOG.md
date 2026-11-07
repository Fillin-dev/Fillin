# Changelog

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
