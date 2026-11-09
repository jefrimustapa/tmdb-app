#!/usr/bin/env node
/**
 * Stress test for TGStrm: ramps up concurrent virtual players and measures Telegram -> server -> client (issue #331).
 *
 * Each step runs N virtual players (HTTP Range streams of real files from the central DB) for --duration seconds and records:
 *   - end to end (client side): TTFB, startup, delivered Mbps, stalls (a simulated player buffer that drains at the quality bitrate)
 *   - Telegram -> server: one server-measured speed-test probe taken while the step is under load (/api/speedtest, metrics.telegramMbps),
 *     plus first-block latency and FLOOD/auth errors parsed from the server log
 *   - server -> client: /api/speedtest/download baseline (RAM bytes, no Telegram) at the start of the step
 *   - server health every 2 s: CPU, RAM, active streams, Telegram connection
 * The ramp stops at the first sign of trouble (see STOP RULES) and a markdown + JSON report is written.
 *
 * Usage: node scripts/stress-test.mjs --base http://192.168.0.120:3033 [options]
 *   --base <url>        TGStrm base URL (default http://127.0.0.1:3033)
 *   --tier <720p|1080p|4k>  quality of the files to stream (default 1080p)
 *   --steps <list>      concurrent players per step, e.g. 2,4,6,8,10,20 (default)
 *   --duration <sec>    seconds per step (default 30)
 *   --mode <paced|full> paced = player-like (reads ahead max 30 s, drains at the tier bitrate); full = read as fast as possible
 *   --cooldown <sec>    pause between steps (default 15)
 *   --min-size-mb <n>   only use files at least this big (default 300)
 *   --out <dir>         report folder (default ./stress-reports)
 *   --dry-run           only check connectivity and list the plan, no streaming
 * STOP RULES (checked while a step runs and after it): Telegram disconnected or authError, FLOOD in the server log,
 *   error rate > 5 %, TTFB p95 > 8 s, more than 20 % of players with > 10 % stall time, server CPU > 90 % or RAM > 85 % of its cap.
 */
import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';

const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};

const BASE = String(opt('base', 'http://127.0.0.1:3033')).replace(/\/+$/, '');
const TIER = String(opt('tier', '1080p')).toLowerCase();
const STEPS = String(opt('steps', '2,4,6,8,10,20')).split(',').map(s => parseInt(s, 10)).filter(n => n > 0);
const DURATION_S = Number(opt('duration', 30));
const MODE = String(opt('mode', 'paced'));
const COOLDOWN_S = Number(opt('cooldown', 15));
const MIN_SIZE = Number(opt('min-size-mb', 300)) * 1024 * 1024;
const OUT_DIR = String(opt('out', './stress-reports'));
const DRY_RUN = opt('dry-run', false) === true;

const TIER_MBPS = { '720p': 3, '1080p': 5, '4k': 15 };
const BITRATE_BPS = (TIER_MBPS[TIER] || 5) * 1e6 / 8;
const PLAYBACK_BUFFER_CAP = BITRATE_BPS * 30; // read-ahead of a real player
const STARTUP_BYTES = BITRATE_BPS * 2; // playback starts with 2 s buffered
const REBUFFER_BYTES = BITRATE_BPS * 1;

const agentOpts = { keepAlive: true, maxSockets: 256 };
const httpAgent = new http.Agent(agentOpts);
const httpsAgent = new https.Agent(agentOpts);
const lib = u => (u.protocol === 'https:' ? https : http);
const agentFor = u => (u.protocol === 'https:' ? httpsAgent : httpAgent);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const pct = (arr, p) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const round = (n, d = 1) => (n === null || n === undefined || Number.isNaN(n) ? null : Math.round(n * 10 ** d) / 10 ** d);
const mbps = (bytes, ms) => (ms > 0 ? (bytes * 8) / (ms / 1000) / 1e6 : 0);

