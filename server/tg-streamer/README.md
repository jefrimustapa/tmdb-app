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

## Stream buffering: concurrency and Overlap Prefetch
Telegram serves a file in blocks of at most 512 KB, and each block costs one round trip (RTT) to the Telegram DC. Fetching one block at a time gives only about 512 KB / RTT, which is too slow for 1080p/4K. **Concurrency** is the number of blocks requested in parallel (a sliding read-ahead window of N x 512 KB, `fillPipeline` in `streamTelegramPipelined`); blocks are still sent to the player in order. Defaults per quality tier (`resolvers/base.js`): sd 2, 720p 4, 1080p 6, 4k 8, editable in the dashboard. Probe and tail-metadata reads are capped at 3. The block the player is waiting on counts inside the window, so while it is being written N-1 other blocks are in flight.

**Single-block start (issue #278).** Previously the start block and the whole window (N more blocks) were requested in the same tick. All requests share one MTProto connection, so the idea was that this burst could delay the first block, the only one the player waits for. Now the start block is requested alone, on a fresh play and on a seek alike. As soon as it arrives the full-concurrency window starts, and the first block is then written to the player, so the buffer builds while playback is already running.

Measured effect: none that stands out. On the router, 6 seeks to uncached offsets (concurrency 10, `curl` time to first byte) gave a median of about 1.6 s with the old burst and about 1.85 s with the single-block start; the same new code gave about 0.55 s in an earlier run. Telegram latency varies more between runs than the difference between the two methods, so this change is about ordering and observability (the timeline log below), not a proven speed-up.

**Overlap Prefetch** (dashboard, "Engine Prefetch & RAM Cache"; setting `overlapPrefetch`) only controls *when* that window starts, within one stream. It has nothing to do with the next episode (that is the separate `/api/prefetch` resolver warm-up).
- Enabled (default): the window starts when the first block arrives, before it is written to the player. The next blocks are usually ready by the time the first one has been sent.
- Disabled: the window starts after the first block has been written, so there is one extra round trip before block 2.

The log (`/tmp/tg-streamer.log` on the router, emptied on restart) tracks the sequence for every non-probe stream request:
```
[PIPELINE START]             ... blocks 683..3276, concurrency: 10
[PIPELINE FIRST BLOCK]       block 683 arrived alone at 640ms (concurrency 10, window starts now)
[PIPELINE WINDOW]            read-ahead window filled at 641ms: 10/10 blocks requested (684..693)
[PIPELINE FIRST BLOCK SENT]  block 683 written to the player at 645ms
```
A first block of 0-1 ms comes from the RAM block cache (blocks 0-3 and anything already fetched), not from Telegram. `[PIPELINE END|CLOSED] ... first block Nms` still gives the same figure in the summary.

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
