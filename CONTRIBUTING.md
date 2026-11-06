# Contributing to Fillin

Thank you for contributing to Fillin! Please review the rules in `AGENTS.md` before making any PRs, and adhere to our decoupled architecture.

## Development Setup

1. **Install Dependencies:**
   ```bash
   pnpm install
   ```
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

## Production Builds
To verify your changes do not break production bundles:
```bash
pnpm exec turbo run build
```
See `apps/extension/BUILD.md` for specific instructions on packing the Chrome extension for submission.
