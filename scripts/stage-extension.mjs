import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../apps/extension/build/fillin-extension.zip', import.meta.url));
const destination = fileURLToPath(new URL('../apps/landing/frontend/public/fillin-extension.zip', import.meta.url));

if (!existsSync(source)) {
  console.error('Extension archive not found. Run pnpm release:extension from the repository root.');
  process.exit(1);
}

mkdirSync(dirname(destination), { recursive: true });
copyFileSync(source, destination);
console.log(`Staged extension download at ${destination}`);
