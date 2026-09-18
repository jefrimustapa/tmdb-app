import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { ConnectionTCPObfuscated } from 'telegram/network/connection/TCPObfuscated.js';
import bigInt from 'big-integer';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 3033;
const apiId = parseInt(process.env.TG_API_ID, 10);
const apiHash = process.env.TG_API_HASH;
const session = process.env.TG_SESSION;

if (!apiId || !apiHash || !session) {
  console.error('[ERROR] TG_API_ID, TG_API_HASH, or TG_SESSION missing from .env!');
}

const client = new TelegramClient(new StringSession(session), apiId, apiHash, {
  connection: ConnectionTCPObfuscated,
  connectionRetries: 5,
  deviceModel: 'MSM Getter Server',
  appVersion: '1.0.0',
  systemVersion: 'Linux/Docker',
});

let isConnected = false;
async function initTelegram() {
  if (!isConnected) {
    console.log('[TG] Connecting MTProto...');
    await client.connect();
    isConnected = true;
    console.log('[TG] Connected to Telegram DC!');
  }
}

// In-memory cache for resolved titles: key = cleanTitle -> { docId, filename, size, timestamp }
const streamCache = new Map();

// Helper: Normalize title
function normalizeTitle(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[^\w\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    isConnected,
    cachedStreams: streamCache.size,
  });
});

