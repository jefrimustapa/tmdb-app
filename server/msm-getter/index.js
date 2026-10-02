import express from 'express';
import http from 'http';
import https from 'https';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { ConnectionTCPObfuscated } from 'telegram/network/connection/TCPObfuscated.js';
import { Logger } from 'telegram/extensions/Logger.js';
import bigInt from 'big-integer';
import axios from 'axios';
import fs from 'fs';
import os from 'os';
import { spawn, execSync } from 'child_process';
import { db } from './db.js';

class QuietLogger extends Logger {
  _log(level, message, color) {
    if (
      typeof message === 'string' &&
      (message.includes('WebSocket connection failed') ||
       message.includes('Connection closed') ||
       message.includes('Not connected') ||
       message.includes('hanging states'))
    ) {
      return;
    }
    super._log(level, message, color);
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
app.set('trust proxy', true);
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 3033;
const INTERNAL_HTTP_PORT = parseInt(process.env.INTERNAL_PORT || '3034', 10);
const apiId = parseInt(process.env.TG_API_ID, 10);
const apiHash = process.env.TG_API_HASH;
let session = process.env.TG_SESSION || '';
const LOG_PATH = process.env.LOG_FILE || (process.platform === 'win32' ? path.join(__dirname, 'msm-getter.log') : '/tmp/msm-getter.log');

function getLogFilePath() {
  if (fs.existsSync('/tmp/msm-getter.log')) return '/tmp/msm-getter.log';
  if (fs.existsSync(LOG_PATH)) return LOG_PATH;
  return path.join(__dirname, 'msm-getter.log');
}

if (!apiId || !apiHash) {
  console.error('[ERROR] TG_API_ID or TG_API_HASH missing from .env!');
}

let client = new TelegramClient(new StringSession(session), apiId, apiHash, {
  connection: ConnectionTCPObfuscated,
  connectionRetries: 10,
  retryDelay: 1000,
  autoReconnect: true,
  timeout: 30,
  deviceModel: 'MSM Getter Server',
  appVersion: '1.0.0',
  systemVersion: 'Linux/ASUS',
  baseLogger: new QuietLogger('error'),
});
try { client.setLogLevel('error'); } catch {}

function attachClientErrorHandler(c) {
  if (!c) return;
  c.onError = (err) => {
    const msg = err?.message || String(err || '');
    if (
      msg.includes('Not connected') ||
      msg.includes('Connection closed') ||
      msg.includes('socket hang up') ||
      msg.includes('ECONNRESET') ||
      msg.includes('ETIMEDOUT') ||
      msg.includes('hanging states')
    ) {
      return;
    }
    console.error('[TG CLIENT ERROR]', err);
  };
}
attachClientErrorHandler(client);

let isConnected = false;
let authError = null;
let initPromise = null;

async function initTelegram() {
  if (isConnected && client?.connected) return;
  if (initPromise) return await initPromise;

  initPromise = (async () => {
    if (!session && !client?.session?.authKey) {
      authError = 'No active session. Please authenticate via Web Portal at /auth.';
      throw new Error(authError);
    }
    console.log('[TG] Connecting MTProto...');
    try {
      await client.connect();
      const me = await client.getMe().catch(() => null);
      if (!me) {
        throw new Error('AUTH_KEY_INVALID: Session not authorized.');
      }
      isConnected = true;
      authError = null;
      console.log(`[TG] Connected to Telegram DC as @${me.username || me.firstName}!`);
    } catch (err) {
      isConnected = false;
      authError = err.message;
      if (err.message && err.message.includes('AUTH_KEY_DUPLICATED')) {
        console.error('[TG ERROR] Auth key duplicated. Re-authentication required at /auth.');
      }
      throw err;
    }
  })().finally(() => {
    initPromise = null;
  });

  return await initPromise;
}

function checkFfmpeg() {
  const ffmpegBin = process.env.FFMPEG_PATH || (fs.existsSync('/opt/bin/ffmpeg') ? '/opt/bin/ffmpeg' : 'ffmpeg');
  try {
    const proc = spawn(ffmpegBin, ['-version']);
    let versionStr = '';
    proc.stdout.on('data', (d) => { versionStr += d.toString(); });
    proc.on('close', (code) => {
      if (code === 0) {
        const firstLine = versionStr.split('\n')[0] || '';
        console.log(`[FFMPEG] Ready: ${firstLine}`);
      } else {
        console.warn(`[FFMPEG WARN] ffmpeg returned exit code ${code}. Audio transcoding may fail.`);
      }
    });
    proc.on('error', (err) => {
      console.warn(`[FFMPEG WARN] ffmpeg not executable (${err.message}). Audio transcoding disabled.`);
    });
  } catch (err) {
    console.warn(`[FFMPEG WARN] Could not check ffmpeg: ${err.message}`);
  }
}

// In-flight request deduplication map: key = cacheKey -> Promise
const inFlightResolutions = new Map();

// Sequential FIFO mutex queue for Telegram bot operations
let resolveMutex = Promise.resolve();
let pendingTelegramTasks = 0;

function queueTelegramTask(taskFn) {
  pendingTelegramTasks++;
  const next = resolveMutex.then(taskFn, taskFn);
  resolveMutex = next.catch(() => {}).finally(() => {
    pendingTelegramTasks--;
    if (pendingTelegramTasks === 0) {
      resolveMutex = Promise.resolve(); // Sever chain to allow GC of completed promises and closures
    }
  });
  return next;
}

// Helper: Normalize title
function normalizeTitle(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[^\w\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Helper: Extract sequel number / identifier from a title string (e.g. "Polis Evo 2" -> 2, "Polis Evo III" -> 3)
function extractSequelInfo(str) {
  if (!str) return null;
  // Clean out common false positive patterns:
  // 1. Bot search results headers: "8 results for..."
  // 2. Audio channel descriptions: "AAC 2.0", "DD 5.1", "2.0", "5.1"
  // 3. Pagination tags: "(1/1)", "(2/2)"
  const cleaned = str
    .replace(/\b\d+\s*results\b/gi, ' ')
    .replace(/\b(aac|ac3|eac3|dts|ddp|flac|audio)?\s*[257]\.[01]\b/gi, ' ')
    .replace(/\b\d+\/\d+\b/g, ' ')
    .replace(/\b(19\d\d|20[0-3]\d)\b/g, ' '); // Strip 4-digit years so "2025" isn't confused

  const s = ` ${cleaned.toLowerCase()} `;
  // Roman numerals: ii -> 2, iii -> 3, iv -> 4, v -> 5, vi -> 6
  const romanMatch = s.match(/\b(?:part|chapter|musim|season)?\s*(ii|iii|iv|v|vi)\b/i);
  if (romanMatch) {
    const map = { ii: 2, iii: 3, iv: 4, v: 5, vi: 6 };
    return map[romanMatch[1].toLowerCase()] || null;
  }
  // Explicit Arabic numbers: e.g. " 2 ", " 3 ", " 4 ", "part 2", "part 3"
  const numMatch = s.match(/\b(?:part|chapter|musim|season)\s*([2-9])\b/i) ||
                   s.match(/\b([2-9])\b/);
  if (numMatch) {
    return parseInt(numMatch[1], 10);
  }
  return null;
}

// Helper: Extract 4-digit release year from a string, protecting numbers that are part of title tokens
function extractYear(str, titleTokens = []) {
  if (!str) return null;
  const titleTokenSet = new Set((titleTokens || []).map(t => String(t).toLowerCase()));

  // 1. Prefer year in parentheses or brackets: "(2026)", "[2026]"
  const parenMatch = str.match(/[\(\[]\s*((?:19|20)\d\d)\s*[\)\]]/);
  if (parenMatch) {
    const yr = parseInt(parenMatch[1], 10);
    if (!titleTokenSet.has(String(yr))) return yr;
  }

  // 2. Year formatted as isolated dot/space/dash delimited release year: ".2026.", " 2026 ", "- 2026 -"
  const allYears = Array.from(str.matchAll(/\b((?:19[7-9]\d|20[0-3]\d))\b/g))
    .map(m => parseInt(m[1], 10))
    .filter(yr => !titleTokenSet.has(String(yr)));
  if (allYears.length > 0) {
    return allYears[allYears.length - 1];
  }

  // 3. Fallback: any 4-digit year not matching title tokens
  const fallbackMatch = str.match(/\b((?:19\d\d|20[0-3]\d))\b/);
  if (fallbackMatch) {
    const yr = parseInt(fallbackMatch[1], 10);
    if (!titleTokenSet.has(String(yr))) return yr;
  }

  return null;
}

// Helper: Convert number to Roman numeral (for seasons, e.g. 2 -> II, 3 -> III)
function toRoman(num) {
  const map = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI', 7: 'VII', 8: 'VIII', 9: 'IX', 10: 'X' };
  return map[num] || String(num);
}

// Generate TV series prioritized search queries according to rule-msm-series-search
function generateSeriesSearchQueries(cleanT, sNum, eNum, totalSeasons, year) {
  const isMultiSeason = totalSeasons > 1 || sNum > 1;
  const s2 = String(sNum).padStart(2, '0');
  const s1 = String(sNum);
  const e2 = String(eNum).padStart(2, '0');
  const e1 = String(eNum);

  const queries = [];
  const addQuery = (q) => {
    const trimmed = (q || '').trim();
    if (trimmed && !queries.includes(trimmed)) {
      queries.push(trimmed);
    }
  };

  if (!isMultiSeason) {
    // If explicit release year provided, prioritize year-qualified queries first to resolve reboot/remake title collisions
    if (year) {
      addQuery(`${cleanT} ${year} Episod ${e1}`);
      addQuery(`${cleanT} ${year} E${e2}`);
      addQuery(`${cleanT} ${year}`);
    }

    // 1. High-yield Localized Malaysian formats
    addQuery(`${cleanT} Episod ${e1}`);
    addQuery(`${cleanT} Episod ${e2}`);
    addQuery(`${cleanT} Ep ${e1}`);
    addQuery(`${cleanT} Ep ${e2}`);
    addQuery(`${cleanT} Episod${e2}`);
    addQuery(`${cleanT} Episod${e1}`);

    // 2. High-yield Standard Scene formats
    addQuery(`${cleanT} E${e2}`);
    addQuery(`${cleanT} E${e1}`);
    addQuery(`${cleanT} EP${e2}`);
    addQuery(`${cleanT} EP${e1}`);
    addQuery(`${cleanT} S${s2}E${e2}`);
    addQuery(`${cleanT} S${s1}E${e1}`);

    // 3. English "Episode" variants & Season 1
    addQuery(`${cleanT} Episode ${e1}`);
    addQuery(`${cleanT} Episode ${e2}`);
    addQuery(`${cleanT} Season ${s1} Episod ${e1}`);
    addQuery(`${cleanT} Season ${s2} EP${e2}`);

    // 4. Base title fallback (prompts bot to return full series keyboard)
    addQuery(cleanT);
  } else {
    // Siri MULTI season
    if (year) {
      addQuery(`${cleanT} ${year} S${s2}E${e2}`);
      addQuery(`${cleanT} ${year} Episod ${e1}`);
      addQuery(`${cleanT} ${year}`);
    }

    // 1. High-yield Scene format
    addQuery(`${cleanT} S${s2}E${e2}`);
    addQuery(`${cleanT} S${s1}E${e1}`);
    addQuery(`${cleanT} S${s2}EP${e2}`);
    addQuery(`${cleanT} S${s1}EP${e1}`);

    // 2. Malaysian "Musim" and "Season" formats
    addQuery(`${cleanT} Musim ${s1} Episod ${e1}`);
    addQuery(`${cleanT} Musim ${s1} EP${e2}`);
    addQuery(`${cleanT} Season ${s1} Episod ${e1}`);
    addQuery(`${cleanT} Season ${s2} Episode ${e2}`);

    // 3. Roman numeral variants (e.g. Musim II, Season II)
    const roman = toRoman(sNum);
    if (roman !== s1) {
      addQuery(`${cleanT} Musim ${roman} Episod ${e1}`);
      addQuery(`${cleanT} Season ${roman} Episode ${e2}`);
      addQuery(`${cleanT} Musim ${roman}`);
      addQuery(`${cleanT} Season ${roman}`);
    }

    addQuery(`${cleanT} Musim ${s1}`);
    addQuery(`${cleanT} Season ${s1}`);
    addQuery(cleanT);
  }

  return queries;
}

// Helper: Extract significant search tokens from title (retaining digits, roman numerals, and words >= 2 chars)
function extractTitleTokens(str) {
  const norm = normalizeTitle(str);
  return norm.split(' ').filter(t => {
    if (!t) return false;
    if (/^\d+$/.test(t)) return true; // keep digits: 2, 3, 4
    if (/^(ii|iii|iv|v|vi)$/i.test(t)) return true; // keep roman numerals
    return t.length >= 2;
  });
}

// Junk blacklist: trailers, teasers, samples, promos, soundtracks, behind-the-scenes
const JUNK_MEDIA_REGEX = /\b(trailer|teaser|sample|clip|promo|ost|soundtrack|behind\s*the\s*scenes|bts|interview|preview|pendek|short)\b/i;

// Split archives and non-streamable files: .zip, .rar, .7z, .tar, .001, .002, .part1, etc.
const UNPLAYABLE_ARCHIVE_REGEX = /\.(zip|rar|7z|tar|gz|00[1-9]|part\d+)(\s|\.|$)/i;

// Stopwords for title coverage calculations
const STOPWORDS = new Set(['the', 'a', 'an', 'dan', 'di', 'ke', 'yang', 'si', 'pada', 'dari', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by']);

function isJunkMedia(text) {
  if (!text) return false;
  return JUNK_MEDIA_REGEX.test(text) || UNPLAYABLE_ARCHIVE_REGEX.test(text);
}

function parseSizeFromText(text) {
  if (!text) return null;
  const m = text.match(/(\d+(?:\.\d+)?)\s*(mb|gb)\b/i);
  if (!m) return null;
  const val = parseFloat(m[1]);
  if (isNaN(val)) return null;
  return m[2].toLowerCase() === 'gb' ? val * 1024 : val;
}

// Clean title for bot searches (strips punctuation, colons, quotes, dashes, parentheticals, and acronym dots)
function cleanSearchTitle(str) {
  if (!str) return '';
  return str
    .replace(/\s*\([^)]*\)/g, ' ') // remove (2024), (US), etc.
    .replace(/\s*\[[^\]]*\]/g, ' ')
    .replace(/[:\-–—'"`!?&,._]/g, ' ') // cleanly replace punctuation with space
    .replace(/\s+/g, ' ')
    .trim();
}

// Whitelist legitimate release metadata tokens that can directly follow a single-word movie title
function isAllowedTitleSuffix(word) {
  if (!word) return true;
  const w = word.toLowerCase();
  // Pure digits: 4-digit years (1990-2030), resolution heights, channel digits, part numbers
  if (/^\d+$/.test(w)) return true;
  // Resolution patterns: 1080p, 720p, 4k, 2160p, etc.
  if (/^\d+(p|k)$/.test(w)) return true;
  // Disc/part patterns: cd1, cd2, pt1, part1, etc.
  if (/^(?:cd|pt|part)\d+$/.test(w)) return true;

  const allowed = new Set([
    // Resolutions & standards
    'p', 'k', 'hd', 'fhd', 'uhd', 'sd', 'hdr', 'hdr10', 'sdr', 'dovi', 'dv',
    // Media sources
    'bluray', 'blu', 'ray', 'webdl', 'webrip', 'web', 'hdrip', 'hdtv', 'dvdrip', 'brrip', 'remux', 'dvd', 'tvrip',
    // Video codecs
    'x264', 'x265', 'h264', 'h265', 'hevc', 'avc', 'av1', '10bit', '8bit',
    // Audio codecs & channels
    'aac', 'ac3', 'eac3', 'dts', 'ddp', 'ddp5', 'mp3', 'flac', 'atmos', 'truehd', 'opus',
    // Containers
    'mkv', 'mp4', 'avi',
    // Languages & subtitles
    'malay', 'malaysub', 'sub', 'subs', 'subtitle', 'subtitles', 'eng', 'engsub', 'indo', 'indosub', 'tam', 'tamil', 'multi', 'dual', 'dub', 'dubbed',
    // Release descriptors
    'movie', 'film', 'part', 'pt', 'vol', 'volume', 'complete', 'repack', 'proper', 'extended', 'unrated', 'directors', 'cut', 'edition', 'version', 'remastered', 'imax', 'internal'
  ]);

  return allowed.has(w);
}

// Extract primary keywords excluding common stopwords for strict coverage validation
function extractSignificantTokens(str) {
  const norm = normalizeTitle(str);
  const rawTokens = norm.split(' ').filter(Boolean);
  const hasLeadingArticle = rawTokens.length <= 2 && /^(the|a|an)$/i.test(rawTokens[0]);

  return rawTokens.filter((t, idx) => {
    if (!t) return false;
    if (idx === 0 && hasLeadingArticle) return true; // Keep leading article for short 1-2 word titles like "The Runner"
    if (STOPWORDS.has(t)) return false;
    if (/^\d+$/.test(t)) return true; // keep digits: 2, 3, 4
    if (/^(ii|iii|iv|v|vi)$/i.test(t)) return true; // keep roman numerals
    return t.length >= 2;
  });
}

// Calculate coverage ratio (0.0 to 1.0) of significant tokens found in candidate text using strict word boundaries
function calculateTitleCoverage(significantTokens, text) {
  if (!significantTokens || significantTokens.length === 0) return 1.0;
  if (!text) return 0.0;
  const norm = normalizeTitle(text);
  const matched = significantTokens.filter(t => {
    const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`, 'i').test(norm);
  });
  return matched.length / significantTokens.length;
}

// Helper: Strip bot search query echo headers from message before evaluation
function cleanBotEchoHeader(msgText) {
  if (!msgText) return '';
  return msgText
    .replace(/^[\s\S]*?(?:hasil\s*carian|carian\s*:|results?\s*for|search\s*results?)[^\n\r]*[\n\r]+/i, '')
    .trim();
}

// Helper: Extract structured episode information from text
function extractEpisodeInfo(text) {
  if (!text) return null;
  const s = String(text);

  // 1. Episode range: Ep 01-16, E01-E10, Episod 1 - 20
  const rangeMatch = s.match(/\b(?:s\d{1,2}\s*)?(?:e|ep|episod|episode)\.?\s*0*(\d{1,4})\s*(?:-|–|—|~|to)\s*(?:e|ep|episod|episode)?\.?\s*0*(\d{1,4})(?!\d)\b/i);
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1], 10);
    const end = parseInt(rangeMatch[2], 10);
    return { isRange: true, start, end, episode: start };
  }

  // 2. Standard episode tags: S01E16, E16, Ep 16, Episod 16, Episode 16, Ep. 16, S1 EP 16
  const stdMatch = s.match(/\b(?:s\d{1,2}\s*)?(?:e|ep|episod|episode)\.?\s*0*(\d{1,4})(?!\d)\b/i);
  if (stdMatch) {
    return { isRange: false, episode: parseInt(stdMatch[1], 10) };
  }

  // 3. Isolated bracketed or parenthesized number: [ 01 ], [ 16 ], ( 01 ), ( 16 )
  const bracketMatch = s.match(/[\[\(]\s*0*(\d{1,3})\s*[\]\)]/);
  if (bracketMatch) {
    const num = parseInt(bracketMatch[1], 10);
    // Ignore resolution numbers like 360, 480, 540, 576, 720, 1080
    if (![360, 480, 540, 576, 720, 1080, 2160].includes(num)) {
      return { isRange: false, episode: num };
    }
  }

  // 4. Dot, underscore or space delimited episode number in filename: Show.Name.01.720p or Show_01_1080p
  const dotNumMatch = s.match(/[\.\_\s]0*(\d{1,3})[\.\_\s]+(?:720p|1080p|480p|540p|360p|2160p|4k|web|bluray|hdrip|hdtv|x264|x265|hevc|mkv|mp4)/i);
  if (dotNumMatch) {
    const num = parseInt(dotNumMatch[1], 10);
    if (![360, 480, 540, 576, 720, 1080, 2160].includes(num)) {
      return { isRange: false, episode: num };
    }
  }

  return null;
}

// Helper: Extract structured season information from text
function extractSeasonInfo(text) {
  if (!text) return null;
  const s = String(text);

  // Standard season patterns: S01, S1, Season 2, Musim 2, Season 10
  const seasonMatch = s.match(/\b(?:s|season|musim)\s*0*(\d{1,2})(?!\d)\b/i);
  if (seasonMatch) {
    return parseInt(seasonMatch[1], 10);
  }

  // Roman numerals: Season II, Musim III, Part IV
  const romanMatch = s.match(/\b(?:s|season|musim|part)\s*(ii|iii|iv|v|vi|vii|viii|ix|x)(?!\w)\b/i);
  if (romanMatch) {
    const map = { ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };
    return map[romanMatch[1].toLowerCase()] || null;
  }

  return null;
}

// Helper: Check if a button text is bare (e.g. only resolution, episode tag, codecs, numbers, or action verbs)
function isBareButton(text) {
  if (!text) return true;
  const clean = text
    .toLowerCase()
    .replace(/[\[\]\(\)\{\}\-_:\|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const tokens = clean.split(' ').filter(Boolean);
  if (tokens.length === 0) return true;
  const bareKeywords = new Set([
    // Resolutions & standards
    '720p', '1080p', '480p', '540p', '360p', '2160p', '4k', 'hd', 'fhd', 'uhd', 'sd',
    // Media sources & codecs
    'webrip', 'webdl', 'web', 'dl', 'hdrip', 'hdtv', 'bluray', 'dvdrip', 'tvrip',
    'hevc', 'x264', 'x265', 'h264', 'h265', '10bit', '8bit', 'aac', 'ac3', 'dts',
    // Episode & Season identifiers
    'ep', 'eps', 'episodes', 'episode', 'episod', 'e', 's', 'season', 'musim', 'part', 'pt',
    // Action verbs / links
    'download', 'muat', 'turun', 'stream', 'play', 'server', 'fast', 'direct',
    'link', 'watch', 'mb', 'gb', 'mp4', 'mkv', 'avi',
    'klik', 'sini', 'tonton', 'salin', 'pautan', 'click', 'here', 'get', 'file', 'video', 'open', 'view', 'mirror', 'backup', 'vip'
  ]);
  return tokens.every(t => /^\d+$/.test(t) || bareKeywords.has(t));
}

// Score a candidate download button against search context
function scoreCandidateButton(btn, msg, context = {}) {
  const {
    isTv = false,
    title = '',
    year = null,
    sNum = 1,
    eNum = 1,
    targetQuality = 720,
    significantTokens = extractSignificantTokens(title)
  } = context;

  if (btn.className !== 'KeyboardButtonUrlAuth' || !btn.url) return -999;
  const btnText = (btn.text || '').toLowerCase();
  const normBtnText = normalizeTitle(btnText);
  const msgText = (msg.message || '').toLowerCase();
  const normMsgText = normalizeTitle(msgText);

  // 1. Immediately disqualify junk media (trailers, teasers, samples, promos, ost)
  if (isJunkMedia(btnText) || isJunkMedia(msgText)) {
    return -999;
  }

  // 2. Minimum file size sanity check
  const btnSizeMB = parseSizeFromText(btn.text) || parseSizeFromText(msg.message);
  if (btnSizeMB !== null) {
    if (isTv) {
      if (btnSizeMB < 70) return -999;
      if (btnSizeMB < 120) return -600;
    } else {
      if (btnSizeMB < 100) return -999;
      if (btnSizeMB < 250) return -600;
    }
  }

  // 3. Strict Title Token Coverage check
  const isBare = isBareButton(btnText);
  const cleanMsgText = cleanBotEchoHeader(msgText);
  let titleTargetText = normBtnText;

  if (isBare) {
    titleTargetText = normalizeTitle(cleanMsgText);
  }

  if (significantTokens.length > 0) {
    const coverage = calculateTitleCoverage(significantTokens, titleTargetText);
    if (significantTokens.length <= 2 && coverage < 1.0) {
      return -999;
    }
    if (coverage < 0.70) {
      return -999;
    }
  }

  let score = 0;

  if (significantTokens.length > 0) {
    const coverage = calculateTitleCoverage(significantTokens, titleTargetText);
    if (coverage >= 1.0) {
      score += 200;
    } else {
      score += Math.round(coverage * 100);
    }
  }

  if (isTv) {
    // 1. Episode matching
    let epInfo = extractEpisodeInfo(btnText);
    if (!epInfo && (isBare || !extractEpisodeInfo(btnText))) {
      epInfo = extractEpisodeInfo(cleanMsgText);
    }

    if (epInfo) {
      if (epInfo.isRange) {
        if (eNum >= epInfo.start && eNum <= epInfo.end) {
          score += 90;
        } else {
          return -999;
        }
      } else if (epInfo.episode === eNum) {
        score += 150;
      } else {
        return -999;
      }
    } else {
      score -= 150;
    }

    // 2. Strict Season validation
    const seasonFound = extractSeasonInfo(btnText) || extractSeasonInfo(cleanMsgText);
    if (seasonFound !== null) {
      if (seasonFound === sNum) {
        score += 80;
      } else {
        return -999;
      }
    }

    // 3. Release year validation
    const explicitTargetYear = parseInt(year, 10);
    const targetYear = !isNaN(explicitTargetYear) ? explicitTargetYear : extractYear(title, significantTokens);
    const btnYear = extractYear(btnText, significantTokens) || extractYear(cleanMsgText, significantTokens);
    if (targetYear && btnYear) {
      if (Math.abs(targetYear - btnYear) <= 1) {
        score += 90;
      } else if (!isNaN(explicitTargetYear)) {
        return -999;
      }
    }
  } else {
    // Movie validation
    const isTvCandidate = /\b(s\d{1,2}e\d{1,2}|s\d{1,2}\s*ep?\s*\d{1,2}|season\s*\d+|musim\s*\d+|episode\s*\d+|episod\s*\d+|ep\s*\d+|\.end\.)\b/i.test(btnText) ||
                          /\b(s\d{1,2}e\d{1,2}|s\d{1,2}\s*ep?\s*\d{1,2}|season\s*\d+|musim\s*\d+|episode\s*\d+|episod\s*\d+|ep\s*\d+|\.end\.)\b/i.test(msgText);
    if (isTvCandidate) {
      return -999;
    }

    if (significantTokens.length === 1) {
      const singleWord = significantTokens[0];
      const textToInspect = isBare ? titleTargetText : (normBtnText || titleTargetText);
      const prefixMatch = textToInspect.match(new RegExp(`\\b([a-z0-9]+)\\s+${singleWord}\\b`, 'i'));
      if (prefixMatch) {
        const prefixWord = prefixMatch[1].toLowerCase();
        const targetHasArticle = /^(the|a|an)\b/i.test(title.trim());
        const ignorePrefixes = new Set(['movie', 'film', 'msm', 'msm32']);
        if (targetHasArticle) {
          ignorePrefixes.add('the');
          ignorePrefixes.add('a');
          ignorePrefixes.add('an');
        }
        if (!ignorePrefixes.has(prefixWord)) {
          return -999;
        }
      }
      const suffixMatch = textToInspect.match(new RegExp(`\\b${singleWord}\\s+([a-z0-9]+)\\b`, 'i'));
      if (suffixMatch) {
        const suffixWord = suffixMatch[1].toLowerCase();
        if (!isAllowedTitleSuffix(suffixWord)) {
          return -999;
        }
      }
    }

    const targetSequel = extractSequelInfo(title);
    const btnSequel = extractSequelInfo(btnText);
    if (targetSequel) {
      if (btnSequel === targetSequel) {
        score += 150;
      } else if (btnSequel) {
        score -= 600;
      } else {
        score -= 400;
      }
    } else {
      if (btnSequel) {
        score -= 600;
      }
    }

    const explicitTargetYear = parseInt(year, 10);
    const targetYear = !isNaN(explicitTargetYear) ? explicitTargetYear : extractYear(title, significantTokens);
    const btnYear = extractYear(btnText, significantTokens) || extractYear(cleanMsgText, significantTokens);
    if (targetYear && btnYear) {
      if (Math.abs(targetYear - btnYear) <= 1) {
        score += 120;
      } else if (!isNaN(explicitTargetYear)) {
        return -999;
      }
    }
  }

  // Quality preference
  if (targetQuality <= 720) {
    if (btnText.includes('720p') || btnText.includes('720')) score += 50;
    else if (btnText.includes('540p') || btnText.includes('480p') || btnText.includes('360p')) score += 30;
    else if (btnText.includes('1080p') || btnText.includes('1080')) score += 5;
    else if (btnText.includes('2160p') || btnText.includes('4k')) score -= 50;
  } else {
    if (btnText.includes('1080p') || btnText.includes('1080')) score += 80;
    else if (btnText.includes('720p') || btnText.includes('720')) score += 30;
  }
  if (btnText.toLowerCase().includes('.mp4') || btnText.toLowerCase().includes('mp4')) score += 15;
  if (btnText.includes('malaysub') || btnText.includes('msm')) score += 5;

  return score;
}

// Web Auth State in RAM
let pendingAuth = {
  client: null,
  phoneNumber: null,
  phoneCodeHash: null,
  timestamp: 0,
};

// ==========================================
// 1. WEB AUTHENTICATION PORTAL & API ROUTES
// ==========================================

// Auth Status Endpoint
app.get('/api/auth/status', async (req, res) => {
  try {
    if (!isConnected || !client) {
      return res.json({
        authenticated: false,
        isConnected: false,
        error: authError || 'Not connected',
      });
    }
    const me = await client.getMe().catch(() => null);
    if (!me) {
      isConnected = false;
      return res.json({ authenticated: false, isConnected: false, error: 'Session expired' });
    }
    return res.json({
      authenticated: true,
      isConnected: true,
      user: {
        id: me.id?.toString(),
        firstName: me.firstName,
        username: me.username,
        phone: me.phone,
      },
    });
  } catch (err) {
    return res.json({ authenticated: false, isConnected: false, error: err.message });
  }
});

// Step 1: Send Login Code to Telegram App
app.post('/api/auth/send-code', async (req, res) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber || !phoneNumber.trim()) {
    return res.status(400).json({ success: false, error: 'Phone number is required (e.g. +60123456789)' });
  }

  const cleanPhone = phoneNumber.trim().replace(/[\s-]/g, '');

  try {
    if (pendingAuth.client) {
      await pendingAuth.client.disconnect().catch(() => {});
    }

    const tempClient = new TelegramClient(new StringSession(''), apiId, apiHash, {
      connection: ConnectionTCPObfuscated,
      connectionRetries: 5,
      deviceModel: 'MSM Getter Server',
      appVersion: '1.0.0',
      systemVersion: 'Linux/Docker',
      baseLogger: new QuietLogger('error'),
    });
    try { tempClient.setLogLevel('error'); } catch {}
    attachClientErrorHandler(tempClient);

    await tempClient.connect();

    const sendResult = await tempClient.invoke(new Api.auth.SendCode({
      phoneNumber: cleanPhone,
      apiId,
      apiHash,
      settings: new Api.CodeSettings({}),
    }));

    pendingAuth = {
      client: tempClient,
      phoneNumber: cleanPhone,
      phoneCodeHash: sendResult.phoneCodeHash,
      timestamp: Date.now(),
    };

    console.log(`[AUTH] Login code dispatched to ${cleanPhone}`);
    return res.json({
      success: true,
      message: 'Login code sent! Please check your official Telegram app.',
      phoneCodeHash: sendResult.phoneCodeHash,
    });
  } catch (err) {
    console.error('[AUTH ERROR] send-code failed:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Step 2: Verify Code and Activate Session in Memory
app.post('/api/auth/verify-code', async (req, res) => {
  const { phoneCode, password } = req.body;
  if (!phoneCode || !phoneCode.trim()) {
    return res.status(400).json({ success: false, error: 'Telegram login code is required' });
  }
  if (!pendingAuth.client || !pendingAuth.phoneCodeHash) {
    return res.status(400).json({ success: false, error: 'No login flow active. Please send code first.' });
  }

  try {
    let user;
    try {
      const signInResult = await pendingAuth.client.invoke(new Api.auth.SignIn({
        phoneNumber: pendingAuth.phoneNumber,
        phoneCodeHash: pendingAuth.phoneCodeHash,
        phoneCode: phoneCode.trim(),
      }));
      user = signInResult.user || signInResult;
    } catch (err) {
      if (err.errorMessage === 'SESSION_PASSWORD_NEEDED') {
        if (!password) {
          return res.status(200).json({ success: false, needPassword: true, error: 'Two-Step Verification (2FA) password required.' });
        }
        user = await pendingAuth.client.signInWithPassword({ apiId, apiHash }, {
          password: async () => password,
          onError: (e) => { throw e; },
        });
      } else {
        throw err;
      }
    }

    const newSessionString = pendingAuth.client.session.save();

    // Disconnect old client instance if running
    if (client && client !== pendingAuth.client) {
      await client.disconnect().catch(() => {});
    }

    // Promote newly authorized client to the primary server client in RAM
    client = pendingAuth.client;
    try { client.setLogLevel('error'); } catch {}
    attachClientErrorHandler(client);
    session = newSessionString;
    isConnected = true;
    authError = null;
    pendingAuth = { client: null, phoneNumber: null, phoneCodeHash: null, timestamp: 0 };

    console.log(`[AUTH SUCCESS] Authenticated as @${user.username || user.firstName}! Server active in RAM.`);

    return res.json({
      success: true,
      message: `Successfully connected as ${user.username ? '@' + user.username : user.firstName}!`,
      session: newSessionString,
      user: {
        id: user.id?.toString(),
        firstName: user.firstName,
        username: user.username,
      },
    });
  } catch (err) {
    console.error('[AUTH ERROR] verify-code failed:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Web Authentication Portal UI (Served at / and /auth)
app.get(['/', '/auth'], (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MSM Getter — Server Authentication Portal</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background-color: #0B0F17; color: #E2E8F0; font-family: ui-sans-serif, system-ui, sans-serif; }
    .glow-box { box-shadow: 0 0 25px rgba(56, 189, 248, 0.15); }
  </style>
</head>
<body class="min-h-screen flex items-center justify-center p-4">
  <div class="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 glow-box shadow-2xl space-y-6">
    
    <!-- Header -->
    <div class="text-center space-y-2">
      <div class="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20 mb-2">
        <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.19-.08-.05-.19-.02-.27 0-.12.03-1.99 1.27-5.62 3.72-.53.36-1.01.54-1.44.53-.47-.01-1.38-.27-2.05-.48-.83-.27-1.48-.42-1.42-.88.03-.24.37-.49 1.02-.75 3.98-1.73 6.64-2.88 7.98-3.44 3.81-1.59 4.6-1.87 5.12-1.88.11 0 .37.03.54.17.14.12.18.28.2.45-.02.07-.02.21-.04.38z"/></svg>
      </div>
      <h1 class="text-2xl font-black tracking-tight text-white">MSM Getter Portal</h1>
      <p class="text-xs text-slate-400">Telegram MTProto Cloud Streaming Gateway</p>
    </div>

    <!-- Navigation Tabs -->
    <div class="flex items-center justify-center gap-2 pb-1">
      <a href="/auth" class="px-3 py-1 rounded-lg text-xs font-semibold text-sky-400 bg-sky-500/10 border border-sky-500/20">
        🔑 Auth Portal
      </a>
      <a href="/logs" class="px-3 py-1 rounded-lg text-xs font-semibold text-slate-400 hover:text-white bg-slate-800/60 border border-slate-700/60 transition">
        📄 Live Logs
      </a>
    </div>

    <!-- Live Status Pill -->
    <div id="statusContainer" class="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between">
      <div class="flex items-center gap-2.5">
        <span id="statusDot" class="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping"></span>
        <span id="statusText" class="text-xs font-semibold text-slate-200">Checking server status...</span>
      </div>
      <button id="reAuthBtn" onclick="toggleAuthForm()" class="hidden text-[11px] font-bold text-sky-400 hover:text-sky-300 underline">Re-login</button>
    </div>

    <!-- Feedback Toast -->
    <div id="toast" class="hidden p-3 rounded-lg text-xs font-medium"></div>

    <!-- Step 1: Request Code -->
    <div id="step1" class="space-y-4">
      <div>
        <label class="block text-xs font-semibold text-slate-300 mb-1.5">Telegram Phone Number</label>
        <input id="phoneNumber" type="tel" placeholder="+60123456789" class="w-full bg-slate-950 border border-slate-700 focus:border-sky-400 rounded-xl px-4 py-2.5 text-sm text-white font-mono outline-none transition" />
        <p class="text-[11px] text-slate-500 mt-1">Include country code (e.g. +60 for Malaysia, +62 for Indonesia).</p>
      </div>
      <button id="btnSendCode" onclick="handleSendCode()" class="w-full py-2.5 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm transition shadow-lg shadow-sky-500/20 active:scale-[0.98]">
        Send Verification Code
      </button>
    </div>

    <!-- Step 2: Verify Code & 2FA -->
    <div id="step2" class="hidden space-y-4">
      <div>
        <label class="block text-xs font-semibold text-slate-300 mb-1.5">Login Code from Telegram</label>
        <input id="phoneCode" type="text" placeholder="12345" maxlength="8" class="w-full bg-slate-950 border border-slate-700 focus:border-sky-400 rounded-xl px-4 py-2.5 text-sm text-white font-mono tracking-widest text-center outline-none transition" />
      </div>

      <div id="pwdContainer" class="hidden">
        <label class="block text-xs font-semibold text-slate-300 mb-1.5">2FA Cloud Password</label>
        <input id="password" type="password" placeholder="Enter your 2FA password" class="w-full bg-slate-950 border border-slate-700 focus:border-sky-400 rounded-xl px-4 py-2.5 text-sm text-white outline-none transition" />
      </div>

      <button id="btnVerify" onclick="handleVerifyCode()" class="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm transition shadow-lg shadow-emerald-500/20 active:scale-[0.98]">
        Verify & Activate Server
      </button>

      <button onclick="backToStep1()" class="w-full text-center text-xs text-slate-400 hover:text-slate-200 transition">← Change Phone Number</button>
    </div>

    <!-- Step 3: Success & Session Box -->
    <div id="step3" class="hidden space-y-4">
      <div class="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center gap-2">
        <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
        <span>Server is now ACTIVE in memory! Streaming is live.</span>
      </div>

      <div>
        <label class="block text-xs font-semibold text-slate-300 mb-1.5">Permanent TG_SESSION String</label>
        <textarea id="sessionOutput" readonly rows="3" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-[11px] font-mono text-slate-300 select-all outline-none resize-none"></textarea>
      </div>

      <button onclick="copySession()" class="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition border border-slate-700 flex items-center justify-center gap-2">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path></svg>
        <span id="copyBtnText">Copy TG_SESSION to Clipboard</span>
      </button>

      <p class="text-[11px] text-slate-500 leading-relaxed text-center">
        💡 To keep this session permanently across Render container rebuilds, paste this value into Render Dashboard -> <b>Environment</b> -> <b>TG_SESSION</b>.
      </p>
    </div>

  </div>

  <script>
    async function checkStatus() {
      try {
        const res = await fetch('/api/auth/status');
        const data = await res.json();
        const dot = document.getElementById('statusDot');
        const text = document.getElementById('statusText');
        const reAuthBtn = document.getElementById('reAuthBtn');

        if (data.isConnected && data.user) {
          dot.className = 'w-2.5 h-2.5 rounded-full bg-emerald-400';
          text.innerHTML = '🟢 Connected as <b>' + (data.user.username ? '@' + data.user.username : data.user.firstName) + '</b>';
          reAuthBtn.classList.remove('hidden');
          document.getElementById('step1').classList.add('hidden');
        } else {
          dot.className = 'w-2.5 h-2.5 rounded-full bg-rose-400';
          text.textContent = '🔴 Offline: ' + (data.error || 'Authentication required');
          reAuthBtn.classList.add('hidden');
          document.getElementById('step1').classList.remove('hidden');
        }
      } catch (err) {
        document.getElementById('statusText').textContent = '⚠️ Unable to check status';
      }
    }

    function showToast(msg, isError) {
      const t = document.getElementById('toast');
      t.className = isError 
        ? 'p-3 rounded-lg text-xs font-medium bg-rose-500/10 border border-rose-500/30 text-rose-400'
        : 'p-3 rounded-lg text-xs font-medium bg-sky-500/10 border border-sky-500/30 text-sky-400';
      t.textContent = msg;
      t.classList.remove('hidden');
    }

    function toggleAuthForm() {
      document.getElementById('step1').classList.remove('hidden');
      document.getElementById('step2').classList.add('hidden');
      document.getElementById('step3').classList.add('hidden');
      document.getElementById('phoneNumber').focus();
    }

    function backToStep1() {
      document.getElementById('step2').classList.add('hidden');
      document.getElementById('step1').classList.remove('hidden');
    }

    async function handleSendCode() {
      const phone = document.getElementById('phoneNumber').value.trim();
      if (!phone) return showToast('Please enter your phone number with country code.', true);

      const btn = document.getElementById('btnSendCode');
      btn.disabled = true;
      btn.textContent = 'Sending code...';

      try {
        const res = await fetch('/api/auth/send-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phoneNumber: phone })
        });
        const data = await res.json();
        if (data.success) {
          showToast(data.message, false);
          document.getElementById('step1').classList.add('hidden');
          document.getElementById('step2').classList.remove('hidden');
          document.getElementById('phoneCode').focus();
        } else {
          showToast(data.error || 'Failed to send code', true);
        }
      } catch (err) {
        showToast(err.message || 'Request failed', true);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Send Verification Code';
      }
    }

    async function handleVerifyCode() {
      const code = document.getElementById('phoneCode').value.trim();
      const password = document.getElementById('password').value;
      if (!code) return showToast('Please enter the code from your Telegram app.', true);

      const btn = document.getElementById('btnVerify');
      btn.disabled = true;
      btn.textContent = 'Verifying with Telegram...';

      try {
        const res = await fetch('/api/auth/verify-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phoneCode: code, password })
        });
        const data = await res.json();
        if (data.needPassword) {
          document.getElementById('pwdContainer').classList.remove('hidden');
          document.getElementById('password').focus();
          showToast('2FA is enabled on your account. Please enter your password.', true);
        } else if (data.success) {
          showToast(data.message, false);
          document.getElementById('step2').classList.add('hidden');
          document.getElementById('step3').classList.remove('hidden');
          document.getElementById('sessionOutput').value = data.session;
          checkStatus();
        } else {
          showToast(data.error || 'Verification failed', true);
        }
      } catch (err) {
        showToast(err.message || 'Request failed', true);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Verify & Activate Server';
      }
    }

    function copySession() {
      const text = document.getElementById('sessionOutput').value;
      navigator.clipboard.writeText(text).then(() => {
        document.getElementById('copyBtnText').textContent = '✅ Copied to Clipboard!';
        setTimeout(() => {
          document.getElementById('copyBtnText').textContent = 'Copy TG_SESSION to Clipboard';
        }, 3000);
      });
    }

    checkStatus();
  </script>
</body>
</html>`);
});

// ==========================================
// 1b. SERVER-SIDE LOG VIEWER & DIAGNOSTICS
// ==========================================

// Active client playback sessions & internal worker map
// key: streamSessionKey (e.g. "192.168.0.109:5895615329916165408") -> {
//   sessionKey: string,
//   ip: string,
//   clientName: string,
//   docId: string,
//   filename: string,
//   mode: string,
//   createdAt: number,
//   lastActive: number,
//   internalWorkers: Map<string, Function>,
//   abort: Function,
// }
const activeStreams = new Map();
const internalWorkers = new Map(); // key: workerKey -> { abort: Function, parentKey: string, createdAt: number }

// In-Memory LRU Block Cache for Telegram MTProto Stream Chunks
// Caches up to 16 blocks (8 MB RAM) to eliminate seek latency while protecting router RAM from exhaustion.
const BLOCK_CACHE_MAX_ENTRIES = 16; // 16 x 512KB = 8 MB
const globalBlockCache = new Map();

// Pinned cache for container headers (first 2 blocks: 0, 1) and tail cues (last 2 blocks)
// These blocks (<= 2 MB total per doc) are NEVER evicted by sequential playback pipelines,
// eliminating 5 out of 6 remote Telegram round-trips on every seek!
const pinnedHeaderCache = new Map(); // key: `${docId}:${blockIdx}` -> Buffer

function getCachedBlock(docId, blockIdx) {
  const key = `${docId}:${blockIdx}`;
  if (pinnedHeaderCache.has(key)) {
    return pinnedHeaderCache.get(key);
  }
  if (globalBlockCache.has(key)) {
    const data = globalBlockCache.get(key);
    globalBlockCache.delete(key);
    globalBlockCache.set(key, data);
    return data;
  }
  return null;
}

function setCachedBlock(docId, blockIdx, data, isPinned = false) {
  if (!data || data.length === 0) return;
  const key = `${docId}:${blockIdx}`;
  if (isPinned) {
    if (pinnedHeaderCache.has(key)) {
      pinnedHeaderCache.delete(key);
    } else if (pinnedHeaderCache.size >= 24) {
      const oldestKey = pinnedHeaderCache.keys().next().value;
      pinnedHeaderCache.delete(oldestKey);
    }
    pinnedHeaderCache.set(key, data);
    return;
  }
  if (globalBlockCache.has(key)) {
    globalBlockCache.delete(key);
  } else if (globalBlockCache.size >= BLOCK_CACHE_MAX_ENTRIES) {
    const oldestKey = globalBlockCache.keys().next().value;
    globalBlockCache.delete(oldestKey);
  }
  globalBlockCache.set(key, data);
}

function calculateChunkCacheBytes() {
  let bytes = 0;
  for (const buf of globalBlockCache.values()) {
    if (buf && buf.length) bytes += buf.length;
  }
  for (const buf of pinnedHeaderCache.values()) {
    if (buf && buf.length) bytes += buf.length;
  }
  return bytes;
}

let idlePurgeTimer = null;

function cancelIdleMemoryPurge() {
  if (idlePurgeTimer) {
    clearTimeout(idlePurgeTimer);
    idlePurgeTimer = null;
  }
}

function scheduleIdleMemoryPurge(delayMs = 15000) {
  cancelIdleMemoryPurge();
  idlePurgeTimer = setTimeout(() => {
    idlePurgeTimer = null;
    if (activeStreams.size === 0) {
      purgeIdleMemory();
    }
  }, delayMs);
  if (idlePurgeTimer && idlePurgeTimer.unref) {
    idlePurgeTimer.unref();
  }
}

function purgeIdleMemory() {
  const beforeMem = process.memoryUsage();
  const beforeRssMB = Math.round(beforeMem.rss / (1024 * 1024));
  const beforeHeapMB = Math.round(beforeMem.heapUsed / (1024 * 1024));

  // 1. Evict temporary block cache (up to 8 MB)
  const evictedBlocks = globalBlockCache.size;
  globalBlockCache.clear();

  // 2. Trim pinned header cache down to latest 4 blocks (up to 2 MB)
  const pinnedKeys = Array.from(pinnedHeaderCache.keys());
  if (pinnedKeys.length > 4) {
    const keysToRemove = pinnedKeys.slice(0, pinnedKeys.length - 4);
    for (const k of keysToRemove) {
      pinnedHeaderCache.delete(k);
    }
  }

  // 3. Clear GramJS entity cache
  try {
    if (client?._entityCache?.cacheMap) {
      client._entityCache.cacheMap.clear();
    }
  } catch {}

  // 4. Force explicit V8 GC sweep if --expose-gc is enabled
  if (typeof global.gc === 'function') {
    try {
      global.gc();
    } catch (err) {
      console.warn('[MEMORY PURGE] global.gc() error:', err.message);
    }
  }

  const afterMem = process.memoryUsage();
  const afterRssMB = Math.round(afterMem.rss / (1024 * 1024));
  const afterHeapMB = Math.round(afterMem.heapUsed / (1024 * 1024));

  console.log(`[MEMORY PURGE] Idle stream purge executed: evicted ${evictedBlocks} blocks, pinned retained: ${pinnedHeaderCache.size}. RSS: ${beforeRssMB}MB -> ${afterRssMB}MB, Heap: ${beforeHeapMB}MB -> ${afterHeapMB}MB (GC: ${typeof global.gc === 'function' ? 'active' : 'disabled'})`);
}

// Automated garbage collector for orphaned stream handles & periodic idle watchdog
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of activeStreams.entries()) {
    if (now - (entry.lastActive || entry.createdAt || now) > 2 * 3600 * 1000) {
      console.warn(`[STREAM GC] Evicting orphaned activeStream: ${key}`);
      try { entry.abort(); } catch {}
      activeStreams.delete(key);
      if (activeStreams.size === 0) scheduleIdleMemoryPurge();
    }
  }
  for (const [wKey, wEntry] of internalWorkers.entries()) {
    if (now - (wEntry.createdAt || now) > 30 * 60 * 1000) {
      try { wEntry.abort(); } catch {}
      internalWorkers.delete(wKey);
    }
  }

  // Periodic Idle Memory Watchdog: If no streams are running and RSS > 85 MB, purge idle memory
  if (activeStreams.size === 0) {
    const curRssMB = Math.round(process.memoryUsage().rss / (1024 * 1024));
    if (curRssMB > 85) {
      console.log(`[MEMORY WATCHDOG] Idle RSS is ${curRssMB}MB (>85MB target). Triggering idle purge...`);
      purgeIdleMemory();
    }
  }
}, 5 * 60 * 1000).unref();

// Network Client Device Resolver (Cached Asuswrt NVRAM + dnsmasq leases)
let cachedClientMap = new Map();
let lastClientMapRefresh = 0;

function refreshClientMap() {
  if (Date.now() - lastClientMapRefresh < 30000 && cachedClientMap.size > 0) {
    return cachedClientMap;
  }
  const newMap = new Map();
  const macToName = new Map();

  if (process.platform === 'linux') {
    try {
      const nv = execSync('nvram get custom_clientlist 2>/dev/null', { timeout: 1000 }).toString('utf8');
      nv.split('<').filter(Boolean).forEach(entry => {
        const parts = entry.split('>');
        if (parts.length >= 2 && parts[0] && parts[1]) {
          macToName.set(parts[1].trim().toLowerCase(), parts[0].trim());
        }
      });
    } catch {}
  }

  const leasePaths = ['/var/lib/misc/dnsmasq.leases', '/tmp/dnsmasq.leases'];
  for (const lp of leasePaths) {
    if (fs.existsSync(lp)) {
      try {
        const content = fs.readFileSync(lp, 'utf8');
        content.split('\n').filter(Boolean).forEach(line => {
          const tokens = line.trim().split(/\s+/);
          if (tokens.length >= 4) {
            const mac = tokens[1].toLowerCase();
            const ip = tokens[2];
            const host = tokens[3] !== '*' ? tokens[3] : '';
            const friendly = macToName.get(mac) || host || ip;
            newMap.set(ip, { ip, mac, name: friendly, host });
          }
        });
      } catch {}
      break;
    }
  }

  cachedClientMap = newMap;
  lastClientMapRefresh = Date.now();
  return cachedClientMap;
}

function resolveClientIdentity(rawIp, req) {
  let ip = rawIp || req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || req?.ip || req?.socket?.remoteAddress || '127.0.0.1';
  if (typeof ip === 'string') {
    if (ip.startsWith('::ffff:')) ip = ip.replace('::ffff:', '');
    if (ip === '::1') ip = '127.0.0.1';
  }

  if (ip === '127.0.0.1' || ip === 'localhost') {
    return { ip, name: 'Internal Transcoder' };
  }

  const isExternal = !/^(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.|127\.|localhost)/.test(ip);

  // 1. Prioritize Router DHCP leases and Asuswrt custom_clientlist (for LAN devices)
  const map = refreshClientMap();
  if (map.has(ip)) {
    const entry = map.get(ip);
    if (entry.name && entry.name !== ip && entry.name !== '*') {
      return { ip, name: entry.name, mac: entry.mac };
    }
  }

  // 2. Fallback to clientName query param / header (e.g. remote connections, WAN, or native app model)
  const queryClient = req?.query?.clientName || req?.query?.client || req?.headers?.['x-client-name'];
  if (queryClient && !['Client', 'undefined', 'null'].includes(String(queryClient).trim())) {
    const cleanName = String(queryClient).trim();
    return { ip, name: isExternal ? `${cleanName} (WAN)` : cleanName };
  }

  // 3. Fallback for external connections without clientName
  if (isExternal) {
    return { ip, name: `External (${ip})` };
  }

  const ua = req?.headers?.['user-agent'] || '';
  let name = ip;
  if (/Android.*TV|GoogleTV|AFT|SmartTV/i.test(ua)) {
    name = 'Android TV';
  } else if (/Android/i.test(ua)) {
    name = 'Android Device';
  } else if (/iPhone|iPad/i.test(ua)) {
    name = 'iOS Device';
  } else if (/Windows/i.test(ua)) {
    name = 'Windows PC';
  } else if (/Macintosh/i.test(ua)) {
    name = 'Mac';
  }

  return { ip, name };
}

// CPU Usage Tracker (Router System CPU from /proc/stat, and msm-getter Process CPU from process.cpuUsage)
let lastSystemCpu = null;
let lastProcCpu = process.cpuUsage();
let lastProcTime = process.hrtime.bigint();

function getCpuMetrics() {
  const cores = os.cpus()?.length || 4;
  const loadAvg1m = Math.round((os.loadavg()?.[0] || 0) * 100) / 100;

  // 1. Router System CPU (differential /proc/stat)
  let routerCpuPct = 0;
  try {
    if (fs.existsSync('/proc/stat')) {
      const line = fs.readFileSync('/proc/stat', 'utf8').split('\n')[0];
      const p = line.split(/\s+/).slice(1).map(Number);
      const idle = p[3] + (p[4] || 0);
      const total = p.reduce((a, b) => a + b, 0);
      if (lastSystemCpu) {
        const dt = total - lastSystemCpu.total;
        const di = idle - lastSystemCpu.idle;
        if (dt > 0) routerCpuPct = Math.max(0, Math.min(100, Math.round(((dt - di) / dt) * 100)));
      }
      lastSystemCpu = { idle, total };
    }
  } catch {}

  // 2. msm-getter Process CPU (process.cpuUsage())
  let nodeCpuPct = 0;
  try {
    const now = process.hrtime.bigint();
    const usage = process.cpuUsage(lastProcCpu);
    const elapsedMicros = Number(now - lastProcTime) / 1000;
    if (elapsedMicros > 0) {
      const totalMicros = usage.user + usage.system;
      nodeCpuPct = Math.round((totalMicros / (elapsedMicros * cores)) * 100 * 10) / 10;
    }
    lastProcCpu = process.cpuUsage();
    lastProcTime = now;
  } catch {}

  return { routerCpuPct, nodeCpuPct, cores, loadAvg1m };
}

// System Stats Endpoint (Uptime, Memory RSS, Active Streams, Active Clients, Log Size)
app.get('/api/system/stats', (req, res) => {
  const mem = process.memoryUsage();
  let logSizeKB = 0;
  try {
    const logPath = getLogFilePath();
    if (fs.existsSync(logPath)) {
      logSizeKB = Math.round(fs.statSync(logPath).size / 1024);
    }
  } catch {}

  const activeClients = [];
  for (const [key, stream] of activeStreams.entries()) {
    activeClients.push({
      sessionKey: key,
      ip: stream.ip || 'unknown',
      clientName: stream.clientName || stream.ip || 'Client',
      filename: stream.filename || 'media',
      mode: stream.mode || 'Direct Native',
      connectedSec: Math.max(0, Math.round((Date.now() - (stream.createdAt || Date.now())) / 1000)),
    });
  }

  const cpu = getCpuMetrics();
  const rssMB = Math.round(mem.rss / (1024 * 1024));
  const capMB = 256;
  const ramPct = Math.min(100, Math.round((rssMB / capMB) * 100));

  res.json({
    status: 'ok',
    uptime: Math.round(process.uptime()),
    isConnected,
    cachedStreams: db.size(),
    activeStreams: activeClients.length,
    activeClients,
    authError: authError || null,
    cpu,
    memory: {
      rssMB,
      capMB,
      ramPct,
      heapUsedMB: Math.round(mem.heapUsed / (1024 * 1024)),
      heapTotalMB: Math.round(mem.heapTotal / (1024 * 1024)),
      externalMB: Math.round((mem.external || 0) / (1024 * 1024)),
      arrayBuffersMB: Math.round((mem.arrayBuffers || 0) / (1024 * 1024)),
      chunkCacheMB: Number((calculateChunkCacheBytes() / (1024 * 1024)).toFixed(1)),
    },
    logSizeKB,
  });
});

// Manual Memory Purge API (Evicts chunk caches, clears client cache & runs GC)
app.post('/api/system/purge-memory', (req, res) => {
  purgeIdleMemory();
  const mem = process.memoryUsage();
  res.json({
    success: true,
    memory: {
      rssMB: Math.round(mem.rss / (1024 * 1024)),
      heapUsedMB: Math.round(mem.heapUsed / (1024 * 1024)),
      chunkCacheMB: Number((calculateChunkCacheBytes() / (1024 * 1024)).toFixed(1)),
    }
  });
});

// Log Snapshot API (Last N lines from RAM disk)
app.get('/api/logs', (req, res) => {
  try {
    const linesCount = parseInt(req.query.lines, 10) || 200;
    const logPath = getLogFilePath();

    if (!fs.existsSync(logPath)) {
      return res.json({ success: true, logs: ['[INFO] Log file is currently empty or not initialized yet.'], totalLines: 0, fileSizeKB: 0 });
    }

    const stat = fs.statSync(logPath);
    // Read up to last 256KB of the log file for instant response
    const maxReadBytes = 256 * 1024;
    const startPos = Math.max(0, stat.size - maxReadBytes);
    const readLength = stat.size - startPos;
    const buffer = Buffer.alloc(readLength);
    let fd;
    try {
      fd = fs.openSync(logPath, 'r');
      fs.readSync(fd, buffer, 0, readLength, startPos);
    } finally {
      if (fd !== undefined) {
        try { fs.closeSync(fd); } catch {}
      }
    }

    const text = buffer.toString('utf8');
    const allLines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    const sliced = allLines.slice(-linesCount);

    return res.json({
      success: true,
      logs: sliced,
      totalLines: allLines.length,
      fileSizeKB: Math.round(stat.size / 1024),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Server-Sent Events (SSE) Live Log Streaming
app.get('/api/logs/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  res.write(': connected\n\n');

  const logPath = getLogFilePath();
  let lastSize = 0;
  if (fs.existsSync(logPath)) {
    lastSize = fs.statSync(logPath).size;
  }

  // Poll for file changes every 1.5s (only while browser client is connected)
  const interval = setInterval(() => {
    try {
      if (res.destroyed || res.writableEnded) {
        clearInterval(interval);
        return;
      }
      if (!fs.existsSync(logPath)) return;
      const curSize = fs.statSync(logPath).size;
      if (curSize > lastSize) {
        // Cap chunk read size to 64KB max to prevent OOM spikes on large log file changes
        const maxChunk = 64 * 1024;
        const readLen = Math.min(curSize - lastSize, maxChunk);
        const startPos = curSize - readLen;
        const buf = Buffer.alloc(readLen);
        let fd;
        try {
          fd = fs.openSync(logPath, 'r');
          fs.readSync(fd, buf, 0, readLen, startPos);
        } finally {
          if (fd !== undefined) {
            try { fs.closeSync(fd); } catch {}
          }
        }
        lastSize = curSize;

        const newText = buf.toString('utf8');
        const lines = newText.split(/\r?\n/).filter(l => l.trim().length > 0);
        if (lines.length > 0) {
          res.write(`data: ${JSON.stringify({ lines })}\n\n`);
        }
      } else if (curSize < lastSize) {
        // File was rotated or cleared
        lastSize = curSize;
      }
    } catch {}
  }, 1500);

  // Heartbeat ping every 15s to keep connection alive through NAT / reverse proxies
  const heartbeat = setInterval(() => {
    if (res.destroyed || res.writableEnded) {
      clearInterval(heartbeat);
      return;
    }
    res.write(': ping\n\n');
  }, 15000);

  req.on('close', () => {
    clearInterval(interval);
    clearInterval(heartbeat);
  });
});

// Download Raw Log File
app.get('/api/logs/download', (req, res) => {
  try {
    const logPath = getLogFilePath();
    if (!fs.existsSync(logPath)) {
      return res.status(404).send('No log file found.');
    }
    const filename = `msm-getter-${new Date().toISOString().slice(0, 10)}.log`;
    res.download(logPath, filename);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Dedicated Web Log Viewer GUI
app.get('/logs', (req, res) => {
  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
  });
  res.send(`<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MSM Getter — Live Log Console</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background-color: #0B0F17; color: #E2E8F0; font-family: ui-sans-serif, system-ui, sans-serif; }
    .glow-box { box-shadow: 0 0 25px rgba(56, 189, 248, 0.08); }
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: #0F172A; }
    ::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: #475569; }
  </style>
</head>
<body class="min-h-screen flex flex-col p-3 sm:p-6 max-w-7xl mx-auto w-full space-y-4">
  <!-- Top Navigation & Header -->
  <header class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
    <div class="flex items-center gap-3">
      <div class="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16m-7 6h7"></path></svg>
      </div>
      <div>
        <h1 class="text-lg font-black tracking-tight text-white flex items-center gap-2">
          MSM Getter <span class="text-xs font-mono font-normal px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">Live Console</span>
        </h1>
        <p class="text-xs text-slate-400">Telegram MTProto Cloud Streaming Server Logs</p>
      </div>
    </div>
    
    <!-- Navigation Tabs -->
    <nav class="flex items-center gap-2">
      <a href="/auth" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800/80 transition">
        🔑 Auth Portal
      </a>
      <a href="/logs" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-sky-400 bg-sky-500/10 border border-sky-500/20 transition">
        📄 Live Logs
      </a>
      <a href="/api/logs/download" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition flex items-center gap-1.5">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
        Download .log
      </a>
    </nav>
  </header>

  <!-- Live System Metrics Bar -->
  <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
    <div class="p-3 rounded-xl bg-slate-900 border border-slate-800/80">
      <span class="text-[10px] text-slate-400 font-semibold block uppercase tracking-wider">Status</span>
      <div class="flex items-center gap-2 mt-1">
        <span id="metricDot" class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
        <span id="metricStatus" class="text-xs font-bold text-emerald-400">Online</span>
      </div>
      <span class="text-[10px] text-slate-500 font-mono block mt-0.5">Telegram MTProto</span>
    </div>
    <div class="p-3 rounded-xl bg-slate-900 border border-slate-800/80">
      <span class="text-[10px] text-slate-400 font-semibold block uppercase tracking-wider">CPU Usage</span>
      <div class="flex items-baseline gap-1 mt-1 truncate">
        <span id="metricNodeCpu" class="text-xs font-bold font-mono text-emerald-400">--%</span>
        <span id="metricRouterCpuBadge" class="text-[11px] font-mono text-slate-400">[<span id="metricRouterCpu">--%</span> router]</span>
      </div>
      <span id="metricCpuDetail" class="text-[10px] text-slate-500 font-mono block mt-0.5">-- cores · load --</span>
    </div>
    <div class="p-3 rounded-xl bg-slate-900 border border-slate-800/80">
      <span class="text-[10px] text-slate-400 font-semibold block uppercase tracking-wider">Node RAM / Cap</span>
      <div class="flex items-baseline gap-1 mt-1 truncate">
        <span id="metricRam" class="text-xs font-bold font-mono text-sky-400">-- / 256 MB</span>
        <span id="metricRamPct" class="text-[10px] font-mono text-slate-400">(--%)</span>
      </div>
      <span id="metricHeapDetail" class="text-[10px] text-slate-500 font-mono block mt-0.5">Heap: -- MB</span>
    </div>
    <div class="p-3 rounded-xl bg-slate-900 border border-slate-800/80">
      <span class="text-[10px] text-slate-400 font-semibold block uppercase tracking-wider">Uptime</span>
      <span id="metricUptime" class="text-xs font-bold font-mono text-white mt-1 block">--</span>
      <span class="text-[10px] text-slate-500 font-mono block mt-0.5">microservice</span>
    </div>
    <div class="p-3 rounded-xl bg-slate-900 border border-slate-800/80 col-span-2 sm:col-span-1">
      <span class="text-[10px] text-slate-400 font-semibold block uppercase tracking-wider">Log File Size</span>
      <span id="metricLogSize" class="text-xs font-bold font-mono text-slate-300 mt-1 block">-- KB</span>
      <span class="text-[10px] text-slate-500 font-mono block mt-0.5">RAM disk (cap 5 MB)</span>
    </div>
  </div>

  <!-- Active Stream Clients Panel -->
  <div id="activeStreamsPanel" class="p-4 rounded-xl bg-slate-900 border border-slate-800/80 space-y-2.5">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
        <span class="text-xs font-bold text-white uppercase tracking-wider">Active Stream Clients</span>
      </div>
      <span id="activeClientsCount" class="text-xs font-mono font-semibold text-slate-400">0 connected</span>
    </div>
    <div id="activeClientsList" class="text-xs text-slate-400">
      <p class="text-slate-500 italic text-[11px] py-1">No active playback sessions.</p>
    </div>
  </div>

  <!-- Terminal Controls & Filters -->
  <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-1">
    <div class="flex flex-wrap items-center gap-1.5 text-xs font-medium">
      <button onclick="setFilter('')" id="btnFilterAll" class="px-2.5 py-1 rounded-lg bg-sky-500/20 text-sky-300 border border-sky-400/30 font-bold transition">All</button>
      <button onclick="setFilter('[STREAM')" id="btnFilterStream" class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition">Streams</button>
      <button onclick="setFilter('[TG]')" id="btnFilterTg" class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition">Telegram</button>
      <button onclick="setFilter('ERROR')" id="btnFilterError" class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition">Errors</button>
      <button onclick="setFilter('[SUPERVISOR]')" id="btnFilterSup" class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition">Supervisor</button>
    </div>

    <div class="flex items-center gap-2.5 flex-1 sm:max-w-md justify-end">
      <div class="relative flex-1">
        <input id="searchInput" type="text" placeholder="Search logs (e.g. 1080p, Polis, docId)..." 
          class="w-full bg-slate-900 border border-slate-800 focus:border-sky-400 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-500 outline-none font-mono transition" />
      </div>
      <label class="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer select-none">
        <input id="autoScroll" type="checkbox" checked class="rounded bg-slate-900 border-slate-700 text-sky-500 focus:ring-0" />
        <span>Auto-scroll</span>
      </label>
      <button onclick="clearDisplay()" class="px-2.5 py-1 text-xs text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 rounded-lg border border-slate-800 transition">
        Clear
      </button>
    </div>
  </div>

  <!-- Persistent Stream Cache Panel -->
  <div id="cachePanel" class="p-4 rounded-xl bg-slate-900 border border-slate-800/80 space-y-3">
    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-2 border-b border-slate-800/60">
      <div class="flex items-center gap-2">
        <span class="text-sm">💾</span>
        <span class="text-xs font-bold text-white uppercase tracking-wider">Persistent Stream Cache (Central DB)</span>
        <span id="cacheCountBadge" class="text-[10px] font-mono font-bold bg-sky-500/10 text-sky-400 px-2 py-0.5 rounded border border-sky-500/20">-- items</span>
      </div>
      <div class="flex items-center gap-2 w-full sm:w-auto">
        <input id="cacheSearch" type="text" placeholder="Search cached video / key..." class="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500/50 w-full sm:w-64" oninput="loadCacheList()" />
        <button onclick="loadCacheList()" class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 border border-slate-700 shrink-0">Refresh</button>
        <button onclick="clearAllCache()" class="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs font-medium shrink-0">Clear All</button>
      </div>
    </div>
    <div id="cacheListContainer" class="max-h-60 overflow-y-auto space-y-1.5 font-mono text-xs">
      <div class="text-slate-500 italic py-2">Loading persistent cache...</div>
    </div>
  </div>

  <!-- Terminal Window -->
  <div class="relative flex-1 bg-slate-950 border border-slate-800/80 rounded-2xl overflow-hidden shadow-2xl glow-box flex flex-col min-h-[500px]">
    <div class="bg-slate-900/90 border-b border-slate-800/80 px-4 py-2 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <div class="flex gap-1.5">
          <span class="w-3 h-3 rounded-full bg-rose-500/70 inline-block"></span>
          <span class="w-3 h-3 rounded-full bg-amber-500/70 inline-block"></span>
          <span class="w-3 h-3 rounded-full bg-emerald-500/70 inline-block"></span>
        </div>
        <span class="text-[11px] font-mono text-slate-400 ml-2">/tmp/msm-getter.log</span>
      </div>
      <div class="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
        <span id="lineCount">0 lines</span>
        <span id="streamStatusBadge" class="inline-flex items-center gap-1 text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span> Live Stream
        </span>
      </div>
    </div>

    <!-- Output Body -->
    <div id="terminalBody" class="p-4 overflow-y-auto flex-1 font-mono text-[11px] leading-relaxed space-y-0.5 select-text">
      <div class="text-slate-500 italic">Connecting to live log stream...</div>
    </div>
  </div>

  <script>
    let rawLines = [];
    let currentFilter = '';
    const terminal = document.getElementById('terminalBody');
    const autoScrollCheck = document.getElementById('autoScroll');
    const searchInput = document.getElementById('searchInput');

    function escapeHtml(str) {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function formatLine(line) {
      const escaped = escapeHtml(line);
      if (line.includes('[ERROR]') || line.includes('[FATAL]') || line.includes('Error:')) {
        return '<div class="text-rose-400 bg-rose-500/5 px-1 rounded">' + escaped + '</div>';
      } else if (line.includes('[WARN]')) {
        return '<div class="text-amber-400 bg-amber-500/5 px-1 rounded">' + escaped + '</div>';
      } else if (line.includes('[STREAM') || line.includes('[PIPELINE')) {
        return '<div class="text-sky-300 bg-sky-500/5 px-1 rounded font-medium">' + escaped + '</div>';
      } else if (line.includes('[SUPERVISOR')) {
        return '<div class="text-emerald-400 bg-emerald-500/5 px-1 rounded font-medium">' + escaped + '</div>';
      } else if (line.includes('[TG]') || line.includes('[AUTH')) {
        return '<div class="text-purple-300 bg-purple-500/5 px-1 rounded">' + escaped + '</div>';
      }
      return '<div class="text-slate-300">' + escaped + '</div>';
    }

    function renderLines() {
      const search = searchInput.value.toLowerCase();
      const filtered = rawLines.filter(l => {
        if (currentFilter && !l.includes(currentFilter)) return false;
        if (search && !l.toLowerCase().includes(search)) return false;
        return true;
      });
      terminal.innerHTML = filtered.map(formatLine).join('') || '<div class="text-slate-500 italic">No matching log lines.</div>';
      document.getElementById('lineCount').textContent = filtered.length + ' lines';
      if (autoScrollCheck.checked) {
        terminal.scrollTop = terminal.scrollHeight;
      }
    }

    function appendLines(newLines) {
      rawLines.push(...newLines);
      if (rawLines.length > 2000) rawLines = rawLines.slice(-1500);
      renderLines();
    }

    function setFilter(filter) {
      currentFilter = filter;
      document.querySelectorAll('[id^="btnFilter"]').forEach(b => {
        b.className = 'px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition';
      });
      if (!filter) document.getElementById('btnFilterAll').className = 'px-2.5 py-1 rounded-lg bg-sky-500/20 text-sky-300 border border-sky-400/30 font-bold transition';
      else if (filter.includes('STREAM')) document.getElementById('btnFilterStream').className = 'px-2.5 py-1 rounded-lg bg-sky-500/20 text-sky-300 border border-sky-400/30 font-bold transition';
      else if (filter.includes('TG')) document.getElementById('btnFilterTg').className = 'px-2.5 py-1 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-400/30 font-bold transition';
      else if (filter.includes('ERROR')) document.getElementById('btnFilterError').className = 'px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-400/30 font-bold transition';
      else if (filter.includes('SUPERVISOR')) document.getElementById('btnFilterSup').className = 'px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 font-bold transition';
      renderLines();
    }

    function clearDisplay() {
      rawLines = [];
      renderLines();
    }

    searchInput.addEventListener('input', renderLines);

    // Initial log fetch
    async function fetchInitialLogs() {
      try {
        const res = await fetch('/api/logs?lines=300');
        const data = await res.json();
        if (data.success && data.logs) {
          rawLines = data.logs;
          renderLines();
        }
      } catch (err) {
        terminal.innerHTML = '<div class="text-rose-400">Failed to load initial logs: ' + err.message + '</div>';
      }
    }

    // Connect Server-Sent Events (SSE)
    function connectSSE() {
      const badge = document.getElementById('streamStatusBadge');
      const es = new EventSource('/api/logs/stream');
      es.onopen = () => {
        badge.className = 'inline-flex items-center gap-1 text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20';
        badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span> Live Stream';
      };
      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.lines && data.lines.length > 0) {
            appendLines(data.lines);
          }
        } catch {}
      };
      es.onerror = () => {
        badge.className = 'inline-flex items-center gap-1 text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20';
        badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span> Reconnecting...';
      };
    }

    // System Metrics Polling
    async function pollMetrics() {
      try {
        const res = await fetch('/api/system/stats');
        const d = await res.json();
        document.getElementById('metricUptime').textContent = Math.floor(d.uptime / 3600) + 'h ' + Math.floor((d.uptime % 3600) / 60) + 'm ' + (d.uptime % 60) + 's';

        // 1. CPU Usage: msm-getter [router]
        const cpu = d.cpu || {};
        const nodeCpuEl = document.getElementById('metricNodeCpu');
        const routerCpuEl = document.getElementById('metricRouterCpu');
        const cpuDetailEl = document.getElementById('metricCpuDetail');
        if (nodeCpuEl && routerCpuEl) {
          const nodeCpu = cpu.nodeCpuPct !== undefined ? cpu.nodeCpuPct : 0;
          const routerCpu = cpu.routerCpuPct !== undefined ? cpu.routerCpuPct : 0;
          nodeCpuEl.textContent = nodeCpu + '%';
          routerCpuEl.textContent = routerCpu + '%';
          if (nodeCpu > 50) nodeCpuEl.className = 'text-xs font-bold font-mono text-rose-400';
          else if (nodeCpu > 20) nodeCpuEl.className = 'text-xs font-bold font-mono text-amber-400';
          else nodeCpuEl.className = 'text-xs font-bold font-mono text-emerald-400';

          if (cpuDetailEl) {
            cpuDetailEl.textContent = (cpu.cores || 4) + ' cores · load ' + (cpu.loadAvg1m || 0);
          }
        }

        // 2. Node RAM / Cap
        const mem = d.memory || {};
        const ramEl = document.getElementById('metricRam');
        const ramPctEl = document.getElementById('metricRamPct');
        const heapDetailEl = document.getElementById('metricHeapDetail');
        if (ramEl) {
          const rss = mem.rssMB || 0;
          const cap = mem.capMB || 256;
          const pct = mem.ramPct !== undefined ? mem.ramPct : Math.round((rss / cap) * 100);
          ramEl.textContent = rss + ' / ' + cap + ' MB';
          if (ramPctEl) ramPctEl.textContent = '(' + pct + '%)';
          if (heapDetailEl) heapDetailEl.textContent = 'Heap: ' + (mem.heapUsedMB || 0) + ' MB · Cache: ' + (mem.chunkCacheMB !== undefined ? mem.chunkCacheMB : 0) + ' MB';
          if (pct > 80) ramEl.className = 'text-xs font-bold font-mono text-rose-400';
          else if (pct > 50) ramEl.className = 'text-xs font-bold font-mono text-amber-400';
          else ramEl.className = 'text-xs font-bold font-mono text-sky-400';
        }

        document.getElementById('metricLogSize').textContent = (d.logSizeKB || 0) + ' KB';
        if (d.isConnected) {
          document.getElementById('metricDot').className = 'w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse';
          document.getElementById('metricStatus').textContent = 'Online';
        } else {
          document.getElementById('metricDot').className = 'w-2.5 h-2.5 rounded-full bg-rose-400';
          document.getElementById('metricStatus').textContent = 'Offline';
        }

        const countEl = document.getElementById('activeClientsCount');
        const listEl = document.getElementById('activeClientsList');
        if (countEl && listEl) {
          const clients = d.activeClients || [];
          countEl.textContent = clients.length === 1 ? '1 client connected' : clients.length + ' clients connected';
          if (clients.length === 0) {
            listEl.innerHTML = '<p class="text-slate-500 italic text-[11px] py-1">No active playback sessions.</p>';
          } else {
            let rowsHtml = '';
            for (let i = 0; i < clients.length; i++) {
              const c = clients[i];
              rowsHtml += '<tr class="text-slate-300 hover:bg-slate-800/40 transition">' +
                '<td class="py-1.5 px-2 font-bold text-sky-400 font-sans flex items-center gap-1.5">📺 ' + escapeHtml(c.clientName || 'Client') + '</td>' +
                '<td class="py-1.5 px-2 text-slate-400 font-mono">' + escapeHtml(c.ip || '') + '</td>' +
                '<td class="py-1.5 px-2 text-slate-200 truncate max-w-xs font-sans" title="' + escapeHtml(c.filename || '') + '">' + escapeHtml(c.filename || '') + '</td>' +
                '<td class="py-1.5 px-2 text-emerald-400 font-sans text-[11px]">' + escapeHtml(c.mode || '') + '</td>' +
                '<td class="py-1.5 px-2 text-slate-400 text-right font-mono">' + (c.connectedSec || 0) + 's</td>' +
              '</tr>';
            }
            listEl.innerHTML = '<div class="overflow-x-auto"><table class="w-full text-left text-xs">' +
              '<thead><tr class="text-slate-500 border-b border-slate-800 pb-1.5 text-[11px]">' +
              '<th class="py-1 px-2 font-semibold">Client / Device</th>' +
              '<th class="py-1 px-2 font-semibold">IP Address</th>' +
              '<th class="py-1 px-2 font-semibold">Media Filename</th>' +
              '<th class="py-1 px-2 font-semibold">Playback Mode</th>' +
              '<th class="py-1 px-2 font-semibold text-right">Connected</th>' +
              '</tr></thead><tbody class="divide-y divide-slate-800/60 font-mono text-[11px]">' +
              rowsHtml + '</tbody></table></div>';
          }
        }
      } catch {}
    }

    async function loadCacheList() {
      const searchEl = document.getElementById('cacheSearch');
      const q = searchEl ? searchEl.value : '';
      try {
        const res = await fetch('/api/cache?search=' + encodeURIComponent(q));
        const data = await res.json();
        const container = document.getElementById('cacheListContainer');
        const badge = document.getElementById('cacheCountBadge');
        if (badge) {
          const totalSizeMB = data.totalSizeBytes ? (data.totalSizeBytes / (1024 * 1024)).toFixed(1) + ' MB' : '0 MB';
          badge.textContent = (data.total || 0) + ' videos (' + totalSizeMB + ')';
        }
        if (!container) return;
        if (!data.items || data.items.length === 0) {
          container.innerHTML = '<div class="text-slate-500 italic py-2">No cached records found.</div>';
          return;
        }
        container.innerHTML = data.items.map(function(item) {
          return '<div class="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800/40 hover:border-slate-700/60 transition gap-2">' +
            '<div class="min-w-0 flex-1">' +
              '<div class="flex items-center gap-1.5 truncate">' +
                '<span class="text-slate-400 text-[10px]">🎬</span>' +
                '<span class="text-white font-semibold truncate text-[11px]">' + escapeHtml(item.filename || item.queryKey) + '</span>' +
              '</div>' +
              '<div class="text-[10px] text-slate-400 truncate flex items-center gap-2 mt-0.5">' +
                '<span class="text-sky-400 font-bold">' + escapeHtml(item.sizeFormatted) + '</span>' +
                '<span>Key: ' + escapeHtml(item.queryKey) + '</span>' +
                '<span>Doc: ' + escapeHtml(item.docId) + '</span>' +
              '</div>' +
            '</div>' +
            '<button data-key="' + encodeURIComponent(item.queryKey || '') + '" data-doc="' + encodeURIComponent(item.docId || '') + '" class="evict-cache-btn px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-[10px] shrink-0 font-sans font-semibold transition">Evict</button>' +
          '</div>';
        }).join('');
      } catch (err) {
        console.error('Failed to load cache:', err);
      }
    }

    const cacheContainerEl = document.getElementById('cacheListContainer');
    if (cacheContainerEl) {
      cacheContainerEl.addEventListener('click', function(e) {
        const btn = e.target.closest('.evict-cache-btn');
        if (btn) {
          const k = decodeURIComponent(btn.getAttribute('data-key') || '');
          const d = decodeURIComponent(btn.getAttribute('data-doc') || '');
          evictCacheRecord(k, d);
        }
      });
    }

    async function evictCacheRecord(key, docId) {
      if (!confirm('Evict this video stream from persistent cache?')) return;
      try {
        await fetch('/api/cache?key=' + encodeURIComponent(key) + '&docId=' + encodeURIComponent(docId), { method: 'DELETE' });
        loadCacheList();
      } catch (err) {
        alert('Evict failed: ' + err.message);
      }
    }

    async function clearAllCache() {
      if (!confirm('DANGER: Clear ALL stream cache records from server?')) return;
      try {
        await fetch('/api/cache/clear', { method: 'POST' });
        loadCacheList();
      } catch (err) {
        alert('Clear failed: ' + err.message);
      }
    }

    fetchInitialLogs();
    connectSSE();
    pollMetrics();
    loadCacheList();
    setInterval(pollMetrics, 3000);
  </script>
</body>
</html>`);
});

// ==========================================
// 2. STREAM RESOLUTION & PLAYBACK ENDPOINTS
// ==========================================

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    isConnected,
    cachedStreams: db.size(),
    authError: authError || null,
  });
});

// Diagnostic endpoint to inspect raw buttons returned by @msm32bot
app.get('/api/debug-search', async (req, res) => {
  try {
    const query = req.query.q || 'Kelas Cikgu Hiragi';
    await initTelegram();
    const sentMsg = await client.sendMessage('msm32bot', { message: query });
    await new Promise(r => setTimeout(r, 2000));
    const msgs = await client.getMessages('msm32bot', { limit: 5 });
    const buttons = [];
    for (const m of msgs) {
      if (m.id > sentMsg.id && m.replyMarkup?.rows) {
        for (const row of m.replyMarkup.rows) {
          for (const btn of row.buttons) {
            buttons.push({ text: btn.text, url: btn.url, className: btn.className });
          }
        }
      }
    }
    res.json({ success: true, query, count: buttons.length, buttons });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Cache management endpoints
app.get('/api/cache', (req, res) => {
  const { search = '' } = req.query;
  const items = db.getAll(search);
  const totalSizeBytes = db.getTotalSizeBytes();

  const formattedItems = items.map(item => {
    const bytes = parseInt(item.size, 10);
    let sizeFormatted = '0 B';
    if (!isNaN(bytes) && bytes > 0) {
      if (bytes >= 1024 * 1024 * 1024) {
        sizeFormatted = `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
      } else {
        sizeFormatted = `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
      }
    }
    return {
      queryKey: item.queryKey,
      docId: item.docId,
      filename: item.filename,
      size: !isNaN(bytes) ? bytes : 0,
      sizeFormatted,
      mimeType: item.mimeType || 'video/mp4',
      dcId: item.dcId || 4,
      createdAt: item.createdAt || (item.date ? item.date * 1000 : 0),
    };
  });

  return res.json({
    success: true,
    total: formattedItems.length,
    totalSizeBytes,
    items: formattedItems,
  });
});

app.delete('/api/cache', (req, res) => {
  const key = req.query.key || req.body?.key;
  const docId = req.query.docId || req.body?.docId;
  let evicted = false;
  if (key) evicted = db.delete(key) || evicted;
  if (docId) evicted = db.deleteByDocId(docId) || evicted;
  return res.json({ success: true, evicted, key, docId });
});

app.post('/api/cache/clear', (req, res) => {
  db.clear();
  return res.json({ success: true, message: 'Central database cache cleared' });
});

app.get('/api/cache/evict', (req, res) => {
  const { key, docId } = req.query;
  let evicted = false;
  if (key) evicted = db.delete(key) || evicted;
  if (docId) evicted = db.deleteByDocId(docId) || evicted;
  return res.json({ success: true, evicted, key, docId });
});

// Resolver endpoint: /api/resolve?title=Kelas+Cikgu+Hiragi&season=1&episode=1
app.get('/api/resolve', async (req, res) => {
  const { title, year, season, episode, totalSeasons: totalSeasonsQuery, maxQuality = '720', force, refresh } = req.query;
  if (!title) {
    return res.status(400).json({ success: false, error: 'Missing title query parameter' });
  }

  const shouldBypassCache = force === 'true' || refresh === 'true';
  const targetQuality = parseInt(maxQuality, 10) || 720;
  const sNum = season ? parseInt(season, 10) : NaN;
  const eNum = episode ? parseInt(episode, 10) : NaN;
  const totalSeasons = totalSeasonsQuery ? parseInt(totalSeasonsQuery, 10) : NaN;
  const isTv = !isNaN(sNum) && !isNaN(eNum);
  const sPadded = isTv ? String(sNum).padStart(2, '0') : '';
  const epPadded = isTv ? String(eNum).padStart(2, '0') : '';
  const tvTag = isTv ? `S${sPadded}E${epPadded}` : '';

  const queryTitle = isTv ? `${title} ${tvTag}` : `${title} ${year || ''}`.trim();
  const baseCacheKey = normalizeTitle(isTv ? `${title} ${tvTag}` : `${title} ${year || ''}`);
  const qualitySuffix = targetQuality <= 720 ? '_720p' : '_1080p';
  const cacheKey = `${baseCacheKey}${qualitySuffix}`;

  console.log(`[RESOLVE] Request: "${queryTitle}" (isTv: ${isTv}, maxQuality: ${targetQuality}, bypassCache: ${shouldBypassCache}, cacheKey: "${cacheKey}")`);

  let isAborted = false;
  const onClientClose = () => {
    if (!res.writableEnded) {
      isAborted = true;
      console.log(`[RESOLVE] Client disconnected / aborted for "${queryTitle}"`);
      inFlightResolutions.delete(cacheKey);
    }
  };
  req.on('close', onClientClose);

  // 1. Check Central Database first (Instant < 1ms response, 0 bot queries)
  let cached = shouldBypassCache ? null : db.get(cacheKey);
  let fallbackCached = null;

  if (!cached && !shouldBypassCache) {
    // Check legacy baseCacheKey without quality suffix
    const legacyCached = db.get(baseCacheKey);
    if (legacyCached && legacyCached.filename) {
      const fnLower = legacyCached.filename.toLowerCase();
      const is1080 = fnLower.includes('1080p') || fnLower.includes('1080');
      const is720 = fnLower.includes('720p') || fnLower.includes('720');
      const isLowerRes = fnLower.includes('480p') || fnLower.includes('540p') || fnLower.includes('360p');

      if (targetQuality <= 720) {
        if (is720 || isLowerRes) {
          cached = legacyCached;
        } else if (is1080) {
          // Keep as fallback in case 720p is not available from bot
          fallbackCached = legacyCached;
        }
      } else {
        cached = legacyCached;
      }
    }
  }

  if (cached) {
    console.log(`[RESOLVE] Central DB Cache HIT for "${cacheKey}" -> Doc ID: ${cached.docId} (${cached.filename})`);
    req.off('close', onClientClose);
    const host = req.get('host');
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    return res.json({
      success: true,
      cached: true,
      streamUrl: `${protocol}://${host}/stream/${cached.docId}`,
      filename: cached.filename,
      size: cached.size,
    });
  }

  // 2. In-flight Request Deduplication: if another request is currently resolving this exact title, await it
  if (inFlightResolutions.has(cacheKey)) {
    console.log(`[RESOLVE] In-flight deduplication: attaching to existing resolution for "${cacheKey}"`);
    try {
      const result = await inFlightResolutions.get(cacheKey);
      req.off('close', onClientClose);
      if (isAborted || res.writableEnded) return;
      const host = req.get('host');
      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      return res.json({
        success: true,
        cached: true,
        streamUrl: `${protocol}://${host}/stream/${result.docId}`,
        filename: result.filename,
        size: result.size,
      });
    } catch (err) {
      req.off('close', onClientClose);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // 3. Queue resolution through sequential FIFO mutex to prevent Telegram chat interleaving
  const resolvePromise = queueTelegramTask(async () => {
    if (isAborted || req.destroyed) {
      console.log(`[RESOLVE] Skipping queued resolution for "${queryTitle}" (client aborted)`);
      const err = new Error('Client aborted resolution');
      err.status = 499;
      throw err;
    }

    await initTelegram();

    if (isAborted || req.destroyed) {
      const err = new Error('Client aborted resolution');
      err.status = 499;
      throw err;
    }

    // Re-check Central DB after waiting in queue
    if (!shouldBypassCache) {
      const cachedAfterQueue = db.get(cacheKey);
      if (cachedAfterQueue) {
        return cachedAfterQueue;
      }
    }

    // Check if matching document was delivered in chat (combining recent messages + Telegram server-side document search)
    const recentMsgs = await client.getMessages('msm32bot', { limit: 30 });
    const cleanTitle = cleanSearchTitle(title);
    const candidateMsgs = [...recentMsgs];

    // Search historical chat messages on Telegram servers for matching documents
    try {
      const serverDocs = await client.getMessages('msm32bot', {
        search: isTv ? `${cleanTitle} ${epPadded}` : cleanTitle,
        limit: 20,
        filter: new Api.InputMessagesFilterDocument(),
      });
      if (serverDocs && serverDocs.length > 0) {
        const seenIds = new Set(candidateMsgs.map(m => m.id));
        for (const sm of serverDocs) {
          if (!seenIds.has(sm.id)) {
            candidateMsgs.push(sm);
            seenIds.add(sm.id);
          }
        }
      }
      if (isTv) {
        const epWordDocs = await client.getMessages('msm32bot', {
          search: `${cleanTitle} Episod ${eNum}`,
          limit: 15,
          filter: new Api.InputMessagesFilterDocument(),
        }).catch(() => []);
        if (epWordDocs && epWordDocs.length > 0) {
          const seenIds = new Set(candidateMsgs.map(m => m.id));
          for (const sm of epWordDocs) {
            if (!seenIds.has(sm.id)) {
              candidateMsgs.push(sm);
              seenIds.add(sm.id);
            }
          }
        }
      }
    } catch (sErr) {
      console.warn('[SEARCH SERVER] MTProto document search warning:', sErr.message);
    }

    const titleTokens = extractTitleTokens(title);
    const significantTokens = extractSignificantTokens(title);
    const targetSequel = extractSequelInfo(title);
    const explicitTargetYear = parseInt(year, 10);
    const targetYear = !isNaN(explicitTargetYear) ? explicitTargetYear : extractYear(title, significantTokens);
    const matchingRecentDocs = [];

    for (const msg of candidateMsgs) {
      if (msg.media?.document) {
        const doc = msg.media.document;
        const fnAttr = doc.attributes?.find(a => a.className === 'DocumentAttributeFilename');
        const filename = fnAttr ? fnAttr.fileName : msg.message;
        const normFn = normalizeTitle(filename);

        // 1. Instantly reject junk media (trailers, teasers, samples, promos, ost)
        if (isJunkMedia(filename) || isJunkMedia(msg.message)) {
          continue;
        }

        // 2. Minimum media file size check (reject clips and trailers under threshold)
        const docSizeMB = Number(doc.size || 0) / (1024 * 1024);
        if (isTv ? docSizeMB < 70 : docSizeMB < 100) {
          continue;
        }

        // 3. Strict Title Token Coverage check
        const coverage = calculateTitleCoverage(significantTokens, filename);
        if (significantTokens.length <= 2 ? coverage < 1.0 : coverage < 0.70) {
          continue;
        }

        let matchesCandidate = true;

        if (isTv) {
          const epInfo = extractEpisodeInfo(filename);
          if (!epInfo) {
            matchesCandidate = false;
          } else if (epInfo.isRange) {
            if (eNum < epInfo.start || eNum > epInfo.end) {
              matchesCandidate = false;
            }
          } else if (epInfo.episode !== eNum) {
            matchesCandidate = false;
          }

          // Season validation
          if (matchesCandidate) {
            const seasonFound = extractSeasonInfo(filename);
            if (seasonFound !== null && seasonFound !== sNum) {
              matchesCandidate = false;
            }
          }

          // Release year validation for TV episodes if target year is provided
          if (matchesCandidate && targetYear) {
            const docYear = extractYear(filename, significantTokens);
            if (docYear && Math.abs(targetYear - docYear) > 1 && !isNaN(explicitTargetYear)) {
              matchesCandidate = false;
            }
          }
        } else {
          // Movie validation: Instantly reject any TV series/episode candidates during movie searches
          const isTvDoc = /\b(s\d{1,2}e\d{1,2}|s\d{1,2}\s*ep?\s*\d{1,2}|season\s*\d+|musim\s*\d+|episode\s*\d+|episod\s*\d+|ep\s*\d+|\.end\.)\b/i.test(filename) ||
                          /\b(s\d{1,2}e\d{1,2}|s\d{1,2}\s*ep?\s*\d{1,2}|season\s*\d+|musim\s*\d+|episode\s*\d+|episod\s*\d+|ep\s*\d+|\.end\.)\b/i.test(msg.message || '');
          if (isTvDoc) {
            matchesCandidate = false;
          }

          // Single-word title collision guard: reject "Gold Digger" or "Runner Runner" when searching for "Digger" / "Runner"
          if (matchesCandidate && significantTokens.length === 1) {
            const singleWord = significantTokens[0];
            const prefixMatch = normFn.match(new RegExp(`\\b([a-z0-9]+)\\s+${singleWord}\\b`, 'i'));
            if (prefixMatch) {
              const prefixWord = prefixMatch[1].toLowerCase();
              const targetHasArticle = /^(the|a|an)\b/i.test(title.trim());
              const ignorePrefixes = new Set(['movie', 'film', 'msm', 'msm32']);
              if (targetHasArticle) {
                ignorePrefixes.add('the');
                ignorePrefixes.add('a');
                ignorePrefixes.add('an');
              }
              if (!ignorePrefixes.has(prefixWord)) {
                matchesCandidate = false;
              }
            }
            if (matchesCandidate) {
              const suffixMatch = normFn.match(new RegExp(`\\b${singleWord}\\s+([a-z0-9]+)\\b`, 'i'));
              if (suffixMatch) {
                const suffixWord = suffixMatch[1].toLowerCase();
                if (!isAllowedTitleSuffix(suffixWord)) {
                  matchesCandidate = false;
                }
              }
            }
          }

          // Movie validation: strictly enforce sequel number and release year alignment
          const docSequel = extractSequelInfo(filename);
          if (targetSequel) {
            if (docSequel !== targetSequel) {
              matchesCandidate = false;
            }
          } else {
            // Target is original movie without sequel number -> reject docs that have a sequel number
            if (docSequel) {
              matchesCandidate = false;
            }
          }

          // Release year validation: reject if filename has an explicit conflicting release year
          const docYear = extractYear(filename, significantTokens);
          if (targetYear && docYear && Math.abs(targetYear - docYear) > 1 && !isNaN(explicitTargetYear)) {
            matchesCandidate = false;
          }
        }

        if (matchesCandidate) {
          const fnLower = (filename || '').toLowerCase();
          const is720 = fnLower.includes('720p') || fnLower.includes('720');
          const is1080 = fnLower.includes('1080p') || fnLower.includes('1080');
          const isLower = fnLower.includes('480p') || fnLower.includes('540p') || fnLower.includes('360p');

          let qualityScore = 10;
          if (targetQuality <= 720) {
            if (is720) qualityScore = 50;
            else if (isLower) qualityScore = 30;
            else if (is1080) qualityScore = 5;
          } else {
            if (is1080) qualityScore = 50;
            else if (is720) qualityScore = 30;
          }
          if (fnLower.includes('.mp4') || fnLower.includes('mp4')) qualityScore += 15;

          matchingRecentDocs.push({ doc, filename, qualityScore });
        }
      }
    }

    if (matchingRecentDocs.length > 0) {
      matchingRecentDocs.sort((a, b) => b.qualityScore - a.qualityScore);
      const chosen = matchingRecentDocs[0];
      // Pick immediately if it meets the desired quality (score >= 30) or if targetQuality > 720
      if (chosen.qualityScore >= 30 || targetQuality > 720) {
        const docIdStr = chosen.doc.id.toString();
        console.log(`[RESOLVE] Found matching recent document in chat: ${chosen.filename} (ID: ${docIdStr}, score: ${chosen.qualityScore})`);
        const streamItem = db.set(cacheKey, {
          docId: docIdStr,
          accessHash: chosen.doc.accessHash?.toString() || '',
          fileReference: chosen.doc.fileReference ? chosen.doc.fileReference.toString('hex') : '',
          filename: chosen.filename,
          size: chosen.doc.size?.toString() || '0',
          mimeType: chosen.doc.mimeType || 'video/mp4',
          dcId: chosen.doc.dcId || 4,
          date: chosen.doc.date,
        });
        return streamItem;
      }
    }

    // Prepare prioritized search queries using clean, unpunctuated titles
    const cleanT = cleanSearchTitle(title);
    const searchQueries = [];
    if (isTv) {
      searchQueries.push(...generateSeriesSearchQueries(cleanT, sNum, eNum, totalSeasons, year));
      if (cleanT !== title) {
        searchQueries.push(...generateSeriesSearchQueries(title, sNum, eNum, totalSeasons, year));
      }
    } else {
      if (year) searchQueries.push(`${cleanT} ${year}`);
      searchQueries.push(cleanT);
      if (cleanT !== title) {
        if (year) searchQueries.push(`${title} ${year}`);
        searchQueries.push(title);
      }
    }

    let targetMsgId = null;
    let targetButtonId = null;
    let fallbackShortcode = null;
    let chosenFilename = null;
    let sentMsgId = 0;
    let deliveredDoc = null;
    let resolvedFilename = null;

    // Helper: Score a candidate download button
    function scoreButton(btn, msg) {
      return scoreCandidateButton(btn, msg, {
        isTv,
        title,
        year,
        sNum,
        eNum,
        targetQuality,
        significantTokens,
      });
    }

    // Helper: Find pagination "Next" button in replyMarkup
    function findNextPageButton(replyMarkup) {
      if (!replyMarkup?.rows) return null;
      for (const row of replyMarkup.rows) {
        for (const btn of row.buttons) {
          if (btn.className === 'KeyboardButtonCallback' && btn.data) {
            const txt = (btn.text || '').toLowerCase();
            if (
              txt.includes('next') ||
              txt.includes('➡️') ||
              txt.includes('➡') ||
              txt.includes('seterusnya') ||
              txt.includes('>>') ||
              txt.includes('>') ||
              /page\s*\d+/i.test(txt)
            ) {
              return btn;
            }
          }
        }
      }
      return null;
    }

    // Execute Ad-Gate HTTP handshake with automatic retry for transient Cloudflare / network timeouts
    async function axiosWithRetry(fn, desc, maxRetries = 2, delayMs = 1000) {
      let lastErr;
      for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        try {
          return await fn();
        } catch (err) {
          lastErr = err;
          const isNetworkOrTimeout = err.code === 'ECONNABORTED' ||
                                     err.code === 'ETIMEDOUT' ||
                                     err.code === 'ECONNRESET' ||
                                     err.code === 'EAI_AGAIN' ||
                                     err.code === 'ENOTFOUND' ||
                                     (err.response && err.response.status >= 500);
          if (attempt <= maxRetries && isNetworkOrTimeout) {
            console.warn(`[RESOLVE RETRY] ${desc} attempt ${attempt} failed (${err.code || err.message}). Retrying in ${delayMs}ms...`);
            await new Promise(r => setTimeout(r, delayMs));
            delayMs = Math.round(delayMs * 1.5);
          } else {
            throw err;
          }
        }
      }
      throw lastErr;
    }

    for (const sq of searchQueries) {
      if (isAborted || req.destroyed) {
        console.log(`[RESOLVE] Aborting search query loop for "${queryTitle}" (client aborted)`);
        break;
      }
      console.log(`[RESOLVE] Querying @msm32bot with: "${sq}"...`);
      const sentMsg = await client.sendMessage('msm32bot', { message: sq });
      sentMsgId = sentMsg.id;

      let noResults = false;

      for (let poll = 0; poll < 8; poll++) {
        if (isAborted || req.destroyed) break;
        await new Promise(r => setTimeout(r, 400));
        const msgs = await client.getMessages('msm32bot', { limit: 5 });
        const candidates = [];

        for (const m of msgs) {
          if (m.id > sentMsgId) {
            const textLower = (m.message || '').toLowerCase();
            if (
              (!m.replyMarkup || !m.replyMarkup.rows || m.replyMarkup.rows.length === 0) &&
              (textLower.includes('tiada carian') || textLower.includes('tidak dijumpai') || textLower.includes('tiada hasil') || textLower.includes('no result'))
            ) {
              console.log(`[RESOLVE] Bot returned no results for "${sq}", advancing immediately.`);
              noResults = true;
              break;
            }

            if (m.replyMarkup?.rows) {
              let currentMsg = m;
              let pageCount = 0;
              const MAX_PAGES = isTv ? 6 : 3;

              while (currentMsg && pageCount < MAX_PAGES) {
                if (isAborted || req.destroyed) break;
                pageCount++;
                if (currentMsg.replyMarkup?.rows) {
                  for (const row of currentMsg.replyMarkup.rows) {
                    for (const btn of row.buttons) {
                      const score = scoreButton(btn, currentMsg);
                      if (score > -999) {
                        candidates.push({
                          msgId: currentMsg.id,
                          buttonId: btn.buttonId,
                          url: btn.url,
                          text: btn.text,
                          score,
                        });
                      }
                    }
                  }
                }

                // Check if we already found an acceptable episode match (score >= 50)
                const hasGoodMatch = candidates.some(c => c.score >= 50);
                if (hasGoodMatch || pageCount >= MAX_PAGES || isAborted || req.destroyed) break;

                // Otherwise, check for pagination button to traverse to next page
                const nextBtn = findNextPageButton(currentMsg.replyMarkup);
                if (nextBtn) {
                  console.log(`[RESOLVE] Navigating to page ${pageCount + 1} for "${sq}" via callback...`);
                  try {
                    await client.invoke(new Api.messages.GetBotCallbackAnswer({
                      peer: 'msm32bot',
                      msgId: currentMsg.id,
                      data: nextBtn.data,
                    }));
                    await new Promise(r => setTimeout(r, 1200));
                    const refreshed = await client.getMessages('msm32bot', { ids: [currentMsg.id] });
                    if (refreshed && refreshed[0]) {
                      currentMsg = refreshed[0];
                    } else {
                      break;
                    }
                  } catch (pErr) {
                    console.warn('[RESOLVE] Pagination callback failed:', pErr.message);
                    break;
                  }
                } else {
                  break;
                }
              }
            }
          }
        }

        if (noResults || isAborted || req.destroyed) break;

        const valid = candidates.filter(c => c.score >= 0).sort((a, b) => b.score - a.score);
        if (valid.length > 0) {
          // Deduplicate candidate buttons by buttonId or url
          const uniqueValid = [];
          const seenButtons = new Set();
          for (const c of valid) {
            const btnKey = c.buttonId || c.url;
            if (!seenButtons.has(btnKey)) {
              seenButtons.add(btnKey);
              uniqueValid.push(c);
            }
          }

          // Try up to top 4 valid candidates with resilient fallback
          const candidatesToTry = uniqueValid.slice(0, 4);
          for (let candIdx = 0; candIdx < candidatesToTry.length; candIdx++) {
            if (isAborted || req.destroyed) break;
            const cand = candidatesToTry[candIdx];
            console.log(`[RESOLVE] Trying candidate (${candIdx + 1}/${candidatesToTry.length}): "${cand.text}" (score: ${cand.score})...`);

            const targetMsgId = cand.msgId;
            const targetButtonId = cand.buttonId;
            const candidateFilename = cand.text.replace(/^[🔥🎞📎\s]+/, '').replace(/\s+\d+(\.\d+)?\s*(mb|gb).*$/i, '').trim();
            const linkMatch = cand.url ? cand.url.match(/\/link\/([a-zA-Z0-9_-]+)/) : null;
            const candShortcode = linkMatch ? linkMatch[1] : null;

            let authRes;
            try {
              console.log(`[RESOLVE] Authorizing button (msgId: ${targetMsgId}, buttonId: ${targetButtonId})...`);
              authRes = await client.invoke(new Api.messages.RequestUrlAuth({
                peer: 'msm32bot',
                msgId: targetMsgId,
                buttonId: targetButtonId,
              }));
            } catch (authErr) {
              console.warn(`[RESOLVE WARN] RequestUrlAuth failed for "${cand.text}": ${authErr.message}. Trying next candidate...`);
              continue;
            }

            const authUrl = authRes.url;
            console.log('[RESOLVE] Authorized URL generated successfully.');

            const cookieMap = new Map();
            function processSetCookies(header) {
              if (!header) return;
              const list = Array.isArray(header) ? header : [header];
              for (const item of list) {
                const pair = item.split(';')[0];
                const [k, v] = pair.split('=');
                if (k && v) cookieMap.set(k.trim(), v.trim());
              }
            }

            let step1;
            try {
              console.log(`[RESOLVE] Stepping through ad-gate: ${authUrl}...`);
              step1 = await axiosWithRetry(
                () => axios.get(authUrl, {
                  maxRedirects: 0,
                  timeout: 25000,
                  validateStatus: (s) => s >= 200 && s < 400,
                  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                }),
                'Step 1 (ad-gate auth)',
                2,
                1000
              );
              processSetCookies(step1.headers['set-cookie']);
            } catch (step1Err) {
              console.warn(`[RESOLVE WARN] Step 1 ad-gate failed for "${cand.text}": ${step1Err.message}. Trying next candidate...`);
              continue;
            }

            const redirectPath = step1.headers['location'] || (authUrl.match(/\/link\/[^\s&?]+/)?.[0] || '/');
            const targetUrl = new URL(redirectPath, authUrl).toString();

            let step2;
            try {
              step2 = await axiosWithRetry(
                () => axios.get(targetUrl, {
                  timeout: 25000,
                  headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    Cookie: Array.from(cookieMap.entries()).map(([k, v]) => `${k}=${v}`).join('; '),
                    Referer: authUrl,
                  },
                }),
                'Step 2 (target page)',
                2,
                1000
              );
              processSetCookies(step2.headers['set-cookie']);
            } catch (step2Err) {
              console.warn(`[RESOLVE WARN] Step 2 ad-gate failed for "${cand.text}": ${step2Err.message}. Trying next candidate...`);
              continue;
            }

            const html = step2.data || '';
            const nonceMatch = html.match(/var\s+msmbotGetFileNonce\s*=\s*["']([^"']+)["']/i);
            const scMatch = html.match(/data-shortcode\s*=\s*["']([^"']+)["']/i) ||
                            html.match(/messageSent_.*?"([^"]+)".*?"video"/i) ||
                            html.match(/messageSent_.*?([a-zA-Z0-9_-]{5,20})/i);
            const shortcode = scMatch ? scMatch[1] : candShortcode;

            if (nonceMatch && shortcode) {
              console.log(`[RESOLVE] Triggering msmbot_getfile (nonce: ${nonceMatch[1]}, shortcode: ${shortcode})...`);
              const postData = new URLSearchParams({
                action: 'msmbot_getfile',
                _wpnonce: nonceMatch[1],
                file_shortcode: shortcode,
              });

              let forwardFailed = false;
              try {
                const ajaxRes = await axiosWithRetry(
                  () => axios.post('https://go.msmbot.club/wp-admin/admin-ajax.php', postData.toString(), {
                    timeout: 25000,
                    headers: {
                      'Content-Type': 'application/x-www-form-urlencoded',
                      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                      Cookie: Array.from(cookieMap.entries()).map(([k, v]) => `${k}=${v}`).join('; '),
                      Referer: targetUrl,
                    },
                  }),
                  'msmbot_getfile ajax',
                  2,
                  1000
                );
                console.log(`[RESOLVE] msmbot_getfile response: ${JSON.stringify(ajaxRes.data || 'ok')}`);
                if (ajaxRes.data?.data?.description === 'forward_failed' || (ajaxRes.data?.data && ajaxRes.data.data.ok === false)) {
                  console.warn(`[RESOLVE WARN] Media forward failed on @msm32bot for candidate "${cand.text}" (${ajaxRes.data?.data?.description || 'failed'}). Trying next candidate...`);
                  forwardFailed = true;
                }
              } catch (postErr) {
                console.warn(`[RESOLVE WARN] msmbot_getfile request issue (${postErr.message}). Checking Telegram chat for delivery anyway...`);
              }

              if (forwardFailed) {
                continue;
              }
            }

            console.log(`[RESOLVE] Waiting for media delivery from @msm32bot (newer than msgId: ${sentMsgId})...`);
            let candDeliveredDoc = null;
            let finalFilename = candidateFilename || queryTitle;

            for (let attempt = 0; attempt < 8; attempt++) {
              if (isAborted || req.destroyed) break;
              await new Promise(r => setTimeout(r, 1500));
              if (isAborted || req.destroyed) break;
              const incoming = await client.getMessages('msm32bot', { limit: 10 });
              for (const im of incoming) {
                if (im.id > sentMsgId && im.media?.document) {
                  candDeliveredDoc = im.media.document;
                  const fnAttr = candDeliveredDoc.attributes?.find(a => a.className === 'DocumentAttributeFilename');
                  if (fnAttr) finalFilename = fnAttr.fileName;
                  break;
                }
              }
              if (candDeliveredDoc) break;
            }

            if (candDeliveredDoc) {
              console.log(`[RESOLVE] Successfully received media document for candidate "${cand.text}"!`);
              deliveredDoc = candDeliveredDoc;
              resolvedFilename = finalFilename;
              break; // Candidate loop succeeded!
            } else {
              console.warn(`[RESOLVE WARN] Delivery timeout waiting for candidate "${cand.text}". Trying next candidate...`);
            }
          }

          if (deliveredDoc) break; // Exit poll loop
        }
      }

      if (deliveredDoc || isAborted || req.destroyed) break; // Exit searchQueries loop
    }

    if (isAborted || req.destroyed) {
      const err = new Error('Client aborted resolution');
      err.status = 499;
      throw err;
    }

    if (!deliveredDoc) {
      if (fallbackCached) {
        console.log(`[RESOLVE] 720p not found from bot, falling back to cached 1080p stream for "${baseCacheKey}"`);
        return fallbackCached;
      }
      const err = new Error(`No downloadable media found for "${queryTitle}" on @msm32bot`);
      err.status = 404;
      throw err;
    }

    const docIdStr = deliveredDoc.id.toString();
    const filename = resolvedFilename || chosenFilename || queryTitle;
    const resolvedItem = db.set(cacheKey, {
      docId: docIdStr,
      accessHash: deliveredDoc.accessHash?.toString() || '',
      fileReference: deliveredDoc.fileReference ? deliveredDoc.fileReference.toString('hex') : '',
      filename,
      size: deliveredDoc.size?.toString() || '0',
      mimeType: deliveredDoc.mimeType || 'video/mp4',
      dcId: deliveredDoc.dcId || 4,
      date: deliveredDoc.date,
    });
    console.log(`[RESOLVE] Successfully resolved "${queryTitle}" -> Doc ID: ${docIdStr} (${filename})`);
    return resolvedItem;
  });

  inFlightResolutions.set(cacheKey, resolvePromise);

  try {
    const result = await resolvePromise;
    inFlightResolutions.delete(cacheKey);
    req.off('close', onClientClose);

    if (isAborted || res.writableEnded) return;

    const host = req.get('host');
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';

    return res.json({
      success: true,
      cached: false,
      streamUrl: `${protocol}://${host}/stream/${result.docId}`,
      filename: result.filename,
      size: result.size,
    });
  } catch (err) {
    inFlightResolutions.delete(cacheKey);
    req.off('close', onClientClose);
    if (err.status === 499 || isAborted || req.destroyed) {
      console.log(`[RESOLVE] Request cancelled cleanly for "${queryTitle}"`);
      return;
    }
    console.error('[RESOLVE ERROR]', err);
    const status = err.status || (err.message?.includes('AUTH_KEY_DUPLICATED') ? 401 : 500);
    return res.status(status).json({ success: false, error: err.message });
  }
});

/**
 * Write a buffer chunk to the HTTP response with strict TCP backpressure.
 * Pauses upstream fetching if the client's network buffer is full.
 */
function writeWithBackpressure(res, chunk) {
  if (res.destroyed || res.writableEnded) return Promise.resolve();
  let ok = false;
  try {
    ok = res.write(chunk);
  } catch (err) {
    return Promise.resolve();
  }
  if (ok) return Promise.resolve();
  return new Promise((resolve) => {
    const onDrain = () => { cleanup(); resolve(); };
    const onClose = () => { cleanup(); resolve(); };
    const cleanup = () => {
      res.off('drain', onDrain);
      res.off('close', onClose);
    };
    res.once('drain', onDrain);
    res.once('close', onClose);
  });
}

// Active in-flight fileReference refresh promises keyed by docId
const inFlightFileRefRefreshes = new Map();

async function refreshDocumentFileReference(client, targetDoc) {
  const docIdStr = targetDoc.id.toString();
  if (inFlightFileRefRefreshes.has(docIdStr)) {
    console.log(`[FILE_REF RECOVERY] Joining existing in-flight refresh for Doc ID: ${docIdStr}`);
    return inFlightFileRefRefreshes.get(docIdStr);
  }

  const refreshPromise = (async () => {
    console.log(`[FILE_REF RECOVERY] Refreshing expired fileReference for Doc ID: ${docIdStr}...`);

    // 1. Scan recent chat messages from @msm32bot for the exact document ID
    try {
      const recentMsgs = await client.getMessages('msm32bot', { limit: 100 });
      for (const m of recentMsgs) {
        if (m.media?.document?.id?.toString() === docIdStr) {
          const freshRef = m.media.document.fileReference;
          if (freshRef) {
            console.log(`[FILE_REF RECOVERY] Found fresh fileReference in chat message ${m.id} for Doc ID: ${docIdStr}!`);
            const dbRecord = db.getByDocId(docIdStr);
            if (dbRecord && dbRecord.queryKey) {
              db.set(dbRecord.queryKey, {
                ...dbRecord,
                fileReference: freshRef.toString('hex'),
                createdAt: Date.now(),
              });
            }
            return freshRef;
          }
        }
      }
    } catch (scanErr) {
      console.warn('[FILE_REF RECOVERY] Chat scan error:', scanErr.message);
    }

    // 2. If not found in recent chat, search by clean title or queryKey via bot
    const dbRecord = db.getByDocId(docIdStr);
    if (dbRecord) {
      let searchTerm = '';
      if (dbRecord.queryKey) {
        searchTerm = dbRecord.queryKey.replace(/_(?:720|1080)p$/i, '').trim();
      } else if (dbRecord.filename) {
        searchTerm = dbRecord.filename
          .replace(/^[#\[][^\]\s]+[\]\s]*/g, '') // remove #NPRH22 or [Group]
          .replace(/\.(mp4|mkv|avi)$/i, '')
          .replace(/[\._\-]/g, ' ')
          .replace(/[^\w\s]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }

      if (searchTerm) {
        console.log(`[FILE_REF RECOVERY] Re-querying bot with: "${searchTerm}" for Doc ID: ${docIdStr}...`);
        try {
          await queueTelegramTask(async () => {
            await client.sendMessage('msm32bot', { message: searchTerm });
            await new Promise(r => setTimeout(r, 2500));
            const msgs = await client.getMessages('msm32bot', { limit: 20 });
            for (const m of msgs) {
              if (m.media?.document?.id?.toString() === docIdStr) {
                const freshRef = m.media.document.fileReference;
                if (freshRef) {
                  console.log(`[FILE_REF RECOVERY] Successfully refreshed fileReference via bot re-query!`);
                  if (dbRecord.queryKey) {
                    db.set(dbRecord.queryKey, {
                      ...dbRecord,
                      fileReference: freshRef.toString('hex'),
                      createdAt: Date.now(),
                    });
                  }
                  return freshRef;
                }
              }
            }
            return null;
          });
        } catch (qErr) {
          console.warn('[FILE_REF RECOVERY] Bot re-query error:', qErr.message);
        }
      }
    }

    console.warn(`[FILE_REF RECOVERY] Unable to refresh fileReference for Doc ID: ${docIdStr}. Evicting stale entry from DB...`);
    db.deleteByDocId(docIdStr);
    return null;
  })().finally(() => {
    inFlightFileRefRefreshes.delete(docIdStr);
  });

  inFlightFileRefRefreshes.set(docIdStr, refreshPromise);
  return refreshPromise;
}

/**
 * High-performance Pipelined Telegram Document Streamer
 * Concurrently prefetches upcoming 512KB chunks across parallel MTProto pipelines (sliding window)
 * ensuring continuous high-throughput delivery with zero buffer underruns for 1080p/4K playback.
 */
async function streamTelegramPipelined(client, targetDoc, startByte, endByte, res, req, customChunkSize, customConcurrency, passedStreamKey) {
  // Map requested chunkSize to MTProto block size and concurrency
  let CHUNK_SIZE = 512 * 1024; // 512KB: Native Telegram MTProto block limit
  let CONCURRENCY = 4;         // Default: 4 concurrent chunks (2MB sliding window)

  if (customChunkSize === 262144) {
    CHUNK_SIZE = 256 * 1024;
    CONCURRENCY = 2; // Eco mode: 512KB sliding window (low bandwidth / mobile)
  } else if (customChunkSize === 1048576) {
    CHUNK_SIZE = 512 * 1024;
    CONCURRENCY = 6; // Turbo mode: 3MB sliding window (high-bitrate 1080p)
  } else if (customConcurrency && typeof customConcurrency === 'number') {
    CONCURRENCY = customConcurrency;
  }

  const isProbe = req?.headers?.['x-internal-probe'] === '1' || req?.query?.probe === '1' || (endByte - startByte <= 1048576);
  const isInternal = req?.headers?.['x-internal-transcoder'] === '1' || req?.query?.direct === '1';
  const parentSessionKey = req?.headers?.['x-parent-session'] || req?.query?.parentSession;
  const clientIdentity = resolveClientIdentity(req?.headers?.['x-forwarded-for'] || req?.ip || req?.socket?.remoteAddress, req);
  if (isProbe) {
    CONCURRENCY = 1; // Prevent MTProto pipeline lookahead congestion during demuxer / metadata / cues probe
  }

  const streamKey = passedStreamKey || `${isInternal ? (parentSessionKey ? `worker-${parentSessionKey}` : `internal-${Date.now()}`) : clientIdentity.ip}:${targetDoc.id}`;

  if (!isInternal && activeStreams.has(streamKey)) {
    console.log(`[PIPELINE ABORT PREVIOUS] Aborting existing active stream for [${clientIdentity.name} (${clientIdentity.ip})] key ${streamKey}`);
    try {
      activeStreams.get(streamKey).abort();
    } catch (e) {}
    activeStreams.delete(streamKey);
  }

  let aborted = false;
  const inFlight = new Map();

  const abortPipeline = () => {
    aborted = true;
    inFlight.clear();
  };

  const parentSession = parentSessionKey ? activeStreams.get(parentSessionKey) : null;
  const workerId = `w-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

  if (parentSession) {
    parentSession.internalWorkers.set(workerId, abortPipeline);
  } else if (!isInternal) {
    cancelIdleMemoryPurge();
    const fnAttr = targetDoc.attributes?.find(a => a.className === 'DocumentAttributeFilename');
    const mediaName = fnAttr ? fnAttr.fileName : `video_${targetDoc.id}.mp4`;
    activeStreams.set(streamKey, {
      sessionKey: streamKey,
      ip: clientIdentity.ip,
      clientName: clientIdentity.name,
      docId: targetDoc.id.toString(),
      filename: mediaName,
      mode: 'Direct Native',
      createdAt: activeStreams.get(streamKey)?.createdAt || Date.now(),
      lastActive: Date.now(),
      internalWorkers: new Map(),
      abort: abortPipeline,
    });
  } else {
    internalWorkers.set(streamKey, { abort: abortPipeline, parentKey: parentSessionKey, createdAt: Date.now() });
  }

  const onReqClose = () => {
    abortPipeline();
    cleanupStream();
    console.log(`[PIPELINE CLOSED] [${clientIdentity.name} (${clientIdentity.ip})] active: block ${activeBlock}/${endBlock}, aborted remaining blocks.`);
  };
  const onResFinish = () => {
    cleanupStream();
  };

  const cleanupStream = () => {
    req.off('close', onReqClose);
    res.off('finish', onResFinish);
    if (parentSession) {
      parentSession.internalWorkers.delete(workerId);
    } else if (!isInternal) {
      if (activeStreams.get(streamKey)?.abort === abortPipeline) {
        activeStreams.delete(streamKey);
        if (activeStreams.size === 0) {
          scheduleIdleMemoryPurge();
        }
      }
    } else {
      internalWorkers.delete(streamKey);
    }
  };

  const startBlock = Math.floor(startByte / CHUNK_SIZE);
  const endBlock = Math.floor(endByte / CHUNK_SIZE);
  let activeBlock = startBlock;

  req.on('close', onReqClose);
  res.on('finish', onResFinish);

  try {
    let dcId = targetDoc.dcId || 4;
    let sender = null; // Lazily acquired on first network fetch; cached blocks return in 0ms!

  const fileRef = Buffer.isBuffer(targetDoc.fileReference)
    ? targetDoc.fileReference
    : Buffer.from(String(targetDoc.fileReference || ''), 'hex');

  const location = new Api.InputDocumentFileLocation({
    id: bigInt(targetDoc.id),
    accessHash: bigInt(targetDoc.accessHash),
    fileReference: fileRef,
    thumbSize: '',
  });

  console.log(`[PIPELINE START] [${clientIdentity.name} (${clientIdentity.ip})] blocks ${startBlock}..${endBlock} (${endBlock - startBlock + 1} blocks), concurrency: ${CONCURRENCY}, chunkSize: ${CHUNK_SIZE / 1024}KB`);

  async function fetchBlock(blockIdx) {
    if (aborted) return null;

    const docIdStr = targetDoc.id.toString();

    // 1. Check in-memory LRU cache (0ms instant lookup)
    const cached = getCachedBlock(docIdStr, blockIdx);
    if (cached) {
      return cached;
    }

    const offset = blockIdx * CHUNK_SIZE;
    if (offset >= Number(targetDoc.size)) return null;

    const request = new Api.upload.GetFile({
      location,
      offset: bigInt(offset),
      limit: CHUNK_SIZE,
    });

    const totalDocBlocks = Math.ceil(Number(targetDoc.size) / CHUNK_SIZE);
    const isPinnedBlock = blockIdx <= 2 || blockIdx >= totalDocBlocks - 3;

    try {
      if (aborted) return null;
      if (!sender) {
        sender = await client.getSender(dcId);
      }
      if (aborted) return null;
      const result = await client.invokeWithSender(request, sender);
      if (aborted) return null;
      const bytes = result.bytes;
      if (bytes && bytes.length > 0) {
        setCachedBlock(docIdStr, blockIdx, bytes, isPinnedBlock);
      }
      return bytes;
    } catch (err) {
      sender = null;
      if (aborted) return null;
      const msg = `${err.errorMessage || ''} ${err.message || ''}`;
      const dcMatch = msg.match(/(?:FILE_MIGRATE_|stored in DC\s*)(\d+)/i);
      const newDc = err.newDc || err.dc || (dcMatch ? parseInt(dcMatch[1], 10) : null);
      if (newDc) {
        console.log(`[STREAM MIGRATE] Document lives on DC ${newDc} (was ${dcId}). Re-routing...`);
        dcId = newDc;
        targetDoc.dcId = newDc;
        if (aborted) return null;
        sender = await client.getSender(newDc);
        if (aborted) return null;
        const result = await client.invokeWithSender(request, sender);
        if (aborted) return null;
        const bytes = result.bytes;
        if (bytes && bytes.length > 0) {
          setCachedBlock(docIdStr, blockIdx, bytes, isPinnedBlock);
        }
        return bytes;
      }

      // Automatically recover from dropped/uninitialized secondary DC connections.
      // Also catches 'Not connected' (GramJS _recvLoop race during internal sender reconnect)
      // which occurs when the router NAT table silently kills idle DC TCP connections after ~30s.
      if (msg.includes('CONNECTION_NOT_INITED') || msg.includes('disconnected') || msg.includes('Not connected')) {
        console.warn(`[STREAM RECONNECT] Sender connection on DC ${dcId} invalid (${err.errorMessage || err.message}). Re-initializing...`);
        try {
          if (sender) {
            await sender.disconnect().catch(() => {});
          }
        } catch {}
        if (client._exportedSenderPromises?.has(dcId)) {
          client._exportedSenderPromises.delete(dcId);
        }
        sender = null;
        if (aborted) return null;

        let retryDelay = 250;
        for (let reconnAttempt = 0; reconnAttempt < 3; reconnAttempt++) {
          if (aborted) return null;
          try {
            sender = await client.getSender(dcId);
            if (aborted) return null;
            const result = await client.invokeWithSender(request, sender);
            if (aborted) return null;
            const bytes = result.bytes;
            if (bytes && bytes.length > 0) {
              setCachedBlock(docIdStr, blockIdx, bytes, isPinnedBlock);
            }
            return bytes;
          } catch (e2) {
            sender = null;
            if (client._exportedSenderPromises?.has(dcId)) {
              client._exportedSenderPromises.delete(dcId);
            }
            const e2msg = `${e2.errorMessage || ''} ${e2.message || ''}`;
            console.warn(`[STREAM RECONNECT] Re-init attempt ${reconnAttempt + 1}/3 failed (${e2.message}). Retrying in ${retryDelay}ms...`);
            if (reconnAttempt < 2) {
              await new Promise(r => setTimeout(r, retryDelay));
              retryDelay = Math.round(retryDelay * 2);
            }
          }
        }
      }

      // Automatically recover from expired Telegram file references (HMAC token expiry)
      if (msg.includes('FILE_REFERENCE') || err.errorMessage === 'FILE_REFERENCE_EXPIRED') {
        console.warn(`[STREAM WARN] File reference expired on Doc ${targetDoc.id}. Auto-refreshing...`);
        const freshRef = await refreshDocumentFileReference(client, targetDoc);
        if (freshRef) {
          targetDoc.fileReference = freshRef;
          location.fileReference = freshRef;
          request.location.fileReference = freshRef;
          console.log(`[STREAM RECOVERY] Successfully swapped fresh fileReference. Retrying block ${blockIdx}...`);
          if (aborted) return null;
          sender = await client.getSender(dcId);
          if (aborted) return null;
          const result = await client.invokeWithSender(request, sender);
          if (aborted) return null;
          const bytes = result.bytes;
          if (bytes && bytes.length > 0) {
            setCachedBlock(docIdStr, blockIdx, bytes, isPinnedBlock);
          }
          return bytes;
        }
      }

      throw err;
    }
  }

  async function fetchBlockWithRetry(blockIdx, retries = 3) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (aborted) return null;
      try {
        const bytes = await fetchBlock(blockIdx);
        if (bytes) return bytes;
      } catch (err) {
        sender = null;
        if (attempt === retries || aborted) throw err;
        const msg = `${err.errorMessage || ''} ${err.message || ''}`;
        if (msg.includes('FILE_REFERENCE')) {
          console.warn(`[STREAM RETRY] File reference expired. Waiting for refresh on attempt ${attempt + 1}...`);
          await refreshDocumentFileReference(client, targetDoc);
        }
        console.warn(`[STREAM RETRY] Block ${blockIdx} attempt ${attempt + 1} failed (${err.message}). Retrying in 500ms...`);
        await new Promise(r => setTimeout(r, 500));
      }
    }
    return null;
  }

  let nextBlockToFetch = startBlock;

  // 1. First-Chunk Express Delivery:
  // Immediately fetch & send the first block alone with 100% bandwidth.
  // This allows the video decoder to display frames instantly (< 300ms) after seek without waiting for parallel chunks.
  let firstBlockData = await fetchBlockWithRetry(startBlock);
  if (aborted || res.destroyed || res.writableEnded) {
    firstBlockData = null;
    return;
  }
  if (!firstBlockData || firstBlockData.length === 0) {
    firstBlockData = null;
    return;
  }

  const firstBlockStart = startBlock * CHUNK_SIZE;
  const firstSliceStart = Math.max(0, startByte - firstBlockStart);
  const firstSliceEnd = Math.min(firstBlockData.length, (endByte - firstBlockStart) + 1);
  if (firstSliceStart < firstSliceEnd) {
    await writeWithBackpressure(res, firstBlockData.subarray(firstSliceStart, firstSliceEnd));
  }
  firstBlockData = null; // Explicitly release 512KB buffer immediately for GC

  if (startBlock === endBlock) {
    return;
  }

  // 2. Sliding-Window Pipeline for subsequent blocks
  nextBlockToFetch = startBlock + 1;

  function fillPipeline() {
    while (!aborted && inFlight.size < CONCURRENCY && nextBlockToFetch <= endBlock) {
      const idx = nextBlockToFetch++;
      const p = fetchBlockWithRetry(idx).catch(err => {
        if (!aborted) console.warn(`[STREAM PIPE WARN] Block ${idx} fetch error: ${err.message}`);
        return null;
      });
      inFlight.set(idx, p);
    }
  }

  for (let currentBlock = startBlock + 1; currentBlock <= endBlock; currentBlock++) {
    activeBlock = currentBlock;
    if (aborted || res.destroyed || res.writableEnded) break;

    fillPipeline();

    const blockPromise = inFlight.get(currentBlock);
    inFlight.delete(currentBlock);

    if (!blockPromise) break;

    const buffer = await blockPromise;
    if (!buffer || buffer.length === 0) break;

    const blockStartPos = currentBlock * CHUNK_SIZE;
    const sliceStart = Math.max(0, startByte - blockStartPos);
    const sliceEnd = Math.min(buffer.length, (endByte - blockStartPos) + 1);

    if (sliceStart < sliceEnd) {
      const slice = buffer.subarray(sliceStart, sliceEnd);
      await writeWithBackpressure(res, slice);
    }
  }

  } finally {
    cleanupStream();
    if (!res.writableEnded) {
      try { res.end(); } catch {}
    }
  }
}

// GitHub Auto-Deploy Webhook
app.post('/api/github-webhook', async (req, res) => {
  try {
    const event = req.headers['x-github-event'];
    if (event === 'ping') {
      console.log('[WEBHOOK] Received GitHub ping event. Connection active!');
      return res.json({ msg: 'pong' });
    }

    if (event !== 'push') {
      return res.json({ msg: `Ignored event: ${event}` });
    }

    const payload = req.body;
    const branch = payload.ref;
    console.log(`[WEBHOOK] Push received for ${branch} by ${payload.pusher?.name || 'unknown'}`);

    if (branch !== 'refs/heads/main' && branch !== 'refs/heads/master') {
      return res.json({ msg: `Ignored branch ${branch}` });
    }

    // Check if files under server/msm-getter/ were modified
    const commits = payload.commits || [];
    let serverFilesChanged = false;
    for (const c of commits) {
      const allModified = [...(c.added || []), ...(c.modified || [])];
      if (allModified.some(f => f.startsWith('server/msm-getter/'))) {
        serverFilesChanged = true;
        break;
      }
    }

    if (!serverFilesChanged && commits.length > 0) {
      console.log('[WEBHOOK] No changes in server/msm-getter/ detected in this push.');
      return res.json({ msg: 'No server changes detected' });
    }

    console.log('[WEBHOOK] Changes detected in server/msm-getter/! Triggering auto-deployment...');
    res.json({ msg: 'Deployment initiated' });

    // Download latest files from GitHub and restart service
    setTimeout(async () => {
      try {
        const fs = await import('fs');
        const repo = payload.repository?.full_name || 'jefrimustapa/tmdb-app';
        const rawBase = `https://raw.githubusercontent.com/${repo}/main/server/msm-getter`;

        console.log(`[AUTO-DEPLOY] Downloading latest index.js from ${rawBase}/index.js...`);
        const idxRes = await axios.get(`${rawBase}/index.js`, { responseType: 'text', timeout: 15000 });
        if (idxRes.data && idxRes.data.length > 1000) {
          const tmpPath = path.join(__dirname, 'index.js.tmp');
          fs.writeFileSync(tmpPath, idxRes.data, 'utf-8');
          fs.renameSync(tmpPath, path.join(__dirname, 'index.js'));
        }

        console.log(`[AUTO-DEPLOY] Downloading latest db.js from ${rawBase}/db.js...`);
        const dbRes = await axios.get(`${rawBase}/db.js`, { responseType: 'text', timeout: 15000 }).catch(() => null);
        if (dbRes?.data && dbRes.data.length > 200) {
          const tmpPath = path.join(__dirname, 'db.js.tmp');
          fs.writeFileSync(tmpPath, dbRes.data, 'utf-8');
          fs.renameSync(tmpPath, path.join(__dirname, 'db.js'));
        }

        console.log('[AUTO-DEPLOY] Code updated successfully! Exiting process for supervisor respawn in 1s...');
        setTimeout(() => {
          process.exit(0);
        }, 1000);
      } catch (dErr) {
        console.error('[AUTO-DEPLOY ERROR] Failed to download or restart:', dErr.message);
      }
    }, 500);

  } catch (err) {
    console.error('[WEBHOOK ERROR]', err);
    res.status(500).json({ error: err.message });
  }
});

// Cache for probed audio track stream specifiers per docId (capped to prevent memory growth)
const docAudioTrackCache = new Map();

async function resolveBestAudioTrack(docId, parentSessionKey) {
  if (docAudioTrackCache.has(docId)) {
    return docAudioTrackCache.get(docId);
  }

  const ffprobeBin = process.env.FFPROBE_PATH || (fs.existsSync('/opt/bin/ffprobe') ? '/opt/bin/ffprobe' : 'ffprobe');
  const probeHeaders = ['x-internal-probe: 1'];
  if (parentSessionKey) {
    probeHeaders.push(`x-parent-session: ${parentSessionKey}`);
  }
  const probeArgs = [
    '-v', 'error',
    '-headers', probeHeaders.join('\r\n') + '\r\n',
    '-probesize', '262144',
    '-analyzeduration', '0',
    '-show_entries', 'stream=index,codec_type,codec_name:stream_tags=language,title',
    '-of', 'json',
    `http://127.0.0.1:${INTERNAL_HTTP_PORT}/stream/${docId}?direct=1&probe=1`,
  ];

  try {
    const specifier = await new Promise((resolve, reject) => {
      let stdout = '';
      let proc = null;
      try {
        proc = spawn(ffprobeBin, probeArgs);
      } catch (e) {
        return reject(e);
      }

      const timer = setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch {}
        reject(new Error('ffprobe timeout after 10s'));
      }, 10000);

      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) return reject(new Error(`ffprobe exited with code ${code}`));
        try {
          const data = JSON.parse(stdout);
          const audioStreams = data.streams?.filter(s => s.codec_type === 'audio') || [];
          if (audioStreams.length === 0) return resolve('0:a:0');
          if (audioStreams.length === 1) return resolve(`0:${audioStreams[0].index}`);

          // Prioritize English audio track (isolated to avoid layered commentary/dub tracks)
          const engStream = audioStreams.find(s => {
            const lang = String(s.tags?.language || '').toLowerCase();
            const title = String(s.tags?.title || '').toLowerCase();
            return /^(en|eng|english)$/.test(lang) || /\b(eng|english|original|orig)\b/.test(title);
          });

          if (engStream) {
            console.log(`[AUDIO TRACK] Selected English track (stream ${engStream.index}, lang: ${engStream.tags?.language || 'unknown'}, title: "${engStream.tags?.title || ''}") for doc ${docId}`);
            return resolve(`0:${engStream.index}`);
          }

          // If no explicit English, check for original / undetermined track
          const origStream = audioStreams.find(s => {
            const lang = String(s.tags?.language || '').toLowerCase();
            const title = String(s.tags?.title || '').toLowerCase();
            return /^(und|qaa)$/.test(lang) || /\b(orig|original)\b/.test(title);
          });
          if (origStream) {
            console.log(`[AUDIO TRACK] Selected original/und track (stream ${origStream.index}) for doc ${docId}`);
            return resolve(`0:${origStream.index}`);
          }

          // Fallback to the first audio stream
          console.log(`[AUDIO TRACK] Fallback to primary audio track (stream ${audioStreams[0].index}) for doc ${docId}`);
          return resolve(`0:${audioStreams[0].index}`);
        } catch (err) {
          reject(err);
        }
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    if (docAudioTrackCache.size > 500) {
      const firstKey = docAudioTrackCache.keys().next().value;
      docAudioTrackCache.delete(firstKey);
    }
    docAudioTrackCache.set(docId, specifier);
    return specifier;
  } catch (err) {
    console.warn(`[AUDIO TRACK WARN] Failed to resolve track for doc ${docId} (${err.message}). Using fallback 0:a:0 without caching.`);
    return '0:a:0';
  }
}

// Stream endpoint with HTTP 206 Partial Content Range support
app.get('/stream/:docId', async (req, res) => {
  try {
    await initTelegram();
    const docId = req.params.docId;
    const rangeHeader = req.headers.range;

    // Zero Nagle buffering delay and keep connection active for fast range requests
    if (req.socket) {
      try {
        req.socket.setNoDelay(true);
        req.socket.setKeepAlive(true, 15000);
      } catch {}
    }

    // Instantly terminate any previous in-flight stream pipeline for this document for the same client session (e.g. user seeked forward)
    // to free 100% of the router's MTProto download bandwidth for the new seek position immediately.
    // Internal transcoder sessions are uniquely keyed so they never self-abort or abort other streams.
    const isInternalProbe = req.headers['x-internal-probe'] === '1' || req.query.probe === '1';
    const isInternalTranscoder = req.headers['x-internal-transcoder'] === '1' || req.query.direct === '1';
    const isInternal = isInternalProbe || isInternalTranscoder;
    const parentSessionKey = req.headers['x-parent-session'] || req.query.parentSession;

    // Resolve client identity (IP and friendly device name)
    const clientIdentity = resolveClientIdentity(req.headers['x-forwarded-for'] || req.ip || req.socket?.remoteAddress, req);
    const clientSession = isInternal
      ? (parentSessionKey ? `worker-${parentSessionKey}` : `internal-${docId}-${Date.now()}`)
      : (req.headers['x-client-id'] || clientIdentity.ip || 'client');
    const streamSessionKey = isInternal ? clientSession : `${clientSession}:${docId}`;

    if (!isInternal && activeStreams.has(streamSessionKey)) {
      console.log(`[STREAM CANCEL] Terminating previous in-flight stream for [${clientIdentity.name} (${clientIdentity.ip})] doc ${docId} on new seek.`);
      try { activeStreams.get(streamSessionKey).abort(); } catch {}
      activeStreams.delete(streamSessionKey);
    }

    let targetDoc = null;
    let targetMedia = null;
    let filename = `video_${docId}.mp4`;
    let fileSize = 0;
    let mimeType = 'video/mp4';

    // 1. Check Central Database first (Instant permanent media handle, 0 message polling)
    const dbRecord = db.getByDocId(docId);
    if (dbRecord && dbRecord.accessHash) {
      console.log(`[STREAM] Serving from Central DB: ${dbRecord.filename} (Doc ID: ${docId})`);
      targetDoc = new Api.Document({
        id: bigInt(dbRecord.docId || docId),
        accessHash: bigInt(dbRecord.accessHash || '0'),
        fileReference: Buffer.from(String(dbRecord.fileReference || ''), 'hex'),
        date: dbRecord.date || Math.floor(Date.now() / 1000),
        mimeType: dbRecord.mimeType || 'video/mp4',
        size: bigInt(dbRecord.size || '0'),
        dcId: dbRecord.dcId || 2,
        attributes: [new Api.DocumentAttributeFilename({ fileName: dbRecord.filename || filename })],
      });
      targetMedia = new Api.MessageMediaDocument({ document: targetDoc });
      filename = dbRecord.filename || filename;
      fileSize = Number(dbRecord.size || 0);
      mimeType = dbRecord.mimeType || 'video/mp4';
    } else {
      // 2. Fallback: Search recent bot messages
      const msgs = await client.getMessages('msm32bot', { limit: 20 });
      for (const m of msgs) {
        if (m.media?.document && m.media.document.id.toString() === docId) {
          targetDoc = m.media.document;
          targetMedia = m.media;
          const fnAttr = targetDoc.attributes?.find(a => a.className === 'DocumentAttributeFilename');
          if (fnAttr) filename = fnAttr.fileName;
          fileSize = Number(targetDoc.size || 0);
          mimeType = targetDoc.mimeType || 'video/mp4';
          break;
        }
      }
    }

    if (!targetDoc || !targetMedia || fileSize <= 0) {
      return res.status(404).send('Media document not found or invalid media size');
    }

    // OPTION C: On-demand Audio & Video Transcoding Pipe (?transcode=audio|video or automatic for .avi)
    // Streams Matroska/fMP4 with audio transcoded to stereo AAC and legacy AVI/MPEG4 video transcoded to H.264 Baseline (1 thread, ~11% CPU)
    const isAvi = /\.avi$/i.test(filename);
    if (isAvi && !isInternalTranscoder && !req.query.transcode) {
      const sep = req.url.includes('?') ? '&' : '?';
      console.log(`[AVI REDIRECT] Redirecting untagged AVI request to transcode pipe for [${clientIdentity.name} (${clientIdentity.ip})] doc ${docId}`);
      return res.redirect(307, `${req.url}${sep}transcode=audio&vcodec=h264`);
    }

    const shouldTranscode = req.query.transcode === 'audio' || req.query.transcode === 'video' || (isAvi && !isInternalTranscoder);

    if (shouldTranscode) {
      const seekSec = Math.max(0, parseFloat(req.query.ss) || 0);
      console.log(`[TRANSCODE ${isAvi ? 'AVI->H264' : 'AUDIO'}] Starting transcode for [${clientIdentity.name} (${clientIdentity.ip})] doc ${docId} (${filename}) at ${seekSec}s...`);

      const isAviOrLegacyVideo = isAvi || req.query.vcodec === 'h264';
      const outputMime = isAviOrLegacyVideo ? 'video/mp4' : 'video/x-matroska';
      const outputExt = isAviOrLegacyVideo ? 'mp4' : 'mkv';

      if (req.method === 'HEAD') {
        res.writeHead(200, {
          'Content-Type': outputMime,
          'Accept-Ranges': 'none',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        });
        return res.end();
      }

      // Isolate preferred single audio track (default: English) so client doesn't play layered multi-language dubs
      const requestedTrack = req.query.audio || req.query.track;
      let audioMapSpecifier = '0:a:0';
      if (requestedTrack && requestedTrack !== 'auto') {
        audioMapSpecifier = requestedTrack.startsWith('0:') ? requestedTrack : `0:${requestedTrack}`;
      } else {
        try {
          audioMapSpecifier = await resolveBestAudioTrack(docId, streamSessionKey);
        } catch (err) {
          audioMapSpecifier = '0:a:0';
        }
      }

      // Video encoding strategy:
      // For AVI / legacy video: use single-thread baseline libx264 (pinned to 1 core, 57 fps, ~11% avg router CPU).
      // For standard MKV/MP4: stream-copy 1:1 (-c:v copy, 0% CPU).
      const videoArgs = isAviOrLegacyVideo
        ? [
            '-threads', '1',
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-tune', 'fastdecode',
            '-profile:v', 'baseline',
            '-g', '25',
            '-keyint_min', '25',
            '-sc_threshold', '0',
            '-crf', '26',
            '-pix_fmt', 'yuv420p',
          ]
        : ['-c:v', 'copy'];

      const muxerArgs = isAviOrLegacyVideo
        ? ['-f', 'mp4', '-movflags', 'frag_keyframe+empty_moov+default_base_moof']
        : ['-flush_packets', '1', '-cluster_time_limit', '1000', '-cluster_size_limit', '524288', '-f', 'matroska'];

      const ffmpegBin = process.env.FFMPEG_PATH || (fs.existsSync('/opt/bin/ffmpeg') ? '/opt/bin/ffmpeg' : 'ffmpeg');
      const inputSeekFlags = seekSec > 0 ? ['-ss', seekSec.toString()] : ['-seekable', '0'];
      const ffmpegArgs = [
        '-loglevel', 'error',
        ...inputSeekFlags,
        '-headers', `x-internal-transcoder: 1\r\nx-parent-session: ${streamSessionKey}\r\n`,
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '2',
        '-probesize', '1000000',
        '-analyzeduration', '1000000',
        '-fflags', '+nobuffer+flush_packets',
        '-i', `http://127.0.0.1:${INTERNAL_HTTP_PORT}/stream/${docId}?direct=1`,
        '-map', '0:v:0',
        '-map', audioMapSpecifier,
        ...videoArgs,
        '-c:a', 'aac',
        '-ac', '2',
        '-b:a', '128k',
        ...(isAviOrLegacyVideo ? ['-af', 'aresample=async=1:first_pts=0'] : []),
        '-avoid_negative_ts', 'make_zero',
        ...muxerArgs,
        'pipe:1',
      ];

      let headersSent = false;
      let firstChunkReceived = false;

      const sendTranscodeHeaders = () => {
        if (!headersSent && !res.headersSent) {
          headersSent = true;
          res.writeHead(200, {
            'Content-Type': outputMime,
            'Transfer-Encoding': 'chunked',
            'Connection': 'keep-alive',
            'Cache-Control': 'no-cache, no-store',
            'Access-Control-Allow-Origin': '*',
            'Content-Disposition': `inline; filename="transcoded_${docId}.${outputExt}"`,
          });
        }
      };

      const ffmpegProc = spawn(ffmpegBin, ffmpegArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

      const transcodeEntry = {
        sessionKey: streamSessionKey,
        ip: clientIdentity.ip,
        clientName: clientIdentity.name,
        docId,
        filename,
        mode: '1080p Transcode (Stereo AAC)',
        createdAt: activeStreams.get(streamSessionKey)?.createdAt || Date.now(),
        lastActive: Date.now(),
        internalWorkers: new Map(),
        abort: () => {
          console.log(`[TRANSCODE ABORT] Killing ffmpeg process and workers for doc ${docId}`);
          try { ffmpegProc.kill('SIGKILL'); } catch {}
          for (const [, abortWorker] of transcodeEntry.internalWorkers.entries()) {
            try { abortWorker(); } catch {}
          }
          transcodeEntry.internalWorkers.clear();
        }
      };
      cancelIdleMemoryPurge();
      activeStreams.set(streamSessionKey, transcodeEntry);

      const cleanupFfmpeg = () => {
        req.off('close', cleanupFfmpeg);
        res.off('finish', cleanupFfmpeg);
        if (activeStreams.get(streamSessionKey) === transcodeEntry) {
          activeStreams.delete(streamSessionKey);
          if (activeStreams.size === 0) {
            scheduleIdleMemoryPurge();
          }
        }
        transcodeEntry.abort();
      };

      req.on('close', cleanupFfmpeg);
      res.on('finish', cleanupFfmpeg);

      ffmpegProc.stderr.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg) console.warn(`[FFMPEG ${docId}]`, msg);
      });

      ffmpegProc.stdout.on('data', (chunk) => {
        if (res.destroyed || res.writableEnded) {
          cleanupFfmpeg();
          return;
        }
        if (!firstChunkReceived) {
          firstChunkReceived = true;
          sendTranscodeHeaders();
        }
        try {
          const ok = res.write(chunk);
          if (!ok) {
            ffmpegProc.stdout.pause();
            res.once('drain', () => {
              if (!ffmpegProc.killed) {
                try { ffmpegProc.stdout.resume(); } catch {}
              }
            });
          }
        } catch (err) {
          cleanupFfmpeg();
        }
      });

      ffmpegProc.stdout.on('error', (err) => {
        console.warn(`[FFMPEG STDOUT ${docId}] Error:`, err.message);
        cleanupFfmpeg();
      });

      ffmpegProc.on('error', (err) => {
        console.error(`[FFMPEG ERROR ${docId}]`, err);
        cleanupFfmpeg();
        if (!headersSent && !res.headersSent) {
          console.warn(`[TRANSCODE FALLBACK] ffmpeg spawn error (${err.message}). Redirecting to direct stream for doc ${docId}...`);
          return res.redirect(`/stream/${docId}?direct=1`);
        }
        if (!res.headersSent) res.status(500).send('Transcoding process error');
      });

      ffmpegProc.on('exit', (code, signal) => {
        cleanupFfmpeg();
        if (code !== 0 && code !== null && signal !== 'SIGKILL') {
          console.warn(`[FFMPEG EXIT ${docId}] exited with code ${code}, signal ${signal}`);
          if (!firstChunkReceived && !headersSent && !res.headersSent) {
            console.warn(`[TRANSCODE FALLBACK] ffmpeg exited before producing stream. Redirecting to direct stream for doc ${docId}...`);
            return res.redirect(`/stream/${docId}?direct=1`);
          }
        }
        if (!res.writableEnded) {
          try { res.end(); } catch {}
        }
      });

      return;
    }

    // Handle HEAD probe requests instantly (critical for Android WebView & ExoPlayer probe)
    if (req.method === 'HEAD') {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': mimeType,
        'Accept-Ranges': 'bytes',
        'Content-Disposition': `inline; filename="${encodeURIComponent(filename)}"`,
      });
      return res.end();
    }

    // Parse user-specified chunk size / pipeline mode from query parameter (e.g. ?chunkSize=1048576)
    const parsedChunk = parseInt(req.query.chunkSize, 10);
    const downloadChunkSize = [131072, 262144, 524288, 1048576].includes(parsedChunk) ? parsedChunk : 512 * 1024;

    if (!rangeHeader) {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': mimeType,
        'Accept-Ranges': 'bytes',
        'Content-Disposition': `inline; filename="${encodeURIComponent(filename)}"`,
      });
      await streamTelegramPipelined(client, targetDoc, 0, fileSize - 1, res, req, downloadChunkSize, undefined, streamSessionKey);
    } else {
      const rangeMatch = rangeHeader.match(/bytes=(\d*)-(\d*)/);
      let start;
      let end;

      if (!rangeMatch) {
        res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
        return res.end();
      }

      if (rangeMatch[1] === '' && rangeMatch[2] !== '') {
        // Suffix range: bytes=-500 (requesting last 500 bytes)
        const suffixLen = parseInt(rangeMatch[2], 10);
        if (isNaN(suffixLen) || suffixLen <= 0) {
          res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
          return res.end();
        }
        start = Math.max(0, fileSize - suffixLen);
        end = fileSize - 1;
      } else {
        start = parseInt(rangeMatch[1], 10);
        end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : fileSize - 1;
      }

      if (isNaN(start) || isNaN(end) || start < 0 || start > end || start >= fileSize) {
        res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
        return res.end();
      }

      end = Math.min(end, fileSize - 1);

      const chunkSize = (end - start) + 1;
      console.log(`[STREAM REQ] [${clientIdentity.name} (${clientIdentity.ip})] ${req.method} Range: "${rangeHeader}" -> start: ${start}, end: ${end} (${chunkSize} bytes, chunkParam: ${req.query.chunkSize || 'default'})`);
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': mimeType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(filename)}"`,
      });

      await streamTelegramPipelined(client, targetDoc, start, end, res, req, downloadChunkSize, undefined, streamSessionKey);
    }
  } catch (err) {
    if (err.code !== 'ERR_STREAM_WRITE_AFTER_END' && err.code !== 'ECONNRESET' && err.code !== 'EPIPE') {
      console.error('[STREAM ERROR]', err);
    }
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else if (!res.writableEnded) {
      try { res.destroy(); } catch {}
    }
  }
});

