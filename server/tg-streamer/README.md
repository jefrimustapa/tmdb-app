---
title: MSM Getter
emoji: 🎬
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# MSM Getter Microservice

High-performance direct stream resolver and Telegram MTProto video proxy for TMDB Streamer.

## Features
- Web Authentication Portal at `/auth`.
- Automated Telegram Bot (`@msmbot` / configurable via `TG_BOT_USERNAME`) query and link authorization via MTProto.
- Multi-tier search fallback for Movies and TV Series (`S01E01`, `E01`, `Episod 1`).
- HTTP 206 Partial Content Range streaming proxy for instant video playback and seeking.
- Memory caching and request deduplication.

## Environment Variables
- `TG_API_ID`: Telegram API ID
- `TG_API_HASH`: Telegram API Hash
- `TG_SESSION`: Telegram session string (can be authenticated via `/auth`)
- `PORT`: 7860

## Router deployment and disk-corruption recovery
The service runs on the ASUS router (Entware): app in `/tmp/mnt/Entware/entware/app/tg-streamer`, started by `/opt/etc/init.d/S99tg-streamer` (supervisor that respawns Node). The Entware USB disk has had ext4 errors, so recovery is automated at three levels.

### node_modules and its backup
`node_modules` is third-party code installed from `package.json` / `package-lock.json` (axios, express, telegram, ... 149 packages, about 5200 files). Changing your own code (`index.js`, `resolvers/*`, `db.js`) never changes it. It only changes when you add or update an npm package; the router has no `npm`, so new dependencies are installed on the PC and uploaded.

Before every Node spawn the supervisor verifies `node_modules` against an md5 manifest kept on the **second disk** (`/tmp/mnt/ASUS-USB/tg-streamer-deps/`: `node_modules.tgz`, `node_modules.md5`, `package-lock.md5`). Missing or corrupted files are restored from the tgz and logged as `[SUPERVISOR HEAL]`. If they cannot be restored it logs `[SUPERVISOR ERROR] corrupted dependency` and waits 300 s instead of crash-looping. When the backup is missing, or stale (the lockfile changed), the check is skipped with a `[SUPERVISOR WARN]` line.

**Regenerate the backup only when `package.json` / `package-lock.json` changes** (not on code changes, and not on a schedule: its content depends only on the lockfile). Run from `server/tg-streamer`, after the new `node_modules` and lockfile are on the router:
```bash
node scripts/deploy-deps-backup.mjs            # build (npm ci), upload to the second disk, verify checksums
node scripts/deploy-deps-backup.mjs --dry-run  # build only, router untouched
```
Env overrides: `DEPLOY_HOST` (default `jm`), `DEPS_REMOTE_DIR`, `APP_REMOTE_DIR`. The script warns when the router lockfile differs from the repo one. `scripts/build-deps-backup.mjs` only builds the three files locally.

### Disk check and auto-mount (`server/router-scripts/pre-mount`, installed as `/jffs/scripts/pre-mount`)
Before the Entware disk is mounted, `e2fsck -p` runs and falls back to `e2fsck -y` on errors (its real exit code is used). A long fsck makes the firmware give up waiting (about 120 s, syslog `failed to mount!`), so a detached watcher mounts the disk afterwards if it is still unmounted and then runs `post-mount`. It does nothing when the firmware mounted normally. Look for `pre-mount:` lines in `/tmp/syslog.log`.

`e2fsck -y` deletes files it cannot read, which is why the dependency self-heal above exists. Files outside `node_modules` (for example `data/streams.json`) are not restored automatically.
