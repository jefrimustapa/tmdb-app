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

if (!apiId || !apiHash) {
  console.error('[ERROR] TG_API_ID or TG_API_HASH missing from .env!');
}

let client = new TelegramClient(new StringSession(session), apiId, apiHash, {
  connection: ConnectionTCPObfuscated,
  connectionRetries: 5,
  deviceModel: 'MSM Getter Server',
  appVersion: '1.0.0',
  systemVersion: 'Linux/Docker',
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

  // 1. Check Central Database first (Instant < 1ms response, 0 bot queries)
  const cached = db.get(cacheKey);
  if (cached) {
    console.log(`[RESOLVE] Central DB Cache HIT for "${cacheKey}" -> Doc ID: ${cached.docId}`);
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
    const cachedAfterQueue = db.get(cacheKey);
    if (cachedAfterQueue) {
      return cachedAfterQueue;
    }

    // Check if matching document was recently delivered in chat
    const recentMsgs = await client.getMessages('msm32bot', { limit: 25 });
    const normSearch = normalizeTitle(title);
    const titleTokens = normSearch.split(' ').filter(t => t.length > 2);

    for (const msg of recentMsgs) {
      if (msg.media?.document) {
        const doc = msg.media.document;
        const fnAttr = doc.attributes?.find(a => a.className === 'DocumentAttributeFilename');
        const filename = fnAttr ? fnAttr.fileName : msg.message;
        const normFn = normalizeTitle(filename);

        const matchesAllTokens = titleTokens.length > 0 && titleTokens.every(t => normFn.includes(t));
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
          const hasTarget = epKeywords.some(kw => normFn.includes(kw));
          if (!hasTarget) {
            matchesEpisode = false;
          } else {
            const otherEpMatch = normFn.match(/\b(s\d+e(\d+)|e(\d+)|episod\s*(\d+))\b/);
            if (otherEpMatch) {
              const foundNum = parseInt(otherEpMatch[2] || otherEpMatch[3] || otherEpMatch[4], 10);
              if (!isNaN(foundNum) && foundNum !== eNum) {
                matchesEpisode = false;
              }
            }
          }
        }

        if (matchesAllTokens && matchesEpisode) {
          const docIdStr = doc.id.toString();
          console.log(`[RESOLVE] Found matching recent document in chat: ${filename} (ID: ${docIdStr})`);
          const streamItem = db.set(cacheKey, {
            docId: docIdStr,
            accessHash: doc.accessHash?.toString() || '',
            fileReference: doc.fileReference ? doc.fileReference.toString('hex') : '',
            filename,
            size: doc.size?.toString() || '0',
            mimeType: doc.mimeType || 'video/mp4',
            dcId: doc.dcId || 4,
            date: doc.date,
          });
          return streamItem;
        }
      }
    }

    // Prepare prioritized search queries
    const searchQueries = [];
    if (isTv) {
      searchQueries.push(`${title} S${sPadded}E${epPadded}`);
      searchQueries.push(`${title} E${epPadded}`);
      searchQueries.push(`${title} Episod ${eNum}`);
      searchQueries.push(title);
    } else {
      if (year) searchQueries.push(`${title} ${year}`);
      searchQueries.push(title);
    }

    let targetMsgId = null;
    let targetButtonId = null;
    let fallbackShortcode = null;
    let chosenFilename = null;
    let sentMsgId = 0;

    for (const sq of searchQueries) {
      console.log(`[RESOLVE] Querying @msm32bot with: "${sq}"...`);
      const sentMsg = await client.sendMessage('msm32bot', { message: sq });
      sentMsgId = sentMsg.id;

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
                      const otherEpMatch = normBtnText.match(/\b(s\d+e(\d+)|e(\d+)|episod\s*(\d+))\b/);
                      if (otherEpMatch) {
                        const foundNum = parseInt(otherEpMatch[2] || otherEpMatch[3] || otherEpMatch[4], 10);
                        if (!isNaN(foundNum) && foundNum !== eNum) {
                          score -= 500;
                        }
                      }
                    }
                  }

                  if (btnText.includes('1080p')) score += 20;
                  else if (btnText.includes('720p')) score += 10;
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

// Stream endpoint with HTTP 206 Partial Content Range support
app.get('/stream/:docId', async (req, res) => {
  try {
    await initTelegram();
    const docId = req.params.docId;
    const rangeHeader = req.headers.range;

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
        dcId: dbRecord.dcId || 4,
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

    // Parse user-specified chunk size from query parameter (e.g. ?chunkSize=262144)
    const parsedChunk = parseInt(req.query.chunkSize, 10);
    const validChunkSizes = [131072, 262144, 524288, 1048576]; // 128KB, 256KB, 512KB, 1MB
    const downloadChunkSize = validChunkSizes.includes(parsedChunk) ? parsedChunk : 512 * 1024;

    if (!rangeHeader) {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': mimeType,
        'Accept-Ranges': 'bytes',
        'Content-Disposition': `inline; filename="${encodeURIComponent(filename)}"`,
      });

      const iter = client.iterDownload({
        file: targetMedia,
        requestSize: downloadChunkSize,
      });

      for await (const chunk of iter) {
        if (res.destroyed || res.writableEnded) break;
        res.write(chunk);
      }
      if (!res.writableEnded) res.end();
    } else {
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize) {
        res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
        return res.end();
      }

      const chunkSize = (end - start) + 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': mimeType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(filename)}"`,
      });

      let offset = bigInt(start);
      let bytesLeft = chunkSize;
      let aborted = false;

      req.on('close', () => { aborted = true; });

      const iter = client.iterDownload({
        file: targetMedia,
        offset,
        limit: bytesLeft,
        requestSize: downloadChunkSize,
      });

      for await (const chunk of iter) {
        if (aborted || res.destroyed || res.writableEnded) break;
        res.write(chunk);
      }
      if (!res.writableEnded) res.end();
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

app.listen(port, async () => {
  console.log(`[SERVER] MSM Getter microservice listening on port ${port}`);
  try {
    await initTelegram();
  } catch (err) {
    console.warn(`[SERVER] Telegram not connected on startup (${err.message}). Web auth portal ready at /auth.`);
  }
});