function getJson(url, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = lib(u).get(u, { agent: agentFor(u), timeout: timeoutMs, headers: { Accept: 'application/json' } }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', c => (body += c));
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(Object.assign(new Error(`HTTP ${res.statusCode} ${url}`), { status: res.statusCode }));
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    });
    req.on('timeout', () => req.destroy(new Error(`timeout ${url}`)));
    req.on('error', reject);
  });
}

/** Download a URL as fast as possible (optionally a Range); resolves with bytes, ms to first byte and total ms. */
function download(url, { range, maxMs = 120000 } = {}) {
  return new Promise(resolve => {
    const u = new URL(url);
    const t0 = Date.now();
    let bytes = 0, firstAt = null, done = false;
    const finish = extra => { if (done) return; done = true; resolve({ bytes, ttfbMs: firstAt === null ? null : firstAt - t0, totalMs: Date.now() - t0, ...extra }); };
    const req = lib(u).get(u, { agent: agentFor(u), headers: { 'Accept-Encoding': 'identity', ...(range ? { Range: range } : {}) } }, res => {
      if (res.statusCode >= 400) { res.resume(); return finish({ status: res.statusCode, error: `HTTP ${res.statusCode}` }); }
      res.on('data', c => { if (firstAt === null) firstAt = Date.now(); bytes += c.length; });
      res.on('end', () => finish({ status: res.statusCode }));
      res.on('error', e => finish({ error: e.message }));
    });
    req.setTimeout(maxMs, () => req.destroy(new Error('timeout')));
    req.on('error', e => finish({ error: e.message }));
  });
}

/** One virtual player: Range request, simulated playback buffer, stall accounting. */
class VirtualPlayer {
  constructor(id, file, durationMs) {
    this.id = id;
    this.file = file;
    this.durationMs = durationMs;
    this.received = 0;
    this.buffered = 0;
    this.playing = false;
    this.stalls = 0;
    this.stallMs = 0;
    this.inStall = false;
    this.startupMs = null;
    this.ttfbMs = null;
    this.firstAt = null;
    this.status = null;
    this.error = null;
    this.paused = false;
    this.burstBytes = 0;
    this.res = null;
    this.lastTick = 0;
  }

  run() {
    return new Promise(resolve => {
      const u = new URL(`${BASE}/stream/${this.file.docId}`);
      const span = Math.max(1, Math.floor((this.file.size * 0.6) / (1024 * 1024)));
      const offset = Math.floor(Math.random() * span) * 1024 * 1024; // random 1 MB aligned start, like a seek
      this.t0 = Date.now();
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        clearInterval(this.timer);
        clearTimeout(this.endTimer);
        try { this.res?.destroy(); this.req?.destroy(); } catch {}
        this.endedAt = Date.now();
        resolve(this);
      };
      this.req = lib(u).get(u, { agent: agentFor(u), headers: { Range: `bytes=${offset}-`, 'Accept-Encoding': 'identity' } }, res => {
        this.res = res;
        this.status = res.statusCode;
        if (res.statusCode >= 400) { this.error = `HTTP ${res.statusCode}`; res.resume(); return finish(); }
        res.on('data', chunk => {
          const now = Date.now();
          if (this.firstAt === null) { this.firstAt = now; this.ttfbMs = now - this.t0; this.lastTick = now; }
          this.received += chunk.length;
          if (now - this.firstAt <= 5000) this.burstBytes += chunk.length;
          this.buffered += chunk.length;
          if (MODE === 'paced' && this.buffered >= PLAYBACK_BUFFER_CAP && !this.paused) { this.paused = true; res.pause(); }
        });
        res.on('end', finish);
        res.on('error', e => { this.error = e.message; finish(); });
      });
      this.req.on('error', e => { this.error = e.message; finish(); });
      this.timer = setInterval(() => this.tick(), 200);
      this.endTimer = setTimeout(finish, this.durationMs);
    });
  }

  tick() {
    if (MODE !== 'paced' || this.firstAt === null) return;
    const now = Date.now();
    const dt = now - this.lastTick;
    this.lastTick = now;
    if (!this.playing) {
      if (this.buffered >= (this.startupMs === null ? STARTUP_BYTES : REBUFFER_BYTES)) {
        if (this.startupMs === null) this.startupMs = now - this.t0;
        this.playing = true;
        this.inStall = false;
      } else if (this.startupMs !== null) {
        this.stallMs += dt; // rebuffering after a stall
      }
    } else {
      const need = (BITRATE_BPS * dt) / 1000;
      if (this.buffered >= need) {
        this.buffered -= need;
      } else {
        this.buffered = 0;
        this.playing = false;
        this.stalls += 1;
        this.inStall = true;
      }
    }
    if (this.paused && this.buffered < PLAYBACK_BUFFER_CAP / 2) { this.paused = false; this.res?.resume(); }
  }

  summary() {
    const activeMs = Math.max(1, (this.endedAt || Date.now()) - (this.firstAt || this.t0));
    return {
      id: this.id,
      docId: this.file.docId,
      status: this.status,
      error: this.error,
      ttfbMs: this.ttfbMs,
      startupMs: this.startupMs,
      mb: round(this.received / 1048576, 1),
      avgMbps: round(mbps(this.received, activeMs)),
      burstMbps: round(mbps(this.burstBytes, Math.min(5000, activeMs))),
      stalls: this.stalls,
      stallPct: round((this.stallMs / Math.max(1, this.durationMs)) * 100),
    };
  }
}

