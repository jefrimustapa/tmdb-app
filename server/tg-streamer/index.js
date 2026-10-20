import './logger.js';
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
import { createGeoBlockMiddleware, isMalaysiaIp, isPrivateIp, checkGeoAccess } from './geoblock.js';

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

// Remove LD_PRELOAD from child environment so spawned 32-bit router binaries (nvram, sh) do not fail ELF class checks
delete process.env.LD_PRELOAD;

const app = express();
app.set('trust proxy', true);
app.use(cors());
app.use(express.json());
// Catch malformed JSON payloads gracefully without logging uncaught SyntaxError stack traces
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ success: false, error: 'Malformed JSON payload' });
  }
  next(err);
});

// Geo-blocking: Restrict incoming public WAN requests exclusively to Malaysia (MY)
app.use(createGeoBlockMiddleware(() => savedSettings));

const port = process.env.PORT || 3033;
const INTERNAL_HTTP_PORT = parseInt(process.env.INTERNAL_PORT || '3034', 10);
const apiId = parseInt(process.env.TG_API_ID, 10);
const apiHash = process.env.TG_API_HASH;
let session = process.env.TG_SESSION || '';
const LOG_PATH = process.env.LOG_FILE || (process.platform === 'win32' ? path.join(__dirname, 'tg-streamer.log') : '/tmp/tg-streamer.log');

const SETTINGS_FILE = path.join(__dirname, 'data', 'settings.json');

import {
  BaseResolver,
  MsmResolver,
  PencuriResolver,
  createResolver,
  listResolvers,
  getResolverClass,
  detectVideoQualityTier,
  normalizeTitle,
  extractSequelInfo,
  extractYear,
  extractEpisodeInfo,
  extractSeasonInfo,
  cleanBotEchoHeader,
  cleanSearchTitle,
  isBareButton,
  isAllowedTitleSuffix,
  validateTitleBoundaries,
  isJunkMedia,
  calculateTitleCoverage,
  extractSignificantTokens,
  extractTitleTokens,
  scoreCandidateButtonWithReason,
  scoreCandidateButton,
  parseSizeFromText,
  generateSeriesSearchQueries,
  DEFAULT_PIPELINE_BUFFERS,
  JUNK_MEDIA_REGEX,
} from './resolvers/index.js';


let savedSettings = {};
try {
  if (fs.existsSync(SETTINGS_FILE)) {
    savedSettings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
  }
} catch (e) {}

savedSettings.pipelineBuffers = Object.assign({}, DEFAULT_PIPELINE_BUFFERS, savedSettings.pipelineBuffers || {});
if (savedSettings.overlapPrefetch === undefined) savedSettings.overlapPrefetch = true;
if (savedSettings.routerRamCacheMb === undefined) savedSettings.routerRamCacheMb = 16;
if (savedSettings.videoTranscodeMode === undefined) savedSettings.videoTranscodeMode = 'disabled';
if (savedSettings.minTvSizeMb === undefined) savedSettings.minTvSizeMb = 80;
if (savedSettings.minMovieSizeMb === undefined) savedSettings.minMovieSizeMb = 180;
if (savedSettings.resolverMaxPages === undefined) savedSettings.resolverMaxPages = 3;
if (savedSettings.geoBlockEnabled === undefined) savedSettings.geoBlockEnabled = true;
if (savedSettings.geoBlockAllowedCountries === undefined) savedSettings.geoBlockAllowedCountries = ['MY'];
if (savedSettings.geoBlockWhitelistedIps === undefined) savedSettings.geoBlockWhitelistedIps = [];
if (savedSettings.activeResolver === undefined) savedSettings.activeResolver = 'msm';
if (savedSettings.targetBotUsernames === undefined) savedSettings.targetBotUsernames = { msm: 'msm34bot', pencuri: 'Pencuri_Movie_Bot' };

export let BOT_USERNAME = (savedSettings.targetBotUsername || process.env.TG_BOT_USERNAME || 'msm34bot').replace(/^@/, '');

export function getActiveTargetBot() {
  const activeResolverId = savedSettings.activeResolver || 'msm';
  if (savedSettings.targetBotUsernames && savedSettings.targetBotUsernames[activeResolverId]) {
    return savedSettings.targetBotUsernames[activeResolverId].replace(/^@/, '');
  }
  if (activeResolverId === 'pencuri') {
    return 'Pencuri_Movie_Bot';
  }
  return BOT_USERNAME.replace(/^@/, '');
}

export function getGeoBadgeHtml(isGeoEnabled) {
  if (isGeoEnabled) {
    return '<span id="geoBadge" class="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono hidden sm:inline-block">🛡️ MY Only</span>';
  }
  return '<span id="geoBadge" class="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 font-mono hidden sm:inline-block">🛡️ Disabled</span>';
}


function getLogFilePath() {
  if (fs.existsSync('/tmp/tg-streamer.log')) return '/tmp/tg-streamer.log';
  if (fs.existsSync(LOG_PATH)) return LOG_PATH;
  return path.join(__dirname, 'tg-streamer.log');
}

if (!apiId || !apiHash) {
  console.error('[ERROR] TG_API_ID or TG_API_HASH missing from .env!');
}
console.log(`[INIT] Target Telegram Bot configured as: @${BOT_USERNAME}`);

let client = new TelegramClient(new StringSession(session), apiId, apiHash, {
  connection: ConnectionTCPObfuscated,
  connectionRetries: 10,
  retryDelay: 1000,
  autoReconnect: true,
  timeout: 60,
  deviceModel: 'MSM Getter Server',
  appVersion: '1.0.0',
  systemVersion: 'Linux/ASUS',
  baseLogger: new QuietLogger('error'),
});
try { client.setLogLevel('error'); } catch {}

function patchExportedSenderProtection(c) {
  if (!c || typeof c._borrowExportedSender !== 'function') return;
  const originalBorrow = c._borrowExportedSender.bind(c);
  const reconnectStats = new Map(); // dcId -> { count: number, lastAttempt: number }

  c._borrowExportedSender = async function(dcId, shouldReconnect, existingSender) {
    const now = Date.now();
    let stats = reconnectStats.get(dcId);
    if (!stats || now - stats.lastAttempt > 15000) {
      stats = { count: 0, lastAttempt: now };
      reconnectStats.set(dcId, stats);
    }
    stats.lastAttempt = now;

    if (shouldReconnect) {
      stats.count++;
      if (stats.count > 5) {
        console.error(`[TG DC GUARD] Max consecutive reconnect attempts (5) reached for DC ${dcId}. Halting socket storm.`);
        if (existingSender) {
          try { await existingSender.disconnect().catch(() => {}); } catch {}
        }
        this._exportedSenderPromises?.delete(dcId);
        stats.count = 0;
        throw new Error(`[TG DC GUARD] Unable to connect to DC ${dcId} after 5 retries. Aborting.`);
      }
      // Progressive backoff delay (300ms, 600ms, 1200ms, 2400ms, 3000ms)
      const delay = Math.min(stats.count * 600, 3000);
      await new Promise(r => setTimeout(r, delay));
    } else {
      stats.count = 0;
    }

    try {
      const sender = await originalBorrow(dcId, shouldReconnect, existingSender);
      // Permanently cancel GramJS's naive 30-second disconnect/reconnect timer.
      // GramJS was designed for quick one-off requests and assumes that any pending request after 30s
      // is a "hanging state", forcefully killing and reconnecting the TCP socket every 30 seconds.
      // During active video streaming, this timer severed the stream every 30s causing playback stutter.
      if (this._exportedSenderReleaseTimeouts?.get(dcId)) {
        clearTimeout(this._exportedSenderReleaseTimeouts.get(dcId));
        this._exportedSenderReleaseTimeouts.delete(dcId);
      }
      stats.count = 0;
      return sender;
    } catch (err) {
      if (existingSender) {
        try { await existingSender.disconnect().catch(() => {}); } catch {}
      }
      this._exportedSenderPromises?.delete(dcId);
      throw err;
    }
  };
}

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
  patchExportedSenderProtection(c);
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
      authError = 'No active session. Please authenticate via Web Portal at /tg/auth.';
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
        console.error('[TG ERROR] Auth key duplicated. Re-authentication required at /tg/auth.');
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

