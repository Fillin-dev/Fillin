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
