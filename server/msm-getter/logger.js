// Global Timestamped Console Logger
// Loaded as the very first import to ensure all module initializations are timestamped

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