async function fetchFiles() {
  const data = await getJson(`${BASE}/api/cache?quality=${encodeURIComponent(TIER)}`);
  const items = (data.items || []).filter(i => i.docId && i.size >= MIN_SIZE).sort((a, b) => b.size - a.size);
  return items.map(i => ({ docId: String(i.docId), filename: i.filename, size: i.size, dcId: i.dcId }));
}

const serverStats = () => getJson(`${BASE}/api/system/stats`, 8000);

async function logTail(lines = 4000) {
  try { return (await getJson(`${BASE}/api/logs?lines=${lines}`, 20000)).logs || []; } catch { return []; }
}

/** Lines written after the marker (the last line seen before the step); everything if the marker rolled out of the window. */
function linesAfter(tail, marker) {
  if (!marker) return tail;
  const idx = tail.lastIndexOf(marker);
  return idx === -1 ? tail : tail.slice(idx + 1);
}

function parseLog(lines) {
  const firstBlocks = [];
  const out = { flood: 0, authErrors: 0, timeouts: 0, fileRef: 0, pipelineEnds: 0, lines: lines.length };
  for (const l of lines) {
    const m = l.match(/\[PIPELINE FIRST BLOCK\].*arrived alone at (\d+)ms/);
    if (m) firstBlocks.push(Number(m[1]));
    if (/FLOOD/i.test(l)) out.flood += 1;
    if (/AUTH_KEY|SESSION_REVOKED|Not connected/i.test(l)) out.authErrors += 1;
    if (/TIMEOUT/i.test(l)) out.timeouts += 1;
    if (/FILE_REFERENCE/i.test(l)) out.fileRef += 1;
    if (/\[PIPELINE END\]/.test(l)) out.pipelineEnds += 1;
  }
  out.firstBlockP50 = pct(firstBlocks, 50);
  out.firstBlockP95 = pct(firstBlocks, 95);
  out.firstBlockCount = firstBlocks.length;
  return out;
}

