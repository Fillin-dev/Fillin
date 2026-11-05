import AdmZip from 'adm-zip';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distDir = path.resolve(__dirname, '../dist');
const targetPath = path.resolve(__dirname, '../build/fillin-extension.zip');
const outputDir = path.dirname(targetPath);

if (!fs.existsSync(distDir)) {
  console.error('dist/ directory not found! Please run build first.');
  process.exit(1);
}

fs.mkdirSync(outputDir, { recursive: true });

const zip = new AdmZip();
zip.addLocalFolder(distDir);

zip.writeZip(targetPath);
console.log(`Successfully bundled extension to ${targetPath}`);
