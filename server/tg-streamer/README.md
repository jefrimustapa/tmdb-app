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

## Network speed test (issue #281)
The app (Settings > Telegram Provider > TGStrm > Diagnostics & Analytics > Network Speed Analytics, mobile and Android TV) measures stream delivery for 720p, 1080p and 4K, one quality after another (SD is not tested). Four endpoints (also under `/tg/api` and `/msm/api`), all behind the geo-block:
- `GET /api/speedtest/targets?tiers=720p,1080p,4k`: one sample file per quality from the central DB plus a single-use `testId`. Sample choice is stable, not random: among the tier's files big enough for a test, the Telegram DC holding most of them, then the median-sized file of that DC; only the read offset is random (middle of the file, away from the pinned head/tail blocks). Also returns the test size `mb`, the budget and the minimum Mbps per quality. Qualities without a sample come back in `missing`.
- `GET /stream/<docId>?speedtest=<testId>`: the normal stream path (Telegram to router to client) for `speedTestMb` MB at the server-chosen offset. It bypasses the RAM block cache (no reads, no writes), never transcodes, and uses its own session key so it cannot abort real playback. The id is single use (409 afterwards).
- `GET /api/speedtest/result?id=<testId>`: server-side numbers of that transfer (first block, sustained Mbps, time spent waiting for blocks / for the socket).
- `GET /api/speedtest/download`: `speedTestMb` MB of random bytes from RAM, no Telegram: the router to device baseline.

The app compares the stream's sustained rate (after the first 512 KB block) with the minimum for the quality (Netflix: 720p 3, 1080p 5, 4K 15 Mbps): under 1.0x is too slow, 1.0-1.5x marginal, 1.5x or more smooth. If the stream stays well below the baseline (under 85%) the limit is on the server side (Telegram to router or the router itself); if it reaches the baseline the device network is the limit. The baseline is the path the client really uses to reach TGStrm: TGStrm runs on the router, so on the home network it is the Wi-Fi/LAN speed, and the router's per-device Bandwidth Limiter does not apply to it (that limiter skips traffic from the router itself and only shapes internet-sourced traffic); from outside it is the internet path.

Server settings (dashboard `/tg/settings` > Engine, or `POST /api/settings`): `speedTestMb` (default 16, 12-64; the block size is 512 KB and the 1080p/4K window about 10 blocks, so a smaller test never fills the window) and `speedTestBudgetMbPerMin` (default 150 per client IP; HTTP 429 with Retry-After beyond it). A 3-quality run at 16 MB is about 48 MB. Log lines: `[SPEEDTEST]` and `[SPEEDTEST END]`.

## Docker deployment (Firebat) - issue #301
TGStrm runs as a container on Firebat behind Nginx Proxy Manager (NPM) at `https://tgstrm.julietmike.net`. The image (`ghcr.io/jefrimustapa/tg-streamer`) is built by `.github/workflows/tg-streamer-image.yml`: PRs only build, a push to a `ci/issue-301-**` branch publishes a branch tag (for testing), `main` publishes `latest`.

Files on Firebat (e.g. `~/tg-streamer/`): `docker-compose.yml`, `.env` (`TG_API_ID`, `TG_API_HASH`, `TG_SESSION`, `TG_BOT_USERNAME`), and `data/` (volume with `streams.json` and `settings.json`).

```bash
docker compose pull && docker compose up -d     # deploy / update
docker compose logs -f tg-streamer
TGSTRM_TAG=ci-issue-301-convert-tgstrm-to-docker-move-location TGSTRM_HOST_PORT=3043 docker compose up -d   # test a branch build on another port
```

NPM Proxy Host: domain `tgstrm.julietmike.net`, forward to `tg-streamer:3033` (the container joins `npm_default`) or `192.168.0.120:3033`, request a Let's Encrypt cert, Force SSL. Advanced tab: `proxy_buffering off; proxy_request_buffering off; proxy_read_timeout 3600s; proxy_send_timeout 3600s;` so Range streaming and long resolves are not cut. NPM sets `X-Forwarded-For` / `X-Real-IP`, which the geo-block uses as the client IP.

### Migration from the router
1. Copy `TG_*` from the router `.env` and the router `data/` folder to Firebat (the Telegram session is reused; stop the router instance before starting the container, two live users of one session can invalidate it).
2. Start the container, check `https://tgstrm.julietmike.net/tg/health`.
3. On the router set `REDIRECT_TO=https://tgstrm.julietmike.net` in its `.env` and restart `S99tg-streamer`: every request except `/tg/health` now answers `307` to the new host (old app installs keep working). Rollback: remove the variable and restart. Each client (IP + user agent) is logged once per 10 minutes as `[REDIRECT] ip | agent -> url` in `/tmp/tg-streamer.log`, to see who still uses the old URL before the router instance is removed (#302).
4. Cleanup of the router instance and the redirect is tracked in #302.

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
