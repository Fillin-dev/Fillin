# Contributing to Fillin

Thank you for contributing to Fillin! Please review the rules in `AGENTS.md` before making any PRs, and adhere to our decoupled architecture.

## Development Setup

1. **Install Dependencies:**
   Use Node 22 (at least 22.12.0) and the exact pnpm version pinned in `package.json`:
   ```bash
   corepack enable
   pnpm --version # Must match package.json (12.9.1)
   pnpm install --frozen-lockfile
   ```
   If another pnpm executable takes precedence, prefix commands with `corepack` (for example, `corepack pnpm typecheck`). Dependencies are installed explicitly; scripts fail with an error when the installation is out of date instead of reinstalling automatically.
2. **Environment Variables:**
   The frontend needs no backend configuration. The optional backend accepts `PORT` (default `3000`), `NODE_ENV`, and `CORS_ORIGIN` through environment variables or a local `.env` file. See `apps/landing/backend/README.md` for details.

3. **Run the Development Servers:**
   ```bash
   pnpm exec turbo run dev
   ```

## Testing & Quality Assurance
We mandate 100% passing tests across the entire monorepo before any merge.
Run the complete testing pipeline with:
```bash
pnpm exec turbo run lint typecheck test
```
- `lint`: Ensures no unused variables or `console.error` leaks.
- `typecheck`: Runs `tsc --noEmit` across all apps.
- `test`: Executes the Vitest suites.

GitHub's `CI / Typecheck, test, and build` job runs `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm verify:release` on every pull request and pushes to `main`. It uses Node 22, the pnpm version from `package.json`, and a frozen lockfile. It does not deploy or update the website download. Repository administrators can make this job a required status check in branch protection.

CI also loads the production extension in Playwright's Chromium and checks real typing, cursor placement, password fields, rich-text insertion, and concurrent extension windows. To run these checks locally:

```bash
corepack pnpm --filter @fillin/extension test:e2e:install
corepack pnpm test:e2e
```

The browser suite uses isolated temporary profiles and local fixture pages. See `docs/development/README.md` for coverage, headed mode, and failure reports.

## Production Builds
To verify your changes do not break production bundles:
```bash
pnpm exec turbo run build
```
See `apps/extension/BUILD.md` for specific instructions on packing the Chrome extension for submission.

When extension build contents change, increase its version with `pnpm release:version <version>`, run `pnpm install --frozen-lockfile`, record the changes in `CHANGELOG.md`, and run `pnpm release:extension`. Commit the staged ZIP and release metadata along with the source changes. See [the release guide](docs/development/releases.md).
