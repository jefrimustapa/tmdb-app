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
- Automated Telegram Bot (`@msm32bot`) query and link authorization via MTProto.
- Multi-tier search fallback for Movies and TV Series (`S01E01`, `E01`, `Episod 1`).
- HTTP 206 Partial Content Range streaming proxy for instant video playback and seeking.
- Memory caching and request deduplication.

## Environment Variables
- `TG_API_ID`: Telegram API ID
- `TG_API_HASH`: Telegram API Hash
- `TG_SESSION`: Telegram session string (can be authenticated via `/auth`)
- `PORT`: 7860
