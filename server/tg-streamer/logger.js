// Global Timestamped Console Logger & Kernel Compatibility Patch
// Loaded as the very first import to ensure all module initializations are timestamped,
// critical runtime shims are active, and logs are teed to both stdout and disk.

import fs from 'fs';
import path from 'path';
import util from 'util';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Patch fs access/existsSync to prevent libuv/glibc faccessat segfault on ASUS Linux 4.1.52 / Node 18
const safeExistsSync = (filePath) => {
  try {
    fs.statSync(filePath);
    return true;
  } catch {
    return false;
  }
};

const safeAccessSync = (filePath) => {
  fs.statSync(filePath);
};

const safeAccess = (filePath, ...args) => {
  const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : () => {};
  fs.stat(filePath, (err) => cb(err));
};

fs.existsSync = safeExistsSync;
fs.accessSync = safeAccessSync;
fs.access = safeAccess;

if (fs.promises) {
  fs.promises.access = async (filePath) => {
    await fs.promises.stat(filePath);
  };
}

export const MAX_LOG_BYTES = 5 * 1024 * 1024; // 5 MB cap

export function getLogFilePath() {
  if (process.env.LOG_FILE) return process.env.LOG_FILE;
  if (process.env.DATA_DIR) return path.join(process.env.DATA_DIR, 'tg-streamer.log');
  if (fs.existsSync('/data')) return '/data/tg-streamer.log';
  if (fs.existsSync('/tmp/tg-streamer.log')) return '/tmp/tg-streamer.log';
  return process.platform === 'win32' ? path.join(__dirname, 'tg-streamer.log') : '/tmp/tg-streamer.log';
}

export function getLogTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `[${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}]`;
}

let currentLogSize = -1;

export function resetLogSizeCache() {
  currentLogSize = -1;
}

export function rotateLogFile(logPath) {
  try {
    if (!fs.existsSync(logPath)) return;
    const stat = fs.statSync(logPath);
    if (stat.size < MAX_LOG_BYTES) return;

    // Read up to last 1MB of log file to extract last 2,000 lines
    const readBytes = Math.min(stat.size, 1024 * 1024);
    const startPos = stat.size - readBytes;
    const buf = Buffer.alloc(readBytes);
    let fd;
    try {
      fd = fs.openSync(logPath, 'r');
      fs.readSync(fd, buf, 0, readBytes, startPos);
    } finally {
      if (fd !== undefined) {
        try { fs.closeSync(fd); } catch {}
      }
    }
    const lines = buf.toString('utf8').split(/\r?\n/);
    const keptLines = lines.slice(-2000).join('\n') + '\n';

    const oldPath = `${logPath}.old`;
    fs.writeFileSync(oldPath, keptLines, 'utf8');
    fs.writeFileSync(logPath, '', 'utf8');
    currentLogSize = 0;
  } catch {
    // Fail-safe: rotation errors must never crash the service
  }
}

export function appendToLogFile(text) {
  if (process.env.DISABLE_FILE_LOGGING === 'true') return;
  try {
    const logPath = getLogFilePath();
    if (!logPath) return;

    const dir = path.dirname(logPath);
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch {}
    }

    if (currentLogSize < 0) {
      currentLogSize = fs.existsSync(logPath) ? fs.statSync(logPath).size : 0;
    }

    const payload = text.endsWith('\n') ? text : text + '\n';
    const payloadBytes = Buffer.byteLength(payload, 'utf8');

    if (currentLogSize + payloadBytes >= MAX_LOG_BYTES) {
      rotateLogFile(logPath);
    }

    fs.appendFileSync(logPath, payload, 'utf8');
    currentLogSize += payloadBytes;
  } catch {
    // Fail-safe: file logging errors must never crash the service
  }
}

if (!global.__LOGGER_INITIALIZED__) {
  global.__LOGGER_INITIALIZED__ = true;
  const origLog = console.log.bind(console);
  const origWarn = console.warn.bind(console);
  const origError = console.error.bind(console);
  const origInfo = console.info.bind(console);

  function logBoth(origFn, args) {
    const ts = getLogTimestamp();
    const formatted = util.format(...args);
    const line = args.length > 0 ? `${ts} ${formatted}` : ts;
    origFn(ts, ...args);
    appendToLogFile(line);
  }

  console.log = (...args) => logBoth(origLog, args);
  console.warn = (...args) => logBoth(origWarn, args);
  console.error = (...args) => logBoth(origError, args);
  console.info = (...args) => logBoth(origInfo, args);
}