/** Server-measured Telegram -> server probe (single-use speed-test session), taken while the step is under load. */
async function telegramProbe() {
  try {
    const t = await getJson(`${BASE}/api/speedtest/targets?tiers=${TIER}`);
    const target = t.targets?.[0];
    if (!target) return { error: `no speed-test sample for ${TIER}` };
    const dl = await download(`${BASE}/stream/${target.docId}?speedtest=${target.testId}`, { maxMs: 90000 });
    const r = await getJson(`${BASE}/api/speedtest/result?id=${target.testId}`);
    return { clientMbps: round(mbps(dl.bytes, dl.totalMs)), ...r.metrics, error: dl.error || null };
  } catch (e) {
    return { error: e.status === 429 ? 'speed-test budget exceeded (429)' : e.message };
  }
}

async function serverBaseline() {
  const dl = await download(`${BASE}/api/speedtest/download`, { maxMs: 60000 });
  if (dl.error) return { error: dl.error };
  return { mbps: round(mbps(dl.bytes, dl.totalMs)), mb: round(dl.bytes / 1048576, 1) };
}

function evaluate(step) {
  const reasons = [];
  const errs = step.players.filter(p => p.error || (p.status && p.status >= 400)).length;
  if (step.players.length && errs / step.players.length > 0.05) reasons.push(`error rate ${round((errs / step.players.length) * 100)}% (${errs}/${step.players.length})`);
  const ttfbs = step.players.map(p => p.ttfbMs).filter(v => v !== null);
  if (pct(ttfbs, 95) > 8000) reasons.push(`TTFB p95 ${pct(ttfbs, 95)}ms > 8000ms`);
  if (MODE === 'paced') {
    const bad = step.players.filter(p => p.stallPct > 10).length;
    if (step.players.length && bad / step.players.length > 0.2) reasons.push(`${bad}/${step.players.length} players stalled > 10% of the time`);
  }
  if (step.log.flood > 0) reasons.push(`FLOOD in server log (${step.log.flood})`);
  if (step.health.disconnected) reasons.push('Telegram disconnected / authError during the step');
  if (step.health.maxServiceCpu > 90) reasons.push(`service CPU peaked at ${step.health.maxServiceCpu}%`);
  if (step.health.maxRamPct > 85) reasons.push(`RAM at ${step.health.maxRamPct}% of cap`);
  return reasons;
}

function bottleneckHint(step) {
  const agg = step.aggregateMbps;
  const need = step.n * (TIER_MBPS[TIER] || 5);
  const base = step.baseline?.mbps;
  const tg = step.probe?.telegramMbps;
  if (MODE === 'paced') {
    if (step.players.every(p => p.stalls === 0)) return `OK: no stalls (needs ${need} Mbps total, burst delivered ${step.burstAggregateMbps} Mbps)`;
  }
  if (base && agg >= 0.85 * base) return 'network (server -> client) is the limit: delivery is close to the no-Telegram baseline';
  if (tg && tg < (need / Math.max(1, step.n)) * 1.5) return `Telegram -> server looks limiting (probe ${tg} Mbps under load)`;
  return 'inconclusive: below baseline but Telegram probe is fine, check server CPU / event loop and first-block latency';
}

