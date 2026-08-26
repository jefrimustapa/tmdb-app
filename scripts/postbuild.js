import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distPath = path.resolve(__dirname, '../dist');

// 1. Verify that dist/ directory and index.html exist
if (!fs.existsSync(distPath) || !fs.existsSync(path.resolve(distPath, 'index.html'))) {
  console.error('\n❌ [Post-Build Error] dist/ directory or index.html is missing!');
  process.exit(1);
}

// 2. Add 404.html and .nojekyll for GitHub Pages SPA routing
fs.copyFileSync(path.resolve(distPath, 'index.html'), path.resolve(distPath, '404.html'));
fs.writeFileSync(path.resolve(distPath, '.nojekyll'), '', 'utf8');

console.log('\n[Version Tracker] ✅ Post-build verification complete. SPA routes & assets prepared.');