// In-memory blacklist of dead shortcodes that returned forward_failed (deleted source messages)
const deadShortcodes = new Set();

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
app.get(['/api/auth/status', '/tg/api/auth/status', '/msm/api/auth/status'], async (req, res) => {
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
app.post(['/api/auth/send-code', '/tg/api/auth/send-code', '/msm/api/auth/send-code'], async (req, res) => {
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
app.post(['/api/auth/verify-code', '/tg/api/auth/verify-code', '/msm/api/auth/verify-code'], async (req, res) => {
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

// Redirect legacy /auth to /tg/auth
app.get('/auth', (req, res) => res.redirect(301, '/tg/auth'));

// Web Authentication Portal UI (Served exclusively at /tg/auth)
app.get('/tg/auth', (req, res) => {
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
<body class="min-h-screen p-4 sm:p-8 flex flex-col items-center bg-[#0B0F17] text-[#E2E8F0]">
  <div class="max-w-6xl w-full space-y-6 flex flex-col items-center pb-28 sm:pb-12">
    <!-- Top Navigation & Header -->
    <header class="flex flex-col sm:flex-row items-center justify-between bg-slate-900 border border-slate-800 rounded-2xl px-6 py-4 glow-box gap-4 w-full">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center font-bold text-lg">
          🔑
        </div>
        <div>
          <h1 class="text-lg font-bold text-white flex items-center gap-2">
            MSM Auth Portal
            <span class="text-xs px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30 font-mono">@${getActiveTargetBot()}</span>
          </h1>
          <p class="text-xs text-slate-400">Telegram MTProto Session & Authentication Gateway</p>
        </div>
      </div>
      <nav class="flex items-center gap-2 flex-wrap">
        <a href="/tg" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800 transition flex items-center gap-1">
          🏠 Dashboard
        </a>
        <a href="/tg/streams" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800 transition flex items-center gap-1">
          💾 Streams
        </a>
        <a href="/tg/settings" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800 transition flex items-center gap-1">
          ⚙️ Settings
        </a>
        <a href="/tg/logs" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800 transition flex items-center gap-1">
          📜 Logs
        </a>
        <a href="/tg/auth" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-sky-400 bg-sky-500/10 border border-sky-500/30 flex items-center gap-1">
          🔑 Auth
        </a>
      </nav>
    </header>

    <div class="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 glow-box shadow-2xl space-y-6">
      
      <!-- Header -->
      <div class="text-center space-y-2">
        <div class="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20 mb-2">
          <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.19-.08-.05-.19-.02-.27 0-.12.03-1.99 1.27-5.62 3.72-.53.36-1.01.54-1.44.53-.47-.01-1.38-.27-2.05-.48-.83-.27-1.48-.42-1.42-.88.03-.24.37-.49 1.02-.75 3.98-1.73 6.64-2.88 7.98-3.44 3.81-1.59 4.6-1.87 5.12-1.88.11 0 .37.03.54.17.14.12.18.28.2.45-.02.07-.02.21-.04.38z"/></svg>
        </div>
        <h2 class="text-xl font-black tracking-tight text-white">Telegram MTProto Login</h2>
        <p class="text-xs text-slate-400">Generate and verify session string with OTP code</p>
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
        const res = await fetch('/msm/api/auth/status');
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
        const res = await fetch('/msm/api/auth/send-code', {
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
        const res = await fetch('/msm/api/auth/verify-code', {
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

    window.addEventListener('scroll', () => {
      const btn = document.getElementById('backToTopBtn');
      if (!btn) return;
      if (window.scrollY > 250) {
        btn.classList.remove('opacity-0', 'translate-y-4', 'pointer-events-none');
        btn.classList.add('opacity-100', 'translate-y-0', 'pointer-events-auto');
      } else {
        btn.classList.add('opacity-0', 'translate-y-4', 'pointer-events-none');
        btn.classList.remove('opacity-100', 'translate-y-0', 'pointer-events-auto');
      }
    }, { passive: true });
  </script>
  </div>
  <!-- Floating Back to Top Button -->
  <button id="backToTopBtn" onclick="window.scrollTo({top: 0, behavior: 'smooth'})" title="Scroll to top" aria-label="Scroll to top" class="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 p-2.5 sm:p-3 rounded-full bg-slate-800/90 hover:bg-sky-500 text-slate-300 hover:text-slate-950 border border-slate-700/80 hover:border-sky-400 shadow-xl backdrop-blur transition-all duration-300 opacity-0 translate-y-4 pointer-events-none focus:outline-none glow-box cursor-pointer">
    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 10l7-7m0 0l7 7m-7-7v18"></path>
    </svg>
  </button>
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
// Configurable cache (8, 16, 32, 64 MB RAM) to eliminate seek latency while protecting router RAM from exhaustion.
export function getBlockCacheMaxEntries() {
  const mb = parseInt(savedSettings.routerRamCacheMb, 10) || 16;
  return mb * 2; // 2 x 512KB blocks per MB
}

export function pruneGlobalBlockCache() {
  const maxEntries = getBlockCacheMaxEntries();
  while (globalBlockCache.size > maxEntries) {
    const oldestKey = globalBlockCache.keys().next().value;
    globalBlockCache.delete(oldestKey);
  }
}

const globalBlockCache = new Map();

// Pinned cache for container headers (first 4 blocks: 0..3) and tail cues (last 4 blocks)
// These blocks (<= 4 MB total per doc) are NEVER evicted by sequential playback pipelines,
// eliminating remote Telegram round-trips on every seek & probe!
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
    } else if (pinnedHeaderCache.size >= 48) {
      const oldestKey = pinnedHeaderCache.keys().next().value;
      pinnedHeaderCache.delete(oldestKey);
    }
    pinnedHeaderCache.set(key, data);
    return;
  }
  const maxEntries = getBlockCacheMaxEntries();
  if (globalBlockCache.has(key)) {
    globalBlockCache.delete(key);
  } else if (globalBlockCache.size >= maxEntries) {
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

// Automated garbage collector for orphaned stream handles & periodic idle watchdog (5-minute grace period)
const STREAM_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of activeStreams.entries()) {
    const idleDuration = now - (entry.lastActive || entry.createdAt || now);
    if (idleDuration > STREAM_IDLE_TIMEOUT_MS) {
      console.warn(`[STREAM IDLE EVICT] Evicting stream idle for ${Math.round(idleDuration / 1000)}s (>5m grace period): ${key} [${entry.clientName || 'Client'} (${entry.ip || ''})]`);
      try { entry.abort(); } catch {}
      activeStreams.delete(key);
      if (activeStreams.size === 0) scheduleIdleMemoryPurge();
    }
  }
  for (const [wKey, wEntry] of internalWorkers.entries()) {
    if (now - (wEntry.createdAt || now) > 15 * 60 * 1000) {
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
}, 30 * 1000).unref();

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

function isDesktopWebClient(req) {
  const ua = req?.headers?.['user-agent'] || '';
  const clientIdentity = resolveClientIdentity(null, req);
  // If device is identified as mobile, phone, or TV from DHCP/DNS/User-Agent, never transcode
  if (/S25|Galaxy|Phone|Android|iOS|iPad|iPhone|SmartTV|GoogleTV|AppleTV|Roku|Tizen|Web0S/i.test(clientIdentity?.name || '')) {
    return false;
  }
  if (!ua) return false;
  const isMobileOrTv = /Mobile|Android|iPhone|iPad|iPod|SmartTV|Tizen|Web0S|GoogleTV|AppleTV|Roku|ExoPlayer|Dalvik|okhttp/i.test(ua);
  const isDesktopOs = /Windows NT|Macintosh|X11; Linux x86_64|CrOS/i.test(ua);
  return isDesktopOs && !isMobileOrTv;
}

function isMobileClient(req) {
  return !isDesktopWebClient(req);
}

// CPU Usage Tracker (Router System CPU from /proc/stat, tg-streamer Node process from process.cpuUsage, and FFmpeg workers from /proc/[pid]/stat)
let lastSystemCpu = null;
let lastProcCpu = process.cpuUsage();
let lastProcTime = process.hrtime.bigint();
const activeFfmpegStats = new Map(); // pid -> { ticks, time }

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

  // 2. tg-streamer Node Process CPU (process.cpuUsage())
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

  // 3. Active FFmpeg Transcode Workers CPU (/proc/[pid]/stat)
  let ffmpegCpuPct = 0;
  try {
    const currentFfmpegPids = new Set();
    for (const s of activeStreams.values()) {
      if (s.ffmpegProc?.pid) {
        currentFfmpegPids.add(s.ffmpegProc.pid);
      }
    }

    const nowMs = Date.now();
    for (const pid of currentFfmpegPids) {
      const statPath = `/proc/${pid}/stat`;
      if (fs.existsSync(statPath)) {
        const content = fs.readFileSync(statPath, 'utf8');
        const closeParenIdx = content.lastIndexOf(')');
        if (closeParenIdx !== -1) {
          const rest = content.substring(closeParenIdx + 2).split(/\s+/);
          const utime = parseInt(rest[11], 10) || 0;
          const stime = parseInt(rest[12], 10) || 0;
          const totalTicks = utime + stime;

          if (activeFfmpegStats.has(pid)) {
            const prev = activeFfmpegStats.get(pid);
            const dtSec = (nowMs - prev.time) / 1000;
            const dTicks = totalTicks - prev.ticks;
            if (dtSec > 0.2 && dTicks >= 0) {
              const pct = (dTicks / (100 * dtSec * cores)) * 100;
              ffmpegCpuPct += Math.min(100, pct);
            }
          }
          activeFfmpegStats.set(pid, { ticks: totalTicks, time: nowMs });
        }
      }
    }

    for (const storedPid of activeFfmpegStats.keys()) {
      if (!currentFfmpegPids.has(storedPid)) {
        activeFfmpegStats.delete(storedPid);
      }
    }
  } catch {}

  ffmpegCpuPct = Math.round(ffmpegCpuPct * 10) / 10;
  const serviceCpuPct = Math.round((nodeCpuPct + ffmpegCpuPct) * 10) / 10;

  return { routerCpuPct, nodeCpuPct, ffmpegCpuPct, serviceCpuPct, cores, loadAvg1m };
}

// System Stats Endpoint (Uptime, Memory RSS, Active Streams, Active Clients, Log Size)
app.get(['/api/system/stats', '/tg/api/system/stats', '/msm/api/system/stats'], (req, res) => {
  let mem = { rss: 0, heapUsed: 0, heapTotal: 0, external: 0 };
  try {
    mem = process.memoryUsage();
  } catch {}
  let logSizeKB = 0;
  try {
    const logPath = getLogFilePath();
    if (fs.existsSync(logPath)) {
      logSizeKB = Math.round(fs.statSync(logPath).size / 1024);
    }
  } catch {}

  const activeClients = [];
  const now = Date.now();
  for (const [key, stream] of activeStreams.entries()) {
    const idleMs = now - (stream.lastActive || stream.createdAt || now);
    const isStreaming = stream.isSocketOpen !== false && idleMs < 15000;
    activeClients.push({
      sessionKey: key,
      ip: stream.ip || 'unknown',
      clientName: stream.clientName || stream.ip || 'Client',
      filename: stream.filename || 'media',
      qualityTier: stream.qualityTier || detectVideoQualityTier(stream.filename || ''),
      concurrency: stream.concurrency || 4,
      pipelineMB: stream.concurrency ? (stream.concurrency * 0.5).toFixed(1) : '2.0',
      isPrefetchOverlapped: stream.isPrefetchOverlapped !== false,
      mode: stream.mode || 'Direct Native',
      status: isStreaming ? 'STREAMING' : 'IDLE',
      idleSec: Math.max(0, Math.round(idleMs / 1000)),
      connectedSec: Math.max(0, Math.round((now - (stream.createdAt || now)) / 1000)),
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
    pipelineBuffers: savedSettings.pipelineBuffers || DEFAULT_PIPELINE_BUFFERS,
    overlapPrefetch: savedSettings.overlapPrefetch !== false,
    routerRamCacheMb: savedSettings.routerRamCacheMb || 16,
    videoTranscodeMode: savedSettings.videoTranscodeMode || 'disabled',
    blockCacheEntries: globalBlockCache.size,
    blockCacheMaxEntries: getBlockCacheMaxEntries(),
    logSizeKB,
    geoBlockEnabled: savedSettings.geoBlockEnabled !== false,
    activeResolver: savedSettings.activeResolver || 'msm',
    targetBotUsername: getActiveTargetBot(),
  });
});

// Manual Memory Purge API (Evicts chunk caches, clears client cache & runs GC)
app.post(['/api/system/purge-memory', '/tg/api/system/purge-memory', '/msm/api/system/purge-memory'], (req, res) => {
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
app.get(['/api/logs', '/tg/api/logs', '/msm/api/logs'], (req, res) => {
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
app.get(['/api/logs/stream', '/tg/api/logs/stream', '/msm/api/logs/stream'], (req, res) => {
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
app.get(['/api/logs/download', '/tg/api/logs/download', '/msm/api/logs/download'], (req, res) => {
  try {
    const logPath = getLogFilePath();
    if (!fs.existsSync(logPath)) {
      return res.status(404).send('No log file found.');
    }
    const filename = `tg-streamer-${new Date().toISOString().slice(0, 10)}.log`;
    res.download(logPath, filename);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Clear / Truncate Physical Log File on Disk
app.post(['/api/logs/clear', '/tg/api/logs/clear', '/msm/api/logs/clear'], (req, res) => {
  try {
    const logPath = getLogFilePath();
    if (fs.existsSync(logPath)) {
      fs.truncateSync(logPath, 0);
    }
    console.log('[SYSTEM] Log file physically truncated and cleared by user.');
    return res.json({ success: true, message: 'Log file cleared successfully.' });
  } catch (err) {
    console.error('[SYSTEM ERROR] Failed to truncate log file:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Redirect legacy /logs to /tg/logs
app.get('/logs', (req, res) => res.redirect(301, '/tg/logs'));

// Dedicated Web Log Viewer GUI (Served exclusively at /tg/logs)
app.get('/tg/logs', (req, res) => {
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
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
  <meta http-equiv="Pragma" content="no-cache" />
  <meta http-equiv="Expires" content="0" />
  <title>MSM Getter — Live Log Console</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background-color: #0B0F17; color: #E2E8F0; font-family: ui-sans-serif, system-ui, sans-serif; }
    .glow-box { box-shadow: 0 0 25px rgba(56, 189, 248, 0.08); }
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: #0B0F17; }
    ::-webkit-scrollbar-thumb { background: #1E293B; border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: #334155; }
  </style>
</head>
<body class="min-h-screen p-4 sm:p-8 flex flex-col items-center bg-[#0B0F17] text-[#E2E8F0]">
  <div class="max-w-6xl w-full space-y-4 flex flex-col flex-1 pb-28 sm:pb-12">
    <!-- Top Navigation & Header -->
    <header class="flex flex-col sm:flex-row items-center justify-between bg-slate-900 border border-slate-800 rounded-2xl px-6 py-4 glow-box gap-4 w-full">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20 flex items-center justify-center font-bold text-lg">
          📜
        </div>
        <div>
          <h1 class="text-lg font-bold text-white flex items-center gap-2">
            MSM Logs
            <span class="text-xs px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30 font-mono">@${getActiveTargetBot()}</span>
          </h1>
          <p class="text-xs text-slate-400">Real-time MTProto microservice streaming & diagnostic console</p>
        </div>
      </div>
      <nav class="flex items-center gap-2 flex-wrap">
        <a href="/tg" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800 transition flex items-center gap-1">
          🏠 Dashboard
        </a>
        <a href="/tg/streams" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800 transition flex items-center gap-1">
          💾 Streams
        </a>
        <a href="/tg/settings" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800 transition flex items-center gap-1">
          ⚙️ Settings
        </a>
        <a href="/tg/logs" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-sky-400 bg-sky-500/10 border border-sky-500/30 flex items-center gap-1">
          📜 Logs
        </a>
        <a href="/tg/auth" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800 transition flex items-center gap-1">
          🔑 Auth
        </a>
        <a href="/msm/api/logs/download" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition flex items-center gap-1.5 ml-1">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
          Download .log
        </a>
      </nav>
    </header>

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
          <input id="searchInput" type="text" placeholder="Search logs (e.g. 1080p, docId, buffer)..." 
            class="w-full bg-slate-900 border border-slate-800 focus:border-sky-400 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-500 outline-none font-mono transition" />
        </div>
        <label class="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer select-none">
          <input id="autoScroll" type="checkbox" checked class="rounded bg-slate-900 border-slate-700 text-sky-500 focus:ring-0" />
          <span>Auto-scroll</span>
        </label>
        <button onclick="clearServerLog()" class="px-2.5 py-1 text-xs font-semibold text-rose-300 hover:text-white bg-rose-500/10 hover:bg-rose-500/20 rounded-lg border border-rose-500/30 transition flex items-center gap-1.5" title="Physically truncate and clear log file on router">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
          Clear Log
        </button>
      </div>
    </div>

    <!-- Terminal Window (Full Height) -->
    <div class="relative flex-1 bg-slate-950 border border-slate-800/80 rounded-2xl overflow-hidden shadow-2xl glow-box flex flex-col min-h-[650px]">
      <div class="bg-slate-900/90 border-b border-slate-800/80 px-4 py-2 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <div class="flex gap-1.5">
            <span class="w-3 h-3 rounded-full bg-rose-500/70 inline-block"></span>
            <span class="w-3 h-3 rounded-full bg-amber-500/70 inline-block"></span>
            <span class="w-3 h-3 rounded-full bg-emerald-500/70 inline-block"></span>
          </div>
          <span class="text-[11px] font-mono text-slate-400 ml-2">/tmp/tg-streamer.log</span>
        </div>
        <div class="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
          <span id="lineCount">0 lines</span>
          <span id="streamStatusBadge" class="inline-flex items-center gap-1 text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span> Live Stream
          </span>
        </div>
      </div>

      <!-- Output Body -->
      <div id="terminalBody" class="p-4 overflow-y-auto flex-1 font-mono text-[11px] leading-relaxed space-y-0.5 select-text whitespace-pre-wrap break-all">
        <div class="text-slate-500 italic">Connecting to live log stream...</div>
      </div>
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
      let colorClass = 'text-slate-300';
      if (line.includes('[ERROR]') || line.includes('[FATAL]') || line.includes('Error:')) {
        colorClass = 'text-rose-400 font-semibold';
      } else if (line.includes('[WARN]')) {
        colorClass = 'text-amber-400';
      } else if (line.includes('[STREAM') || line.includes('[PIPELINE')) {
        colorClass = 'text-sky-300 font-medium';
      } else if (line.includes('[SUPERVISOR')) {
        colorClass = 'text-emerald-400 font-medium';
      } else if (line.includes('[TG]') || line.includes('[AUTH')) {
        colorClass = 'text-purple-300';
      } else if (line.includes('[MEMORY PURGE]') || line.includes('[MEMORY WATCHDOG]') || line.includes('[SYSTEM]')) {
        colorClass = 'text-cyan-400 font-medium';
      }
      return '<div class="m-0 p-0 ' + colorClass + '">' + escaped + '</div>';
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

    async function clearServerLog() {
      if (!confirm('Are you sure you want to physically clear and truncate the log file on the router?')) return;
      try {
        const res = await fetch('/msm/api/logs/clear', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          rawLines = [];
          renderLines();
        } else {
          alert('Failed to clear log: ' + (data.error || 'Unknown error'));
        }
      } catch (err) {
        alert('Network error while clearing log: ' + err.message);
      }
    }

    searchInput.addEventListener('input', renderLines);

    // Initial log fetch
    async function fetchInitialLogs() {
      try {
        const res = await fetch('/msm/api/logs?lines=300');
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
      const es = new EventSource('/msm/api/logs/stream');
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

    // Backward compatibility: redirect anchor /tg/logs#cachePanel to dedicated streams page
    if (window.location.hash === '#cachePanel') {
      window.location.replace('/tg/streams');
    }

    fetchInitialLogs();
    connectSSE();

    window.addEventListener('scroll', () => {
      const btn = document.getElementById('backToTopBtn');
      if (!btn) return;
      if (window.scrollY > 250) {
        btn.classList.remove('opacity-0', 'translate-y-4', 'pointer-events-none');
        btn.classList.add('opacity-100', 'translate-y-0', 'pointer-events-auto');
      } else {
        btn.classList.add('opacity-0', 'translate-y-4', 'pointer-events-none');
        btn.classList.remove('opacity-100', 'translate-y-0', 'pointer-events-auto');
      }
    }, { passive: true });
  </script>
  <!-- Floating Back to Top Button -->
  <button id="backToTopBtn" onclick="window.scrollTo({top: 0, behavior: 'smooth'})" title="Scroll to top" aria-label="Scroll to top" class="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 p-2.5 sm:p-3 rounded-full bg-slate-800/90 hover:bg-sky-500 text-slate-300 hover:text-slate-950 border border-slate-700/80 hover:border-sky-400 shadow-xl backdrop-blur transition-all duration-300 opacity-0 translate-y-4 pointer-events-none focus:outline-none glow-box cursor-pointer">
    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 10l7-7m0 0l7 7m-7-7v18"></path>
    </svg>
  </button>
</body>
</html>`);
});

// ==========================================
// 2. STREAM RESOLUTION & PLAYBACK ENDPOINTS
// ==========================================

// Health check endpoint (moved /health/ to /msm/health/)
app.get(['/health', '/health/', '/msm/health', '/msm/health/'], (req, res) => res.redirect(301, '/tg/health/'));
app.get(['/tg/health', '/tg/health/', '/msm/health', '/msm/health/', '/api/health', '/api/health/', '/tg/api/health', '/tg/api/health/', '/msm/api/health', '/msm/api/health/'], (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    isConnected,
    cachedStreams: db.size(),
    targetBotUsername: BOT_USERNAME,
    activeResolver: savedSettings.activeResolver || 'msm',
    availableResolvers: listResolvers(),
    targetBotUsernames: savedSettings.targetBotUsernames || { msm: BOT_USERNAME, pencuri: 'Pencuri_Movie_Bot' },
    authError: authError || null,
  });
});

// Settings API endpoints

// Resolvers endpoint
app.get(['/api/resolvers', '/tg/api/resolvers', '/msm/api/resolvers'], (req, res) => {
  res.json({
    success: true,
    activeResolver: savedSettings.activeResolver || 'msm',
    targetBotUsernames: savedSettings.targetBotUsernames || { msm: BOT_USERNAME, pencuri: 'Pencuri_Movie_Bot' },
    resolvers: listResolvers(),
  });
});

app.get(['/api/settings', '/tg/api/settings', '/msm/api/settings'], (req, res) => {
  res.json({
    success: true,
    activeResolver: savedSettings.activeResolver || 'msm',
    targetBotUsername: BOT_USERNAME,
    targetBotUsernames: savedSettings.targetBotUsernames || { msm: BOT_USERNAME, pencuri: 'Pencuri_Movie_Bot' },
    isConnected,
    uptime: process.uptime(),
    cachedStreams: db.size(),
    pipelineBuffers: savedSettings.pipelineBuffers || DEFAULT_PIPELINE_BUFFERS,
    overlapPrefetch: savedSettings.overlapPrefetch !== false,
    routerRamCacheMb: savedSettings.routerRamCacheMb || 16,
    videoTranscodeMode: savedSettings.videoTranscodeMode || 'disabled',
    minTvSizeMb: savedSettings.minTvSizeMb ?? 80,
    minMovieSizeMb: savedSettings.minMovieSizeMb ?? 180,
    resolverMaxPages: savedSettings.resolverMaxPages ?? 3,
    geoBlockEnabled: savedSettings.geoBlockEnabled !== false,
    geoBlockAllowedCountries: savedSettings.geoBlockAllowedCountries || ['MY'],
    geoBlockWhitelistedIps: savedSettings.geoBlockWhitelistedIps || [],
    blockCacheEntries: globalBlockCache.size,
    blockCacheMaxEntries: getBlockCacheMaxEntries(),
    port,
    internalPort: INTERNAL_HTTP_PORT,
  });
});

app.post(['/api/settings', '/tg/api/settings', '/msm/api/settings'], (req, res) => {
  try {
    const {
      targetBotUsername,
      activeResolver,
      targetBotUsernames,
      pipelineBuffers,
      overlapPrefetch,
      routerRamCacheMb,
      videoTranscodeMode,
      minTvSizeMb,
      minMovieSizeMb,
      resolverMaxPages,
      geoBlockEnabled,
      geoBlockWhitelistedIps,
    } = req.body || {};
    let changed = false;

    if (activeResolver && typeof activeResolver === 'string') {
      const normResolver = activeResolver.trim().toLowerCase();
      if (['msm', 'pencuri'].includes(normResolver)) {
        savedSettings.activeResolver = normResolver;
        changed = true;
        console.log(`[SETTINGS] Active Resolver updated to: ${normResolver}`);
      }
    }

    if (targetBotUsernames && typeof targetBotUsernames === 'object') {
      savedSettings.targetBotUsernames = savedSettings.targetBotUsernames || { msm: BOT_USERNAME, pencuri: 'Pencuri_Movie_Bot' };
      if (targetBotUsernames.msm) savedSettings.targetBotUsernames.msm = targetBotUsernames.msm.trim().replace(/^@/, '');
      if (targetBotUsernames.pencuri) savedSettings.targetBotUsernames.pencuri = targetBotUsernames.pencuri.trim().replace(/^@/, '');
      changed = true;
      console.log(`[SETTINGS] Resolver Bot Usernames updated to:`, JSON.stringify(savedSettings.targetBotUsernames));
    }

    if (targetBotUsername && typeof targetBotUsername === 'string') {
      const sanitized = targetBotUsername.trim().replace(/^@/, '');
      if (sanitized.length > 0) {
        BOT_USERNAME = sanitized;
        savedSettings.targetBotUsername = sanitized;
        changed = true;
        console.log(`[SETTINGS] Target Telegram Bot updated to: @${BOT_USERNAME}`);
      }
    }

    if (pipelineBuffers && typeof pipelineBuffers === 'object') {
      savedSettings.pipelineBuffers = savedSettings.pipelineBuffers || { ...DEFAULT_PIPELINE_BUFFERS };
      for (const tier of ['sd', '720p', '1080p', '4k']) {
        if (pipelineBuffers[tier] !== undefined) {
          const val = parseInt(pipelineBuffers[tier], 10);
          if (!isNaN(val) && val >= 1 && val <= 16) {
            savedSettings.pipelineBuffers[tier] = val;
            changed = true;
          }
        }
      }
      console.log(`[SETTINGS] Stream Pipeline Buffers updated:`, JSON.stringify(savedSettings.pipelineBuffers));
    }

    if (overlapPrefetch !== undefined) {
      savedSettings.overlapPrefetch = Boolean(overlapPrefetch);
      changed = true;
      console.log(`[SETTINGS] Overlap Prefetch updated to:`, savedSettings.overlapPrefetch);
    }

    if (routerRamCacheMb !== undefined) {
      const mb = parseInt(routerRamCacheMb, 10);
      if ([8, 16, 32, 64].includes(mb)) {
        savedSettings.routerRamCacheMb = mb;
        changed = true;
        pruneGlobalBlockCache();
        console.log(`[SETTINGS] Router RAM Block Cache updated to: ${mb} MB (${mb * 2} blocks)`);
      }
    }

    if (videoTranscodeMode !== undefined && typeof videoTranscodeMode === 'string') {
      const mode = videoTranscodeMode.trim().toLowerCase();
      if (['disabled', 'desktop_hevc', 'always'].includes(mode)) {
        savedSettings.videoTranscodeMode = mode;
        changed = true;
        console.log(`[SETTINGS] Video Transcode Mode updated to: ${mode}`);
      }
    }

    if (minTvSizeMb !== undefined) {
      const tvMb = parseInt(minTvSizeMb, 10);
      if (!isNaN(tvMb) && tvMb >= 10 && tvMb <= 500) {
        savedSettings.minTvSizeMb = tvMb;
        changed = true;
        console.log(`[SETTINGS] Minimum TV episode size updated to: ${tvMb} MB`);
      }
    }

    if (minMovieSizeMb !== undefined) {
      const movieMb = parseInt(minMovieSizeMb, 10);
      if (!isNaN(movieMb) && movieMb >= 50 && movieMb <= 2000) {
        savedSettings.minMovieSizeMb = movieMb;
        changed = true;
        console.log(`[SETTINGS] Minimum Movie size updated to: ${movieMb} MB`);
      }
    }

    if (resolverMaxPages !== undefined) {
      const maxP = parseInt(resolverMaxPages, 10);
      if (!isNaN(maxP) && maxP >= 1 && maxP <= 20) {
        savedSettings.resolverMaxPages = maxP;
        changed = true;
        console.log(`[SETTINGS] Resolver max paging updated to: ${maxP}`);
      }
    }

    if (geoBlockEnabled !== undefined) {
      savedSettings.geoBlockEnabled = Boolean(geoBlockEnabled);
      changed = true;
      console.log(`[SETTINGS] Geo-Blocking Enabled updated to:`, savedSettings.geoBlockEnabled);
    }

    if (geoBlockWhitelistedIps !== undefined) {
      let ips = [];
      if (Array.isArray(geoBlockWhitelistedIps)) {
        ips = geoBlockWhitelistedIps.map(s => String(s).trim()).filter(Boolean);
      } else if (typeof geoBlockWhitelistedIps === 'string') {
        ips = geoBlockWhitelistedIps.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
      }
      savedSettings.geoBlockWhitelistedIps = ips;
      changed = true;
      console.log(`[SETTINGS] Geo-Blocking Whitelisted IPs updated to:`, JSON.stringify(ips));
    }

    if (changed) {
      const dataDir = path.join(__dirname, 'data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(savedSettings, null, 2), 'utf-8');
    }

    return res.json({
      success: true,
      targetBotUsername: BOT_USERNAME,
      pipelineBuffers: savedSettings.pipelineBuffers || DEFAULT_PIPELINE_BUFFERS,
      overlapPrefetch: savedSettings.overlapPrefetch !== false,
      routerRamCacheMb: savedSettings.routerRamCacheMb || 16,
      videoTranscodeMode: savedSettings.videoTranscodeMode || 'disabled',
      minTvSizeMb: savedSettings.minTvSizeMb ?? 80,
      minMovieSizeMb: savedSettings.minMovieSizeMb ?? 180,
      resolverMaxPages: savedSettings.resolverMaxPages ?? 3,
      geoBlockEnabled: savedSettings.geoBlockEnabled !== false,
      geoBlockAllowedCountries: savedSettings.geoBlockAllowedCountries || ['MY'],
      geoBlockWhitelistedIps: savedSettings.geoBlockWhitelistedIps || [],
      blockCacheEntries: globalBlockCache.size,
      blockCacheMaxEntries: getBlockCacheMaxEntries(),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// System Service Restart Endpoint (Exits process; router supervisor auto-respawns in ~3s)
app.post(['/api/system/restart', '/tg/api/system/restart', '/msm/api/system/restart'], (req, res) => {
  console.log('[SYSTEM] Service restart requested via web settings.');
  res.json({ success: true, message: 'Restarting MSM Getter service...' });
  setTimeout(() => {
    process.exit(0);
  }, 1000);
});

// Redirect legacy root / and /dashboard to /msm
app.get(['/', '/dashboard'], (req, res) => res.redirect(301, '/tg'));

// Dedicated Web Dashboard (Served exclusively at /msm, /msm/dashboard)
app.get(['/tg', '/msm/dashboard'], (req, res) => {
  const isGeoEnabled = savedSettings.geoBlockEnabled !== false;
  const activeBot = getActiveTargetBot();
  const geoBadgeHtml = getGeoBadgeHtml(isGeoEnabled);
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
  <title>MSM Getter — Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background-color: #0B0F17; color: #E2E8F0; font-family: ui-sans-serif, system-ui, sans-serif; }
    .glow-box { box-shadow: 0 0 25px rgba(56, 189, 248, 0.08); }
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: #0B0F17; }
    ::-webkit-scrollbar-thumb { background: #1E293B; border-radius: 4px; }
  </style>
</head>
<body class="min-h-screen p-4 sm:p-8 flex flex-col items-center bg-[#0B0F17] text-[#E2E8F0]">
  <div class="max-w-6xl w-full space-y-6 pb-28 sm:pb-12">
    <!-- Top Navigation & Header -->
    <header class="flex flex-col sm:flex-row items-center justify-between bg-slate-900 border border-slate-800 rounded-2xl px-6 py-4 glow-box gap-4 w-full">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20 flex items-center justify-center font-bold text-lg">
          🎬
        </div>
        <div>
          <h1 class="text-lg font-bold text-white flex items-center gap-2">
            MSM Dashboard
            <span id="botBadge" class="text-xs px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30 font-mono">@${activeBot}</span>
            ${geoBadgeHtml}
          </h1>
          <p class="text-xs text-slate-400">Telegram MTProto Cloud Streaming Gateway</p>
        </div>
      </div>
      <nav class="flex items-center gap-2 flex-wrap">
        <a href="/tg" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-sky-400 bg-sky-500/10 border border-sky-500/30 flex items-center gap-1">
          🏠 Dashboard
        </a>
        <a href="/tg/streams" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800 transition flex items-center gap-1">
          💾 Streams
        </a>
        <a href="/tg/settings" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800 transition flex items-center gap-1">
          ⚙️ Settings
        </a>
        <a href="/tg/logs" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800 transition flex items-center gap-1">
          📜 Logs
        </a>
        <a href="/tg/auth" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800 transition flex items-center gap-1">
          🔑 Auth
        </a>
      </nav>
    </header>

    <!-- Live System Metrics Bar -->
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <div class="p-3.5 rounded-2xl bg-slate-900 border border-slate-800/80 glow-box">
        <span class="text-[10px] text-slate-400 font-semibold block uppercase tracking-wider">Status</span>
        <div class="flex items-center gap-2 mt-1">
          <span id="metricDot" class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
          <span id="metricStatus" class="text-xs font-bold text-emerald-400">Online</span>
        </div>
        <span class="text-[10px] text-slate-500 font-mono block mt-0.5">Telegram MTProto</span>
      </div>
      <div class="p-3.5 rounded-2xl bg-slate-900 border border-slate-800/80 glow-box">
        <span class="text-[10px] text-slate-400 font-semibold block uppercase tracking-wider">CPU Usage</span>
        <div class="flex items-baseline gap-1 mt-1 truncate">
          <span id="metricNodeCpu" class="text-xs font-bold font-mono text-emerald-400">--%</span>
          <span id="metricRouterCpuBadge" class="text-[11px] font-mono text-slate-400">[<span id="metricRouterCpu">--%</span> router]</span>
        </div>
        <span id="metricCpuDetail" class="text-[10px] text-slate-500 font-mono block mt-0.5">-- cores · load --</span>
      </div>
      <div class="p-3.5 rounded-2xl bg-slate-900 border border-slate-800/80 glow-box">
        <span class="text-[10px] text-slate-400 font-semibold block uppercase tracking-wider">Node RAM / Cap</span>
        <div class="flex items-baseline gap-1 mt-1 truncate">
          <span id="metricRam" class="text-xs font-bold font-mono text-sky-400">-- / 256 MB</span>
          <span id="metricRamPct" class="text-[10px] font-mono text-slate-400">(--%)</span>
        </div>
        <span id="metricHeapDetail" class="text-[10px] text-slate-500 font-mono block mt-0.5">Heap: -- MB</span>
      </div>
      <div class="p-3.5 rounded-2xl bg-slate-900 border border-slate-800/80 glow-box">
        <span class="text-[10px] text-slate-400 font-semibold block uppercase tracking-wider">Uptime</span>
        <span id="metricUptime" class="text-xs font-bold font-mono text-white mt-1 block">--</span>
        <span class="text-[10px] text-slate-500 font-mono block mt-0.5">microservice</span>
      </div>
      <div class="p-3.5 rounded-2xl bg-slate-900 border border-slate-800/80 glow-box col-span-2 sm:col-span-1">
        <span class="text-[10px] text-slate-400 font-semibold block uppercase tracking-wider">Log File Size</span>
        <span id="metricLogSize" class="text-xs font-bold font-mono text-slate-300 mt-1 block">-- KB</span>
        <span class="text-[10px] text-slate-500 font-mono block mt-0.5">RAM disk (cap 5 MB)</span>
      </div>
    </div>

    <!-- ⚡ Stream Buffering & Engine Performance Strip -->
    <div class="bg-slate-900 border border-slate-800 rounded-2xl p-5 glow-box space-y-3">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
        <div class="flex items-center gap-2">
          <span class="text-base">⚡</span>
          <h2 class="text-xs font-bold text-white uppercase tracking-wider">Stream Buffering & Engine Performance</h2>
        </div>
        <a href="/tg/settings" class="text-xs text-sky-400 hover:text-sky-300 font-semibold flex items-center gap-1 transition">
          ⚙️ Configure in Settings →
        </a>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2.5">
        <div class="bg-slate-950/70 border border-slate-800/80 rounded-xl p-2.5">
          <span class="text-[10px] text-slate-400 font-semibold block uppercase">SD Pipeline</span>
          <span id="stripBufSd" class="text-xs font-bold font-mono text-emerald-400 block mt-0.5">2 × 512KB</span>
          <span class="text-[10px] text-slate-500 font-mono block">1.0 MB in-flight</span>
        </div>
        <div class="bg-slate-950/70 border border-slate-800/80 rounded-xl p-2.5">
          <span class="text-[10px] text-slate-400 font-semibold block uppercase">720p Pipeline</span>
          <span id="stripBuf720" class="text-xs font-bold font-mono text-emerald-400 block mt-0.5">4 × 512KB</span>
          <span class="text-[10px] text-slate-500 font-mono block">2.0 MB in-flight</span>
        </div>
        <div class="bg-slate-950/70 border border-slate-800/80 rounded-xl p-2.5">
          <span class="text-[10px] text-slate-400 font-semibold block uppercase">1080p Pipeline</span>
          <span id="stripBuf1080" class="text-xs font-bold font-mono text-sky-400 block mt-0.5">6 × 512KB</span>
          <span class="text-[10px] text-slate-500 font-mono block">3.0 MB in-flight</span>
        </div>
        <div class="bg-slate-950/70 border border-slate-800/80 rounded-xl p-2.5">
          <span class="text-[10px] text-slate-400 font-semibold block uppercase">4K Pipeline</span>
          <span id="stripBuf4k" class="text-xs font-bold font-mono text-purple-400 block mt-0.5">8 × 512KB</span>
          <span class="text-[10px] text-slate-500 font-mono block">4.0 MB in-flight</span>
        </div>
        <div class="bg-slate-950/70 border border-slate-800/80 rounded-xl p-2.5">
          <span class="text-[10px] text-slate-400 font-semibold block uppercase">Overlap Prefetch</span>
          <span id="stripPrefetch" class="text-xs font-bold font-mono text-emerald-400 block mt-0.5">Active</span>
          <span class="text-[10px] text-slate-500 font-mono block">Fast seek & start</span>
        </div>
        <div class="bg-slate-950/70 border border-slate-800/80 rounded-xl p-2.5">
          <span class="text-[10px] text-slate-400 font-semibold block uppercase">Router RAM Cache</span>
          <span id="stripRamCache" class="text-xs font-bold font-mono text-white block mt-0.5">16 MB</span>
          <span id="stripRamBlocks" class="text-[10px] text-slate-500 font-mono block">32 blocks cap</span>
        </div>
        <div class="bg-slate-950/70 border border-slate-800/80 rounded-xl p-2.5">
          <span class="text-[10px] text-slate-400 font-semibold block uppercase">Video Transcode</span>
          <span id="stripVideoTranscode" class="text-xs font-bold font-mono text-emerald-400 block mt-0.5">Disabled</span>
          <span id="stripVideoTranscodeDesc" class="text-[10px] text-slate-500 font-mono block">0% Video CPU</span>
        </div>
      </div>
    </div>

    <!-- Active Stream Clients Panel -->
    <div id="activeStreamsPanel" class="p-5 rounded-2xl bg-slate-900 border border-slate-800 glow-box space-y-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
          <span class="text-xs font-bold text-white uppercase tracking-wider">Active Stream Clients</span>
        </div>
        <span id="activeClientsCount" class="text-xs font-mono font-semibold text-slate-400">0 connected</span>
      </div>
      <div id="activeClientsList" class="text-xs text-slate-400">
        <p class="text-slate-500 italic text-[11px] py-2">No active playback sessions.</p>
      </div>
    </div>

    <!-- Quick Navigation Hub -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <a href="/tg/streams" class="bg-slate-900 hover:bg-slate-800/90 border border-slate-800 rounded-2xl p-5 space-y-2 transition group block glow-box">
        <div class="w-9 h-9 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20 flex items-center justify-center text-lg">
          💾
        </div>
        <h3 class="text-sm font-bold text-white group-hover:text-sky-400 transition">Persistent Stream Cache</h3>
        <p class="text-xs text-slate-400">Explore, search, and manage cached video streams stored in central database streams.json.</p>
        <span class="text-xs text-sky-400 font-semibold inline-block pt-1">Open Streams →</span>
      </a>

      <a href="/tg/settings" class="bg-slate-900 hover:bg-slate-800/90 border border-slate-800 rounded-2xl p-5 space-y-2 transition group block glow-box">
        <div class="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center justify-center text-lg">
          ⚙️
        </div>
        <h3 class="text-sm font-bold text-white group-hover:text-sky-400 transition">Server Settings</h3>
        <p class="text-xs text-slate-400">Configure target bot handle (@msm34bot), adjust buffer pipelines, RAM cache, and reboot service.</p>
        <span class="text-xs text-sky-400 font-semibold inline-block pt-1">Open Settings →</span>
      </a>

      <a href="/tg/logs" class="bg-slate-900 hover:bg-slate-800/90 border border-slate-800 rounded-2xl p-5 space-y-2 transition group block glow-box">
        <div class="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center text-lg">
          📜
        </div>
        <h3 class="text-sm font-bold text-white group-hover:text-sky-400 transition">Live Console Logs</h3>
        <p class="text-xs text-slate-400">Inspect real-time resolution logs, client playback metrics, and diagnose stream requests.</p>
        <span class="text-xs text-sky-400 font-semibold inline-block pt-1">View Logs →</span>
      </a>

      <a href="/tg/auth" class="bg-slate-900 hover:bg-slate-800/90 border border-slate-800 rounded-2xl p-5 space-y-2 transition group block glow-box">
        <div class="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center text-lg">
          🔑
        </div>
        <h3 class="text-sm font-bold text-white group-hover:text-sky-400 transition">Telegram Auth Portal</h3>
        <p class="text-xs text-slate-400">Authenticate or update your Telegram phone number session string with 2FA OTP code.</p>
        <span class="text-xs text-sky-400 font-semibold inline-block pt-1">Open Auth Portal →</span>
      </a>
    </div>

    <!-- Live Query Diagnostic Sandbox -->
    <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 glow-box space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-bold text-white flex items-center gap-2">
          🔍 Live Bot Query Diagnostic Sandbox
        </h2>
        <span class="text-xs text-slate-400">Targeting @${activeBot}</span>
      </div>
      <p class="text-xs text-slate-400">Test live query extraction and view raw candidate buttons directly from the active Telegram bot.</p>
      <div class="flex flex-col sm:flex-row gap-2">
        <input id="diagInput" type="text" value="Kudrat 1968" placeholder="Title (e.g. Spider-Man, Carrie)..." class="flex-1 px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-sky-500/50" />
        <button id="diagBtn" onclick="runDiagnostic()" class="w-full sm:w-auto px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 shrink-0">
          Test Query
        </button>
      </div>
      <div id="diagResults" class="hidden space-y-2 max-h-56 overflow-y-auto text-xs bg-slate-950 p-3 rounded-xl border border-slate-800">
      </div>
    </div>
  </div>

  <script>
    function escapeHtml(str) {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    async function loadStats() {
      try {
        const res = await fetch('/msm/api/system/stats');
        const d = await res.json();

        // 1. Status
        if (d.isConnected) {
          document.getElementById('metricDot').className = 'w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse';
          document.getElementById('metricStatus').textContent = 'Online';
          document.getElementById('metricStatus').className = 'text-xs font-bold text-emerald-400';
        } else {
          document.getElementById('metricDot').className = 'w-2.5 h-2.5 rounded-full bg-rose-400';
          document.getElementById('metricStatus').textContent = 'Offline';
          document.getElementById('metricStatus').className = 'text-xs font-bold text-rose-400';
        }

        // Badges: Geo-Block & Active Bot
        if (d.geoBlockEnabled !== undefined) {
          const geoEl = document.getElementById('geoBadge');
          if (geoEl) {
            if (d.geoBlockEnabled) {
              geoEl.className = 'text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono hidden sm:inline-block';
              geoEl.textContent = '🛡️ MY Only';
            } else {
              geoEl.className = 'text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 font-mono hidden sm:inline-block';
              geoEl.textContent = '🛡️ Disabled';
            }
          }
        }
        if (d.targetBotUsername) {
          const botEl = document.getElementById('botBadge');
          if (botEl) botEl.textContent = '@' + d.targetBotUsername.replace(/^@/, '');
        }

        // 2. CPU
        const cpu = d.cpu || {};
        const nodeCpuEl = document.getElementById('metricNodeCpu');
        const routerCpuEl = document.getElementById('metricRouterCpu');
        const cpuDetailEl = document.getElementById('metricCpuDetail');
        if (nodeCpuEl && routerCpuEl) {
          const nodeCpu = cpu.nodeCpuPct !== undefined ? cpu.nodeCpuPct : 0;
          const routerCpu = cpu.routerCpuPct !== undefined ? cpu.routerCpuPct : 0;
          const ffmpegCpu = cpu.ffmpegCpuPct !== undefined ? cpu.ffmpegCpuPct : 0;
          const serviceCpu = cpu.serviceCpuPct !== undefined ? cpu.serviceCpuPct : nodeCpu;

          nodeCpuEl.textContent = (ffmpegCpu > 0 ? serviceCpu : nodeCpu) + '%';
          routerCpuEl.textContent = routerCpu + '%';
          if (serviceCpu > 50 || routerCpu > 70) nodeCpuEl.className = 'text-xs font-bold font-mono text-rose-400';
          else if (serviceCpu > 20 || routerCpu > 40) nodeCpuEl.className = 'text-xs font-bold font-mono text-amber-400';
          else nodeCpuEl.className = 'text-xs font-bold font-mono text-emerald-400';

          if (cpuDetailEl) {
            if (ffmpegCpu > 0) {
              cpuDetailEl.textContent = 'FFmpeg: ' + ffmpegCpu + '% · Node: ' + nodeCpu + '% · load ' + (cpu.loadAvg1m || 0);
            } else {
              cpuDetailEl.textContent = (cpu.cores || 4) + ' cores · load ' + (cpu.loadAvg1m || 0);
            }
          }
        }

        // 3. RAM
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

        // 4. Uptime
        const u = d.uptime || 0;
        document.getElementById('metricUptime').textContent = Math.floor(u / 3600) + 'h ' + Math.floor((u % 3600) / 60) + 'm ' + (u % 60) + 's';

        // 5. Log Size
        document.getElementById('metricLogSize').textContent = (d.logSizeKB || 0) + ' KB';

        // 6. Buffering Performance Strip
        if (d.pipelineBuffers) {
          const p = d.pipelineBuffers;
          if (p.sd) document.getElementById('stripBufSd').textContent = p.sd + ' × 512KB';
          if (p['720p']) document.getElementById('stripBuf720').textContent = p['720p'] + ' × 512KB';
          if (p['1080p']) document.getElementById('stripBuf1080').textContent = p['1080p'] + ' × 512KB';
          if (p['4k']) document.getElementById('stripBuf4k').textContent = p['4k'] + ' × 512KB';
        }
        if (d.overlapPrefetch !== undefined) {
          const el = document.getElementById('stripPrefetch');
          el.textContent = d.overlapPrefetch ? 'Active' : 'Disabled';
          el.className = d.overlapPrefetch ? 'text-xs font-bold font-mono text-emerald-400 block mt-0.5' : 'text-xs font-bold font-mono text-slate-400 block mt-0.5';
        }
        if (d.routerRamCacheMb !== undefined) {
          document.getElementById('stripRamCache').textContent = d.routerRamCacheMb + ' MB';
          document.getElementById('stripRamBlocks').textContent = (d.routerRamCacheMb * 2) + ' blocks cap';
        }
        if (d.videoTranscodeMode !== undefined) {
          const el = document.getElementById('stripVideoTranscode');
          const descEl = document.getElementById('stripVideoTranscodeDesc');
          if (el && descEl) {
            if (d.videoTranscodeMode === 'desktop_hevc') {
              el.textContent = 'PC Only';
              el.className = 'text-xs font-bold font-mono text-amber-400 block mt-0.5';
              descEl.textContent = 'HEVC->H264 (2 cores)';
            } else if (d.videoTranscodeMode === 'always') {
              el.textContent = 'Enabled';
              el.className = 'text-xs font-bold font-mono text-rose-400 block mt-0.5';
              descEl.textContent = 'All Devices';
            } else {
              el.textContent = 'Disabled';
              el.className = 'text-xs font-bold font-mono text-emerald-400 block mt-0.5';
              descEl.textContent = '0% Video CPU';
            }
          }
        }

        // 7. Active Clients Table
        const countEl = document.getElementById('activeClientsCount');
        const listEl = document.getElementById('activeClientsList');
        if (countEl && listEl) {
          const clients = d.activeClients || [];
          countEl.textContent = clients.length === 1 ? '1 client connected' : clients.length + ' clients connected';
          if (clients.length === 0) {
            listEl.innerHTML = '<p class="text-slate-500 italic text-[11px] py-2">No active playback sessions.</p>';
          } else {
            let rowsHtml = '';
            for (let i = 0; i < clients.length; i++) {
              const c = clients[i];
              const isStreaming = c.status === 'STREAMING';
              const statusBadge = isStreaming
                ? '<span class="inline-flex items-center gap-1 text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-bold text-[10px]"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Streaming</span>'
                : '<span class="inline-flex items-center gap-1 text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 font-medium text-[10px]">⏸ Idle (' + (c.idleSec || 0) + 's)</span>';

              const tierBadge = '<span class="text-sky-300 font-mono font-bold uppercase">' + escapeHtml(c.qualityTier || '720p') + '</span> · ' +
                (c.concurrency || 4) + '×512KB (' + (c.pipelineMB || '2.0') + ' MB)';

              rowsHtml += '<tr class="text-slate-300 hover:bg-slate-800/40 transition">' +
                '<td class="py-2 px-2.5 font-bold text-sky-400 font-sans flex items-center gap-1.5">📺 ' + escapeHtml(c.clientName || 'Client') + '</td>' +
                '<td class="py-2 px-2.5 text-slate-400 font-mono text-[11px]">' + escapeHtml(c.ip || '') + '</td>' +
                '<td class="py-2 px-2.5 text-slate-200 truncate max-w-xs font-sans text-xs" title="' + escapeHtml(c.filename || '') + '">' + escapeHtml(c.filename || '') + '</td>' +
                '<td class="py-2 px-2.5 text-slate-300 font-sans text-[11px]">' + tierBadge + '</td>' +
                '<td class="py-2 px-2.5 text-sky-300 font-sans text-[11px]">' + escapeHtml(c.mode || '') + '</td>' +
                '<td class="py-2 px-2.5 font-sans">' + statusBadge + '</td>' +
                '<td class="py-2 px-2.5 text-slate-400 text-right font-mono text-[11px]">' + (c.connectedSec || 0) + 's</td>' +
              '</tr>';
            }
            listEl.innerHTML = '<div class="overflow-x-auto"><table class="w-full text-left text-xs">' +
              '<thead><tr class="text-slate-500 border-b border-slate-800 pb-2 text-[11px]">' +
              '<th class="py-1.5 px-2.5 font-semibold">Client / Device</th>' +
              '<th class="py-1.5 px-2.5 font-semibold">IP Address</th>' +
              '<th class="py-1.5 px-2.5 font-semibold">Media Filename</th>' +
              '<th class="py-1.5 px-2.5 font-semibold">Quality & Buffer Pipeline</th>' +
              '<th class="py-1.5 px-2.5 font-semibold">Playback Mode</th>' +
              '<th class="py-1.5 px-2.5 font-semibold">Status</th>' +
              '<th class="py-1.5 px-2.5 font-semibold text-right">Connected</th>' +
              '</tr></thead><tbody class="divide-y divide-slate-800/60">' +
              rowsHtml + '</tbody></table></div>';
          }
        }
      } catch (err) {
        console.warn('Failed to load stats:', err);
      }
    }

    async function runDiagnostic() {
      const query = document.getElementById('diagInput').value.trim();
      if (!query) return;
      const btn = document.getElementById('diagBtn');
      const box = document.getElementById('diagResults');
      btn.disabled = true;
      btn.textContent = 'Querying...';
      box.classList.remove('hidden');
      box.innerHTML = '<span class="text-slate-400">Querying @' + '${activeBot}' + '...</span>';

      try {
        const res = await fetch('/msm/api/debug-search?q=' + encodeURIComponent(query));
        const data = await res.json();
        if (data.success && data.buttons) {
          box.innerHTML = '<div class="text-slate-300 font-semibold mb-2">Found ' + data.buttons.length + ' buttons for "' + query + '":</div>' +
            data.buttons.map(b => 
              '<div class="p-2.5 rounded-xl bg-slate-900 border border-slate-800">' +
                '<div class="text-white font-medium truncate">' + b.text + '</div>' +
                '<div class="text-[10px] text-slate-500 flex gap-2 mt-1">' +
                  '<span class="text-sky-400 font-mono">' + b.className + '</span>' +
                  (b.url ? '<span class="truncate max-w-sm text-slate-400">' + b.url + '</span>' : '') +
                '</div>' +
              '</div>'
            ).join('');
        } else {
          box.innerHTML = '<span class="text-rose-400">No buttons found or error: ' + (data.error || 'Empty') + '</span>';
        }
      } catch (e) {
        box.innerHTML = '<span class="text-rose-400">Query failed: ' + e.message + '</span>';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Test Query';
      }
    }

    loadStats();
    setInterval(loadStats, 3000);

    window.addEventListener('scroll', () => {
      const btn = document.getElementById('backToTopBtn');
      if (!btn) return;
      if (window.scrollY > 250) {
        btn.classList.remove('opacity-0', 'translate-y-4', 'pointer-events-none');
        btn.classList.add('opacity-100', 'translate-y-0', 'pointer-events-auto');
      } else {
        btn.classList.add('opacity-0', 'translate-y-4', 'pointer-events-none');
        btn.classList.remove('opacity-100', 'translate-y-0', 'pointer-events-auto');
      }
    }, { passive: true });
  </script>
  <!-- Floating Back to Top Button -->
  <button id="backToTopBtn" onclick="window.scrollTo({top: 0, behavior: 'smooth'})" title="Scroll to top" aria-label="Scroll to top" class="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 p-2.5 sm:p-3 rounded-full bg-slate-800/90 hover:bg-sky-500 text-slate-300 hover:text-slate-950 border border-slate-700/80 hover:border-sky-400 shadow-xl backdrop-blur transition-all duration-300 opacity-0 translate-y-4 pointer-events-none focus:outline-none glow-box cursor-pointer">
    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 10l7-7m0 0l7 7m-7-7v18"></path>
    </svg>
  </button>
</body>
</html>`);
});

// Redirect legacy /streams and /cache to /tg/streams
app.get(['/streams', '/cache'], (req, res) => res.redirect(301, '/tg/streams'));

// Dedicated Persistent Stream Cache Page (Served exclusively at /tg/streams, /msm/cache)
app.get(['/tg/streams', '/msm/cache'], (req, res) => {
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
  <title>MSM Getter — Persistent Stream Cache</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background-color: #0B0F17; color: #E2E8F0; font-family: ui-sans-serif, system-ui, sans-serif; }
    .glow-box { box-shadow: 0 0 25px rgba(56, 189, 248, 0.08); }
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: #0B0F17; }
    ::-webkit-scrollbar-thumb { background: #1E293B; border-radius: 4px; }
  </style>
</head>
<body class="min-h-screen p-4 sm:p-8 flex flex-col items-center bg-[#0B0F17] text-[#E2E8F0]">
  <div class="max-w-6xl w-full space-y-6 pb-28 sm:pb-12">
    <!-- Top Navigation & Header -->
    <header class="flex flex-col sm:flex-row items-center justify-between bg-slate-900 border border-slate-800 rounded-2xl px-6 py-4 glow-box gap-4 w-full">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20 flex items-center justify-center font-bold text-lg">
          💾
        </div>
        <div>
          <h1 class="text-lg font-bold text-white flex items-center gap-2">
            Persistent Stream Cache
            <span id="headerCountBadge" class="text-xs px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30 font-mono">-- items</span>
          </h1>
          <p class="text-xs text-slate-400">Central database explorer for cached Telegram video streams (streams.json)</p>
        </div>
      </div>
      <nav class="flex items-center gap-2 flex-wrap">
        <a href="/tg" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800 transition flex items-center gap-1">
          🏠 Dashboard
        </a>
        <a href="/tg/streams" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-sky-400 bg-sky-500/10 border border-sky-500/30 flex items-center gap-1">
          💾 Streams
        </a>
        <a href="/tg/settings" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800 transition flex items-center gap-1">
          ⚙️ Settings
        </a>
        <a href="/tg/logs" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800 transition flex items-center gap-1">
          📜 Logs
        </a>
        <a href="/tg/auth" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800 transition flex items-center gap-1">
          🔑 Auth
        </a>
      </nav>
    </header>

    <!-- Key Metrics Grid -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="bg-slate-900 border border-slate-800/80 rounded-2xl p-4 glow-box">
        <span class="text-xs text-slate-400 font-medium">Total Cached Videos</span>
        <div class="flex items-baseline gap-1 mt-1">
          <p id="statTotalCount" class="text-xl font-bold font-mono text-white">--</p>
          <span class="text-xs text-slate-400 font-mono">items</span>
        </div>
      </div>
      <div class="bg-slate-900 border border-slate-800/80 rounded-2xl p-4 glow-box">
        <span class="text-xs text-slate-400 font-medium">Total Storage Footprint</span>
        <div class="flex items-baseline gap-1 mt-1">
          <p id="statTotalSize" class="text-xl font-bold font-mono text-sky-400">--</p>
        </div>
      </div>
      <div class="bg-slate-900 border border-slate-800/80 rounded-2xl p-4 glow-box">
        <span class="text-xs text-slate-400 font-medium">Database File</span>
        <p class="text-sm font-bold font-mono text-white mt-1 truncate">data/streams.json</p>
        <span class="text-[10px] text-slate-500 font-mono block mt-0.5">Persistent disk storage</span>
      </div>
      <div class="bg-slate-900 border border-slate-800/80 rounded-2xl p-4 glow-box">
        <span class="text-xs text-slate-400 font-medium">Eviction Policy</span>
        <p class="text-sm font-bold font-mono text-emerald-400 mt-1">LRU Cap: 3,000</p>
        <span class="text-[10px] text-slate-500 font-mono block mt-0.5">Auto-prunes oldest items</span>
      </div>
    </div>

    <!-- Explorer Toolbar & Filters -->
    <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4 glow-box space-y-3">
      <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div class="relative flex-1">
          <span class="absolute left-3 top-2.5 text-slate-500 text-xs">🔍</span>
          <input id="streamSearch" type="text" placeholder="Search by title, query key, or document ID..." 
            class="w-full pl-8 pr-8 py-2 bg-slate-950 border border-slate-800 focus:border-sky-500/50 rounded-xl text-xs text-white placeholder:text-slate-500 outline-none font-mono transition" 
            oninput="handleSearchInput()" />
          <button id="clearSearchBtn" onclick="clearSearch()" class="hidden absolute right-3 top-2.5 text-slate-500 hover:text-slate-300 text-xs font-bold">✕</button>
        </div>

        <div class="flex items-center gap-2 flex-wrap">
          <select id="sortSelect" onchange="applyFilterAndSort()" class="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-xl px-3 py-2 outline-none focus:border-sky-500/50 cursor-pointer">
            <option value="newest">Sort: Newest First</option>
            <option value="oldest">Sort: Oldest First</option>
            <option value="sizeDesc">Sort: Largest Size</option>
            <option value="sizeAsc">Sort: Smallest Size</option>
            <option value="titleAsc">Sort: Title (A-Z)</option>
          </select>

          <button onclick="loadStreams()" class="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold rounded-xl transition flex items-center gap-1.5" title="Reload streams from server">
            <span>🔄</span> Refresh
          </button>

          <a href="/api/cache" target="_blank" class="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold rounded-xl transition flex items-center gap-1.5" title="Export raw JSON records">
            <span>📥</span> Export JSON
          </a>

          <button onclick="clearAllCache()" class="px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-semibold rounded-xl transition flex items-center gap-1.5" title="Clear all stream records">
            <span>🗑️</span> Clear All
          </button>
        </div>
      </div>

      <!-- Quick Quality Filter Pills -->
      <div class="flex items-center gap-1.5 flex-wrap pt-1">
        <button type="button" onclick="setQualityFilter('all')" id="qTab_all" class="quality-tab px-3 py-1.5 rounded-xl text-xs font-semibold bg-sky-500/20 text-sky-300 border border-sky-500/40 transition flex items-center gap-1">
          <span>🎬 All</span>
          <span id="count_all" class="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-sky-500/30 text-sky-200 font-mono">0</span>
        </button>
        <button type="button" onclick="setQualityFilter('4k')" id="qTab_4k" class="quality-tab px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-950 text-slate-400 hover:text-white border border-slate-800 transition flex items-center gap-1">
          <span>✨ 4K UHD</span>
          <span id="count_4k" class="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-400 font-mono">0</span>
        </button>
        <button type="button" onclick="setQualityFilter('1080p')" id="qTab_1080p" class="quality-tab px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-950 text-slate-400 hover:text-white border border-slate-800 transition flex items-center gap-1">
          <span>💎 1080p FHD</span>
          <span id="count_1080p" class="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-400 font-mono">0</span>
        </button>
        <button type="button" onclick="setQualityFilter('720p')" id="qTab_720p" class="quality-tab px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-950 text-slate-400 hover:text-white border border-slate-800 transition flex items-center gap-1">
          <span>📺 720p HD</span>
          <span id="count_720p" class="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-400 font-mono">0</span>
        </button>
        <button type="button" onclick="setQualityFilter('sd')" id="qTab_sd" class="quality-tab px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-950 text-slate-400 hover:text-white border border-slate-800 transition flex items-center gap-1">
          <span>📱 480p SD</span>
          <span id="count_sd" class="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-400 font-mono">0</span>
        </button>
      </div>

      <div class="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-slate-800/80">
        <span id="resultsCount">Showing 0 of 0 cached streams</span>
        <span class="text-[11px] text-slate-500 font-mono">Live Central DB Viewer</span>
      </div>
    </div>

    <!-- Feedback Toast -->
    <div id="toast" class="hidden fixed bottom-6 right-6 z-50 p-3.5 rounded-xl text-xs font-semibold shadow-2xl transition-all duration-200 bg-sky-500/90 text-white border border-sky-400"></div>

    <!-- Streams Card List -->
    <div id="streamListContainer" class="space-y-2.5">
      <div class="p-8 text-center bg-slate-900 border border-slate-800 rounded-2xl">
        <p class="text-slate-500 italic text-sm">Loading stream records...</p>
      </div>
    </div>
  </div>

  <script>
    let allStreams = [];
    let searchTimer = null;
    let currentQuality = 'all';

    // Parse initial quality parameter from URL if provided (e.g. /tg/streams?quality=1080p)
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const qParam = (urlParams.get('quality') || '').toLowerCase().trim();
      if (['4k', '1080p', '720p', 'sd', '480p'].includes(qParam)) {
        currentQuality = qParam === '480p' ? 'sd' : qParam;
      }
    } catch {}

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function showToast(msg, isError = false) {
      const toast = document.getElementById('toast');
      toast.textContent = msg;
      toast.className = 'fixed bottom-6 right-6 z-50 p-3.5 rounded-xl text-xs font-semibold shadow-2xl transition-all duration-200 ' + 
        (isError ? 'bg-rose-600 text-white border border-rose-500' : 'bg-sky-500 text-white border border-sky-400');
      toast.classList.remove('hidden');
      setTimeout(() => toast.classList.add('hidden'), 2500);
    }

    function handleSearchInput() {
      const searchEl = document.getElementById('streamSearch');
      const clearBtn = document.getElementById('clearSearchBtn');
      if (clearBtn) {
        clearBtn.classList.toggle('hidden', !searchEl.value);
      }
      clearTimeout(searchTimer);
      searchTimer = setTimeout(applyFilterAndSort, 150);
    }

    function clearSearch() {
      const searchEl = document.getElementById('streamSearch');
      searchEl.value = '';
      const clearBtn = document.getElementById('clearSearchBtn');
      if (clearBtn) clearBtn.classList.add('hidden');
      applyFilterAndSort();
    }

    function setQualityFilter(quality) {
      currentQuality = quality;
      updateQualityTabStyles();
      applyFilterAndSort();
    }

    function updateQualityTabStyles() {
      const tabs = ['all', '4k', '1080p', '720p', 'sd'];
      tabs.forEach(t => {
        const btn = document.getElementById('qTab_' + t);
        if (!btn) return;
        const countSpan = document.getElementById('count_' + t);
        if (t === currentQuality) {
          btn.className = 'quality-tab px-3 py-1.5 rounded-xl text-xs font-semibold bg-sky-500/20 text-sky-300 border border-sky-500/40 transition flex items-center gap-1';
          if (countSpan) countSpan.className = 'ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-sky-500/30 text-sky-200 font-mono';
        } else {
          btn.className = 'quality-tab px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-950 text-slate-400 hover:text-white border border-slate-800 transition flex items-center gap-1';
          if (countSpan) countSpan.className = 'ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-400 font-mono';
        }
      });
    }

    function updateQualityCounts() {
      let countAll = allStreams.length;
      let count4k = 0, count1080 = 0, count720 = 0, countSd = 0;
      allStreams.forEach(item => {
        const tier = item.qualityTier || '720p';
        if (tier === '4k') count4k++;
        else if (tier === '1080p') count1080++;
        else if (tier === 'sd') countSd++;
        else count720++;
      });
      const elAll = document.getElementById('count_all'); if (elAll) elAll.textContent = countAll;
      const el4k = document.getElementById('count_4k'); if (el4k) el4k.textContent = count4k;
      const el1080 = document.getElementById('count_1080p'); if (el1080) el1080.textContent = count1080;
      const el720 = document.getElementById('count_720p'); if (el720) el720.textContent = count720;
      const elSd = document.getElementById('count_sd'); if (elSd) elSd.textContent = countSd;
    }

    async function loadStreams() {
      try {
        const res = await fetch('/msm/api/cache');
        const data = await res.json();
        allStreams = data.items || [];

        const totalCount = allStreams.length;
        const totalBytes = data.totalSizeBytes || 0;
        let formattedSize = '0 MB';
        if (totalBytes >= 1024 * 1024 * 1024) {
          formattedSize = (totalBytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
        } else {
          formattedSize = (totalBytes / (1024 * 1024)).toFixed(1) + ' MB';
        }

        document.getElementById('headerCountBadge').textContent = totalCount + ' items';
        document.getElementById('statTotalCount').textContent = totalCount;
        document.getElementById('statTotalSize').textContent = formattedSize;

        updateQualityTabStyles();
        updateQualityCounts();

        applyFilterAndSort();
      } catch (err) {
        console.error('Failed to load streams:', err);
        showToast('Failed to load stream cache: ' + err.message, true);
      }
    }

    function applyFilterAndSort() {
      const searchEl = document.getElementById('streamSearch');
      const sortEl = document.getElementById('sortSelect');
      const q = (searchEl ? searchEl.value : '').trim().toLowerCase();
      const sortMode = sortEl ? sortEl.value : 'newest';

      let filtered = allStreams.filter(item => {
        // Quality Filter
        if (currentQuality !== 'all') {
          const itemTier = item.qualityTier || '720p';
          if (itemTier !== currentQuality) return false;
        }

        if (!q) return true;
        const fn = (item.filename || '').toLowerCase();
        const key = (item.queryKey || '').toLowerCase();
        const doc = String(item.docId || '').toLowerCase();
        return fn.includes(q) || key.includes(q) || doc.includes(q);
      });

      filtered.sort((a, b) => {
        if (sortMode === 'newest') return (b.createdAt || 0) - (a.createdAt || 0);
        if (sortMode === 'oldest') return (a.createdAt || 0) - (b.createdAt || 0);
        if (sortMode === 'sizeDesc') return (b.size || 0) - (a.size || 0);
        if (sortMode === 'sizeAsc') return (a.size || 0) - (b.size || 0);
        if (sortMode === 'titleAsc') return (a.filename || a.queryKey || '').localeCompare(b.filename || b.queryKey || '');
        return 0;
      });

      renderList(filtered);
    }

    function renderList(items) {
      const container = document.getElementById('streamListContainer');
      const countEl = document.getElementById('resultsCount');
      if (countEl) {
        const qualitySuffix = currentQuality !== 'all' ? ' (' + currentQuality.toUpperCase() + ')' : '';
        countEl.textContent = 'Showing ' + items.length + ' of ' + allStreams.length + ' cached streams' + qualitySuffix;
      }

      if (items.length === 0) {
        container.innerHTML = '<div class="p-12 text-center bg-slate-900 border border-slate-800 rounded-2xl space-y-2">' +
          '<div class="text-3xl">📭</div>' +
          '<p class="text-sm font-semibold text-slate-300">No stream records found</p>' +
          '<p class="text-xs text-slate-500">Try adjusting your search query, selecting another quality filter, or resolve a title from TMDB Stream.</p>' +
          '</div>';
        return;
      }

      container.innerHTML = items.map(item => {
        const title = item.filename || item.queryKey || 'Untitled Stream';
        const dateStr = item.createdAt ? new Date(item.createdAt).toLocaleString() : '--';
        const tier = item.qualityTier || '720p';

        let qualityBadge = '<span class="px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-bold">720p HD</span>';
        if (tier === '4k') {
          qualityBadge = '<span class="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold">4K UHD</span>';
        } else if (tier === '1080p') {
          qualityBadge = '<span class="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-bold">1080p FHD</span>';
        } else if (tier === 'sd') {
          qualityBadge = '<span class="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 font-bold">480p SD</span>';
        }

        return '<div class="bg-slate-900 hover:bg-slate-900/90 border border-slate-800/90 hover:border-slate-700/80 rounded-2xl p-4 transition glow-box flex flex-col md:flex-row md:items-center justify-between gap-3.5">' +
          '<div class="min-w-0 flex-1 space-y-1.5">' +
            '<div class="flex items-center gap-2">' +
              '<span class="text-base shrink-0">🎬</span>' +
              '<h3 class="text-sm font-bold text-white truncate" title="' + escapeHtml(title) + '">' + escapeHtml(title) + '</h3>' +
            '</div>' +
            '<div class="flex items-center gap-2 flex-wrap text-[11px] font-mono">' +
              qualityBadge +
              '<span class="px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-bold">' + escapeHtml(item.sizeFormatted) + '</span>' +
              '<span class="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700/70">Key: ' + escapeHtml(item.queryKey || '--') + '</span>' +
              (item.requestedQuality ? '<span class="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">Req: ' + escapeHtml(item.requestedQuality) + '</span>' : '') +
              '<span class="px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700/70">DC ' + escapeHtml(item.dcId || 4) + '</span>' +
              (item.videoCodec ? '<span class="px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 uppercase">' + escapeHtml(item.videoCodec) + '</span>' : '') +
              '<span class="text-slate-500 text-[10px]">' + escapeHtml(dateStr) + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="flex items-center gap-2 shrink-0 self-end md:self-center">' +
            '<button onclick="copyDocId(\\'' + escapeHtml(item.docId || '') + '\\', this)" class="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-mono font-medium transition flex items-center gap-1.5" title="Copy Telegram Document ID">' +
              '<span>📋</span> <span class="doc-label">Doc: ' + escapeHtml(item.docId || '--') + '</span>' +
            '</button>' +
            '<button onclick="evictItem(\\'' + encodeURIComponent(item.queryKey || '') + '\\', \\'' + encodeURIComponent(item.docId || '') + '\\', \\'' + escapeHtml(title).replace(/'/g, "\\\\'") + '\\')" class="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs font-semibold transition flex items-center gap-1">' +
              '<span>🗑️</span> Evict' +
            '</button>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    async function copyDocId(docId, btn) {
      if (!docId) return;
      try {
        await navigator.clipboard.writeText(docId);
        showToast('Copied Doc ID: ' + docId);
        const label = btn.querySelector('.doc-label');
        if (label) {
          const old = label.textContent;
          label.textContent = '✓ Copied!';
          setTimeout(() => { label.textContent = old; }, 1500);
        }
      } catch (err) {
        showToast('Doc ID: ' + docId);
      }
    }

    async function evictItem(keyEnc, docIdEnc, title) {
      const key = decodeURIComponent(keyEnc || '');
      const docId = decodeURIComponent(docIdEnc || '');
      if (!confirm('Evict from persistent cache?\\n\\n' + (title || key))) return;
      try {
        const res = await fetch('/msm/api/cache?key=' + encodeURIComponent(key) + '&docId=' + encodeURIComponent(docId), { method: 'DELETE' });
        const d = await res.json();
        if (d.success) {
          showToast('Evicted: ' + (title || key));
          loadStreams();
        } else {
          showToast('Evict failed', true);
        }
      } catch (err) {
        showToast('Evict failed: ' + err.message, true);
      }
    }

    async function clearAllCache() {
      if (!confirm('DANGER: Clear ALL cached stream records from central database?\\n\\nThis will remove all ' + allStreams.length + ' video records.')) return;
      try {
        const res = await fetch('/msm/api/cache/clear', { method: 'POST' });
        const d = await res.json();
        showToast(d.message || 'Cache cleared');
        loadStreams();
      } catch (err) {
        showToast('Clear failed: ' + err.message, true);
      }
    }

    loadStreams();

    window.addEventListener('scroll', () => {
      const btn = document.getElementById('backToTopBtn');
      if (!btn) return;
      if (window.scrollY > 250) {
        btn.classList.remove('opacity-0', 'translate-y-4', 'pointer-events-none');
        btn.classList.add('opacity-100', 'translate-y-0', 'pointer-events-auto');
      } else {
        btn.classList.add('opacity-0', 'translate-y-4', 'pointer-events-none');
        btn.classList.remove('opacity-100', 'translate-y-0', 'pointer-events-auto');
      }
    }, { passive: true });
  </script>
  <!-- Floating Back to Top Button -->
  <button id="backToTopBtn" onclick="window.scrollTo({top: 0, behavior: 'smooth'})" title="Scroll to top" aria-label="Scroll to top" class="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 p-2.5 sm:p-3 rounded-full bg-slate-800/90 hover:bg-sky-500 text-slate-300 hover:text-slate-950 border border-slate-700/80 hover:border-sky-400 shadow-xl backdrop-blur transition-all duration-300 opacity-0 translate-y-4 pointer-events-none focus:outline-none glow-box cursor-pointer">
    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 10l7-7m0 0l7 7m-7-7v18"></path>
    </svg>
  </button>
</body>
</html>`);
});

// Redirect legacy /setting and /settings to /tg/settings
app.get(['/setting', '/settings', '/msm/settings', '/tg/setting'], (req, res) => res.redirect(301, '/tg/settings'));

// Dedicated Web Settings Page (Served exclusively at /msm/setting, /tg/settings)
app.get(['/msm/setting', '/tg/settings'], (req, res) => {
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
  <title>MSM Getter — Settings</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background-color: #0B0F17; color: #E2E8F0; font-family: ui-sans-serif, system-ui, sans-serif; }
    .glow-box { box-shadow: 0 0 25px rgba(56, 189, 248, 0.08); }
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: #0B0F17; }
    ::-webkit-scrollbar-thumb { background: #1E293B; border-radius: 4px; }
  </style>
</head>
<body class="min-h-screen p-4 sm:p-8 flex flex-col items-center bg-[#0B0F17] text-[#E2E8F0]">
  <div class="max-w-6xl w-full space-y-6 pb-28 sm:pb-12">
    <!-- Top Navigation & Header -->
    <header class="flex flex-col sm:flex-row items-center justify-between bg-slate-900 border border-slate-800 rounded-2xl px-6 py-4 glow-box gap-4 w-full">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center justify-center font-bold text-lg">
          ⚙️
        </div>
        <div>
          <h1 class="text-lg font-bold text-white flex items-center gap-2">
            MSM Settings
            <span class="text-xs px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30 font-mono">@${getActiveTargetBot()}</span>
          </h1>
          <p class="text-xs text-slate-400">Configure bot handle, buffer pipelines, RAM block cache, and system services</p>
        </div>
      </div>
      <nav class="flex items-center gap-2 flex-wrap">
        <a href="/tg" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800 transition flex items-center gap-1">
          🏠 Dashboard
        </a>
        <a href="/tg/streams" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800 transition flex items-center gap-1">
          💾 Streams
        </a>
        <a href="/tg/settings" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-sky-400 bg-sky-500/10 border border-sky-500/30 flex items-center gap-1">
          ⚙️ Settings
        </a>
        <a href="/tg/logs" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800 transition flex items-center gap-1">
          📜 Logs
        </a>
        <a href="/tg/auth" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800 transition flex items-center gap-1">
          🔑 Auth
        </a>
      </nav>
    </header>

    <!-- Main Settings Form Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      
      <!-- Card 1: Stream Resolver & Bot Configuration -->
      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 glow-box space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold text-white flex items-center gap-2">
            🤖 Stream Resolver & Target Bot
          </h2>
          <span id="botStatusPill" class="text-xs px-2.5 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30 font-mono">
            ${savedSettings.activeResolver === 'pencuri' ? 'Pencuri: @' + (savedSettings.targetBotUsernames?.pencuri || 'Pencuri_Movie_Bot') : 'MSM: @' + (savedSettings.targetBotUsernames?.msm || BOT_USERNAME)}
          </span>
        </div>
        <p class="text-xs text-slate-400">Choose the active stream resolving engine and configure target Telegram bot handles.</p>

        <div class="space-y-3">
          <div>
            <label class="text-xs text-slate-300 font-medium block mb-1">Active Resolver Engine</label>
            <select id="resolverSelect" onchange="onResolverChange()" class="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-sky-500/50">
              <option value="msm" ${savedSettings.activeResolver === 'msm' || !savedSettings.activeResolver ? 'selected' : ''}>MSM Bot (Inline Callbacks & Ad-Gate)</option>
              <option value="pencuri" ${savedSettings.activeResolver === 'pencuri' ? 'selected' : ''}>Pencuri Movie Bot (Search API & Mini App)</option>
            </select>
          </div>

          <div>
            <label class="text-xs text-slate-300 font-medium block mb-1">Bot Username Handle</label>
            <div class="flex gap-2">
              <div class="relative flex-1">
                <span class="absolute left-3 top-2 text-slate-500 text-sm">@</span>
                <input id="botInput" type="text" value="${savedSettings.activeResolver === 'pencuri' ? (savedSettings.targetBotUsernames?.pencuri || 'Pencuri_Movie_Bot') : (savedSettings.targetBotUsernames?.msm || BOT_USERNAME)}" placeholder="bot_username" class="w-full pl-7 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-sky-500/50" />
              </div>
              <button id="saveBotBtn" onclick="saveBot()" class="px-4 py-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs rounded-xl transition">
                Save
              </button>
            </div>
          </div>
          <p id="saveMsg" class="text-xs text-emerald-400 hidden">✓ Resolver and bot settings saved and applied live!</p>
        </div>

        <div class="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
          <span>Quick presets:</span>
          <div id="quickPresets" class="flex gap-2 font-mono">
            <!-- Dynamic presets populated by JS -->
          </div>
        </div>
      </div>

      <!-- Card 2: Stream Buffer Pipelines (Per-Quality Concurrency) -->
      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 glow-box space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold text-white flex items-center gap-2">
            ⚡ Stream Buffer Pipelines
          </h2>
          <span class="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">Dynamic Prefetch</span>
        </div>
        <p class="text-xs text-slate-400">Configure parallel MTProto stream download pipelines (x 512 KB) per video quality tier. Applied dynamically to all mobile, TV, and web streams.</p>

        <div class="space-y-3 pt-1">
          <!-- SD <=480p -->
          <div class="flex items-center justify-between gap-3 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
            <div>
              <div class="text-xs font-semibold text-white">SD (≤ 480p / 360p)</div>
              <div id="sdBufCalc" class="text-[11px] text-slate-400 font-mono">2 × 512 KB = 1.0 MB in-flight</div>
            </div>
            <div class="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-lg p-1">
              <button type="button" onclick="adjustPipelineBuf('sd', -1)" class="w-6 h-6 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs transition select-none">-</button>
              <input id="sdBufInput" type="number" step="1" min="1" max="16" value="2" oninput="updatePipelineLabels()" class="w-10 bg-transparent text-center text-xs font-mono font-semibold text-white focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
              <button type="button" onclick="adjustPipelineBuf('sd', 1)" class="w-6 h-6 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs transition select-none">+</button>
            </div>
          </div>

          <!-- HD 720p -->
          <div class="flex items-center justify-between gap-3 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
            <div>
              <div class="text-xs font-semibold text-white">HD 720p</div>
              <div id="720pBufCalc" class="text-[11px] text-slate-400 font-mono">4 × 512 KB = 2.0 MB in-flight</div>
            </div>
            <div class="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-lg p-1">
              <button type="button" onclick="adjustPipelineBuf('720p', -1)" class="w-6 h-6 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs transition select-none">-</button>
              <input id="720pBufInput" type="number" step="1" min="1" max="16" value="4" oninput="updatePipelineLabels()" class="w-10 bg-transparent text-center text-xs font-mono font-semibold text-white focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
              <button type="button" onclick="adjustPipelineBuf('720p', 1)" class="w-6 h-6 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs transition select-none">+</button>
            </div>
          </div>

          <!-- FHD 1080p -->
          <div class="flex items-center justify-between gap-3 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
            <div>
              <div class="text-xs font-semibold text-white">Full HD 1080p</div>
              <div id="1080pBufCalc" class="text-[11px] text-slate-400 font-mono">6 × 512 KB = 3.0 MB in-flight</div>
            </div>
            <div class="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-lg p-1">
              <button type="button" onclick="adjustPipelineBuf('1080p', -1)" class="w-6 h-6 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs transition select-none">-</button>
              <input id="1080pBufInput" type="number" step="1" min="1" max="16" value="6" oninput="updatePipelineLabels()" class="w-10 bg-transparent text-center text-xs font-mono font-semibold text-white focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
              <button type="button" onclick="adjustPipelineBuf('1080p', 1)" class="w-6 h-6 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs transition select-none">+</button>
            </div>
          </div>

          <!-- 4K UHD -->
          <div class="flex items-center justify-between gap-3 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
            <div>
              <div class="text-xs font-semibold text-white">4K UHD (2160p)</div>
              <div id="4kBufCalc" class="text-[11px] text-slate-400 font-mono">8 × 512 KB = 4.0 MB in-flight</div>
            </div>
            <div class="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-lg p-1">
              <button type="button" onclick="adjustPipelineBuf('4k', -1)" class="w-6 h-6 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs transition select-none">-</button>
              <input id="4kBufInput" type="number" step="1" min="1" max="16" value="8" oninput="updatePipelineLabels()" class="w-10 bg-transparent text-center text-xs font-mono font-semibold text-white focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
              <button type="button" onclick="adjustPipelineBuf('4k', 1)" class="w-6 h-6 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs transition select-none">+</button>
            </div>
          </div>

          <div class="flex items-center justify-between pt-2">
            <span id="savePipelineMsg" class="text-xs text-emerald-400 hidden">✓ Pipeline buffers saved & applied live!</span>
            <div class="flex-1"></div>
            <button id="savePipelineBtn" onclick="savePipelineBuffers()" class="px-4 py-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs rounded-xl transition">
              Save Pipeline Buffers
            </button>
          </div>
        </div>
      </div>

      <!-- Card 3: Stream Engine Prefetch & RAM Cache -->
      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 glow-box space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold text-white flex items-center gap-2">
            🚀 Engine Prefetch & RAM Cache
          </h2>
          <span class="text-xs px-2.5 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30 font-mono">Router Tuned</span>
        </div>
        <p class="text-xs text-slate-400">Optimize seek latency and in-memory LRU caching on the router's RAM disk.</p>

        <div class="space-y-3 pt-1">
          <!-- Overlap Prefetch Toggle -->
          <div class="flex items-center justify-between gap-3 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
            <div>
              <div class="text-xs font-semibold text-white">Overlap Prefetch</div>
              <div class="text-[11px] text-slate-400">Proactively queues upcoming chunks during initial seek/play</div>
            </div>
            <select id="prefetchSelect" class="bg-slate-900 border border-slate-700 text-xs text-white rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-sky-500">
              <option value="true" selected>Enabled (Fast Playback)</option>
              <option value="false">Disabled (Strict Sequential)</option>
            </select>
          </div>

          <!-- Router RAM Block Cache -->
          <div class="flex items-center justify-between gap-3 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
            <div>
              <div class="text-xs font-semibold text-white">Router RAM Block Cache</div>
              <div id="ramCacheHint" class="text-[11px] text-slate-400">32 blocks (16 MB cap in Node memory)</div>
            </div>
            <select id="ramCacheSelect" onchange="updateRamCacheLabel()" class="bg-slate-900 border border-slate-700 text-xs text-white rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-sky-500">
              <option value="8">8 MB (16 blocks)</option>
              <option value="16" selected>16 MB (32 blocks - Recommended)</option>
              <option value="32">32 MB (64 blocks)</option>
              <option value="64">64 MB (128 blocks - High RAM)</option>
            </select>
          </div>

          <!-- Video Transcode Mode -->
          <div class="flex items-center justify-between gap-3 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
            <div>
              <div class="text-xs font-semibold text-white">Video Transcoding</div>
              <div id="videoTranscodeHint" class="text-[11px] text-slate-400">100% Direct Stream Copy (0% CPU load) [Recommended]</div>
            </div>
            <select id="videoTranscodeSelect" onchange="updateVideoTranscodeLabel()" class="bg-slate-900 border border-slate-700 text-xs text-white rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-sky-500">
              <option value="disabled" selected>Disabled (100% Direct Copy - 0% CPU)</option>
              <option value="desktop_hevc">Desktop Web Only (HEVC/AVI -> H.264 for PC Chrome)</option>
              <option value="always">Enabled for All Devices</option>
            </select>
          </div>

          <!-- TV Series Minimum File Size -->
          <div class="flex items-center justify-between gap-3 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
            <div>
              <div class="text-xs font-semibold text-white">TV Series Minimum Size</div>
              <div id="minTvSizeHint" class="text-[11px] text-slate-400">Files &lt; 80 MB are treated as clips/trailers and skipped</div>
            </div>
            <div class="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-lg p-1">
              <button type="button" onclick="adjustMinTvSize(-5)" class="w-6 h-6 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs transition select-none">-</button>
              <input id="minTvSizeInput" type="number" step="5" min="10" max="500" value="80" oninput="updateMinTvSizeLabel()" class="w-12 bg-transparent text-center text-xs font-mono font-semibold text-white focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
              <span class="text-[11px] text-slate-400 pr-1">MB</span>
              <button type="button" onclick="adjustMinTvSize(5)" class="w-6 h-6 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs transition select-none">+</button>
            </div>
          </div>

          <!-- Movie Minimum File Size -->
          <div class="flex items-center justify-between gap-3 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
            <div>
              <div class="text-xs font-semibold text-white">Movie Minimum Size</div>
              <div id="minMovieSizeHint" class="text-[11px] text-slate-400">Files &lt; 180 MB are treated as clips/trailers and skipped</div>
            </div>
            <div class="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-lg p-1">
              <button type="button" onclick="adjustMinMovieSize(-5)" class="w-6 h-6 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs transition select-none">-</button>
              <input id="minMovieSizeInput" type="number" step="5" min="20" max="2000" value="180" oninput="updateMinMovieSizeLabel()" class="w-12 bg-transparent text-center text-xs font-mono font-semibold text-white focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
              <span class="text-[11px] text-slate-400 pr-1">MB</span>
              <button type="button" onclick="adjustMinMovieSize(5)" class="w-6 h-6 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs transition select-none">+</button>
            </div>
          </div>

          <!-- Resolver Max Paging -->
          <div class="flex items-center justify-between gap-3 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
            <div>
              <div class="text-xs font-semibold text-white">Resolver Max Paging</div>
              <div id="resolverMaxPagesHint" class="text-[11px] text-slate-400">Traverse up to 3 pages per search query during media resolution</div>
            </div>
            <div class="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-lg p-1">
              <button type="button" onclick="adjustResolverMaxPages(-1)" class="w-6 h-6 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs transition select-none">-</button>
              <input id="resolverMaxPagesInput" type="number" step="1" min="1" max="15" value="3" oninput="updateResolverMaxPagesLabel()" class="w-10 bg-transparent text-center text-xs font-mono font-semibold text-white focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
              <button type="button" onclick="adjustResolverMaxPages(1)" class="w-6 h-6 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs transition select-none">+</button>
            </div>
          </div>

          <div class="flex items-center justify-between pt-2">
            <span id="saveEngineMsg" class="text-xs text-emerald-400 hidden">✓ Engine settings saved & applied!</span>
            <div class="flex-1"></div>
            <button id="saveEngineBtn" onclick="saveEngineSettings()" class="px-4 py-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs rounded-xl transition">
              Save Engine Settings
            </button>
          </div>
        </div>
      </div>

      <!-- Card 4: Service Management (Reboot / Restart MSM Server) -->
      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 glow-box space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold text-white flex items-center gap-2">
            🔄 Service Management
          </h2>
          <span class="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono">Supervisor</span>
        </div>
        <p class="text-xs text-slate-400">Reboot the MSM Getter microservice. The router supervisor loop will automatically respawn the process with clean memory in ~3 seconds.</p>

        <div class="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-1">
          <span class="text-xs font-semibold text-amber-300 block">⚠️ Note on Active Streams</span>
          <p class="text-[11px] text-slate-400">Rebooting will briefly interrupt in-flight downloads. Active video players will automatically retry and reconnect.</p>
        </div>

        <div class="pt-2 flex items-center justify-end">
          <button onclick="confirmRestartService()" class="px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 hover:text-amber-300 border border-amber-500/30 rounded-xl text-xs font-semibold transition flex items-center gap-1.5">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
            Restart MSM Service
          </button>
        </div>
      </div>

      <!-- Card 5: Stream Cache Management -->
      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 glow-box space-y-4">
        <h2 class="text-sm font-semibold text-white flex items-center gap-2">
          💾 Stream Cache Storage
        </h2>
        <p class="text-xs text-slate-400">Central database mapping cached video stream documents in <code class="text-slate-300">streams.json</code>.</p>
        <div class="space-y-3">
          <div class="flex gap-3">
            <a href="/tg/streams" class="flex-1 text-center py-2 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white rounded-xl transition">
              Browse Cached Videos
            </a>
            <button onclick="clearCache()" class="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-semibold rounded-xl transition">
              Clear All Cache
            </button>
          </div>
          <div class="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>Total stored items:</span>
            <span id="cacheCount" class="font-bold text-white">--</span>
          </div>
        </div>
      </div>

      <!-- Card 6: Log File Maintenance & Telegram Session -->
      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 glow-box space-y-4">
        <h2 class="text-sm font-semibold text-white flex items-center gap-2">
          📜 Maintenance & Telegram Auth
        </h2>
        <p class="text-xs text-slate-400">Manage server stdout/stderr diagnostic log files or update your active Telegram phone session.</p>
        <div class="flex flex-col gap-2.5">
          <div class="flex gap-3">
            <a href="/api/logs/download" class="flex-1 text-center py-2 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white rounded-xl transition">
              Download Log File
            </a>
            <button onclick="clearLogs()" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-rose-400 text-xs font-semibold rounded-xl transition">
              Clear Log
            </button>
          </div>
          <a href="/tg/auth" class="block text-center py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-semibold rounded-xl transition">
            Open Telegram Phone Auth Portal →
          </a>
        </div>
      </div>

      <!-- Card 7: Geo-Blocking (Malaysia Only) -->
      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 glow-box space-y-4 md:col-span-2">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center font-bold text-lg">
              🛡️
            </div>
            <div>
              <h2 class="text-sm font-semibold text-white flex items-center gap-2">
                Geo-Blocking (Malaysia Only)
              </h2>
              <p class="text-xs text-slate-400">Restricts public streaming and resolver endpoints strictly to Malaysia (MY) IP addresses.</p>
            </div>
          </div>
          <span id="geoBlockStatusBadge" class="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">Active (MY)</span>
        </div>

        <div class="space-y-3 pt-1">
          <!-- Toggle Geo-Blocking -->
          <div class="flex items-center justify-between gap-3 bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
            <div>
              <div class="text-xs font-semibold text-white">Enforce Malaysia Geo-Blocking</div>
              <div class="text-[11px] text-slate-400">Deny all public WAN connections originating outside Malaysia (403 Forbidden). Local LAN and loopback traffic are always permitted.</div>
            </div>
            <label class="relative inline-flex items-center cursor-pointer select-none">
              <input id="geoBlockToggle" type="checkbox" checked onchange="updateGeoBlockToggleUI()" class="sr-only peer" />
              <div class="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
            </label>
          </div>

          <!-- IP Whitelist -->
          <div class="space-y-1.5 bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
            <div class="text-xs font-semibold text-white">Custom Whitelisted IPs / Subnets</div>
            <div class="text-[11px] text-slate-400">Explicitly permit specific IPs or CIDR blocks outside Malaysia (one per line or comma-separated).</div>
            <textarea id="geoBlockWhitelistInput" rows="2" placeholder="e.g. 1.2.3.4, 195.154.0.0/16" class="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-sky-500/50 resize-y"></textarea>
          </div>

          <div class="flex items-center justify-between pt-1">
            <span id="saveGeoMsg" class="text-xs text-emerald-400 hidden">✓ Geo-blocking settings saved!</span>
            <div class="flex-1"></div>
            <button id="saveGeoBtn" onclick="saveGeoSettings()" class="px-4 py-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs rounded-xl transition">
              Save Geo Settings
            </button>
          </div>
        </div>
      </div>

    </div>
  </div>

  <!-- Restart Confirmation Modal -->
  <div id="restartModal" class="hidden fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
    <div class="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 glow-box shadow-2xl space-y-4">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center text-lg">
          🔄
        </div>
        <div>
          <h3 class="text-base font-bold text-white">Restart MSM Service</h3>
          <p class="text-xs text-slate-400">Confirm microservice restart</p>
        </div>
      </div>
      <p class="text-xs text-slate-300 leading-relaxed">
        Are you sure you want to reboot the MSM Getter server process? The router supervisor loop will respawn the service automatically within ~3 seconds.
      </p>
      <div id="restartStatusBox" class="hidden p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-center text-sky-400">
        <div class="flex items-center justify-center gap-2">
          <span class="w-2.5 h-2.5 rounded-full bg-sky-400 animate-ping"></span>
          <span id="restartingCountdown">Restarting service in 3s...</span>
        </div>
      </div>
      <div id="restartBtnGroup" class="flex items-center justify-end gap-2 pt-2">
        <button onclick="closeRestartModal()" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition">
          Cancel
        </button>
        <button id="btnConfirmRestart" onclick="executeRestartService()" class="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl transition">
          Yes, Restart Now
        </button>
      </div>
    </div>
  </div>

  <script>
    async function loadSettingsData() {
      try {
        const res = await fetch('/tg/api/settings').catch(() => fetch('/msm/api/settings')).then(r => r.json());
        if (res.cachedStreams !== undefined) {
          document.getElementById('cacheCount').textContent = res.cachedStreams + ' videos';
        }
        if (res.activeResolver) {
          const sel = document.getElementById('resolverSelect');
          if (sel) sel.value = res.activeResolver;
          if (res.targetBotUsernames && res.targetBotUsernames[res.activeResolver]) {
            resolverBotDefaults[res.activeResolver] = res.targetBotUsernames[res.activeResolver];
            const botIn = document.getElementById('botInput');
            if (botIn) botIn.value = res.targetBotUsernames[res.activeResolver];
          }
          const pill = document.getElementById('botStatusPill');
          if (pill) {
            const currentBot = (res.targetBotUsernames && res.targetBotUsernames[res.activeResolver]) || res.targetBotUsername || '';
            pill.textContent = (res.activeResolver === 'pencuri' ? 'Pencuri: @' : 'MSM: @') + currentBot;
          }
          updatePresets();
        } else if (res.targetBotUsername) {
          document.getElementById('botStatusPill').textContent = '@' + res.targetBotUsername;
        }
        if (res.pipelineBuffers) {
          if (res.pipelineBuffers.sd) document.getElementById('sdBufInput').value = String(res.pipelineBuffers.sd);
          if (res.pipelineBuffers['720p']) document.getElementById('720pBufInput').value = String(res.pipelineBuffers['720p']);
          if (res.pipelineBuffers['1080p']) document.getElementById('1080pBufInput').value = String(res.pipelineBuffers['1080p']);
          if (res.pipelineBuffers['4k']) document.getElementById('4kBufInput').value = String(res.pipelineBuffers['4k']);
          updatePipelineLabels();
        }
        if (res.overlapPrefetch !== undefined) {
          document.getElementById('prefetchSelect').value = String(res.overlapPrefetch);
        }
        if (res.routerRamCacheMb !== undefined) {
          document.getElementById('ramCacheSelect').value = String(res.routerRamCacheMb);
          updateRamCacheLabel();
        }
        if (res.videoTranscodeMode !== undefined) {
          document.getElementById('videoTranscodeSelect').value = String(res.videoTranscodeMode);
          updateVideoTranscodeLabel();
        }
        if (res.minTvSizeMb !== undefined) {
          document.getElementById('minTvSizeInput').value = String(res.minTvSizeMb);
          updateMinTvSizeLabel();
        }
        if (res.minMovieSizeMb !== undefined) {
          document.getElementById('minMovieSizeInput').value = String(res.minMovieSizeMb);
          updateMinMovieSizeLabel();
        }
        if (res.resolverMaxPages !== undefined) {
          document.getElementById('resolverMaxPagesInput').value = String(res.resolverMaxPages);
          updateResolverMaxPagesLabel();
        }
        if (res.geoBlockEnabled !== undefined) {
          const toggle = document.getElementById('geoBlockToggle');
          if (toggle) toggle.checked = Boolean(res.geoBlockEnabled);
          updateGeoBlockToggleUI();
        }
        if (res.geoBlockWhitelistedIps) {
          const wl = document.getElementById('geoBlockWhitelistInput');
          if (wl) wl.value = res.geoBlockWhitelistedIps.join('\\n');
        }
      } catch (e) {}
    }

    function updateGeoBlockToggleUI() {
      const checked = document.getElementById('geoBlockToggle')?.checked;
      const badge = document.getElementById('geoBlockStatusBadge');
      if (badge) {
        if (checked) {
          badge.className = 'text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono';
          badge.textContent = 'Active (MY)';
        } else {
          badge.className = 'text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 font-mono';
          badge.textContent = 'Disabled';
        }
      }
    }

    async function saveGeoSettings() {
      const enabled = document.getElementById('geoBlockToggle')?.checked;
      const rawIps = document.getElementById('geoBlockWhitelistInput')?.value || '';
      const ips = rawIps.split(/[\\n,]/).map(s => s.trim()).filter(Boolean);

      const btn = document.getElementById('saveGeoBtn');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Saving...';
      }

      try {
        const res = await fetch('/msm/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            geoBlockEnabled: enabled,
            geoBlockWhitelistedIps: ips,
          })
        });
        const data = await res.json();
        if (data.success) {
          const msg = document.getElementById('saveGeoMsg');
          if (msg) {
            msg.classList.remove('hidden');
            setTimeout(() => msg.classList.add('hidden'), 3000);
          }
          updateGeoBlockToggleUI();
        }
      } catch (e) {
        alert('Failed to save Geo settings: ' + e.message);
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Save Geo Settings';
        }
      }
    }

    function adjustPipelineBuf(tier, delta) {
      const input = document.getElementById(tier + 'BufInput');
      if (!input) return;
      let val = (parseInt(input.value, 10) || 1) + delta;
      val = Math.max(1, Math.min(16, val));
      input.value = String(val);
      updatePipelineLabels();
    }

    function updatePipelineLabels() {
      const sd = Math.max(1, Math.min(16, parseInt(document.getElementById('sdBufInput')?.value, 10) || 2));
      const p720 = Math.max(1, Math.min(16, parseInt(document.getElementById('720pBufInput')?.value, 10) || 4));
      const p1080 = Math.max(1, Math.min(16, parseInt(document.getElementById('1080pBufInput')?.value, 10) || 6));
      const p4k = Math.max(1, Math.min(16, parseInt(document.getElementById('4kBufInput')?.value, 10) || 8));

      const sdCalc = document.getElementById('sdBufCalc');
      if (sdCalc) sdCalc.textContent = sd + ' × 512 KB = ' + (sd * 0.5).toFixed(1) + ' MB in-flight';
      const p720Calc = document.getElementById('720pBufCalc');
      if (p720Calc) p720Calc.textContent = p720 + ' × 512 KB = ' + (p720 * 0.5).toFixed(1) + ' MB in-flight';
      const p1080Calc = document.getElementById('1080pBufCalc');
      if (p1080Calc) p1080Calc.textContent = p1080 + ' × 512 KB = ' + (p1080 * 0.5).toFixed(1) + ' MB in-flight';
      const p4kCalc = document.getElementById('4kBufCalc');
      if (p4kCalc) p4kCalc.textContent = p4k + ' × 512 KB = ' + (p4k * 0.5).toFixed(1) + ' MB in-flight';
    }

    function updateRamCacheLabel() {
      const mb = parseInt(document.getElementById('ramCacheSelect').value, 10) || 16;
      document.getElementById('ramCacheHint').textContent = (mb * 2) + ' blocks (' + mb + ' MB cap in Node memory)';
    }

    function adjustMinTvSize(delta) {
      const input = document.getElementById('minTvSizeInput');
      let val = (parseInt(input.value, 10) || 80) + delta;
      val = Math.max(10, Math.min(500, Math.round(val / 5) * 5));
      input.value = String(val);
      updateMinTvSizeLabel();
    }

    function adjustMinMovieSize(delta) {
      const input = document.getElementById('minMovieSizeInput');
      let val = (parseInt(input.value, 10) || 180) + delta;
      val = Math.max(20, Math.min(2000, Math.round(val / 5) * 5));
      input.value = String(val);
      updateMinMovieSizeLabel();
    }

    function updateMinTvSizeLabel() {
      const mb = parseInt(document.getElementById('minTvSizeInput').value, 10) || 80;
      document.getElementById('minTvSizeHint').textContent = 'Files < ' + mb + ' MB are treated as clips/trailers and skipped';
    }

    function updateMinMovieSizeLabel() {
      const mb = parseInt(document.getElementById('minMovieSizeInput').value, 10) || 180;
      document.getElementById('minMovieSizeHint').textContent = 'Files < ' + mb + ' MB are treated as clips/trailers and skipped';
    }

    function adjustResolverMaxPages(delta) {
      const input = document.getElementById('resolverMaxPagesInput');
      let val = (parseInt(input.value, 10) || 3) + delta;
      val = Math.max(1, Math.min(15, val));
      input.value = String(val);
      updateResolverMaxPagesLabel();
    }

    function updateResolverMaxPagesLabel() {
      const pages = parseInt(document.getElementById('resolverMaxPagesInput').value, 10) || 3;
      document.getElementById('resolverMaxPagesHint').textContent = 'Traverse up to ' + pages + ' page' + (pages === 1 ? '' : 's') + ' per search query during media resolution';
    }

    function updateVideoTranscodeLabel() {
      const mode = document.getElementById('videoTranscodeSelect').value;
      const hint = document.getElementById('videoTranscodeHint');
      if (hint) {
        if (mode === 'desktop_hevc') {
          hint.textContent = 'HEVC/AVI -> H.264 Baseline for PC Chrome (2 router CPU cores)';
        } else if (mode === 'always') {
          hint.textContent = 'Transcodes HEVC/AVI to H.264 for all devices upon request';
        } else {
          hint.textContent = '100% Direct Stream Copy (0% CPU load) [Recommended]';
        }
      }
    }

    async function savePipelineBuffers() {
      const sd = parseInt(document.getElementById('sdBufInput').value, 10) || 2;
      const p720 = parseInt(document.getElementById('720pBufInput').value, 10) || 4;
      const p1080 = parseInt(document.getElementById('1080pBufInput').value, 10) || 6;
      const p4k = parseInt(document.getElementById('4kBufInput').value, 10) || 8;

      const btn = document.getElementById('savePipelineBtn');
      btn.disabled = true;
      btn.textContent = 'Saving...';

      try {
        const res = await fetch('/msm/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pipelineBuffers: { sd, '720p': p720, '1080p': p1080, '4k': p4k }
          })
        });
        const data = await res.json();
        if (data.success) {
          const msg = document.getElementById('savePipelineMsg');
          msg.classList.remove('hidden');
          setTimeout(() => msg.classList.add('hidden'), 3000);
        }
      } catch (e) {
        alert('Failed to save pipeline buffers: ' + e.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Save Pipeline Buffers';
      }
    }

    async function saveEngineSettings() {
      const prefetch = document.getElementById('prefetchSelect').value === 'true';
      const ramMb = parseInt(document.getElementById('ramCacheSelect').value, 10) || 16;
      const transcodeMode = document.getElementById('videoTranscodeSelect').value || 'disabled';
      const minTvMb = parseInt(document.getElementById('minTvSizeInput').value, 10) || 80;
      const minMovieMb = parseInt(document.getElementById('minMovieSizeInput').value, 10) || 180;
      const resolverMaxPages = parseInt(document.getElementById('resolverMaxPagesInput').value, 10) || 3;

      const btn = document.getElementById('saveEngineBtn');
      btn.disabled = true;
      btn.textContent = 'Saving...';

      try {
        const res = await fetch('/msm/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            overlapPrefetch: prefetch,
            routerRamCacheMb: ramMb,
            videoTranscodeMode: transcodeMode,
            minTvSizeMb: minTvMb,
            minMovieSizeMb: minMovieMb,
            resolverMaxPages: resolverMaxPages,
          })
        });
        const data = await res.json();
        if (data.success) {
          const msg = document.getElementById('saveEngineMsg');
          msg.classList.remove('hidden');
          setTimeout(() => msg.classList.add('hidden'), 3000);
        }
      } catch (e) {
        alert('Failed to save engine settings: ' + e.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Save Engine Settings';
      }
    }

    const resolverBotDefaults = {
      msm: '${savedSettings.targetBotUsernames?.msm || BOT_USERNAME || "msm34bot"}',
      pencuri: '${savedSettings.targetBotUsernames?.pencuri || "Pencuri_Movie_Bot"}',
    };

    function updatePresets() {
      const sel = document.getElementById('resolverSelect');
      if (!sel) return;
      const resolver = sel.value;
      const container = document.getElementById('quickPresets');
      if (!container) return;
      container.innerHTML = '';
      const list = resolver === 'pencuri' ? ['Pencuri_Movie_Bot', 'UnOfficialsBot'] : ['msm34bot', 'msm32bot'];
      list.forEach((bot, idx) => {
        if (idx > 0) {
          const sep = document.createElement('span');
          sep.textContent = ' • ';
          container.appendChild(sep);
        }
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'hover:text-sky-400 text-slate-300';
        btn.textContent = '@' + bot;
        btn.onclick = function() { setBotPreset(bot); };
        container.appendChild(btn);
      });
    }

    function onResolverChange() {
      const resolver = document.getElementById('resolverSelect').value;
      document.getElementById('botInput').value = resolverBotDefaults[resolver] || (resolver === 'pencuri' ? 'Pencuri_Movie_Bot' : 'msm34bot');
      updatePresets();
    }

    async function saveBot() {
      const resolver = document.getElementById('resolverSelect').value;
      const input = document.getElementById('botInput');
      const val = input.value.trim().replace(/^@/, '');
      if (!val) return;

      const btn = document.getElementById('saveBotBtn');
      btn.disabled = true;
      btn.textContent = 'Saving...';

      try {
        const payload = {
          activeResolver: resolver,
          targetBotUsername: val,
          targetBotUsernames: {
            [resolver]: val,
          },
        };
        const res = await fetch('/tg/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
          resolverBotDefaults[resolver] = val;
          document.getElementById('botStatusPill').textContent = (resolver === 'pencuri' ? 'Pencuri: @' : 'MSM: @') + val;
          const msg = document.getElementById('saveMsg');
          msg.classList.remove('hidden');
          setTimeout(() => msg.classList.add('hidden'), 3000);
        }
      } catch (e) {
        alert('Failed to save resolver settings: ' + e.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Save';
      }
    }

    function setBotPreset(name) {
      document.getElementById('botInput').value = name;
      saveBot();
    }
    
    // Initialize presets on load
    updatePresets();

    function confirmRestartService() {
      document.getElementById('restartModal').classList.remove('hidden');
      document.getElementById('restartStatusBox').classList.add('hidden');
      document.getElementById('restartBtnGroup').classList.remove('hidden');
    }

    function closeRestartModal() {
      document.getElementById('restartModal').classList.add('hidden');
    }

    async function executeRestartService() {
      const btnGroup = document.getElementById('restartBtnGroup');
      const statusBox = document.getElementById('restartStatusBox');
      const countdownEl = document.getElementById('restartingCountdown');

      btnGroup.classList.add('hidden');
      statusBox.classList.remove('hidden');
      countdownEl.textContent = 'Initiating service reboot...';

      try {
        await fetch('/msm/api/system/restart', { method: 'POST' });
      } catch (e) {}

      let remaining = 4;
      const interval = setInterval(async () => {
        remaining--;
        if (remaining > 0) {
          countdownEl.textContent = 'Restarting microservice in ' + remaining + 's...';
        } else {
          countdownEl.textContent = 'Checking server connection...';
          try {
            const res = await fetch('/msm/api/settings', { cache: 'no-store' });
            if (res.ok) {
              clearInterval(interval);
              countdownEl.textContent = '✓ Service back online! Reloading...';
              setTimeout(() => window.location.reload(), 1000);
            }
          } catch (pingErr) {}
        }
      }, 1000);
    }

    async function clearCache() {
      if (!confirm('Are you sure you want to clear the entire stream cache?')) return;
      try {
        const res = await fetch('/msm/api/cache/clear', { method: 'POST' });
        const d = await res.json();
        alert(d.message || 'Cache cleared');
        loadSettingsData();
      } catch (e) {
        alert('Failed to clear cache: ' + e.message);
      }
    }

    async function clearLogs() {
      if (!confirm('Are you sure you want to truncate the log file?')) return;
      try {
        const res = await fetch('/msm/api/logs/clear', { method: 'POST' });
        const d = await res.json();
        alert(d.message || 'Log cleared');
      } catch (e) {
        alert('Failed to clear logs: ' + e.message);
      }
    }

    loadSettingsData();

    window.addEventListener('scroll', () => {
      const btn = document.getElementById('backToTopBtn');
      if (!btn) return;
      if (window.scrollY > 250) {
        btn.classList.remove('opacity-0', 'translate-y-4', 'pointer-events-none');
        btn.classList.add('opacity-100', 'translate-y-0', 'pointer-events-auto');
      } else {
        btn.classList.add('opacity-0', 'translate-y-4', 'pointer-events-none');
        btn.classList.remove('opacity-100', 'translate-y-0', 'pointer-events-auto');
      }
    }, { passive: true });
  </script>
  <!-- Floating Back to Top Button -->
  <button id="backToTopBtn" onclick="window.scrollTo({top: 0, behavior: 'smooth'})" title="Scroll to top" aria-label="Scroll to top" class="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 p-2.5 sm:p-3 rounded-full bg-slate-800/90 hover:bg-sky-500 text-slate-300 hover:text-slate-950 border border-slate-700/80 hover:border-sky-400 shadow-xl backdrop-blur transition-all duration-300 opacity-0 translate-y-4 pointer-events-none focus:outline-none glow-box cursor-pointer">
    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 10l7-7m0 0l7 7m-7-7v18"></path>
    </svg>
  </button>
</body>
</html>`);
});

// Diagnostic endpoint to inspect raw buttons returned by @${BOT_USERNAME}
app.get(['/api/debug-search', '/tg/api/debug-search', '/msm/api/debug-search'], async (req, res) => {
  try {
    const query = req.query.q || 'Kelas Cikgu Hiragi';
    await initTelegram();
    const sentMsg = await client.sendMessage(BOT_USERNAME, { message: query });
    await new Promise(r => setTimeout(r, 2000));
    const msgs = await client.getMessages(BOT_USERNAME, { limit: 5 });
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
app.get(['/api/cache', '/tg/api/cache', '/msm/api/cache'], (req, res) => {
  const { search = '', quality = '' } = req.query;
  const items = db.getAll(search);
  const totalSizeBytes = db.getTotalSizeBytes();

  let formattedItems = items.map(item => {
    const bytes = parseInt(item.size, 10);
    let sizeFormatted = '0 B';
    if (!isNaN(bytes) && bytes > 0) {
      if (bytes >= 1024 * 1024 * 1024) {
        sizeFormatted = `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
      } else {
        sizeFormatted = `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
      }
    }
    const fakeDoc = (item.width || item.height) ? { size: bytes, attributes: [{ className: 'DocumentAttributeVideo', w: item.width, h: item.height }] } : (bytes > 0 ? { size: bytes } : null);
    const qualityTier = detectVideoQualityTier(item.filename || '', item.queryKey || '', fakeDoc, bytes);

    return {
      queryKey: item.queryKey,
      docId: item.docId,
      filename: item.filename,
      size: !isNaN(bytes) ? bytes : 0,
      sizeFormatted,
      qualityTier,
      actualQuality: item.actualQuality || qualityTier,
      requestedQuality: item.requestedQuality,
      requestedQualities: item.requestedQualities || (item.requestedQuality ? [item.requestedQuality] : []),
      videoCodec: item.videoCodec,
      width: item.width,
      height: item.height,
      mimeType: item.mimeType || 'video/mp4',
      dcId: item.dcId || 4,
      createdAt: item.createdAt || (item.date ? item.date * 1000 : 0),
    };
  });

  if (quality && quality.trim() && quality.trim().toLowerCase() !== 'all') {
    const qLower = quality.trim().toLowerCase();
    formattedItems = formattedItems.filter(item => {
      if (qLower === '4k' || qLower === '2160p') return item.qualityTier === '4k';
      if (qLower === '1080p') return item.qualityTier === '1080p';
      if (qLower === '720p') return item.qualityTier === '720p';
      if (qLower === 'sd' || qLower === '480p') return item.qualityTier === 'sd';
      return item.qualityTier === qLower;
    });
  }

  return res.json({
    success: true,
    total: formattedItems.length,
    totalSizeBytes,
    items: formattedItems,
  });
});

app.delete(['/api/cache', '/tg/api/cache', '/msm/api/cache'], (req, res) => {
  const key = req.query.key || req.body?.key;
  const docId = req.query.docId || req.body?.docId;
  let evicted = false;
  if (key) evicted = db.delete(key) || evicted;
  if (docId) evicted = db.deleteByDocId(docId) || evicted;
  return res.json({ success: true, evicted, key, docId });
});

app.post(['/api/cache/clear', '/tg/api/cache/clear', '/msm/api/cache/clear'], (req, res) => {
  db.clear();
  return res.json({ success: true, message: 'Central database cache cleared' });
});

app.get(['/api/cache/evict', '/tg/api/cache/evict', '/msm/api/cache/evict'], (req, res) => {
  const { key, docId } = req.query;
  let evicted = false;
  if (key) evicted = db.delete(key) || evicted;
  if (docId) evicted = db.deleteByDocId(docId) || evicted;
  return res.json({ success: true, evicted, key, docId });
});

// Resolver endpoint: /api/resolve and Prefetch endpoint: /api/prefetch
app.get(['/api/resolve', '/tg/api/resolve', '/msm/api/resolve', '/api/prefetch', '/tg/api/prefetch', '/msm/api/prefetch'], async (req, res) => {
  const { title, year, season, episode, totalSeasons: totalSeasonsQuery, maxQuality = '720', force, refresh, minTvSize, minMovieSize, altTitle: altTitleQuery, englishTitle, maxPages: maxPagesQuery } = req.query;
  if (!title) {
    return res.status(400).json({ success: false, error: 'Missing title query parameter' });
  }

  const altTitle = String(altTitleQuery || englishTitle || '').trim();

  const parsedMinTv = minTvSize ? parseInt(minTvSize, 10) : undefined;
  const parsedMinMovie = minMovieSize ? parseInt(minMovieSize, 10) : undefined;
  const effectiveMinTv = !isNaN(parsedMinTv) ? parsedMinTv : (savedSettings.minTvSizeMb ?? 80);
  const effectiveMinMovie = !isNaN(parsedMinMovie) ? parsedMinMovie : (savedSettings.minMovieSizeMb ?? 180);
  const parsedMaxPages = maxPagesQuery ? parseInt(maxPagesQuery, 10) : undefined;
  const effectiveMaxPages = (!isNaN(parsedMaxPages) && parsedMaxPages >= 1)
    ? parsedMaxPages
    : (savedSettings.resolverMaxPages ?? 3);

  const isPrefetch = req.path.includes('/prefetch') || req.query.prefetch === 'true' || req.query.prefetch === '1';
  const logPrefix = isPrefetch ? 'PREFETCH' : 'RESOLVE';

  const shouldBypassCache = !isPrefetch && (force === 'true' || refresh === 'true');
  let targetQuality = 720;
  const rawQ = String(maxQuality || '').toLowerCase().trim();
  if (rawQ) {
    if (rawQ === '4k' || parseInt(rawQ, 10) >= 2160) {
      targetQuality = 2160;
    } else if (parseInt(rawQ, 10) >= 1080) {
      targetQuality = 1080;
    } else if (parseInt(rawQ, 10) >= 720) {
      targetQuality = 720;
    } else {
      targetQuality = 480;
    }
  }

  const sNum = season ? parseInt(season, 10) : NaN;
  const eNum = episode ? parseInt(episode, 10) : NaN;
  const totalSeasons = totalSeasonsQuery ? parseInt(totalSeasonsQuery, 10) : NaN;
  const isTv = !isNaN(sNum) && !isNaN(eNum);
  const sPadded = isTv ? String(sNum).padStart(2, '0') : '';
  const epPadded = isTv ? String(eNum).padStart(2, '0') : '';
  const tvTag = isTv ? `S${sPadded}E${epPadded}` : '';

  const queryTitle = isTv ? `${title} ${tvTag}` : `${title} ${year || ''}`.trim();
  const baseCacheKey = normalizeTitle(isTv ? `${title} ${tvTag}` : `${title} ${year || ''}`);
  const cacheKey = baseCacheKey;
  const requestedTier = (targetQuality >= 2160 ? '4k' : targetQuality >= 1080 ? '1080p' : targetQuality <= 480 ? 'sd' : '720p');
  const inFlightKey = `${baseCacheKey}_${requestedTier}`;

  console.log(`[${logPrefix}] Request: "${queryTitle}" (isTv: ${isTv}, maxQuality: ${targetQuality}, maxPages: ${effectiveMaxPages}, bypassCache: ${shouldBypassCache}, cacheKey: "${cacheKey}", tier: ${requestedTier}${altTitle ? `, altTitle: "${altTitle}"` : ''})`);

  let isAborted = false;
  const onClientClose = () => {
    if (!res.writableEnded) {
      isAborted = true;
      console.log(`[${logPrefix}] Client disconnected / aborted for "${queryTitle}"`);
      inFlightResolutions.delete(inFlightKey);
    }
  };
  if (!isPrefetch) {
    req.on('close', onClientClose);
  }
  const checkAborted = () => !isPrefetch && (isAborted || Boolean(req.destroyed));

  // 1. Check Central Database first (Instant < 1ms response, 0 bot queries)
  let cached = shouldBypassCache ? null : db.get(baseCacheKey, requestedTier);
  let fallbackCached = null;

  if (!cached && !shouldBypassCache) {
    fallbackCached = db.getFallback(baseCacheKey, requestedTier);
  }

  // Validate that cached entry is not junk media (e.g. previously cached review/recap)
  if (cached && isJunkMedia(cached.filename || cached.queryKey, title, altTitle)) {
    console.log(`[${logPrefix}] Stale/junk media detected in cache for "${cacheKey}" ("${cached.filename}"), evicting...`);
    db.deleteByDocId(cached.docId);
    cached = null;
  }
  if (fallbackCached && isJunkMedia(fallbackCached.filename || fallbackCached.queryKey, title, altTitle)) {
    console.log(`[${logPrefix}] Stale/junk media detected in fallback cache ("${fallbackCached.filename}"), ignoring...`);
    fallbackCached = null;
  }

  if (cached) {
    console.log(`[${logPrefix}] Central DB Cache HIT for "${cacheKey}" (tier: ${requestedTier}) -> Doc ID: ${cached.docId} (${cached.filename})`);
    if (!isPrefetch) req.off('close', onClientClose);
    if (isPrefetch) {
      return res.json({
        success: true,
        cached: true,
        docId: cached.docId,
        filename: cached.filename,
        size: cached.size,
      });
    }
    const host = req.get('host');
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const isDesktopWeb = isDesktopWebClient(req);
    const isHevc = cached.videoCodec === 'hevc' || cached.videoCodec === 'h265' || /\b(x265|hevc|h265)\b/i.test(cached.filename || '');
    const isAvi = /\.avi$/i.test(cached.filename || '');
    const transcodeSetting = savedSettings.videoTranscodeMode || 'disabled';
    let transcodeQuery = '';
    if (transcodeSetting === 'desktop_hevc' && isDesktopWeb && (isHevc || isAvi)) {
      transcodeQuery = '?transcode=audio&vcodec=h264';
    } else if (transcodeSetting === 'always' && (isHevc || isAvi)) {
      transcodeQuery = '?transcode=audio&vcodec=h264';
    }
    return res.json({
      success: true,
      cached: true,
      streamUrl: `${protocol}://${host}/stream/${cached.docId}${transcodeQuery}`,
      filename: cached.filename,
      size: cached.size,
      videoCodec: cached.videoCodec || (isHevc ? 'hevc' : undefined),
    });
  }

  // 2. In-flight Request Deduplication: if another request is currently resolving this exact title, await it
  if (inFlightResolutions.has(cacheKey)) {
    console.log(`[${logPrefix}] In-flight deduplication: attaching to existing resolution for "${cacheKey}"`);
    if (isPrefetch) {
      return res.json({ success: true, cached: false, inFlight: true });
    }
    try {
      const result = await inFlightResolutions.get(cacheKey);
      req.off('close', onClientClose);
      if (isAborted || res.writableEnded) return;
      const host = req.get('host');
      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      const isDesktopWeb = isDesktopWebClient(req);
      const isHevc = result.videoCodec === 'hevc' || result.videoCodec === 'h265' || /\b(x265|hevc|h265)\b/i.test(result.filename || '');
      const isAvi = /\.avi$/i.test(result.filename || '');
      let transcodeQuery = '';
      if (transcodeSetting === 'desktop_hevc' && isDesktopWeb && (isHevc || isAvi)) {
        transcodeQuery = '?transcode=audio&vcodec=h264';
      } else if (transcodeSetting === 'always' && (isHevc || isAvi)) {
        transcodeQuery = '?transcode=audio&vcodec=h264';
      }
      return res.json({
        success: true,
        cached: true,
        streamUrl: `${protocol}://${host}/stream/${result.docId}${transcodeQuery}`,
        filename: result.filename,
        size: result.size,
        videoCodec: result.videoCodec || (isHevc ? 'hevc' : undefined),
      });
    } catch (err) {
      req.off('close', onClientClose);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // 3. If prefetch request and not yet cached: immediately acknowledge HTTP 200 so client connection does not block!
  if (isPrefetch) {
    console.log(`[PREFETCH] Immediately acknowledging prefetch for "${queryTitle}". Continuing bot resolution in background.`);
    res.json({ success: true, cached: false, prefetching: true });
  }

  // 4. Queue resolution through sequential FIFO mutex to prevent Telegram chat interleaving
  const resolvePromise = queueTelegramTask(async () => {
    if (checkAborted()) {
      console.log(`[${logPrefix}] Skipping queued resolution for "${queryTitle}" (client aborted)`);
      const err = new Error('Client aborted resolution');
      err.status = 499;
      throw err;
    }

    await initTelegram();

    if (checkAborted()) {
      const err = new Error('Client aborted resolution');
      err.status = 499;
      throw err;
    }

    // Re-check Central DB after waiting in queue
    if (!shouldBypassCache) {
      const cachedAfterQueue = db.get(baseCacheKey, requestedTier);
      if (cachedAfterQueue) {
        return cachedAfterQueue;
      }
    }

    const activeResolverId = String(req.query.resolver || savedSettings.activeResolver || 'msm').toLowerCase().trim();
    const targetBotHandle = (req.query.bot || (savedSettings.targetBotUsernames && savedSettings.targetBotUsernames[activeResolverId]) || (activeResolverId === 'pencuri' ? 'Pencuri_Movie_Bot' : BOT_USERNAME)).replace(/^@/, '');

    console.log(`[${logPrefix}] Delegating to resolver "${activeResolverId}" with target bot @${targetBotHandle}`);
    const resolver = createResolver(activeResolverId, client, {
      targetBot: targetBotHandle,
      deadShortcodes,
    });

    const resolvedData = await resolver.resolve({
      title,
      year,
      season,
      episode,
      totalSeasons,
      altTitle,
      englishTitle,
      targetQuality,
      requestedTier,
      effectiveMinTv,
      effectiveMinMovie,
      effectiveMaxPages,
      targetBot: targetBotHandle,
      checkAborted,
      fallbackCached,
      db,
      baseCacheKey,
    });

    if (checkAborted()) {
      const err = new Error('Client aborted resolution');
      err.status = 499;
      throw err;
    }

    if (!resolvedData) {
      if (fallbackCached) {
        console.log(`[${logPrefix}] Requested quality ${targetQuality}p not found, falling back to cached "${fallbackCached.queryKey || fallbackCached.filename}" for "${baseCacheKey}"`);
        db.addRequestedQuality(fallbackCached.docId, requestedTier);
        return fallbackCached;
      }
      const err = new Error(`No downloadable media found for "${queryTitle}" on @${targetBotHandle} (resolver: ${activeResolverId})`);
      err.status = 404;
      throw err;
    }

    const deliveredDoc = resolvedData.document;
    const deliveredMsgId = resolvedData.msgId;
    const filename = resolvedData.filename || queryTitle;
    const actualTier = resolvedData.tier || detectVideoQualityTier(filename, '', deliveredDoc, deliveredDoc.size);
    const docIdStr = deliveredDoc.id.toString();
    const vAttr = deliveredDoc.attributes?.find(a => a.className === 'DocumentAttributeVideo');

    const resolvedItem = db.set(baseCacheKey, {
      docId: docIdStr,
      msgId: deliveredMsgId,
      accessHash: deliveredDoc.accessHash?.toString() || '',
      fileReference: deliveredDoc.fileReference ? deliveredDoc.fileReference.toString('hex') : '',
      filename,
      size: deliveredDoc.size?.toString() || '0',
      mimeType: deliveredDoc.mimeType || 'video/mp4',
      dcId: deliveredDoc.dcId || 4,
      date: deliveredDoc.date,
      width: vAttr?.w ? Number(vAttr.w) : null,
      height: vAttr?.h ? Number(vAttr.h) : null,
      actualQuality: actualTier,
      requestedQualities: [requestedTier],
    });
    console.log(`[${logPrefix}] Successfully resolved "${queryTitle}" -> Doc ID: ${docIdStr} (${filename}) as "${baseCacheKey}" (tier: ${actualTier}, req: ${requestedTier})`);
    return resolvedItem;
  });

  inFlightResolutions.set(inFlightKey, resolvePromise);

  try {
    const result = await resolvePromise;
    inFlightResolutions.delete(inFlightKey);
    if (!isPrefetch) {
      req.off('close', onClientClose);
    }

    if (isPrefetch) {
      console.log(`[PREFETCH] Background resolution complete for "${queryTitle}" -> Doc ID: ${result?.docId || result?.id} cached in Central DB.`);
      return;
    }

    if (isAborted || res.writableEnded) return;

    const host = req.get('host');
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const isDesktopWeb = isDesktopWebClient(req);
    const isHevc = result.videoCodec === 'hevc' || result.videoCodec === 'h265' || /\b(x265|hevc|h265)\b/i.test(result.filename || '');
    const isAvi = /\.avi$/i.test(result.filename || '');
    const transcodeSetting = savedSettings.videoTranscodeMode || 'disabled';
    let transcodeQuery = '';
    if (transcodeSetting === 'desktop_hevc' && isDesktopWeb && (isHevc || isAvi)) {
      transcodeQuery = '?transcode=audio&vcodec=h264';
    } else if (transcodeSetting === 'always' && (isHevc || isAvi)) {
      transcodeQuery = '?transcode=audio&vcodec=h264';
    }

    return res.json({
      success: true,
      cached: false,
      streamUrl: `${protocol}://${host}/stream/${result.docId}${transcodeQuery}`,
      filename: result.filename,
      size: result.size,
      videoCodec: result.videoCodec || (isHevc ? 'hevc' : undefined),
    });
  } catch (err) {
    inFlightResolutions.delete(cacheKey);
    if (!isPrefetch) {
      req.off('close', onClientClose);
    }
    if (isPrefetch) {
      console.warn(`[PREFETCH WARN] Background prefetch failed for "${queryTitle}":`, err.message);
      return;
    }
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
function writeWithBackpressure(res, chunk, onWrite) {
  if (res.destroyed || res.writableEnded) return Promise.resolve();
  let ok = false;
  try {
    ok = res.write(chunk);
    if (typeof onWrite === 'function') onWrite();
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
    const dbRecord = db.getByDocId(docIdStr);

    // 1. Direct message ID lookup (official MTProto fast path: re-fetching the message provides fresh HMAC file_reference)
    if (dbRecord && dbRecord.msgId) {
      try {
        const msgs = await client.getMessages(BOT_USERNAME, { ids: [Number(dbRecord.msgId)] });
        const m = msgs?.[0];
        if (m && m.media?.document?.id?.toString() === docIdStr) {
          const freshRef = m.media.document.fileReference;
          if (freshRef) {
            console.log(`[FILE_REF RECOVERY] Found fresh fileReference via direct msgId ${dbRecord.msgId} for Doc ID: ${docIdStr}!`);
            if (dbRecord.queryKey) {
              db.set(dbRecord.queryKey, {
                ...dbRecord,
                fileReference: freshRef.toString('hex'),
                updatedAt: Date.now(),
              });
            }
            return freshRef;
          }
        }
      } catch (idErr) {
        console.warn(`[FILE_REF RECOVERY] Message ID lookup failed (${idErr.message}). Falling back to scan...`);
      }
    }

    // 2. Scan recent chat messages from @${BOT_USERNAME} for the exact document ID
    try {
      const recentMsgs = await client.getMessages(BOT_USERNAME, { limit: 100 });
      for (const m of recentMsgs) {
        if (m.media?.document?.id?.toString() === docIdStr) {
          const freshRef = m.media.document.fileReference;
          if (freshRef) {
            console.log(`[FILE_REF RECOVERY] Found fresh fileReference in chat message ${m.id} for Doc ID: ${docIdStr}!`);
            if (dbRecord && dbRecord.queryKey) {
              db.set(dbRecord.queryKey, {
                ...dbRecord,
                msgId: m.id,
                fileReference: freshRef.toString('hex'),
                updatedAt: Date.now(),
              });
            }
            return freshRef;
          }
        }
      }
    } catch (scanErr) {
      console.warn('[FILE_REF RECOVERY] Chat scan error:', scanErr.message);
    }

    // 3. Search Telegram MTProto servers for historical media documents
    if (dbRecord) {
      let searchTerm = '';
      if (dbRecord.queryKey) {
        searchTerm = dbRecord.queryKey.replace(/_(?:720|1080)p$/i, '').trim();
      } else if (dbRecord.filename) {
        searchTerm = cleanSearchTitle(dbRecord.filename);
      }

      if (searchTerm) {
        console.log(`[FILE_REF RECOVERY] Searching server messages for "${searchTerm}" (Doc ID: ${docIdStr})...`);
        try {
          const serverDocs = await client.getMessages(BOT_USERNAME, {
            search: searchTerm,
            limit: 30,
            filter: new Api.InputMessagesFilterDocument(),
          }).catch(() => []);
          for (const m of serverDocs) {
            if (m.media?.document?.id?.toString() === docIdStr) {
              const freshRef = m.media.document.fileReference;
              if (freshRef) {
                console.log(`[FILE_REF RECOVERY] Successfully recovered fresh fileReference via MTProto server search (msgId: ${m.id})!`);
                if (dbRecord.queryKey) {
                  db.set(dbRecord.queryKey, {
                    ...dbRecord,
                    msgId: m.id,
                    fileReference: freshRef.toString('hex'),
                    updatedAt: Date.now(),
                  });
                }
                return freshRef;
              }
            }
          }
        } catch (searchErr) {
          console.warn('[FILE_REF RECOVERY] MTProto document search error:', searchErr.message);
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
async function streamTelegramPipelined(client, targetDoc, startByte, endByte, res, req, customChunkSize, customConcurrency, passedStreamKey, passedQualityTier) {
  // Map requested chunkSize / mode to MTProto block size and concurrency
  let CHUNK_SIZE = 512 * 1024; // 512KB: Native Telegram MTProto block limit
  let CONCURRENCY = (typeof customConcurrency === 'number' && customConcurrency >= 1) ? customConcurrency : 4;

  if (req?.query?.concurrency) {
    const c = parseInt(req.query.concurrency, 10);
    if (!isNaN(c) && c >= 1 && c <= 16) CONCURRENCY = c;
  } else if (req?.query?.mode === 'eco' || customChunkSize === 262144) {
    CONCURRENCY = 2; // Eco: 2 parallel calls (1.0 MB in-flight)
  } else if (req?.query?.mode === 'turbo' || customChunkSize === 1048576) {
    CONCURRENCY = 6; // Turbo: 6 parallel calls (3.0 MB in-flight)
  } else if (req?.query?.mode === 'ultra' || customChunkSize === 2097152) {
    CONCURRENCY = 8; // Ultra: 8 parallel calls (4.0 MB in-flight)
  }

  const docTotalSize = Number(targetDoc.size || 0);
  const isTailMetadata = docTotalSize > 0 && startByte >= docTotalSize - 10 * 1024 * 1024;
  const isProbe = req?.headers?.['x-internal-probe'] === '1' || req?.query?.probe === '1' || (endByte - startByte <= 1048576) || isTailMetadata;
  const isInternal = req?.headers?.['x-internal-transcoder'] === '1' || req?.query?.direct === '1';
  const parentSessionKey = req?.headers?.['x-parent-session'] || req?.query?.parentSession;
  const clientIdentity = resolveClientIdentity(req?.headers?.['x-forwarded-for'] || req?.ip || req?.socket?.remoteAddress, req);
  if (isProbe) {
    CONCURRENCY = Math.min(CONCURRENCY, 3); // Fast metadata & cues retrieval without timeout
  }

  const streamKey = passedStreamKey || `${isInternal ? (parentSessionKey ? `worker-${parentSessionKey}` : `internal-${Date.now()}`) : clientIdentity.ip}:${targetDoc.id}`;

  if (!isInternal && !isProbe && activeStreams.has(streamKey)) {
    const existing = activeStreams.get(streamKey);
    if (existing && existing.isSocketOpen && existing.abort !== abortPipeline) {
      console.log(`[PIPELINE ABORT PREVIOUS] Aborting existing active stream for [${clientIdentity.name} (${clientIdentity.ip})] key ${streamKey}`);
      try { existing.abort(); } catch (e) {}
    }
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
    const qualityTier = passedQualityTier || detectVideoQualityTier(mediaName, '', targetDoc);
    const isPrefetchOverlapped = savedSettings.overlapPrefetch !== false;
    activeStreams.set(streamKey, {
      sessionKey: streamKey,
      ip: clientIdentity.ip,
      clientName: clientIdentity.name,
      docId: targetDoc.id.toString(),
      filename: mediaName,
      qualityTier,
      concurrency: CONCURRENCY,
      isPrefetchOverlapped,
      mode: 'Direct Native',
      createdAt: activeStreams.get(streamKey)?.createdAt || Date.now(),
      lastActive: Date.now(),
      isSocketOpen: true,
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
      const entry = activeStreams.get(streamKey);
      if (entry && entry.abort === abortPipeline) {
        entry.isSocketOpen = false;
        // Keep session in activeStreams marked as IDLE so dashboard displays Idle / Paused status
        // during the 5-minute grace period. The 5-minute idle watchdog or /api/stream/close will evict it.
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
    let senderAcquisitionPromise = null;

    async function getOrAcquireSender(targetDc, forceReconnect = false) {
      if (aborted) return null;
      if (!forceReconnect && sender && sender.isConnected() && sender.dcId === targetDc) {
        return sender;
      }
      if (!senderAcquisitionPromise) {
        senderAcquisitionPromise = (async () => {
          try {
            if (forceReconnect && sender) {
              try { await sender.disconnect().catch(() => {}); } catch {}
              sender = null;
            }
            const s = await client.getSender(targetDc);
            sender = s;
            return s;
          } finally {
            senderAcquisitionPromise = null;
          }
        })();
      }
      return await senderAcquisitionPromise;
    }

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
    const isPinnedBlock = blockIdx <= 3 || blockIdx >= totalDocBlocks - 4;

    try {
      if (aborted) return null;
      sender = await getOrAcquireSender(dcId);
      if (aborted || !sender) return null;
      const result = await client.invokeWithSender(request, sender);
      if (aborted) return null;
      const bytes = result.bytes;
      if (bytes && bytes.length > 0) {
        setCachedBlock(docIdStr, blockIdx, bytes, isPinnedBlock);
      }
      return bytes;
    } catch (err) {
      if (aborted) return null;
      const msg = `${err.errorMessage || ''} ${err.message || ''}`;
      const dcMatch = msg.match(/(?:FILE_MIGRATE_|stored in DC\s*)(\d+)/i);
      const newDc = err.newDc || err.dc || (dcMatch ? parseInt(dcMatch[1], 10) : null);
      if (newDc) {
        console.log(`[STREAM MIGRATE] Document lives on DC ${newDc} (was ${dcId}). Re-routing...`);
        dcId = newDc;
        targetDoc.dcId = newDc;
        if (aborted) return null;
        sender = await getOrAcquireSender(newDc, true);
        if (aborted || !sender) return null;
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
        if (aborted) return null;

        let retryDelay = 500;
        for (let reconnAttempt = 0; reconnAttempt < 3; reconnAttempt++) {
          if (aborted) return null;
          try {
            sender = await getOrAcquireSender(dcId, true);
            if (aborted || !sender) return null;
            const result = await client.invokeWithSender(request, sender);
            if (aborted) return null;
            const bytes = result.bytes;
            if (bytes && bytes.length > 0) {
              setCachedBlock(docIdStr, blockIdx, bytes, isPinnedBlock);
            }
            return bytes;
          } catch (e2) {
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
          sender = await getOrAcquireSender(dcId);
          if (aborted || !sender) return null;
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

  let nextBlockToFetch = startBlock + 1;
  const touchActive = () => {
    const s = activeStreams.get(streamKey);
    if (s) s.lastActive = Date.now();
  };

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

  // 1. Overlapped Prefetching Delivery:
  // Concurrently fetch startBlock AND immediately trigger prefetching for subsequent blocks when enabled.
  // When startBlock arrives and streams to the player, upcoming blocks (startBlock + 1..)
  // are already in-flight or completed, eliminating the ~200ms initial playback stall!
  const isOverlapPrefetchEnabled = savedSettings.overlapPrefetch !== false;
  const firstBlockPromise = fetchBlockWithRetry(startBlock);
  if (startBlock < endBlock && isOverlapPrefetchEnabled) {
    fillPipeline();
  }

  let firstBlockData = await firstBlockPromise;
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
    await writeWithBackpressure(res, firstBlockData.subarray(firstSliceStart, firstSliceEnd), touchActive);
  }
  firstBlockData = null; // Explicitly release 512KB buffer immediately for GC

  if (startBlock === endBlock) {
    return;
  }

  // 2. Sliding-Window Pipeline for subsequent blocks

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
      await writeWithBackpressure(res, slice, touchActive);
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

    // Check if files under server/tg-streamer/ were modified
    const commits = payload.commits || [];
    let serverFilesChanged = false;
    for (const c of commits) {
      const allModified = [...(c.added || []), ...(c.modified || [])];
      if (allModified.some(f => f.startsWith('server/tg-streamer/'))) {
        serverFilesChanged = true;
        break;
      }
    }

    if (!serverFilesChanged && commits.length > 0) {
      console.log('[WEBHOOK] No changes in server/tg-streamer/ detected in this push.');
      return res.json({ msg: 'No server changes detected' });
    }

    console.log('[WEBHOOK] Changes detected in server/tg-streamer/! Triggering auto-deployment...');
    res.json({ msg: 'Deployment initiated' });

    // Download latest files from GitHub and restart service
    setTimeout(async () => {
      try {
        const fs = await import('fs');
        const repo = payload.repository?.full_name || 'jefrimustapa/tmdb-app';
        const rawBase = `https://raw.githubusercontent.com/${repo}/main/server/tg-streamer`;

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
// Cache for probed media details (audio track specifier, videoCodec, isHevc, etc.) per docId (capped to prevent memory growth)
const docMediaDetailsCache = new Map();

async function resolveMediaDetails(docId, parentSessionKey) {
  if (docMediaDetailsCache.has(docId)) {
    return docMediaDetailsCache.get(docId);
  }

  const ffprobeBin = process.env.FFPROBE_PATH || (fs.existsSync('/opt/bin/ffprobe') ? '/opt/bin/ffprobe' : 'ffprobe');
  const probeHeaders = ['x-internal-probe: 1'];
  if (parentSessionKey) {
    probeHeaders.push(`x-parent-session: ${parentSessionKey}`);
  }
  const probeArgs = [
    '-v', 'error',
    '-seekable', '1',
    '-reconnect', '1',
    '-reconnect_streamed', '1',
    '-headers', probeHeaders.join('\r\n') + '\r\n',
    '-probesize', '524288',
    '-analyzeduration', '1000000',
    '-show_entries', 'stream=index,codec_type,codec_name,codec_tag_string:stream_tags=language,title',
    '-of', 'json',
    `http://127.0.0.1:${INTERNAL_HTTP_PORT}/stream/${docId}?direct=1&probe=1`,
  ];

  try {
    const details = await new Promise((resolve, reject) => {
      let stdout = '';
      let proc = null;
      try {
        proc = spawn(ffprobeBin, probeArgs);
      } catch (e) {
        return reject(e);
      }

      const timer = setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch {}
        reject(new Error('ffprobe timeout after 15s'));
      }, 15000);

      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) return reject(new Error(`ffprobe exited with code ${code}`));
        try {
          const data = JSON.parse(stdout);
          const videoStream = data.streams?.find(s => s.codec_type === 'video');
          const videoCodec = (videoStream?.codec_name || '').toLowerCase();
          const videoTag = (videoStream?.codec_tag_string || '').toLowerCase();
          const width = videoStream?.width ? Number(videoStream.width) : 0;
          const height = videoStream?.height ? Number(videoStream.height) : 0;
          const isHevc = videoCodec === 'hevc' || videoCodec === 'h265' || videoTag === 'hvc1';
          const isLegacyVideo = /^(mpeg4|msmpeg4v3|wmv3|flv1|vp6f)$/i.test(videoCodec);

          const audioStreams = data.streams?.filter(s => s.codec_type === 'audio') || [];
          let audioSpec = '0:a:0';
          if (audioStreams.length === 1) {
            audioSpec = `0:${audioStreams[0].index}`;
          } else if (audioStreams.length > 1) {
            const engStream = audioStreams.find(s => {
              const lang = String(s.tags?.language || '').toLowerCase();
              const title = String(s.tags?.title || '').toLowerCase();
              return /^(en|eng|english)$/.test(lang) || /\b(eng|english|original|orig)\b/.test(title);
            });
            if (engStream) {
              audioSpec = `0:${engStream.index}`;
            } else {
              const origStream = audioStreams.find(s => {
                const lang = String(s.tags?.language || '').toLowerCase();
                const title = String(s.tags?.title || '').toLowerCase();
                return /^(und|qaa)$/.test(lang) || /\b(orig|original)\b/.test(title);
              });
              audioSpec = origStream ? `0:${origStream.index}` : `0:${audioStreams[0].index}`;
            }
          }

          if (videoCodec) {
            db.updateVideoCodec(docId, videoCodec);
          }
          if (height) {
            db.updateVideoDimensions(docId, width, height);
          }

          console.log(`[MEDIA PROBE] Doc ${docId} probed: videoCodec=${videoCodec || 'none'} (isHevc: ${isHevc}), dimensions=${width}x${height}, audioTrack=${audioSpec}`);
          return resolve({
            audioMapSpecifier: audioSpec,
            videoCodec,
            isHevc,
            isLegacyVideo,
            width,
            height,
          });
        } catch (err) {
          reject(err);
        }
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    if (docMediaDetailsCache.size > 500) {
      const firstKey = docMediaDetailsCache.keys().next().value;
      docMediaDetailsCache.delete(firstKey);
    }
    docMediaDetailsCache.set(docId, details);
    return details;
  } catch (err) {
    console.warn(`[MEDIA PROBE WARN] Failed to resolve media details for doc ${docId} (${err.message}). Using defaults.`);
    return {
      audioMapSpecifier: '0:a:0',
      videoCodec: '',
      isHevc: false,
      isLegacyVideo: false,
    };
  }
}

// Backward compatibility alias for resolveBestAudioTrack
async function resolveBestAudioTrack(docId, parentSessionKey) {
  const details = await resolveMediaDetails(docId, parentSessionKey);
  return details.audioMapSpecifier;
}


// Endpoint to immediately evict a stream on explicit client exit (e.g. Back button to Detail page)
app.all('/api/stream/close', (req, res) => {
  const docId = req.query.docId || req.body?.docId;
  const clientIdentity = resolveClientIdentity(req.headers['x-forwarded-for'] || req.ip || req.socket?.remoteAddress, req);
  let closedCount = 0;

  for (const [key, stream] of activeStreams.entries()) {
    const matchDoc = !docId || String(stream.docId) === String(docId);
    const matchIp = stream.ip === clientIdentity.ip || key.startsWith(`${clientIdentity.ip}:`);
    if (matchDoc && matchIp) {
      console.log(`[API STREAM CLOSE] Explicit close for [${clientIdentity.name} (${clientIdentity.ip})] key: ${key}`);
      try { stream.abort(); } catch {}
      activeStreams.delete(key);
      closedCount++;
    }
  }

  if (activeStreams.size === 0) {
    scheduleIdleMemoryPurge();
  }

  res.json({ success: true, closed: closedCount });
});

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

    // Only cancel if previous stream was an active transcode process replaced by a seek query (?ss=)
    const existingStream = activeStreams.get(streamSessionKey);
    if (!isInternal && existingStream && existingStream.isSocketOpen && existingStream.mode?.includes('Transcode') && req.query.ss !== undefined) {
      console.log(`[STREAM CANCEL] Terminating previous transcode stream for [${clientIdentity.name} (${clientIdentity.ip})] doc ${docId} on new seek.`);
      try { existingStream.abort(); } catch {}
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
      const docHeight = dbRecord.height || docMediaDetailsCache.get(docId)?.height || null;
      const docWidth = dbRecord.width || docMediaDetailsCache.get(docId)?.width || null;
      const docAttrs = [new Api.DocumentAttributeFilename({ fileName: dbRecord.filename || filename })];
      if (docHeight) {
        docAttrs.push(new Api.DocumentAttributeVideo({ w: docWidth || 1280, h: docHeight, duration: 0 }));
      }
      targetDoc = new Api.Document({
        id: bigInt(dbRecord.docId || docId),
        accessHash: bigInt(dbRecord.accessHash || '0'),
        fileReference: Buffer.from(String(dbRecord.fileReference || ''), 'hex'),
        date: dbRecord.date || Math.floor(Date.now() / 1000),
        mimeType: dbRecord.mimeType || 'video/mp4',
        size: bigInt(dbRecord.size || '0'),
        dcId: dbRecord.dcId || 2,
        attributes: docAttrs,
      });
      targetMedia = new Api.MessageMediaDocument({ document: targetDoc });
      filename = dbRecord.filename || filename;
      fileSize = Number(dbRecord.size || 0);
      mimeType = dbRecord.mimeType || 'video/mp4';
    } else {
      // 2. Fallback: Search recent bot messages
      const msgs = await client.getMessages(BOT_USERNAME, { limit: 20 });
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

    // OPTION C: On-demand Audio & Video Transcoding Pipe (?transcode=audio|video or automatic for .avi / hevc)
    // Streams Matroska/fMP4 with audio transcoded to stereo AAC and legacy AVI/MPEG4/HEVC video transcoded to H.264 Baseline
    const isAvi = /\.avi$/i.test(filename);
    const isHevcFilename = /\b(x265|hevc|h265)\b/i.test(filename);
    let isHevc = isHevcFilename || dbRecord?.videoCodec === 'hevc' || dbRecord?.videoCodec === 'h265';

    // If not known yet, check in-memory cache or probe media details before serving to prevent serving raw HEVC to Chrome
    if (!isInternalTranscoder && !isAvi && !isHevc) {
      const memCached = docMediaDetailsCache.get(docId);
      if (memCached?.isHevc) {
        isHevc = true;
      } else if (!dbRecord?.videoCodec) {
        try {
          const probed = await resolveMediaDetails(docId, streamSessionKey);
          if (probed?.isHevc) {
            isHevc = true;
          }
        } catch (probeErr) {
          console.warn(`[CODEC PROBE WARN] Failed to probe doc ${docId}:`, probeErr.message);
        }
      }
    }

    const isMp4 = /\.mp4$/i.test(filename);
    const isMkv = /\.mkv$/i.test(filename);
    const isDesktopWeb = isDesktopWebClient(req);
    const isMobileDevice = isMobileClient(req);

    const transcodeSetting = savedSettings.videoTranscodeMode || 'disabled';
    const isAudioTranscodeRequested = req.query.transcode === 'audio';
    const isVideoTranscodeRequested = req.query.transcode === 'video';
    let autoVideoTranscodeNeeded = false;
    if (transcodeSetting === 'desktop_hevc') {
      autoVideoTranscodeNeeded = isDesktopWeb && (isAvi || isHevc);
    } else if (transcodeSetting === 'always') {
      autoVideoTranscodeNeeded = isAvi || isHevc;
    }

    const shouldTranscode = !isInternalTranscoder && (
      isAudioTranscodeRequested ||
      isVideoTranscodeRequested ||
      autoVideoTranscodeNeeded
    );

    if (shouldTranscode) {
      const seekSec = Math.max(0, parseFloat(req.query.ss) || 0);
      const detectedTier = detectVideoQualityTier(filename, '', targetDoc);
      const tierConcurrency = (savedSettings.pipelineBuffers && savedSettings.pipelineBuffers[detectedTier]) || DEFAULT_PIPELINE_BUFFERS[detectedTier] || 4;

      let mediaDetails = { audioMapSpecifier: '0:a:0', videoCodec: '', isHevc: false, isLegacyVideo: false };
      try {
        mediaDetails = await resolveMediaDetails(docId, streamSessionKey);
      } catch (err) {
        mediaDetails = { audioMapSpecifier: '0:a:0', videoCodec: '', isHevc: false, isLegacyVideo: false };
      }

      let needsVideoTranscode = false;
      if (transcodeSetting === 'desktop_hevc') {
        needsVideoTranscode = isDesktopWeb && (isAvi || req.query.vcodec === 'h264' || isHevc || mediaDetails.isHevc || mediaDetails.isLegacyVideo);
      } else if (transcodeSetting === 'always') {
        needsVideoTranscode = isAvi || req.query.vcodec === 'h264' || isHevc || mediaDetails.isHevc || mediaDetails.isLegacyVideo;
      }

      const isMp4Source = /\.mp4$/i.test(filename);
      const isMkvSource = /\.mkv$/i.test(filename);
      // Container Selection:
      // When stream-copying video (-c:v copy), preserve original container format:
      // MKV sources MUST stay Matroska (-f matroska) to preserve B-frame DTS/PTS alignment.
      // MP4 sources stay Fragmented MP4 (-f mp4).
      // When video is actively re-encoded to H.264 baseline, Fragmented MP4 is universally supported.
      const useMp4Muxer = isMp4Source || (needsVideoTranscode && !isMkvSource);
      const outputMime = useMp4Muxer ? 'video/mp4' : 'video/x-matroska';
      const outputExt = useMp4Muxer ? 'mp4' : 'mkv';

      console.log(`[TRANSCODE ${needsVideoTranscode ? 'VIDEO H264' : 'AUDIO (Direct Video Copy)'}] Starting transcode for [${clientIdentity.name} (${clientIdentity.ip})] doc ${docId} (${filename}, Container: ${outputExt.toUpperCase()}, Tier: ${detectedTier.toUpperCase()} [${tierConcurrency}x512KB]) at ${seekSec}s...`);

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
      let audioMapSpecifier = mediaDetails.audioMapSpecifier;
      if (requestedTrack && requestedTrack !== 'auto') {
        audioMapSpecifier = requestedTrack.startsWith('0:') ? requestedTrack : `0:${requestedTrack}`;
      }

      // Video encoding strategy:
      // For AVI / legacy video or HEVC on desktop web (when transcode enabled): use baseline libx264.
      // For standard streams and direct copy mode: stream-copy 1:1 (-c:v copy, 0% CPU).
      const videoThreadCount = (mediaDetails.isHevc || isHevc) ? '2' : '1';
      const videoArgs = needsVideoTranscode
        ? [
            '-threads', videoThreadCount,
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

      const muxerArgs = useMp4Muxer
        ? ['-f', 'mp4', '-movflags', 'frag_keyframe+empty_moov+default_base_moof']
        : ['-flush_packets', '1', '-cluster_time_limit', '1000', '-cluster_size_limit', '524288', '-f', 'matroska'];

      const ffmpegBin = process.env.FFMPEG_PATH || (fs.existsSync('/opt/bin/ffmpeg') ? '/opt/bin/ffmpeg' : 'ffmpeg');
      // When stream copying (-c:v copy) with seeking, use -noaccurate_seek so audio starts on the exact same keyframe as the video stream
      const inputSeekFlags = seekSec > 0
        ? ['-ss', seekSec.toString(), '-noaccurate_seek', '-seekable', '1']
        : ['-seekable', '1'];
      const inputDecoderThreads = (needsVideoTranscode && (mediaDetails.isHevc || isHevc)) ? ['-threads', '2'] : [];
      const ffmpegArgs = [
        '-loglevel', 'error',
        ...inputDecoderThreads,
        ...inputSeekFlags,
        '-headers', `x-internal-transcoder: 1\r\nx-parent-session: ${streamSessionKey}\r\n`,
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '2',
        '-probesize', '1000000',
        '-analyzeduration', '1000000',
        '-fflags', '+nobuffer+flush_packets',
        '-i', `http://127.0.0.1:${INTERNAL_HTTP_PORT}/stream/${docId}?direct=1&concurrency=${tierConcurrency}`,
        '-map', '0:v:0',
        '-map', audioMapSpecifier,
        ...videoArgs,
        '-c:a', 'aac',
        '-ac', '2',
        '-b:a', '128k',
        '-af', 'aresample=async=1:first_pts=0',
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
        ffmpegProc,
        ip: clientIdentity.ip,
        clientName: clientIdentity.name,
        docId,
        filename,
        qualityTier: detectedTier,
        concurrency: tierConcurrency,
        isPrefetchOverlapped: savedSettings.overlapPrefetch !== false,
        mode: `${detectedTier.toUpperCase()} Transcode (${needsVideoTranscode ? (mediaDetails.isHevc || isHevc ? 'HEVC->H264' : 'Video H264') : 'Direct Video Copy + Stereo AAC'})`,
        createdAt: activeStreams.get(streamSessionKey)?.createdAt || Date.now(),
        lastActive: Date.now(),
        isSocketOpen: true,
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
        transcodeEntry.abort();
        if (activeStreams.get(streamSessionKey) === transcodeEntry) {
          transcodeEntry.isSocketOpen = false;
        }
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
          transcodeEntry.lastActive = Date.now();
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

    // Detect video resolution quality tier (sd, 720p, 1080p, 4k) based on ACTUAL media (never downgraded by requested queryKey)
    const detectedTier = detectVideoQualityTier(filename, '', targetDoc);
    const tierConcurrency = (savedSettings.pipelineBuffers && savedSettings.pipelineBuffers[detectedTier]) || DEFAULT_PIPELINE_BUFFERS[detectedTier] || 4;

    // Parse user-specified chunk size / pipeline mode from query parameter (for debug or backward compatibility)
    const parsedChunk = parseInt(req.query.chunkSize, 10);
    const downloadChunkSize = [262144, 524288, 1048576, 2097152].includes(parsedChunk) ? parsedChunk : 524288;

    if (res.socket) {
      try {
        res.socket.setNoDelay(true);
        res.socket.setKeepAlive(true, 15000);
      } catch {}
    }

    if (!rangeHeader) {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': mimeType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache, no-store, no-transform',
        'X-Accel-Buffering': 'no',
        'Content-Disposition': `inline; filename="${encodeURIComponent(filename)}"`,
      });
      console.log(`[STREAM REQ] [${clientIdentity.name} (${clientIdentity.ip})] ${req.method} Full Stream -> 0 to ${fileSize - 1} (${fileSize} bytes, Tier: ${detectedTier.toUpperCase()} [${tierConcurrency}x512KB])`);
      await streamTelegramPipelined(client, targetDoc, 0, fileSize - 1, res, req, downloadChunkSize, tierConcurrency, streamSessionKey, detectedTier);
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
      console.log(`[STREAM REQ] [${clientIdentity.name} (${clientIdentity.ip})] ${req.method} Range: "${rangeHeader}" -> start: ${start}, end: ${end} (${chunkSize} bytes, Tier: ${detectedTier.toUpperCase()} [${tierConcurrency}x512KB])`);
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': mimeType,
        'Cache-Control': 'no-cache, no-store, no-transform',
        'X-Accel-Buffering': 'no',
        'Content-Disposition': `inline; filename="${encodeURIComponent(filename)}"`,
      });

      await streamTelegramPipelined(client, targetDoc, start, end, res, req, downloadChunkSize, tierConcurrency, streamSessionKey, detectedTier);
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
    code === 'EMFILE' ||
    code === 'ENFILE' ||
    msg.includes('EMFILE') ||
    msg.includes('ENFILE') ||
    msg.includes('too many open files') ||
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
    msg.includes('ETIMEDOUT') ||
    msg.includes('EMFILE') ||
    msg.includes('ENFILE') ||
    msg.includes('too many open files') ||
    msg.includes('hanging states')
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
          console.warn(`[SERVER] Telegram not connected on startup (${err.message}). Web auth portal ready at /tg/auth.`);
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
          console.warn(`[SERVER] Telegram not connected on startup (${err.message}). Web auth portal ready at /tg/auth.`);
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
        console.warn(`[SERVER] Telegram not connected on startup (${err.message}). Web auth portal ready at /tg/auth.`);
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
  DEFAULT_PIPELINE_BUFFERS,
  detectVideoQualityTier,
  BaseResolver,
  MsmResolver,
  PencuriResolver,
  createResolver,
  listResolvers,
  getResolverClass,
  extractEpisodeInfo,
  extractSeasonInfo,
  cleanBotEchoHeader,
  cleanSearchTitle,
  isBareButton,
  scoreCandidateButton,
  scoreCandidateButtonWithReason,
  parseSizeFromText,
  generateSeriesSearchQueries,
  calculateTitleCoverage,
  normalizeTitle,
  extractSignificantTokens,
  extractYear,
  extractSequelInfo,
  isAllowedTitleSuffix,
  validateTitleBoundaries,
  createGeoBlockMiddleware,
  isMalaysiaIp,
  isPrivateIp,
  checkGeoAccess,
  savedSettings,
  isJunkMedia,
  JUNK_MEDIA_REGEX,
};