async function runStep(n, files) {
  const marker = (await logTail(1)).slice(-1)[0] || null;
  const baseline = await serverBaseline();
  const players = [];
  const stats = [];
  let stopEarly = null;
  const poll = setInterval(async () => {
    try {
      const s = await serverStats();
      stats.push(s);
      if (s.isConnected === false || s.authError) stopEarly = 'Telegram disconnected / authError';
    } catch {}
  }, 2000);

  const t0 = Date.now();
  const runs = [];
  for (let i = 0; i < n; i++) {
    const p = new VirtualPlayer(i + 1, files[i % files.length], DURATION_S * 1000);
    players.push(p);
    runs.push(p.run());
    await sleep(300); // players do not start in the same millisecond
  }
  const probeTimer = sleep(Math.min(DURATION_S * 500, 12000)).then(telegramProbe); // mid-step, under load
  const abortWatch = setInterval(() => {
    if (stopEarly) players.forEach(p => { try { p.res?.destroy(); p.req?.destroy(); } catch {} });
  }, 1000);
  await Promise.all(runs);
  const probe = await probeTimer;
  clearInterval(abortWatch);
  clearInterval(poll);
  const wallMs = Date.now() - t0;

  const logLines = linesAfter(await logTail(5000), marker);
  const log = parseLog(logLines);
  const summaries = players.map(p => p.summary());
  const totalBytes = players.reduce((a, p) => a + p.received, 0);
  const burstBytes = players.reduce((a, p) => a + p.burstBytes, 0);
  const cpuSamples = stats.map(s => s.cpu?.serviceCpuPct).filter(v => typeof v === 'number');
  const hostCpu = stats.map(s => s.cpu?.routerCpuPct).filter(v => typeof v === 'number');
  const step = {
    n,
    wallSec: round(wallMs / 1000),
    baseline,
    probe,
    players: summaries,
    aggregateMbps: round(mbps(totalBytes, DURATION_S * 1000)),
    burstAggregateMbps: round(mbps(burstBytes, Math.min(5000, DURATION_S * 1000))),
    perPlayerAvgMbps: round(summaries.reduce((a, p) => a + p.avgMbps, 0) / Math.max(1, summaries.length)),
    perPlayerMinMbps: round(Math.min(...summaries.map(p => p.avgMbps))),
    ttfbP50: pct(summaries.map(p => p.ttfbMs).filter(v => v !== null), 50),
    ttfbP95: pct(summaries.map(p => p.ttfbMs).filter(v => v !== null), 95),
    stalledPlayers: summaries.filter(p => p.stalls > 0).length,
    log,
    health: {
      samples: stats.length,
      maxServiceCpu: cpuSamples.length ? Math.max(...cpuSamples) : null,
      maxHostCpu: hostCpu.length ? Math.max(...hostCpu) : null,
      maxRssMB: stats.length ? Math.max(...stats.map(s => s.memory?.rssMB || 0)) : null,
      maxRamPct: stats.length ? Math.max(...stats.map(s => s.memory?.ramPct || 0)) : null,
      maxActive: stats.length ? Math.max(...stats.map(s => s.activeStreams || 0)) : null,
      loadAvg1m: stats.length ? stats[stats.length - 1].cpu?.loadAvg1m ?? null : null,
      disconnected: Boolean(stopEarly),
    },
  };
  step.stopReasons = evaluate(step);
  step.hint = bottleneckHint(step);
  return step;
}

function table(steps) {
  const head = '| Players | E2E total Mbps | per player avg / min | TTFB p50 / p95 ms | stalled | Telegram->server probe Mbps (first block ms) | server->client baseline Mbps | TG first block p50/p95 ms (log) | svc CPU % | RAM % | verdict |';
  const sep = '|' + head.split('|').slice(1, -1).map(() => '---').join('|') + '|';
  const rows = steps.map(s => `| ${s.n} | ${s.aggregateMbps} | ${s.perPlayerAvgMbps} / ${s.perPlayerMinMbps} | ${s.ttfbP50 ?? '-'} / ${s.ttfbP95 ?? '-'} | ${s.stalledPlayers}/${s.n} | ${s.probe?.telegramMbps ?? s.probe?.error ?? '-'} (${s.probe?.firstBlockMs ?? '-'}) | ${s.baseline?.mbps ?? s.baseline?.error ?? '-'} | ${s.log.firstBlockP50 ?? '-'} / ${s.log.firstBlockP95 ?? '-'} | ${s.health.maxServiceCpu ?? '-'} | ${s.health.maxRamPct ?? '-'} | ${s.stopReasons.length ? 'STOP: ' + s.stopReasons.join('; ') : s.hint} |`);
  return [head, sep, ...rows].join('\n');
}