process.on('uncaughtException', (err) => {
  const code = err?.code || '';
  const msg = err?.message || '';
  if (
    code === 'ECONNRESET' ||
    code === 'EPIPE' ||
    code === 'ERR_STREAM_WRITE_AFTER_END' ||
    code === 'ERR_STREAM_PREMATURE_CLOSE' ||
    code === 'ECANCELED' ||
    code === 'ETIMEDOUT' ||
    code === 'ENETUNREACH' ||
    code === 'EHOSTUNREACH' ||
    code === 'ECONNREFUSED' ||
    msg.includes('socket hang up') ||
    msg.includes('Connection closed') ||
    msg.includes('Not connected') ||
    msg.includes('disconnected')
  ) {
    return;
  }
  console.error('[FATAL EXCEPTION]', err);
});

process.on('unhandledRejection', (reason) => {
  const msg = reason?.message || String(reason || '');
  if (
    msg.includes('Not connected') ||
    msg.includes('Connection closed') ||
    msg.includes('socket hang up') ||
    msg.includes('ECONNRESET') ||
    msg.includes('ETIMEDOUT')
  ) {
    return;
  }
  console.error('[UNHANDLED REJECTION]', reason);
});

// Locate SSL certificates (Let's Encrypt on Asuswrt or custom environment paths)
const certCandidates = [
  process.env.SSL_CERT_PATH,
  '/etc/cert.pem',
  '/jffs/.le/www.julietmike.net_ecc/fullchain.pem',
  '/jffs/ssl/cert.pem',
].filter(Boolean);

