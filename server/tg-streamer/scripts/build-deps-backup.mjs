#!/usr/bin/env node
/**
 * Build the clean dependency backup used by S99tg-streamer to self-heal a corrupted node_modules.
 *
 * Runs `npm ci` from package.json + package-lock.json in a temp folder (no scripts), then writes:
 *   node_modules.tgz     clean copy of node_modules
 *   node_modules.md5     md5sum -c manifest of every file (paths relative to the app dir)
 *   package-lock.md5     md5 of package-lock.json (CRs stripped); the router skips the heal when it differs
 *
 * Usage: node scripts/build-deps-backup.mjs [outDir]      (default: ./deps-backup)
 * Deploy: copy the three files to /tmp/mnt/ASUS-USB/tg-streamer-deps/ on the router (the second disk).
 * Rebuild and redeploy whenever package-lock.json changes.
 */
import { execFileSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(process.argv[2] || 'deps-backup');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-deps-'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const md5 = (buf) => crypto.createHash('md5').update(buf).digest('hex');

try {
  for (const f of ['package.json', 'package-lock.json']) {
    fs.copyFileSync(path.join(appDir, f), path.join(work, f));
  }
  execFileSync(npm, ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: work, stdio: 'inherit', shell: process.platform === 'win32' });

  const lines = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === '.bin' || e.name === '.package-lock.json') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) lines.push(`${md5(fs.readFileSync(p))}  ${path.relative(work, p).split(path.sep).join('/')}`);
    }
  })(path.join(work, 'node_modules'));
  lines.sort((a, b) => a.slice(34).localeCompare(b.slice(34)));

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'node_modules.md5'), lines.join('\n') + '\n');
  const lock = fs.readFileSync(path.join(appDir, 'package-lock.json')).toString('latin1').replace(/\r/g, '');
  fs.writeFileSync(path.join(outDir, 'package-lock.md5'), md5(Buffer.from(lock, 'latin1')) + '\n');
  // relative archive name + cwd: GNU tar treats a drive letter such as C: in -f as a remote host
  execFileSync('tar', ['czf', 'node_modules.tgz', '-C', work, '--exclude=node_modules/.bin', 'node_modules'], { cwd: outDir, stdio: 'inherit' });

  console.log(`${lines.length} files; backup written to ${outDir}`);
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
