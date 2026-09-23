# Context & Architectural Analysis: MKV Telegram Playback Audio & Progress Issue

**Date:** 2026-09-23  
**Workspace:** `D:\ai_project\tmdb_stream`  
**Active Branch:** `fix/mkv-telegram-playback-no-sound`  
**Pull Request:** [PR #136](https://github.com/jefrimustapa/tmdb-app/pull/136) (clean baseline)  
**Target Platform:** Android Phone (and Android TV) running in-app TMDB Streamer (`CustomDirectPlayer.tsx`)  

---

## 1. Objective & User Constraints

- **Core Goal:** Fix audio silence when streaming `.mkv` files with Dolby audio (`ac3` / `eac3`) from Telegram (MSM32 provider) inside the **in-app player** (`CustomDirectPlayer.tsx`).
- **Strict Constraint:** **NO external player launching** (VLC, MX Player, or Intent dialogs are strictly rejected; playback must remain 100% inside `tmdb-app`).
- **Hardware Target:** ASUS RT-AX86U router (`admin@julietmike.net:2222`), running `msm-getter` microservice on port 3033.

---

## 2. Root Cause Analysis

### Issue A: Why Direct MKV Playback Has No Sound in Android WebView
- **Container (`.mkv`):** Android Chromium WebView has a built-in Matroska demuxer; it loads and plays `.mkv` containers natively.
- **Video (`h264` / `hevc`):** Android hardware decoders decode both codecs smoothly.
- **Audio (`ac3` / `eac3`):** Chromium on Android **omits proprietary Dolby AC3/EAC3 software decoders** due to licensing. When an MKV contains `eac3 5.1` (e.g. *Ice Cream Man*) or `ac3` (e.g. *Spider-Man*), the audio track fails silently while video continues playing.
- **Audio Supported Natively:** AAC (`aac`), MP3, Opus (`opus`), Vorbis, FLAC.

### Issue B: Why the Experimental HLS Transcoder Failed with a 14-Minute Progress Bar
When testing on-demand HLS audio transcoding (`-c:v copy -c:a aac -hls_time 4`), playback of *Ice Cream Man* showed only ~14 minutes total runtime, and seeking failed:

1. **In-Flight Stream Self-Cancellation (`server/msm-getter/index.js:2125-2130`):**
   - `ffmpeg` connected locally via `https://127.0.0.1:3033/stream/:docId`.
   - `msm-getter`'s active-stream limiter keys sessions by `clientSession = req.headers['x-client-id'] || req.ip || ...`.
   - When `ffmpeg` opened a second connection (for range/probing), the server logged:
     `[STREAM CANCEL] Terminating previous in-flight stream for client ::ffff:127.0.0.1 doc 5875111800290158314 on new seek.`
   - This aborted `ffmpeg`'s source download stream mid-transcode. Receiving an unexpected EOF, `ffmpeg` finalized the playlist at segment 502 with `#EXT-X-ENDLIST` and exited, permanently truncating the playlist at ~14–20 minutes.
2. **Dynamic Playlist Duration vs Seekbar Duration (`CustomDirectPlayer.tsx:691-695`):**
   - In `CustomDirectPlayer.tsx`, seekbar duration was driven solely by `video.duration`.
   - During live/in-progress HLS transcoding without `#EXT-X-ENDLIST`, `video.duration` only reflects the segments parsed so far by `hls.js`.
   - The player did not utilize the true movie runtime (from TMDB `details.runtime` or Telegram `DocumentAttributeVideo.duration`).
   - Seeking ahead to un-generated segments failed because those `.m4s` fragment files did not exist on disk yet.
3. **USB Flash Storage Bottleneck:**
   - Slicing a 90-minute movie into 4-second fragments creates ~1,350 `.m4s` files on the router's USB flash storage, causing file system latency, wear, and potential storage corruption.

---

## 3. Evaluated Architectural Options

### Option A: On-Demand HLS (`.m3u8` + `.m4s` files)
- **Mechanism:** `ffmpeg` writes progressive fMP4 segments to router disk; player consumes via `hls.js`.
- **Pros:** Standard HLS protocol.
- **Cons:** High disk I/O (1,000+ files per movie), orphan cache management, seeking forward stalls until future segments are transcoded.

### Option C: Time-Offset Pipe (`/stream/:docId?transcode=audio&ss=<timestamp>`)
- **Mechanism:** `ffmpeg` transcodes on the fly directly to a single continuous HTTP stream (`pipe:1`), passing video untouched (`-c:v copy`) and converting audio to AAC (`-c:a aac`).
- **Disk Usage:** **0 bytes written to disk** (pure RAM / network socket pipe).
- **RAM Footprint:** **~25–35 MB RSS** (Linux kernel pipe is 64 KB; no raw video framebuffers).
- **Seeking (`?ss=`):** When seeking to e.g. 45:00 (`2700s`), the player sends `?ss=2700`. The router starts `ffmpeg` with `-ss 2700`, which jumps directly to the keyframe near 45:00 via Telegram byte range and streams immediately (~1.5s latency).
- **Seekbar Duration:** Set from TMDB runtime / Telegram video attribute so the progress bar always spans the full movie duration.

---

## 4. Current Hardware & System State

### Router Specifications (ASUS RT-AX86U)
- **CPU:** Quad-Core 1.8 GHz ARM Cortex-A53 (Broadcom BCM4908, 64-bit `aarch64`).
- **RAM:** 1 GB total; **~409 MB available/free** (plenty of headroom).
- **USB Storage:** `/tmp/mnt/Entware` on `/dev/sdb1` (Ext4, 105 GB free).
- **Supervisor & Node:** Node.js v18.20.2 supervised by `/opt/etc/init.d/S99msm-getter`. Health check verified: `{"status":"ok","uptime":...,"cachedStreams":43,"activeStreams":0}`.

### Repository & PR State
- **Branch:** `fix/mkv-telegram-playback-no-sound`
- **Commit:** `a128471 fix(watch): eliminate hover tooltip and punch-through splash layer in watch page (#135)`
- **Working Tree:** Clean. Reverted back to `origin/main` baseline. Force-pushed to remote. PR #136 is clean and ready.

---

## 5. Next Steps for Implementation

1. **Implement Transcode Stream Endpoint in `server/msm-getter/index.js`:**
   - Support `/stream/:docId?transcode=audio&ss=<seconds>`.
   - Spawn `ffmpeg` with `-ss <ss> -i <pipe/stream> -map 0:v:0 -map 0:a:0? -c:v copy -c:a aac -ac 2 -b:a 192k -f matroska pipe:1`.
   - Exempt internal transcoding stream requests from `activeStreams` cancellation using an internal header (e.g. `x-stream-consumer: internal-transcoder`).
2. **Update `CustomDirectPlayer.tsx` for Time-Offset Seeking:**
   - Receive `runtimeMinutes` (from TMDB `details.runtime` or `episodeRuntimeMinutes`) to lock the seekbar duration.
   - For transcoded streams, intercept seeking: update URL with `&ss=<seekTarget>` and offset the display clock by `baseOffset + video.currentTime`.
3. **Deploy & Validate:**
   - Deploy `index.js` to router microservice.
   - Test playback of *Ice Cream Man* (`eac3 5.1`) on Android phone: verify audio plays, full duration is shown, and scrubbing works.
