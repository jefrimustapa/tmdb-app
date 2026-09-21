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
import bigInt from 'big-integer';
import axios from 'axios';
import fs from 'fs';
import { db } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
app.set('trust proxy', true);
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 3033;
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
  connectionRetries: 5,
  deviceModel: 'MSM Getter Server',
  appVersion: '1.0.0',
  systemVersion: 'Linux/ASUS',
});

let isConnected = false;
let authError = null;

async function initTelegram() {
  if (!isConnected) {
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
  }
}

// In-flight request deduplication map: key = cacheKey -> Promise
const inFlightResolutions = new Map();

// Sequential FIFO mutex queue for Telegram bot operations
let resolveMutex = Promise.resolve();
function queueTelegramTask(taskFn) {
  const next = resolveMutex.then(taskFn, taskFn);
  resolveMutex = next.catch(() => {});
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
  const s = ` ${str.toLowerCase()} `;
  // Roman numerals: ii -> 2, iii -> 3, iv -> 4, v -> 5, vi -> 6
  const romanMatch = s.match(/\b(?:part|chapter|musim|season)?\s*(ii|iii|iv|v|vi)\b/i);
  if (romanMatch) {
    const map = { ii: 2, iii: 3, iv: 4, v: 5, vi: 6 };
    return map[romanMatch[1].toLowerCase()] || null;
  }
  // Explicit Arabic numbers: e.g. " 2 ", " 3 ", " 4 ", "part 2", "part 3", "2.0"
  const numMatch = s.match(/\b(?:part|chapter|musim|season)?\s*([2-9])(?:\.0)?\b/i);
  if (numMatch) {
    return parseInt(numMatch[1], 10);
  }
  return null;
}

// Helper: Extract 4-digit release year from a string
function extractYear(str) {
  if (!str) return null;
  const m = str.match(/\b(19\d\d|20[0-3]\d)\b/);
  return m ? parseInt(m[1], 10) : null;
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
    });

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

