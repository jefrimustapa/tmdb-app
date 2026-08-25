import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pkgPath = path.resolve(__dirname, '../package.json');
const distPath = path.resolve(__dirname, '../dist');

// 1. Verify that dist/ directory and index.html exist
if (!fs.existsSync(distPath) || !fs.existsSync(path.resolve(distPath, 'index.html'))) {
  console.error('\n❌ [Post-Build Error] dist/ directory or index.html is missing!');
  process.exit(1);
}

// 2. Read package.json and commit increment only after 100% successful compile
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const newBuild = (pkg.buildNumber || 0) + 1;
pkg.buildNumber = newBuild;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

console.log(`\n[Version Tracker] ✅ Successfully committed Build #${newBuild} to package.json`);
