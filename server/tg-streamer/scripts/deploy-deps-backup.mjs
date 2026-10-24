#!/usr/bin/env node
/**
 * Build the clean node_modules backup and put it on the router's second disk, where S99tg-streamer
 * self-heals node_modules from it (see build-deps-backup.mjs). Run whenever package-lock.json changes.
 *
 * Usage: node scripts/deploy-deps-backup.mjs [--dry-run]
 *   --dry-run   build only, do not touch the router
 * Env:
 *   DEPLOY_HOST      ssh host alias (default: jm)
 *   DEPS_REMOTE_DIR  backup folder on the second disk (default: /tmp/mnt/ASUS-USB/tg-streamer-deps)
 *   APP_REMOTE_DIR   app folder on the router (default: /tmp/mnt/Entware/entware/app/tg-streamer)
 */
import { execFileSync, spawnSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const host = process.env.DEPLOY_HOST || 'jm';
const depsDir = process.env.DEPS_REMOTE_DIR || '/tmp/mnt/ASUS-USB/tg-streamer-deps';
const appDir = process.env.APP_REMOTE_DIR || '/tmp/mnt/Entware/entware/app/tg-streamer';
const dryRun = process.argv.includes('--dry-run');
const FILES = ['node_modules.tgz', 'node_modules.md5', 'package-lock.md5'];

const here = path.dirname(fileURLToPath(import.meta.url));
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-deps-out-'));
const md5 = (buf) => crypto.createHash('md5').update(buf).digest('hex');

function ssh(command, input) {
  const res = spawnSync('ssh', ['-o', 'ConnectTimeout=15', host, command], { input, maxBuffer: 64 * 1024 * 1024 });
  if (res.status !== 0) {
    throw new Error(`ssh ${host} "${command}" failed (${res.status}): ${String(res.stderr || res.error || '').trim()}`);
  }
  return String(res.stdout);
}

try {
  console.log('1/4 Building clean dependency backup (npm ci)...');
  execFileSync(process.execPath, [path.join(here, 'build-deps-backup.mjs'), out], { stdio: 'inherit' });
  const local = Object.fromEntries(FILES.map((f) => [f, fs.readFileSync(path.join(out, f))]));
  for (const f of FILES) console.log(`    ${f}  ${(local[f].length / 1024).toFixed(0)} KB`);

  if (dryRun) {
    console.log(`Dry run: nothing uploaded. Would copy to ${host}:${depsDir}`);
  } else {
    console.log(`2/4 Uploading to ${host}:${depsDir} ...`);
    ssh(`mkdir -p '${depsDir}'`);
    for (const f of FILES) ssh(`cat > '${depsDir}/${f}'`, local[f]);

    console.log('3/4 Verifying checksums on the router...');
    const remote = new Map(ssh(`cd '${depsDir}' && md5sum ${FILES.join(' ')}`)
      .trim().split('\n').map((l) => l.trim().split(/\s+/).reverse()));
    let ok = true;
    for (const f of FILES) {
      const match = remote.get(f) === md5(local[f]);
      ok = ok && match;
      console.log(`    ${match ? 'OK      ' : 'MISMATCH'} ${f}`);
    }
    if (!ok) throw new Error('checksum mismatch after upload; run it again');

    console.log('4/4 Checking the router lockfile matches this backup...');
    const routerLock = ssh(`tr -d "\\r" < '${appDir}/package-lock.json' | md5sum`).trim().split(/\s+/)[0];
    const backupLock = local['package-lock.md5'].toString().trim();
    if (routerLock === backupLock) {
      console.log('    OK       router package-lock.json matches the backup');
    } else {
      console.warn('    WARNING  router package-lock.json differs from the repo lockfile.');
      console.warn('             S99tg-streamer will skip the node_modules check ("backup is stale")');
      console.warn('             until the router runs the same lockfile/node_modules.');
    }
    console.log('Done.');
  }
} finally {
  fs.rmSync(out, { recursive: true, force: true });
}