// System Stats Endpoint (Uptime, Memory RSS, Active Streams, Log Size)
app.get('/api/system/stats', (req, res) => {
  const mem = process.memoryUsage();
  let logSizeKB = 0;
  try {
    const logPath = getLogFilePath();
    if (fs.existsSync(logPath)) {
      logSizeKB = Math.round(fs.statSync(logPath).size / 1024);
    }
  } catch {}
  res.json({
    status: 'ok',
    uptime: Math.round(process.uptime()),
    isConnected,
    cachedStreams: db.size(),
    activeStreams: activeStreams.size,
    authError: authError || null,
    memory: {
      rssMB: Math.round(mem.rss / (1024 * 1024)),
      heapUsedMB: Math.round(mem.heapUsed / (1024 * 1024)),
      heapTotalMB: Math.round(mem.heapTotal / (1024 * 1024)),
    },
    logSizeKB,
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
    const fd = fs.openSync(logPath, 'r');
    fs.readSync(fd, buffer, 0, readLength, startPos);
    fs.closeSync(fd);

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
        const readLen = curSize - lastSize;
        const buf = Buffer.alloc(readLen);
        const fd = fs.openSync(logPath, 'r');
        fs.readSync(fd, buf, 0, readLen, lastSize);
        fs.closeSync(fd);
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
  <div class="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
    <div class="p-3 rounded-xl bg-slate-900 border border-slate-800/80">
      <span class="text-[10px] text-slate-400 font-semibold block uppercase tracking-wider">Status</span>
      <div class="flex items-center gap-2 mt-1">
        <span id="metricDot" class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
        <span id="metricStatus" class="text-xs font-bold text-emerald-400">Online</span>
      </div>
    </div>
    <div class="p-3 rounded-xl bg-slate-900 border border-slate-800/80">
      <span class="text-[10px] text-slate-400 font-semibold block uppercase tracking-wider">Uptime</span>
      <span id="metricUptime" class="text-xs font-bold font-mono text-white mt-1 block">--</span>
    </div>
    <div class="p-3 rounded-xl bg-slate-900 border border-slate-800/80">
      <span class="text-[10px] text-slate-400 font-semibold block uppercase tracking-wider">Node RAM (RSS)</span>
      <span id="metricRam" class="text-xs font-bold font-mono text-sky-400 mt-1 block">-- MB</span>
    </div>
    <div class="p-3 rounded-xl bg-slate-900 border border-slate-800/80">
      <span class="text-[10px] text-slate-400 font-semibold block uppercase tracking-wider">Active Streams</span>
      <span id="metricStreams" class="text-xs font-bold font-mono text-white mt-1 block">0 active</span>
    </div>
    <div class="p-3 rounded-xl bg-slate-900 border border-slate-800/80 col-span-2 sm:col-span-1">
      <span class="text-[10px] text-slate-400 font-semibold block uppercase tracking-wider">Log File Size</span>
      <span id="metricLogSize" class="text-xs font-bold font-mono text-slate-300 mt-1 block">-- KB</span>
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

    function formatLine(line) {
      const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
        document.getElementById('metricRam').textContent = (d.memory?.rssMB || 0) + ' MB';
        document.getElementById('metricStreams').textContent = (d.activeStreams || 0) + ' active';
        document.getElementById('metricLogSize').textContent = (d.logSizeKB || 0) + ' KB';
        if (d.isConnected) {
          document.getElementById('metricDot').className = 'w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse';
          document.getElementById('metricStatus').textContent = 'Online';
        } else {
          document.getElementById('metricDot').className = 'w-2.5 h-2.5 rounded-full bg-rose-400';
          document.getElementById('metricStatus').textContent = 'Offline';
        }
      } catch {}
    }

    fetchInitialLogs();
    connectSSE();
    pollMetrics();
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

// Resolver endpoint: /api/resolve?title=Kelas+Cikgu+Hiragi&season=1&episode=1
app.get('/api/resolve', async (req, res) => {
  const { title, year, season, episode, maxQuality = '720', force, refresh } = req.query;
  if (!title) {
    return res.status(400).json({ success: false, error: 'Missing title query parameter' });
  }

  const shouldBypassCache = force === 'true' || refresh === 'true';
  const targetQuality = parseInt(maxQuality, 10) || 720;
  const sNum = season ? parseInt(season, 10) : NaN;
  const eNum = episode ? parseInt(episode, 10) : NaN;
  const isTv = !isNaN(sNum) && !isNaN(eNum);
  const sPadded = isTv ? String(sNum).padStart(2, '0') : '';
  const epPadded = isTv ? String(eNum).padStart(2, '0') : '';
  const tvTag = isTv ? `S${sPadded}E${epPadded}` : '';

  const queryTitle = isTv ? `${title} ${tvTag}` : `${title} ${year || ''}`.trim();
  const baseCacheKey = normalizeTitle(isTv ? `${title} ${tvTag}` : `${title} ${year || ''}`);
  const qualitySuffix = targetQuality <= 720 ? '_720p' : '_1080p';
  const cacheKey = `${baseCacheKey}${qualitySuffix}`;

  console.log(`[RESOLVE] Request: "${queryTitle}" (isTv: ${isTv}, maxQuality: ${targetQuality}, bypassCache: ${shouldBypassCache}, cacheKey: "${cacheKey}")`);

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
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // 3. Queue resolution through sequential FIFO mutex to prevent Telegram chat interleaving
  const resolvePromise = queueTelegramTask(async () => {
    await initTelegram();

    // Re-check Central DB after waiting in queue
    if (!shouldBypassCache) {
      const cachedAfterQueue = db.get(cacheKey);
      if (cachedAfterQueue) {
        return cachedAfterQueue;
      }
    }

    // Check if matching document was recently delivered in chat
    const recentMsgs = await client.getMessages('msm32bot', { limit: 25 });
    const titleTokens = extractTitleTokens(title);
    const targetSequel = extractSequelInfo(title);
    const targetYear = parseInt(year, 10) || extractYear(title);
    const matchingRecentDocs = [];

    for (const msg of recentMsgs) {
      if (msg.media?.document) {
        const doc = msg.media.document;
        const fnAttr = doc.attributes?.find(a => a.className === 'DocumentAttributeFilename');
        const filename = fnAttr ? fnAttr.fileName : msg.message;
        const normFn = normalizeTitle(filename);

        const matchesAllTokens = titleTokens.length > 0 && titleTokens.every(t => normFn.includes(t));
        let matchesCandidate = matchesAllTokens;

        if (isTv) {
          const epKeywords = [
            `s${sPadded}e${epPadded}`,
            `s${sNum}e${epPadded}`,
            `s${sPadded}e${eNum}`,
            `ep${epPadded}`,
            `ep ${epPadded}`,
            `ep ${eNum}`,
            `episod ${eNum}`,
            `episod ${epPadded}`,
            `episode ${eNum}`,
            `episode ${epPadded}`,
            `e${epPadded}`,
          ];
          const hasTarget = epKeywords.some(kw => normFn.includes(kw));
          if (!hasTarget) {
            matchesCandidate = false;
          } else {
            const otherEpMatch = normFn.match(/\b(s\d+e(\d+)|e(\d+)|ep\s*(\d+)|episod\s*(\d+)|episode\s*(\d+))\b/);
            if (otherEpMatch) {
              const foundNum = parseInt(otherEpMatch[2] || otherEpMatch[3] || otherEpMatch[4] || otherEpMatch[5] || otherEpMatch[6], 10);
              if (!isNaN(foundNum) && foundNum !== eNum) {
                matchesCandidate = false;
              }
            }
          }

          // Season validation: prevent Season 1 files matching Season 2+, and vice-versa
          if (sNum > 1) {
            const hasSeason1 = normFn.match(/\b(s0?1|season\s*1|musim\s*1)\b/);
            const hasTargetSeason = normFn.match(new RegExp(`\\b(s0?${sNum}|season\\s*${sNum}|musim\\s*${sNum})\\b`));
            if (hasSeason1 && !hasTargetSeason) {
              matchesCandidate = false;
            }
          } else if (sNum === 1) {
            const hasHigherSeason = normFn.match(/\b(s0?[2-9]|season\s*[2-9]|musim\s*[2-9])\b/);
            if (hasHigherSeason) {
              matchesCandidate = false;
            }
          }
        } else {
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
          const docYear = extractYear(filename);
          if (targetYear && docYear && Math.abs(targetYear - docYear) > 1) {
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

    // Prepare prioritized search queries
    // For series: specific episode tags first to get clean 1-page results without pagination clutter
    const searchQueries = [];
    if (isTv) {
      if (sNum > 1) {
        searchQueries.push(`${title} Season ${sNum}`);
        searchQueries.push(`${title} S${sNum}E${epPadded}`);
        searchQueries.push(`${title} S${sPadded}E${epPadded}`);
        searchQueries.push(`${title} S${sNum}`);
        searchQueries.push(`${title} S${sPadded}`);
        searchQueries.push(`${title} EP${epPadded}`);
        searchQueries.push(`${title} Musim ${sNum}`);
        searchQueries.push(title);
      } else {
        // Season 1 or single-season series: specific episode queries first
        searchQueries.push(`${title} EP${epPadded}`);
        searchQueries.push(`${title} Episod ${eNum}`);
        searchQueries.push(`${title} Episod ${epPadded}`);
        searchQueries.push(`${title} S01E${epPadded}`);
        searchQueries.push(`${title} E${epPadded}`);
        searchQueries.push(`${title} Season 1`);
        searchQueries.push(title);
        if (year) searchQueries.push(`${title} ${year}`);
      }
    } else {
      if (year) searchQueries.push(`${title} ${year}`);
      searchQueries.push(title);
    }

    let targetMsgId = null;
    let targetButtonId = null;
    let fallbackShortcode = null;
    let chosenFilename = null;
    let sentMsgId = 0;

    // Helper: Score a candidate download button
    function scoreButton(btn, msg) {
      if (btn.className !== 'KeyboardButtonUrlAuth' || !btn.url) return -999;
      const btnText = (btn.text || '').toLowerCase();
      const normBtnText = normalizeTitle(btnText);
      const msgText = (msg.message || '').toLowerCase();
      const normMsgText = normalizeTitle(msgText);
      const combinedNorm = `${normMsgText} ${normBtnText}`;

      let score = 0;

      if (isTv) {
        const epKeywords = [
          `s${sPadded}e${epPadded}`,
          `s${sNum}e${epPadded}`,
          `s${sPadded}e${eNum}`,
          `ep${epPadded}`,
          `ep ${epPadded}`,
          `ep ${eNum}`,
          `episod ${eNum}`,
          `episod ${epPadded}`,
          `episode ${eNum}`,
          `episode ${epPadded}`,
          `e${epPadded}`,
        ];
        const hasTargetEp = epKeywords.some(kw => normBtnText.includes(kw));

        if (hasTargetEp) {
          score += 100;
        } else {
          const otherEpMatch = normBtnText.match(/\b(s\d+e(\d+)|e(\d+)|ep\s*(\d+)|episod\s*(\d+)|episode\s*(\d+))\b/);
          if (otherEpMatch) {
            const foundNum = parseInt(otherEpMatch[2] || otherEpMatch[3] || otherEpMatch[4] || otherEpMatch[5] || otherEpMatch[6], 10);
            if (!isNaN(foundNum) && foundNum !== eNum) {
              score -= 500;
            }
          } else {
            score -= 150;
          }
        }

        // Strict Season validation across button and parent message
        if (sNum > 1) {
          const hasSeason1 = combinedNorm.match(/\b(s0?1|season\s*1|musim\s*1)\b/);
          const hasTargetSeason = combinedNorm.match(new RegExp(`\\b(s0?${sNum}|season\\s*${sNum}|musim\\s*${sNum})\\b`));
          if (hasSeason1 && !hasTargetSeason) {
            score -= 500;
          } else if (hasTargetSeason) {
            score += 80;
          }
        } else if (sNum === 1) {
          const hasHigherSeason = combinedNorm.match(/\b(s0?[2-9]|season\s*[2-9]|musim\s*[2-9])\b/);
          if (hasHigherSeason) {
            score -= 500;
          }
        }
      } else {
        // Movie validation: Sequel and Release Year Alignment
        const targetSequel = extractSequelInfo(title);
        const btnSequel = extractSequelInfo(btnText) || extractSequelInfo(msgText);
        if (targetSequel) {
          if (btnSequel === targetSequel) {
            score += 150; // Strong reward for matching target sequel number
          } else if (btnSequel) {
            score -= 600; // Heavy penalty for wrong sequel number
          } else {
            score -= 400; // Heavy penalty if candidate lacks sequel number
          }
        } else {
          // Target is original without sequel number -> reject candidates with sequel numbers
          if (btnSequel) {
            score -= 600;
          }
        }

        const targetYear = parseInt(year, 10) || extractYear(title);
        const btnYear = extractYear(btnText) || extractYear(msgText);
        if (targetYear && btnYear) {
          if (Math.abs(targetYear - btnYear) <= 1) {
            score += 90; // Reward matching release year
          } else {
            score -= 450; // Heavy penalty for conflicting release year
          }
        }
      }

      // Title relevance check: award bonus if title tokens appear in message caption or button
      if (titleTokens.length > 0) {
        const matchingTokens = titleTokens.filter(t => combinedNorm.includes(t));
        if (matchingTokens.length > 0) {
          score += Math.min(60, matchingTokens.length * 20);
        } else {
          score -= 300;
        }
      }

      // Quality preference
      if (targetQuality <= 720) {
        if (btnText.includes('720p') || btnText.includes('720')) score += 50;
        else if (btnText.includes('540p') || btnText.includes('480p') || btnText.includes('360p')) score += 30;
        else if (btnText.includes('1080p') || btnText.includes('1080')) score += 5;
        else if (btnText.includes('2160p') || btnText.includes('4k')) score -= 50;
      } else {
        if (btnText.includes('1080p') || btnText.includes('1080')) score += 50;
        else if (btnText.includes('720p') || btnText.includes('720')) score += 30;
      }
      if (btnText.toLowerCase().includes('.mp4') || btnText.toLowerCase().includes('mp4')) score += 35;
      if (btnText.includes('malaysub') || btnText.includes('msm')) score += 5;

      return score;
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

    for (const sq of searchQueries) {
      console.log(`[RESOLVE] Querying @msm32bot with: "${sq}"...`);
      const sentMsg = await client.sendMessage('msm32bot', { message: sq });
      sentMsgId = sentMsg.id;

      let noResults = false;

      for (let i = 0; i < 5; i++) {
        await new Promise(r => setTimeout(r, 1500));
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
              const MAX_PAGES = 3;

              while (currentMsg && pageCount < MAX_PAGES) {
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
                if (hasGoodMatch || pageCount >= MAX_PAGES) break;

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

        if (noResults) break;

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
      if (fallbackCached) {
        console.log(`[RESOLVE] 720p not found from bot, falling back to cached 1080p stream for "${baseCacheKey}"`);
        return fallbackCached;
      }
      const err = new Error(`No downloadable media found for "${queryTitle}" on @msm32bot`);
      err.status = 404;
      throw err;
    }

    console.log(`[RESOLVE] Authorizing button (msgId: ${targetMsgId}, buttonId: ${targetButtonId})...`);
    const authRes = await client.invoke(new Api.messages.RequestUrlAuth({
      peer: 'msm32bot',
      msgId: targetMsgId,
      buttonId: targetButtonId,
    }));

    const authUrl = authRes.url;
    console.log('[RESOLVE] Authorized URL generated successfully.');

    // Execute Ad-Gate HTTP handshake
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

    console.log(`[RESOLVE] Stepping through ad-gate: ${authUrl}...`);
    const step1 = await axios.get(authUrl, {
      maxRedirects: 0,
      timeout: 10000,
      validateStatus: (s) => s >= 200 && s < 400,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    processSetCookies(step1.headers['set-cookie']);

    const redirectPath = step1.headers['location'] || (authUrl.match(/\/link\/[^\s&?]+/)?.[0] || '/');
    const targetUrl = new URL(redirectPath, authUrl).toString();

    const step2 = await axios.get(targetUrl, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Cookie: Array.from(cookieMap.entries()).map(([k, v]) => `${k}=${v}`).join('; '),
        Referer: authUrl,
      },
    });
    processSetCookies(step2.headers['set-cookie']);

    const html = step2.data || '';
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
        timeout: 10000,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Cookie: Array.from(cookieMap.entries()).map(([k, v]) => `${k}=${v}`).join('; '),
          Referer: targetUrl,
        },
      });
    }

    console.log(`[RESOLVE] Waiting for media delivery from @msm32bot (newer than msgId: ${sentMsgId})...`);
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
      const err = new Error(`Timeout waiting for media delivery from @msm32bot for "${queryTitle}"`);
      err.status = 504;
      throw err;
    }

    const docIdStr = deliveredDoc.id.toString();
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
    console.error('[RESOLVE ERROR]', err);
    const status = err.status || (err.message?.includes('AUTH_KEY_DUPLICATED') ? 401 : 500);
    return res.status(status).json({ success: false, error: err.message });
  }
});

// In-Memory LRU Block Cache for Telegram MTProto Stream Chunks
// Caches up to 16 blocks (8 MB RAM) to eliminate seek latency while protecting router RAM from exhaustion.
const BLOCK_CACHE_MAX_ENTRIES = 16; // 16 x 512KB = 8 MB
const globalBlockCache = new Map();
const activeStreams = new Map(); // key: docId -> { abort: Function }

function getCachedBlock(docId, blockIdx) {
  const key = `${docId}:${blockIdx}`;
  if (globalBlockCache.has(key)) {
    const data = globalBlockCache.get(key);
    globalBlockCache.delete(key);
    globalBlockCache.set(key, data);
    return data;
  }
  return null;
}

function setCachedBlock(docId, blockIdx, data) {
  if (!data || data.length === 0) return;
  const key = `${docId}:${blockIdx}`;
  if (globalBlockCache.has(key)) {
    globalBlockCache.delete(key);
  } else if (globalBlockCache.size >= BLOCK_CACHE_MAX_ENTRIES) {
    const oldestKey = globalBlockCache.keys().next().value;
    globalBlockCache.delete(oldestKey);
  }
  globalBlockCache.set(key, data);
}

/**
 * Write a buffer chunk to the HTTP response with strict TCP backpressure.
 * Pauses upstream fetching if the client's network buffer is full.
 */
function writeWithBackpressure(res, chunk) {
  if (res.destroyed || res.writableEnded) return Promise.resolve();
  if (res.write(chunk)) return Promise.resolve();
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

    // 2. If not found in recent chat, search by filename or queryKey via bot
    const dbRecord = db.getByDocId(docIdStr);
    if (dbRecord) {
      const searchTerm = dbRecord.filename
        ? dbRecord.filename.replace(/\.mp4|\.mkv|\.avi/gi, '').replace(/[^\w\s]/gi, ' ').replace(/\s+/g, ' ').trim()
        : dbRecord.queryKey;

      if (searchTerm) {
        console.log(`[FILE_REF RECOVERY] Re-querying bot with: "${searchTerm}" for Doc ID: ${docIdStr}...`);
        try {
          await client.sendMessage('msm32bot', { message: searchTerm });
          await new Promise(r => setTimeout(r, 2000));
          const msgs = await client.getMessages('msm32bot', { limit: 15 });
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
        } catch (qErr) {
          console.warn('[FILE_REF RECOVERY] Bot re-query error:', qErr.message);
        }
      }
    }

    console.warn(`[FILE_REF RECOVERY] Unable to refresh fileReference for Doc ID: ${docIdStr}`);
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
async function streamTelegramPipelined(client, targetDoc, startByte, endByte, res, req, customChunkSize, customConcurrency) {
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

  let dcId = targetDoc.dcId || 2;
  let sender = await client.getSender(dcId);
  const fileRef = Buffer.isBuffer(targetDoc.fileReference)
    ? targetDoc.fileReference
    : Buffer.from(String(targetDoc.fileReference || ''), 'hex');

  const location = new Api.InputDocumentFileLocation({
    id: bigInt(targetDoc.id),
    accessHash: bigInt(targetDoc.accessHash),
    fileReference: fileRef,
    thumbSize: '',
  });

  const startBlock = Math.floor(startByte / CHUNK_SIZE);
  const endBlock = Math.floor(endByte / CHUNK_SIZE);

  let aborted = false;
  let activeBlock = startBlock;
  req.on('close', () => {
    aborted = true;
    console.log(`[PIPELINE CLOSED by client] active: block ${activeBlock}/${endBlock}, aborted remaining blocks.`);
  });

  console.log(`[PIPELINE START] blocks ${startBlock}..${endBlock} (${endBlock - startBlock + 1} blocks), concurrency: ${CONCURRENCY}, chunkSize: ${CHUNK_SIZE / 1024}KB`);

  async function fetchBlock(blockIdx) {
    if (aborted) return null;

    // 1. Check in-memory LRU cache (0ms instant lookup)
    const cached = getCachedBlock(targetDoc.id.toString(), blockIdx);
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

    try {
      sender = await client.getSender(sender?.dcId || dcId);
      const result = await client.invokeWithSender(request, sender);
      const bytes = result.bytes;
      if (bytes && bytes.length > 0) {
        setCachedBlock(targetDoc.id.toString(), blockIdx, bytes);
      }
      return bytes;
    } catch (err) {
      const msg = `${err.errorMessage || ''} ${err.message || ''}`;
      const dcMatch = msg.match(/(?:FILE_MIGRATE_|stored in DC\s*)(\d+)/i);
      const newDc = err.newDc || err.dc || (dcMatch ? parseInt(dcMatch[1], 10) : null);
      if (newDc) {
        console.log(`[STREAM MIGRATE] Document lives on DC ${newDc} (was ${dcId}). Re-routing...`);
        dcId = newDc;
        targetDoc.dcId = newDc;
        sender = await client.getSender(newDc);
        const result = await client.invokeWithSender(request, sender);
        const bytes = result.bytes;
        if (bytes && bytes.length > 0) {
          setCachedBlock(targetDoc.id.toString(), blockIdx, bytes);
        }
        return bytes;
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
          sender = await client.getSender(sender?.dcId || dcId);
          const result = await client.invokeWithSender(request, sender);
          const bytes = result.bytes;
          if (bytes && bytes.length > 0) {
            setCachedBlock(targetDoc.id.toString(), blockIdx, bytes);
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
  const inFlight = new Map();

  const clientSession = req?.headers?.['x-client-id'] || req?.ip || req?.socket?.remoteAddress || 'client';
  const streamKey = `${clientSession}:${targetDoc.id}`;
  activeStreams.set(streamKey, {
    abort: () => {
      aborted = true;
      inFlight.clear();
    }
  });

  const cleanupStream = () => {
    if (activeStreams.get(streamKey)) {
      activeStreams.delete(streamKey);
    }
  };
  req.on('close', cleanupStream);
  res.on('finish', cleanupStream);

  // 1. First-Chunk Express Delivery:
  // Immediately fetch & send the first block alone with 100% bandwidth.
  // This allows the video decoder to display frames instantly (< 300ms) after seek without waiting for parallel chunks.
  const firstBlockData = await fetchBlockWithRetry(startBlock);
  if (aborted || res.destroyed || res.writableEnded) {
    cleanupStream();
    return;
  }
  if (!firstBlockData || firstBlockData.length === 0) {
    if (!res.writableEnded) res.end();
    cleanupStream();
    return;
  }

  const firstBlockStart = startBlock * CHUNK_SIZE;
  const firstSliceStart = Math.max(0, startByte - firstBlockStart);
  const firstSliceEnd = Math.min(firstBlockData.length, (endByte - firstBlockStart) + 1);
  if (firstSliceStart < firstSliceEnd) {
    await writeWithBackpressure(res, firstBlockData.subarray(firstSliceStart, firstSliceEnd));
  }

  if (startBlock === endBlock) {
    if (!res.writableEnded) res.end();
    cleanupStream();
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

  cleanupStream();
  if (!res.writableEnded) {
    res.end();
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
          fs.writeFileSync(path.join(__dirname, 'index.js'), idxRes.data, 'utf-8');
        }

        console.log(`[AUTO-DEPLOY] Downloading latest db.js from ${rawBase}/db.js...`);
        const dbRes = await axios.get(`${rawBase}/db.js`, { responseType: 'text', timeout: 15000 }).catch(() => null);
        if (dbRes?.data && dbRes.data.length > 200) {
          fs.writeFileSync(path.join(__dirname, 'db.js'), dbRes.data, 'utf-8');
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

// Stream endpoint with HTTP 206 Partial Content Range support
app.get('/stream/:docId', async (req, res) => {
  try {
    await initTelegram();
    const docId = req.params.docId;
    const rangeHeader = req.headers.range;

    // Instantly terminate any previous in-flight stream pipeline for this document for the same client session (e.g. user seeked forward)
    // to free 100% of the router's MTProto download bandwidth for the new seek position immediately.
    const clientSession = req.headers['x-client-id'] || req.ip || req.socket.remoteAddress || 'client';
    const streamSessionKey = `${clientSession}:${docId}`;
    if (activeStreams.has(streamSessionKey)) {
      console.log(`[STREAM CANCEL] Terminating previous in-flight stream for client ${clientSession} doc ${docId} on new seek.`);
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
        id: bigInt(dbRecord.docId),
        accessHash: bigInt(dbRecord.accessHash),
        fileReference: Buffer.from(dbRecord.fileReference, 'hex'),
        date: dbRecord.date || Math.floor(Date.now() / 1000),
        mimeType: dbRecord.mimeType || 'video/mp4',
        size: bigInt(dbRecord.size),
        dcId: dbRecord.dcId || 2,
        attributes: [new Api.DocumentAttributeFilename({ fileName: dbRecord.filename })],
      });
      targetMedia = new Api.MessageMediaDocument({ document: targetDoc });
      filename = dbRecord.filename;
      fileSize = Number(dbRecord.size);
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
          fileSize = Number(targetDoc.size);
          mimeType = targetDoc.mimeType || 'video/mp4';
          break;
        }
      }
    }

    if (!targetDoc || !targetMedia) {
      return res.status(404).send('Media document not found or expired from recent bot messages');
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
      await streamTelegramPipelined(client, targetDoc, 0, fileSize - 1, res, req, downloadChunkSize);
    } else {
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize) {
        res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
        return res.end();
      }

      const chunkSize = (end - start) + 1;
      console.log(`[STREAM REQ] ${req.method} Range: "${rangeHeader}" -> start: ${start}, end: ${end} (${chunkSize} bytes, chunkParam: ${req.query.chunkSize || 'default'})`);
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': mimeType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(filename)}"`,
      });

      await streamTelegramPipelined(client, targetDoc, start, end, res, req, downloadChunkSize);
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
  if (err.code === 'ECONNRESET' || err.code === 'EPIPE' || err.code === 'ERR_STREAM_WRITE_AFTER_END') return;
  console.error('[FATAL EXCEPTION]', err);
});

process.on('unhandledRejection', (reason) => {
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

let serverInstance;

if (sslCertFile && sslKeyFile) {
  try {
    const sslOptions = {
      key: fs.readFileSync(sslKeyFile),
      cert: fs.readFileSync(sslCertFile),
    };
    serverInstance = https.createServer(sslOptions, app);
    serverInstance.listen(port, async () => {
      console.log(`[SERVER] MSM Getter microservice listening securely on HTTPS port ${port} (cert: ${sslCertFile})`);
      try {
        await initTelegram();
      } catch (err) {
        console.warn(`[SERVER] Telegram not connected on startup (${err.message}). Web auth portal ready at /auth.`);
      }
    });
  } catch (sslErr) {
    console.error('[SERVER SSL ERROR] Failed to initialize HTTPS server, falling back to HTTP:', sslErr);
    serverInstance = http.createServer(app);
    serverInstance.listen(port, async () => {
      console.log(`[SERVER] MSM Getter microservice fallback listening on HTTP port ${port}`);
      try {
        await initTelegram();
      } catch (err) {
        console.warn(`[SERVER] Telegram not connected on startup (${err.message}). Web auth portal ready at /auth.`);
      }
    });
  }
} else {
  serverInstance = http.createServer(app);
  serverInstance.listen(port, async () => {
    console.log(`[SERVER] MSM Getter microservice listening on HTTP port ${port}`);
    try {
      await initTelegram();
    } catch (err) {
      console.warn(`[SERVER] Telegram not connected on startup (${err.message}). Web auth portal ready at /auth.`);
    }
  });
}
