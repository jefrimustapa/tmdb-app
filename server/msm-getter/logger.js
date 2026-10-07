// Global Timestamped Console Logger & Kernel Compatibility Patch
// Loaded as the very first import to ensure all module initializations are timestamped
// and critical runtime shims are active before any other module loads.

import fs from 'fs';

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

function getLogTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `[${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}]`;
}

if (!global.__LOGGER_INITIALIZED__) {
  global.__LOGGER_INITIALIZED__ = true;
  const origLog = console.log.bind(console);
  const origWarn = console.warn.bind(console);
  const origError = console.error.bind(console);
  const origInfo = console.info.bind(console);

  console.log = (...args) => origLog(getLogTimestamp(), ...args);
  console.warn = (...args) => origWarn(getLogTimestamp(), ...args);
  console.error = (...args) => origError(getLogTimestamp(), ...args);
  console.info = (...args) => origInfo(getLogTimestamp(), ...args);
}
