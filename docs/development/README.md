# Development Guide

This directory contains resources for building and testing Fillin locally.

## Dependency Setup
Use Node 22 (22.12.0 or later) and pnpm 12.9.1. From the repository root:

```bash
corepack enable
pnpm --version
pnpm install --frozen-lockfile
```

If `pnpm --version` reports a different version, use `corepack pnpm` for installation and scripts. The workspace checks dependency state before running scripts and reports an error instead of initiating an automatic reinstall. After changing dependencies, install explicitly and commit the lockfile update.

The GitHub CI workflow runs typechecks, tests, and production builds for every pull request and on pushes to `main`.

## Chrome Extension Loading
To test the extension locally:
1. Build it and its shared dependency from the repository root: `pnpm exec turbo run build --filter=@fillin/extension`.
2. Open Chrome -> `chrome://extensions/`.
3. Enable "Developer mode".
4. Click "Load unpacked" and select `apps/extension/dist`.
5. The extension is now loaded! You can open the popup and start creating snippets.

### Extension Development
The extension runs on Vite. However, due to Chrome Extension CSP and module loading, hot module replacement (HMR) for the content scripts requires special configuration or manual rebuilds. For the popup, `pnpm run dev` works natively.
The content script is explicitly bundled as an IIFE via `vite.content.config.ts`.

## Real-browser Extension Tests

Install the test browser once, then run the suite from the repository root:

```bash
corepack pnpm --filter @fillin/extension test:e2e:install
corepack pnpm test:e2e
```

The root command builds the shared package and extension before launching Playwright's Chromium with the unpacked `apps/extension/dist` extension. Each test uses a fresh temporary browser profile and a local HTTP fixture server. It does not use your personal Chrome profile or saved snippets.

The suite covers popup creation and persistence, typed expansion in inputs and textareas, cursor placement in the middle of text, multiline snippets, password-field exclusion, plain and formatted contenteditable insertion, simultaneous saves from two separate extension windows, and statistics updates from different website origins. Storage and messaging use the browser's real extension APIs; no content script is injected manually and no adapters are mocked. Third-party editor integrations such as Google Docs still need manual site-specific checks.

Toolbar sizing is checked separately with `chrome.action.openPopup()` and no emulated viewport. These tests inspect the actual popup through Chrome's debugging interface because toolbar popups are not exposed as Playwright pages. Do not replace them with a fixed-size window: that hides popup auto-sizing failures. The document needs intrinsic dimensions before the content can adapt to Chrome's available height. Assert the document and body are exactly 400px wide; Chromium on Linux may reserve an additional 4px for the scrollbar in its viewport. The checks still reject clipping, collapsed content, and oversized viewports, including after opening the editor.

To watch the browser after building, or inspect the most recent report:

```bash
corepack pnpm --filter @fillin/extension test:e2e --headed
corepack pnpm --filter @fillin/extension exec playwright show-report
```

Set `FILLIN_E2E_PORT` if the default local port `4177` is occupied. Browser tests run separately from the unit suite, with retries disabled. Failure traces and screenshots are attached to the HTML report. Generated reports and results are ignored by Git.

GitHub CI installs Chromium with its system dependencies and runs these checks after the production builds. Reports and failure traces are uploaded as the `extension-browser-tests` artifact and retained for seven days.

Visual-snippet checks additionally cover original media across restarts, confirmation and undo, protected fields, bounded messaging, full backup restoration into a fresh profile, failed writes and repair. `media-release.spec.ts` runs axe WCAG A/AA checks, keyboard/focus checks, narrow layouts, and a content-script resource probe that verifies typing transfers no media and repeated preview cancellation revokes every object URL. A service test checks that 100 shortcuts sharing a file read the original only once during reconciliation. Automated checks do not replace manual assistive-technology or third-party application testing. See the [user guide](../product/visual-snippets.md) and [release review](visual-snippets-release.md).

## Landing Page Development
The landing page (`apps/landing/frontend`) is a standard Vite + React + TailwindCSS application.
- Run `pnpm exec turbo run dev --filter=@fillin/landing-frontend` from the repository root to build the shared package before starting Vite.
- The frontend does not require a backend or API URL.

## Backend Development
The optional backend (`apps/landing/backend`) is a standalone Node.js + Fastify health API.
- Run `pnpm --filter @fillin/landing-backend run dev`.
- Provide a `.env` with `CORS_ORIGIN=http://localhost:5173` to accept requests from your local frontend.
- Provide `PORT=3000`.
- See `apps/landing/backend/README.md` for independent production builds and deployment.
