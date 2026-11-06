# Optional backend

This standalone Fastify service exposes `GET /health`. The landing website and extension work without it. No signup data is collected.

## Build independently

The backend directory can be copied outside the monorepo. It has no workspace dependencies or external TypeScript configuration.

From this directory, with Node.js 20 or later:

```bash
npm install
npm run build
npm start
```

The build clears `dist/` and compiles production source only. No test files or TypeScript source packages are needed at runtime.

## Deploy compiled output

After building, copy `dist/` and `package.json` into a deployment directory, then run:

```bash
npm install --omit=dev
NODE_ENV=production npm start
```

Set `PORT` to the platform's assigned port (default `3000`). The server listens on `0.0.0.0`. `CORS_ORIGIN` defaults to `http://localhost:5173` and may be set to an allowed origin when needed. Configure these through environment variables; keep `.env` files private.
