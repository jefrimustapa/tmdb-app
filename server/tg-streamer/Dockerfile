FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:20-alpine
# ffmpeg/ffprobe are used for audio transcode and probing (found on PATH)
RUN apk add --no-cache ffmpeg tini curl
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .

# Persistent state (streams.json, settings.json) lives in /data, mounted as a volume
RUN mkdir -p /data && chown -R node:node /app /data
USER node

ENV PORT=3033 \
    DATA_DIR=/data \
    LOG_FILE=/data/tg-streamer.log \
    NODE_ENV=production
VOLUME ["/data"]
EXPOSE 3033

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3033/tg/health | grep -q '"status":"ok"' || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "--expose-gc", "index.js"]