// Resolver endpoint: /api/resolve?title=Kelas+Cikgu+Hiragi&season=1&episode=1
app.get('/api/resolve', async (req, res) => {
  const { title, year, season, episode } = req.query;
  if (!title) {
    return res.status(400).json({ success: false, error: 'Missing title query parameter' });
  }

  const sNum = season ? parseInt(season, 10) : NaN;
  const eNum = episode ? parseInt(episode, 10) : NaN;
  const isTv = !isNaN(sNum) && !isNaN(eNum);
  const epPadded = isTv ? String(eNum).padStart(2, '0') : '';
  const sPadded = isTv ? String(sNum).padStart(2, '0') : '';
  const tvTag = isTv ? `S${sPadded}E${epPadded}` : '';

  const queryTitle = isTv ? `${title} ${tvTag}` : `${title} ${year || ''}`.trim();
  const cacheKey = normalizeTitle(isTv ? `${title} ${tvTag}` : `${title} ${year || ''}`);

  console.log(`[RESOLVE] Request: "${queryTitle}" (isTv: ${isTv}, cacheKey: "${cacheKey}")`);

  // 1. Check cache
  if (streamCache.has(cacheKey)) {
    const cached = streamCache.get(cacheKey);
    console.log(`[RESOLVE] Cache HIT for "${cacheKey}" -> Doc ID: ${cached.docId}`);
    const host = req.get('host');
    const protocol = req.protocol;
    return res.json({
      success: true,
      cached: true,
      streamUrl: `${protocol}://${host}/stream/${cached.docId}`,
      filename: cached.filename,
      size: cached.size,
    });
  }

  try {
    await initTelegram();

    // 2. Check if matching document was recently delivered in chat
    const recentMsgs = await client.getMessages('msm32bot', { limit: 25 });
    const normSearch = normalizeTitle(title);
    const titleTokens = normSearch.split(' ').filter(t => t.length > 2);

    for (const msg of recentMsgs) {
      if (msg.media?.document) {
        const doc = msg.media.document;
        const fnAttr = doc.attributes?.find(a => a.className === 'DocumentAttributeFilename');
        const filename = fnAttr ? fnAttr.fileName : msg.message;
        const normFn = normalizeTitle(filename);

        // Strict title match check: title tokens must be contained
        const matchesAllTokens = titleTokens.length > 0 && titleTokens.every(t => normFn.includes(t));

        // If TV, filename must also match requested episode
        let matchesEpisode = true;
        if (isTv) {
          const epKeywords = [
            `s${sPadded}e${epPadded}`,
            `s${sNum}e${epPadded}`,
            `s${sPadded}e${eNum}`,
            `e${epPadded}`,
            `episod ${eNum}`,
            `episod ${epPadded}`,
            `ep${epPadded}`,
            `ep ${eNum}`,
          ];
          matchesEpisode = epKeywords.some(kw => normFn.includes(kw));
        }

        if (matchesAllTokens && matchesEpisode) {
          console.log(`[RESOLVE] Found matching document in recent chat: "${filename}" (ID: ${doc.id})`);
          streamCache.set(cacheKey, {
            docId: doc.id.toString(),
            filename,
            size: doc.size,
            timestamp: Date.now(),
          });

          const host = req.get('host');
          const protocol = req.protocol;
          return res.json({
            success: true,
            cached: false,
            streamUrl: `${protocol}://${host}/stream/${doc.id}`,
            filename,
            size: doc.size,
          });
        }
      }
    }

    // 3. Search query strategies: try specific episode query first (e.g. "Title S01E01", "Title E01", etc.)
    const searchQueries = isTv
      ? [
          `${title} S${sPadded}E${epPadded}`,
          `${title} E${epPadded}`,
          `${title} Episod ${eNum}`,
          `${title}`,
        ]
      : [
          year ? `${title} ${year}` : `${title}`,
          `${title}`,
        ];

    let targetMsgId = null;
    let targetButtonId = null;
    let fallbackShortcode = null;
    let chosenFilename = queryTitle;
    let sentMsgId = 0;

    for (const sq of searchQueries) {
      console.log(`[RESOLVE] Querying @msm32bot with: "${sq}"...`);
      const sentMsg = await client.sendMessage('msm32bot', { message: sq });
      sentMsgId = sentMsg.id;

      // Poll for bot reply with download buttons (must be newer than sentMsgId)
      for (let i = 0; i < 5; i++) {
        await new Promise(r => setTimeout(r, 1500));
        const msgs = await client.getMessages('msm32bot', { limit: 5 });
        const candidates = [];

        for (const m of msgs) {
          if (m.id > sentMsgId && m.replyMarkup?.rows) {
            for (const row of m.replyMarkup.rows) {
              for (const btn of row.buttons) {
                if (btn.className === 'KeyboardButtonUrlAuth' && btn.url) {
                  const btnText = (btn.text || '').toLowerCase();
                  const normBtnText = normalizeTitle(btnText);
                  let score = 0;

                  if (isTv) {
                    const epKeywords = [
                      `s${sPadded}e${epPadded}`,
                      `s${sNum}e${epPadded}`,
                      `e${epPadded}`,
                      `episod ${eNum}`,
                      `episod ${epPadded}`,
                      `ep${epPadded}`,
                      `ep ${eNum}`,
                    ];
                    const hasTargetEp = epKeywords.some(kw => normBtnText.includes(kw));

                    if (hasTargetEp) {
                      score += 100;
                    } else {
                      // Check if it clearly belongs to another episode (e.g. S01E20 when looking for E01)
                      const otherEpMatch = normBtnText.match(/\b(s\d+e(\d+)|e(\d+)|episod\s*(\d+))\b/);
                      if (otherEpMatch) {
                        const foundNum = parseInt(otherEpMatch[2] || otherEpMatch[3] || otherEpMatch[4], 10);
                        if (!isNaN(foundNum) && foundNum !== eNum) {
                          score -= 500; // Reject wrong episode
                        }
                      }
                    }
                  }

                  // Quality preferences
                  if (btnText.includes('1080p')) score += 20;
                  else if (btnText.includes('720p')) score += 10;

                  // MalaySub preference
                  if (btnText.includes('malaysub') || btnText.includes('msm')) score += 5;

                  candidates.push({
                    msgId: m.id,
                    buttonId: btn.buttonId,
                    url: btn.url,
                    text: btn.text,
                    score,
                  });
                }
              }
            }
          }
        }

        // Filter valid candidates (score >= 0) and sort highest score first
        const valid = candidates.filter(c => c.score >= 0).sort((a, b) => b.score - a.score);
        if (valid.length > 0) {
          const best = valid[0];
          targetMsgId = best.msgId;
          targetButtonId = best.buttonId;
          chosenFilename = best.text.replace(/^[🔥🎞📎\s]+/, '').replace(/\s+\d+(\.\d+)?\s*(mb|gb).*$/i, '').trim();
          const linkMatch = best.url.match(/\/link\/([a-zA-Z0-9_-]+)/);
          if (linkMatch) fallbackShortcode = linkMatch[1];
          console.log(`[RESOLVE] Selected best button: "${best.text}" (score: ${best.score})`);
          break;
        }
      }

      if (targetButtonId) break;
    }

    if (!targetButtonId) {
      return res.status(404).json({
        success: false,
        error: `No downloadable media found for "${queryTitle}" on @msm32bot`,
      });
    }

    // 5. Authorize with Telegram MTProto to get cryptographically signed URL
    console.log(`[RESOLVE] Authorizing button (msgId: ${targetMsgId}, buttonId: ${targetButtonId})...`);
    const authRes = await client.invoke(new Api.messages.RequestUrlAuth({
      peer: 'msm32bot',
      msgId: targetMsgId,
      buttonId: targetButtonId,
    }));

    const authUrl = authRes.url;
    console.log('[RESOLVE] Authorized URL generated successfully.');

    // 6. Handle WordPress authentication with strict CookieMap (filtering expired cookies)
    const cookieMap = new Map();
    function processSetCookies(scList) {
      if (!scList) return;
      for (const sc of scList) {
        const parts = sc.split(';')[0].trim().split('=');
        const k = parts[0].trim();
        const v = parts.slice(1).join('=');
        if (sc.includes('Max-Age=0') || v === '%20') {
          cookieMap.delete(k);
        } else {
          cookieMap.set(k, v);
        }
      }
    }

    // Initial step: do not auto-redirect so Set-Cookie can be extracted cleanly
    const step1 = await axios.get(authUrl, {
      maxRedirects: 0,
      validateStatus: () => true,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    processSetCookies(step1.headers['set-cookie']);

    const redirectPath = step1.headers['location'] || (authUrl.match(/\/link\/[^\s&?]+/)?.[0] || '/');
    const targetUrl = new URL(redirectPath, authUrl).toString();

    const step2 = await axios.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Cookie: Array.from(cookieMap.entries()).map(([k, v]) => `${k}=${v}`).join('; '),
        Referer: authUrl,
      },
    });
    processSetCookies(step2.headers['set-cookie']);

    const html = step2.data || '';

    // Extract nonce & shortcode
    const nonceMatch = html.match(/var\s+msmbotGetFileNonce\s*=\s*["']([^"']+)["']/i);
    const scMatch = html.match(/data-shortcode\s*=\s*["']([^"']+)["']/i) ||
                    html.match(/messageSent_.*?"([^"]+)".*?"video"/i) ||
                    html.match(/messageSent_.*?([a-zA-Z0-9_-]{5,20})/i);
    const shortcode = scMatch ? scMatch[1] : fallbackShortcode;

    if (nonceMatch && shortcode) {
      console.log(`[RESOLVE] Triggering msmbot_getfile (nonce: ${nonceMatch[1]}, shortcode: ${shortcode})...`);
      const postData = new URLSearchParams({
        action: 'msmbot_getfile',
        _wpnonce: nonceMatch[1],
        file_shortcode: shortcode,
      });

      await axios.post('https://go.msmbot.club/wp-admin/admin-ajax.php', postData.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Cookie: Array.from(cookieMap.entries()).map(([k, v]) => `${k}=${v}`).join('; '),
          Referer: targetUrl,
        },
      });
    }

    // 7. Wait for delivered media document strictly AFTER sentMsgId
    console.log(`[RESOLVE] Waiting for @msm32bot to deliver file document (newer than ID ${sentMsgId})...`);
    let deliveredDoc = null;
    let filename = chosenFilename || queryTitle;

    for (let attempt = 0; attempt < 8; attempt++) {
      await new Promise(r => setTimeout(r, 2000));
      const incoming = await client.getMessages('msm32bot', { limit: 5 });
      for (const im of incoming) {
        if (im.id > sentMsgId && im.media?.document) {
          deliveredDoc = im.media.document;
          const fnAttr = deliveredDoc.attributes?.find(a => a.className === 'DocumentAttributeFilename');
          if (fnAttr) filename = fnAttr.fileName;
          break;
        }
      }
      if (deliveredDoc) break;
    }

    if (!deliveredDoc) {
      return res.status(500).json({
        success: false,
        error: `Timeout waiting for media delivery from @msm32bot for "${queryTitle}"`,
      });
    }

    const docIdStr = deliveredDoc.id.toString();
    streamCache.set(cacheKey, {
      docId: docIdStr,
      filename,
      size: deliveredDoc.size,
      timestamp: Date.now(),
    });

    const host = req.get('host');
    const protocol = req.protocol;

    console.log(`[RESOLVE] Successfully resolved "${queryTitle}" -> Doc ID: ${docIdStr} (${filename})`);
    return res.json({
      success: true,
      cached: false,
      streamUrl: `${protocol}://${host}/stream/${docIdStr}`,
      filename,
      size: deliveredDoc.size,
    });
  } catch (err) {
    console.error('[RESOLVE ERROR]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Stream endpoint with HTTP 206 Partial Content Range support
app.get('/stream/:docId', async (req, res) => {
  try {
    await initTelegram();
    const docId = req.params.docId;

    // Find document in bot chat messages
    const msgs = await client.getMessages('msm32bot', { limit: 15 });
    let targetDoc = null;
    let targetMedia = null;

    for (const m of msgs) {
      if (m.media?.document && m.media.document.id.toString() === docId) {
        targetDoc = m.media.document;
        targetMedia = m.media;
        break;
      }
    }

    if (!targetDoc || !targetMedia) {
      return res.status(404).json({ error: 'Video document not found in chat history' });
    }

    const fileSize = targetDoc.size;
    const range = req.headers.range;

    let aborted = false;
    req.on('close', () => {
      aborted = true;
    });

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;

      console.log(`[STREAM] Range: ${start}-${end}/${fileSize} (${(chunksize / (1024 * 1024)).toFixed(2)} MB)`);

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': targetDoc.mimeType || 'video/mp4',
        'Access-Control-Allow-Origin': '*',
      });

      const requestChunkSize = 512 * 1024;
      const iter = client.iterDownload({
        file: targetMedia,
        dcId: targetDoc.dcId,
        offset: bigInt(start),
        requestSize: requestChunkSize,
      });

      let bytesSent = 0;
      for await (const chunk of iter) {
        if (aborted || res.destroyed || res.writableEnded) break;
        const remaining = chunksize - bytesSent;
        if (remaining <= 0) break;

        const slice = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk;
        res.write(slice);
        bytesSent += slice.length;

        if (bytesSent >= chunksize) break;
      }
      if (!res.writableEnded) {
        res.end();
      }
    } else {
      console.log(`[STREAM] Full stream requested (${(fileSize / (1024 * 1024)).toFixed(2)} MB)`);
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': targetDoc.mimeType || 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
      });

      const iter = client.iterDownload({
        file: targetMedia,
        dcId: targetDoc.dcId,
        offset: bigInt(0),
        requestSize: 512 * 1024,
      });

      for await (const chunk of iter) {
        if (aborted || res.destroyed || res.writableEnded) break;
        res.write(chunk);
      }
      if (!res.writableEnded) {
        res.end();
      }
    }
  } catch (err) {
    if (err.code !== 'ERR_STREAM_WRITE_AFTER_END' && err.code !== 'ECONNRESET' && err.code !== 'EPIPE') {
      console.error('[STREAM ERROR]', err);
    }
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

process.on('uncaughtException', (err) => {
  if (err.code === 'ECONNRESET' || err.code === 'EPIPE' || err.code === 'ERR_STREAM_WRITE_AFTER_END') {
    return;
  }
  console.error('[FATAL EXCEPTION]', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason);
});

app.listen(port, async () => {
  console.log(`[SERVER] MSM Getter microservice listening on port ${port}`);
  await initTelegram();
});