async function main() {
  console.log(`TGStrm stress test -> ${BASE} | tier ${TIER} | mode ${MODE} | steps ${STEPS.join(',')} | ${DURATION_S}s per step${DRY_RUN ? ' | DRY RUN' : ''}`);
  const health = await getJson(`${BASE}/tg/health`).catch(() => getJson(`${BASE}/health`));
  console.log(`health: ${health.status}, connected=${health.isConnected}, cached=${health.cachedStreams}`);
  if (!health.isConnected) throw new Error('Telegram is not connected on the server, aborting');
  const files = await fetchFiles();
  if (!files.length) throw new Error(`no ${TIER} files >= ${MIN_SIZE / 1048576} MB in the central DB`);
  console.log(`${files.length} candidate ${TIER} file(s); largest ${Math.round(files[0].size / 1048576)} MB${files.length < Math.max(...STEPS) ? ` (fewer than the max step: files are reused across players)` : ''}`);
  const s0 = await serverStats();
  console.log(`server: cores ${s0.cpu?.cores}, load ${s0.cpu?.loadAvg1m}, rss ${s0.memory?.rssMB}/${s0.memory?.capMB} MB, activeStreams ${s0.activeStreams}, pipelineBuffers ${JSON.stringify(s0.pipelineBuffers)}`);
  if (DRY_RUN) { console.log('dry run done'); return; }
  if (s0.activeStreams > 0) console.log(`WARNING: ${s0.activeStreams} real stream(s) already active, results include that load`);

  const steps = [];
  let stoppedAt = null;
  for (const n of STEPS) {
    console.log(`\n== step: ${n} concurrent player(s) ==`);
    const step = await runStep(n, files);
    steps.push(step);
    console.log(`E2E ${step.aggregateMbps} Mbps total (${step.perPlayerAvgMbps}/player), TTFB p95 ${step.ttfbP95}ms, stalled ${step.stalledPlayers}/${n}, probe ${step.probe?.telegramMbps ?? step.probe?.error}, baseline ${step.baseline?.mbps ?? step.baseline?.error}`);
    if (step.stopReasons.length) { stoppedAt = { n, reasons: step.stopReasons }; console.log(`STOP: ${step.stopReasons.join('; ')}`); break; }
    if (n !== STEPS[STEPS.length - 1]) await sleep(COOLDOWN_S * 1000);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const meta = { base: BASE, tier: TIER, mode: MODE, durationSec: DURATION_S, steps: STEPS, startedAt: stamp, serverBefore: { cpu: s0.cpu, memory: s0.memory, pipelineBuffers: s0.pipelineBuffers, nodeRamCapMb: s0.nodeRamCapMb } };
  fs.writeFileSync(path.join(OUT_DIR, `stress-${stamp}.json`), JSON.stringify({ meta, stoppedAt, steps }, null, 2));
  const md = [
    `# TGStrm stress test ${stamp}`,
    `Base: ${BASE} | tier: ${TIER} | mode: ${MODE} | ${DURATION_S}s per step | cores ${s0.cpu?.cores} | node RAM cap ${s0.nodeRamCapMb} MB`,
    '',
    table(steps),
    '',
    stoppedAt ? `**Stopped at ${stoppedAt.n} players:** ${stoppedAt.reasons.join('; ')}` : `**Completed all steps up to ${STEPS[STEPS.length - 1]} players without a stop condition.**`,
    '',
    'Columns: E2E = bytes received by the virtual players (Telegram -> server -> client). Probe = server-measured Telegram -> server rate of a single speed-test stream taken mid-step under load. Baseline = server -> client rate of RAM bytes with no Telegram. TG first block = first-block latency from the server log.',
  ].join('\n');
  fs.writeFileSync(path.join(OUT_DIR, `stress-${stamp}.md`), md);
  console.log(`\n${table(steps)}\n\nreport: ${path.join(OUT_DIR, `stress-${stamp}.md`)}`);
}

main().catch(e => { console.error('stress test failed:', e.message); process.exit(1); }).finally(() => { httpAgent.destroy(); httpsAgent.destroy(); });
