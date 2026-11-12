# Save selection to Fillin — phase 3

## Usage and scope

Select text on an HTTP/HTTPS page, right-click and choose **Save selection to Fillin**. The extension opens its own editor with a suggested unused trigger, the selected plain text, and optional tags. The shortcut field receives focus. Existing conflict checks, date-template options and save validation apply. Captures start with HTML and template interpretation disabled, so text such as `<b>{{date}}</b>` remains literal.

Save uses the existing snippet service and cross-window write lock. Cancel, the back button, or closing the window creates no snippet. Failed saves retain the edited form. If persistence succeeds but temporary-draft cleanup fails, the editor displays a saved state with a cleanup retry; it cannot submit a second snippet.

The only added permission is `contextMenus`. No clipboard reading, network requests or new site permissions are added. The extension remains independent of the landing page, backend and deployment.

## Selection verification

The menu callback checks both page and frame URLs against freshly read blocked-site settings. A settings read failure refuses capture. The originating content frame verifies a trusted right-click within the last 30 seconds, a connected target, and an unchanged selection. Its stored context is only an element reference and timestamp, not selected text. Successful or failed verification consumes that reference.

Native text fields and textareas exclude passwords, one-time-code/password autocomplete, disabled/readonly fields and unsupported input types before accessing their values. Standard DOM selections and contenteditable selections are supported. Missing content scripts, changed selections, inaccessible frames, canvas selections, browser pages and unsupported targets show an extension-owned explanation. Reload existing tabs after updating the unpacked extension so their verification handler is available.

## Temporary data and recovery

The background worker serializes writes to one validated `chrome.storage.session` map. Each draft has a random opaque identifier, a ten-minute expiry, and its own editor window ID. Only the identifier appears in the editor URL. Selected text and source URLs never appear in URLs or logs. The session area uses trusted-context access; the read/discard message handler checks the extension sender, editor path, matching draft ID and window binding.

Drafts survive worker restarts and remain isolated across editors. There can be five pending drafts of at most 100,000 UTF-16 code units each. Oversized selections are refused rather than truncated. Invalid/failed reads never become an empty map; failed writes leave the original data intact. Closing one window clears only its draft. Expired drafts cannot be loaded and are physically pruned on the next draft mutation; browser restarts clear the session area. A form already loaded into an open editor can still save after the draft expires.

## Validation

Unit checks cover storage failure/corruption, concurrent drafts, worker restarts, expiry/cap/size limits, window binding, menu registration, frame selection verification, current blocked-site checks, untrusted senders, failed editor navigation, save recovery and duplicate-free cleanup retries.

Local validation passed: extension typecheck, production build/package, 171 extension unit tests, and all 27 installed Chromium tests. The capture editor is also checked at a 440 × 700 viewport.

Installed Chromium tests cover multiple real editor windows, literal content, successful save/cancel, preserving edited content and the original library on a failed save, expired-draft recovery, and trusted right-click verification in the real content script including password exclusion. Browser editor tests create session drafts directly; the native menu dispatch is covered by worker unit tests. Manually verify choosing the actual Chrome context-menu item before claiming full native-menu compatibility. Live Gmail, Notion, Google Docs and screen-reader behavior are not claimed by these checks.

## Review boundary

Stop after phase 3. Fill-in template dialogs and cursor markers are later phases. Release 0.1.0 includes this feature in the website download.
