FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .

# Hugging Face Spaces runs as user 1000
RUN chown -R 1000:1000 /app
USER 1000

EXPOSE 7860
ENV PORT=7860
CMD ["node", "index.js"]
