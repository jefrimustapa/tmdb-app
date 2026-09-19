# MSM Getter Microservice

High-performance direct stream resolver and Telegram MTProto video proxy for TMDB Streamer.

## Features
- Automated Telegram Bot (`@msm32bot`) query and link authorization via MTProto.
- Multi-tier search fallback for Movies and TV Series (`S01E01`, `E01`, `Episod 1`).
- HTTP 206 Partial Content Range streaming proxy for instant video playback and seeking.
- Memory caching of resolved documents.

## Environment Variables
Create a `.env` file or set environment variables in your cloud host:

```env
TG_API_ID=your_api_id
TG_API_HASH=your_api_hash
TG_SESSION=your_session_string
PORT=8000
```

## Running with Docker
```bash
docker build -t msm-getter .
docker run -p 8000:8000 --env-file .env msm-getter
```
