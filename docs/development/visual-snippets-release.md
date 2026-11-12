# Visual snippets: release 0.2.0 review

Phase 7 completed locally on November 12, 2026. The extension package, source manifest, changelog and website download now agree on **0.2.0**. No commit, push, GitHub release or website deployment was performed in this phase.

## Prepared artifact

- Extension: `apps/extension/build/fillin-extension.zip`.
- Website copy: `apps/landing/frontend/public/fillin-extension.zip` and its generated release metadata.
- SHA-256: `5aba80a08a2fa8e16fb6162c6a55b30e639e1d38074a45c50a92282c98f3634b`.
- The existing repository release command rebuilt the extension and website, staged the download, and verified both public and built website copies against every packaged extension file. A subsequent `verify:release` passed after browser tests.
- Normal extension builds still write only inside the extension. Repository release scripts coordinate the website copy. No manifest permission was added.

## Integrated validation

| Check | Result |
| --- | --- |
| Workspace typechecks | Passed for shared, extension, frontend and backend |
| Workspace unit tests | Passed, including 246 extension and 75 shared tests |
| Timezone-dependent shared templates | All 15 template tests passed separately with America/New_York, including the DST case skipped in the local timezone |
| Release tooling | All 11 tests passed |
| Production builds | All packages passed; shared JavaScript/declarations and independent backend output retained |
| Installed Chromium extension suite | 104 passed, retries disabled |
| Website Chromium suite | 40 passed, including downloading the verified release |
| Release integrity | Package/manifest/changelog/public ZIP/deployment ZIP/file hashes agree |
| Diff whitespace | Passed |

Existing dependency deprecation and Rollup annotation warnings are nonfatal. No claims are based on a live GitHub CI run or deployed website in this phase.

## Accessibility review

Standard used for targeted automated review: WCAG 2 A/AA and 2.1 AA tags in axe. The test suite uses the real installed extension. Editor and backup dialog checks run at 390 pixels wide; the editor also fits a 640 × 450 effective desktop viewport. The webpage preview fits within a 390 × 640 viewport.

| Area | Result and evidence |
| --- | --- |
| Form labels, non-text content and contrast | No axe violations in the tested media editor, backup-options dialog and webpage media preview |
| Keyboard | Backup and preview dialogs retain Tab focus; Escape closes them and restores focus to the original control/field |
| Motion | Existing GIF checks verify still-first previews, explicit play/pause and reduced-motion still insertion without altering originals |
| Touch controls | Editor GIF control and caption/animation checkbox rows now have at least 44-pixel height |
| Responsive composition | Installed-browser width checks passed; desktop and phone editor screenshots visually reviewed |
| Status/errors | Existing checks cover save failures, stale fields, missing assets, clipboard rejection and failed restore/retry |

The automated scan waits for the short dialog entrance animation to finish before measuring contrast, so it measures the stable interface. No contrast rule was disabled.

This is a targeted engineering review, not a complete WCAG conformance certification. VoiceOver/NVDA announcements and physical-device/browser zoom have not been manually verified. The effective-viewport check covers layout reflow rather than claiming a full assistive-technology audit.

## Performance and resource review

The library reconciliation now reads and hashes each unique original once per review. A regression with 100 shortcuts sharing one original verifies one read for both a healthy and unavailable file, while still reporting every affected shortcut and preserving metadata.

A Chromium content-script probe verifies ordinary typing sends zero media requests. Six consecutive preview/cancel cycles each create two object URLs and release both on close, leaving zero active preview URLs. Timings and request totals are attached to the test report as `preview-lifecycle`; elapsed time is observational, not a cross-device performance guarantee.

Existing installed checks cover static thumbnails, worker cancellation, original storage across a full browser restart, 10 MiB bounded JSON transfer, 50 MiB persistence, 12-megapixel decoding and the 300-frame limit. Backup extraction and file decoding remain bounded and run in dedicated workers. These tests do not establish a heap-memory ceiling or performance on every supported machine.

## User documentation and support limits

The [user guide](../product/visual-snippets.md), root README and 0.2.0 changelog explain creation, practice, webpage confirmation, complete backups, conflicts, explicit repair, limits and local storage. Text-only JSON remains supported and clearly excludes media.

Direct visual insertion is verified in Fillin practice and ordinary native contenteditable fixtures. Managed editors including Google Docs, Gmail, Notion and chat apps remain manual copy/download/attachment destinations. No live application-specific media sending or persistence is claimed. Protected fields and blocked sites remain excluded.

Before updating or removing an existing installation, export a full ZIP backup. An older text-only Fillin version cannot restore visual backups. Reload the unpacked extension and existing webpage tabs to try the local build.

Publishing this prepared release to GitHub or Vercel requires the next explicit publication instruction. It does not require another feature phase.