const keyCandidates = [
  process.env.SSL_KEY_PATH,
  '/etc/key.pem',
  '/jffs/.le/www.julietmike.net_ecc/domain.key',
  '/jffs/ssl/key.pem',
].filter(Boolean);

const sslCertFile = certCandidates.find(p => fs.existsSync(p));
const sslKeyFile = keyCandidates.find(p => fs.existsSync(p));

function attachServerErrorHandler(server, name, sPort) {
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[SERVER FATAL] ${name} port ${sPort} is already in use (EADDRINUSE). Another instance may be running.`);
    } else {
      console.error(`[SERVER ERROR] ${name} listener error:`, err);
    }
  });
}

let serverInstance;

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  if (sslCertFile && sslKeyFile) {
    try {
      const sslOptions = {
        key: fs.readFileSync(sslKeyFile),
        cert: fs.readFileSync(sslCertFile),
      };
      serverInstance = https.createServer(sslOptions, app);
      attachServerErrorHandler(serverInstance, 'MSM Getter HTTPS', port);
      serverInstance.listen(port, async () => {
        console.log(`[SERVER] MSM Getter microservice listening securely on HTTPS port ${port} (cert: ${sslCertFile})`);
        checkFfmpeg();
        try {
          await initTelegram();
        } catch (err) {
          console.warn(`[SERVER] Telegram not connected on startup (${err.message}). Web auth portal ready at /auth.`);
        }
      });
    } catch (sslErr) {
      console.error('[SERVER SSL ERROR] Failed to initialize HTTPS server, falling back to HTTP:', sslErr);
      serverInstance = http.createServer(app);
      attachServerErrorHandler(serverInstance, 'MSM Getter HTTP (Fallback)', port);
      serverInstance.listen(port, async () => {
        console.log(`[SERVER] MSM Getter microservice listening on HTTP port ${port}`);
        checkFfmpeg();
        try {
          await initTelegram();
        } catch (err) {
          console.warn(`[SERVER] Telegram not connected on startup (${err.message}). Web auth portal ready at /auth.`);
        }
      });
    }
  } else {
    serverInstance = http.createServer(app);
    attachServerErrorHandler(serverInstance, 'MSM Getter HTTP', port);
    serverInstance.listen(port, async () => {
      console.log(`[SERVER] MSM Getter microservice listening on HTTP port ${port}`);
      checkFfmpeg();
      try {
        await initTelegram();
      } catch (err) {
        console.warn(`[SERVER] Telegram not connected on startup (${err.message}). Web auth portal ready at /auth.`);
      }
    });
  }

  // Start dedicated internal loopback HTTP listener on 127.0.0.1:3034
  // Bypasses TLS overhead completely for local ffmpeg transcode demuxer
  if (port !== INTERNAL_HTTP_PORT) {
    try {
      const internalServer = http.createServer(app);
      attachServerErrorHandler(internalServer, 'Internal Transcoder Loopback', INTERNAL_HTTP_PORT);
      internalServer.listen(INTERNAL_HTTP_PORT, '127.0.0.1', () => {
        console.log(`[SERVER] Internal loopback HTTP listener active on http://127.0.0.1:${INTERNAL_HTTP_PORT} (0% TLS overhead for ffmpeg)`);
      });
    } catch (internalErr) {
      console.warn('[SERVER] Could not bind internal HTTP listener:', internalErr.message);
    }
  }
}

export {
  extractEpisodeInfo,
  extractSeasonInfo,
  cleanBotEchoHeader,
  cleanSearchTitle,
  isBareButton,
  scoreCandidateButton,
  generateSeriesSearchQueries,
  calculateTitleCoverage,
  normalizeTitle,
  extractSignificantTokens,
  extractYear,
  extractSequelInfo,
};
