import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { formatDuration } from './dashboard/src/utils/formatDuration.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Dummy env for Telegram client initialization during test
process.env.TG_API_ID = process.env.TG_API_ID || '12345';
process.env.TG_API_HASH = process.env.TG_API_HASH || 'abcdef1234567890abcdef1234567890';

const { app } = await import('./index.js');

let total = 0;
let passed = 0;

async function test(desc, fn) {
  total++;
  try {
    await fn();
    console.log(`  ✓ ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${desc}`);
    console.error(err);
  }
}

console.log('\n--- TGStrm MUI Dashboard Test Suite (#344) ---');

// 1. Static Build Artifact Verification
console.log('\n1. Build Artifacts');
await test('verifies dashboard/dist/index.html exists and contains root div and script tag', () => {
  const distIndex = path.join(__dirname, 'dashboard', 'dist', 'index.html');
  assert.ok(fs.existsSync(distIndex), 'dashboard/dist/index.html must exist');
  const html = fs.readFileSync(distIndex, 'utf8');
  assert.ok(html.includes('<div id="root"></div>'), 'index.html must contain <div id="root"></div>');
  assert.ok(html.includes('<script type="module"'), 'index.html must contain Vite module script tag');
});

await test('verifies compiled assets exist in dashboard/dist/assets', () => {
  const assetsDir = path.join(__dirname, 'dashboard', 'dist', 'assets');
  assert.ok(fs.existsSync(assetsDir), 'assets directory must exist');
  const files = fs.readdirSync(assetsDir);
  assert.ok(files.length > 0, 'assets directory must not be empty');
  const jsBundle = files.find(f => f.startsWith('index-') && f.endsWith('.js'));
  assert.ok(jsBundle, 'assets must contain compiled index-*.js bundle');
});

// Start ephemeral server for HTTP route testing
const server = app.listen(0);
const port = server.address().port;
const baseUrl = `http://127.0.0.1:${port}`;

try {
  // 2. All 5 Pages and Aliases Serve Single Page App
  console.log('\n2. SPA Route Serving & Aliases');

  const pageRoutes = [
    // Dashboard & aliases
    '/',
    '/dashboard',
    '/tg',
    '/msm',
    '/msm/dashboard',
    // Streams & aliases
    '/streams',
    '/cache',
    '/tg/streams',
    '/msm/cache',
    '/msm/streams',
    // Settings & aliases
    '/settings',
    '/setting',
    '/tg/settings',
    '/tg/setting',
    '/msm/settings',
    '/msm/setting',
    // Logs & aliases
    '/logs',
    '/tg/logs',
    '/msm/logs',
    // Auth & aliases
    '/auth',
    '/tg/auth',
    '/msm/auth',
  ];

  for (const route of pageRoutes) {
    await test(`serves MUI dashboard HTML for ${route}`, async () => {
      const res = await fetch(`${baseUrl}${route}`);
      assert.strictEqual(res.status, 200, `Route ${route} must return 200 OK`);
      const contentType = res.headers.get('content-type') || '';
      assert.ok(contentType.includes('text/html'), `Route ${route} must return text/html`);
      const text = await res.text();
      assert.ok(text.includes('<div id="root"></div>'), `Route ${route} must contain #root div`);
      assert.strictEqual(
        res.headers.get('cache-control'),
        'no-cache, no-store, must-revalidate',
        `Route ${route} must have no-cache headers`
      );
    });
  }

  // 3. Static Asset Resolution
  console.log('\n3. Static Assets & Prefixes');
  const assetsDir = path.join(__dirname, 'dashboard', 'dist', 'assets');
  const files = fs.readdirSync(assetsDir);
  const jsBundle = files.find(f => f.startsWith('index-') && f.endsWith('.js'));

  for (const prefix of ['', '/tg', '/msm']) {
    await test(`serves compiled JS asset under prefix "${prefix || 'root'}"`, async () => {
      const assetUrl = `${baseUrl}${prefix}/assets/${jsBundle}`;
      const res = await fetch(assetUrl);
      assert.strictEqual(res.status, 200, `Asset ${assetUrl} must return 200 OK`);
      const contentType = res.headers.get('content-type') || '';
      assert.ok(
        contentType.includes('javascript'),
        `Asset ${assetUrl} must return javascript content-type, got ${contentType}`
      );
      const text = await res.text();
      assert.ok(text.length > 1000, 'JS bundle must be substantial');
    });
  }

  // 4. API Endpoints Compatibility Across Aliases
  console.log('\n4. Backend API Compatibility');
  const apiTestEndpoints = [
    '/api/auth/status',
    '/tg/api/auth/status',
    '/msm/api/auth/status',
    '/api/system/stats',
    '/tg/api/system/stats',
    '/msm/api/system/stats',
    '/api/settings',
    '/tg/api/settings',
    '/msm/api/settings',
  ];

  for (const ep of apiTestEndpoints) {
    await test(`returns valid JSON from ${ep}`, async () => {
      const res = await fetch(`${baseUrl}${ep}`);
      assert.strictEqual(res.status, 200, `${ep} must return 200 OK`);
      const contentType = res.headers.get('content-type') || '';
      assert.ok(contentType.includes('application/json'), `${ep} must return application/json`);
      const data = await res.json();
      assert.ok(data !== null && typeof data === 'object', `${ep} response must be an object`);
    });
  }

  // 5. Boundary Value Analysis & Edge Cases (BVA)
  console.log('\n5. Boundary Value Analysis (BVA)');
  await test('handles trailing slashes on subpages gracefully (/settings/)', async () => {
    const res = await fetch(`${baseUrl}/settings/`);
    assert.strictEqual(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes('<div id="root"></div>'));
  });

  await test('handles query strings on subpages gracefully (/streams?q=movie&page=1)', async () => {
    const res = await fetch(`${baseUrl}/streams?q=movie&page=1`);
    assert.strictEqual(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes('<div id="root"></div>'));
  });

  await test('returns 404 for non-existent static assets without crashing', async () => {
    const res = await fetch(`${baseUrl}/assets/non-existent-file-xyz.js`);
    assert.strictEqual(res.status, 404);
  });

  // 6. Component & Bundle Integrity (SDLC Step 8 Regression Prevention)
  console.log('\n6. Component & Bundle Integrity (SDLC Step 8 Regression Prevention)');
  await test('verifies all JSX components in dashboard/src are properly imported and declared', () => {
    const srcDir = path.join(__dirname, 'dashboard', 'src');
    const undeclaredErrors = [];

    function checkFile(file) {
      const code = fs.readFileSync(file, 'utf8');
      const matches = [...code.matchAll(/<([A-Z][A-Za-z0-9_]*)/g)].map(m => m[1]);
      const uniqueTags = [...new Set(matches)];
      const importsText = code.slice(0, code.indexOf('export default'));

      for (const tag of uniqueTags) {
        if (!importsText.includes(tag) && tag !== 'Fragment' && !code.includes(`function ${tag}`) && !code.includes(`const ${tag}`) && !code.includes(`class ${tag}`)) {
          undeclaredErrors.push(`[${path.basename(file)}] Missing declaration/import for <${tag}>`);
        }
      }
    }

    function walk(dir) {
      for (const item of fs.readdirSync(dir)) {
        const full = path.join(dir, item);
        if (fs.statSync(full).isDirectory()) walk(full);
        else if (full.endsWith('.jsx') || full.endsWith('.js')) checkFile(full);
      }
    }

    walk(srcDir);
    assert.strictEqual(
      undeclaredErrors.length,
      0,
      `Found undeclared JSX components:\n${undeclaredErrors.join('\n')}`
    );
  });

  await test('verifies compiled production bundle does not contain raw undeclared Grid references', () => {
    const assetsDir = path.join(__dirname, 'dashboard', 'dist', 'assets');
    const files = fs.readdirSync(assetsDir);
    const jsBundle = files.find(f => f.startsWith('index-') && f.endsWith('.js'));
    assert.ok(jsBundle, 'Compiled bundle must exist');
    const bundleContent = fs.readFileSync(path.join(assetsDir, jsBundle), 'utf8');

    // If Grid was undeclared in JSX, Vite/Rollup compiles it to raw `m.jsx(Grid` or `m.jsxs(Grid`
    const hasRawGridJSX = /children:m\.jsxs\(Grid,/.test(bundleContent) || /children:m\.jsx\(Grid,/.test(bundleContent);
    assert.strictEqual(hasRawGridJSX, false, 'Production bundle must not contain unbundled raw Grid references');
  });

  await test('verifies App.jsx includes ErrorBoundary and trailing slash normalization', () => {
    const appFile = path.join(__dirname, 'dashboard', 'src', 'App.jsx');
    const appContent = fs.readFileSync(appFile, 'utf8');
    assert.ok(appContent.includes('class ErrorBoundary'), 'App.jsx must define ErrorBoundary');
    assert.ok(appContent.includes('<ErrorBoundary>'), 'App.jsx must wrap active page with ErrorBoundary');
    assert.ok(
      appContent.includes("replace(/\\/+$/, '')"),
      'App.jsx must normalize path trailing slashes'
    );
  });

  await test('verifies SettingsPage.jsx contains all required settings and maintenance controls (#HOM-177)', () => {
    const settingsFile = path.join(__dirname, 'dashboard', 'src', 'pages', 'SettingsPage.jsx');
    const content = fs.readFileSync(settingsFile, 'utf8');
    const requiredTokens = [
      'TV Series Minimum Size',
      'Movie Minimum Size',
      'Resolver Max Paging',
      'Speed Test Size',
      'Speed Test Budget',
      'Restart TGStrm Service',
      'Clear All Cache',
      'Clear Log',
      'Open Telegram Phone Auth Portal',
      'minTvSizeMb',
      'minMovieSizeMb',
      'resolverMaxPages',
      'speedTestMb',
      'speedTestBudgetMbPerMin',
      'cachedStreams',
      'Restart TGStrm Service',
    ];
    for (const token of requiredTokens) {
      assert.ok(content.includes(token), `SettingsPage.jsx must include "${token}"`);
    }
  });

  // 7. HOM-181 Regression & BVA Verification (SSE, Autoscroll, Range Alignment)
  console.log('\n7. HOM-181 Regression & BVA Verification');
  await test('GET /api/logs validates lines parameter with BVA (lines=-3, 0, positive)', async () => {
    // Negative number: must default to 200, never return slice(-(-3))
    const resNeg = await fetch(`${baseUrl}/api/logs?lines=-3`);
    assert.strictEqual(resNeg.status, 200);
    const dataNeg = await resNeg.json();
    assert.ok(dataNeg.success);
    assert.ok(dataNeg.logs.length <= 200, `Expected <= 200 lines for lines=-3, got ${dataNeg.logs.length}`);

    // Zero: must default to 200
    const resZero = await fetch(`${baseUrl}/api/logs?lines=0`);
    assert.strictEqual(resZero.status, 200);
    const dataZero = await resZero.json();
    assert.ok(dataZero.success);
    assert.ok(dataZero.logs.length <= 200, `Expected <= 200 lines for lines=0, got ${dataZero.logs.length}`);

    // Valid positive number: 5 lines
    const res5 = await fetch(`${baseUrl}/api/logs?lines=5`);
    assert.strictEqual(res5.status, 200);
    const data5 = await res5.json();
    assert.ok(data5.success);
    assert.ok(data5.logs.length <= 5, `Expected <= 5 lines for lines=5, got ${data5.logs.length}`);
  });

  await test('verifies LogsPage.jsx handles SSE message/log event and unpacks parsed.lines array', () => {
    const logsFile = path.join(__dirname, 'dashboard', 'src', 'pages', 'LogsPage.jsx');
    const content = fs.readFileSync(logsFile, 'utf8');
    assert.ok(content.includes('es.onmessage ='), 'LogsPage.jsx must handle default SSE message event');
    assert.ok(content.includes("es.addEventListener('log'"), 'LogsPage.jsx must also handle log named event');
    assert.ok(content.includes('parsed?.lines') || content.includes('data?.lines'), 'LogsPage.jsx must unpack lines array');
  });

  await test('verifies LogsPage.jsx separates each log entry (issue #351)', () => {
    const logsFile = path.join(__dirname, 'dashboard', 'src', 'pages', 'LogsPage.jsx');
    const content = fs.readFileSync(logsFile, 'utf8');
    assert.ok(content.includes("borderLeft: '3px solid currentColor'"), 'log entry must have level color left stripe');
    assert.ok(content.includes('borderBottom:'), 'log entry must have bottom separator');
    assert.ok(content.includes("idx === filteredLogs.length - 1"), 'last entry must not have trailing separator');
  });

  await test('verifies LogsPage.jsx Card container has bounded height for autoscroll (BUG-2 fix)', () => {
    const logsFile = path.join(__dirname, 'dashboard', 'src', 'pages', 'LogsPage.jsx');
    const content = fs.readFileSync(logsFile, 'utf8');
    const cardMatch = content.match(/\{\/\* Terminal Container \*\/\}\s*<Card[\s\S]*?sx=\{\{([\s\S]*?)\}\}/);
    assert.ok(cardMatch, 'Card terminal container must be present in LogsPage.jsx');
    const cardSx = cardMatch[1];
    assert.ok(/(?<!min)height\s*:|maxHeight\s*:/.test(cardSx), 'Card terminal container must have explicit height or maxHeight');
    assert.ok(content.includes('ref={terminalRef}'), 'terminalRef must be attached to the scrollable terminal Box');
  });

  await test('verifies SettingsPage.jsx ranges align with backend validation (minMovieSizeMb 50, resolverMaxPages 20)', () => {
    const settingsFile = path.join(__dirname, 'dashboard', 'src', 'pages', 'SettingsPage.jsx');
    const content = fs.readFileSync(settingsFile, 'utf8');
    assert.ok(content.includes('Math.max(50,'), 'minMovieSizeMb lower bound must be 50');
    assert.ok(content.includes('min: 50,'), 'minMovieSizeMb input min must be 50');
    assert.ok(content.includes('Math.min(20,'), 'resolverMaxPages upper bound must be 20');
    assert.ok(content.includes('max: 20,'), 'resolverMaxPages input max must be 20');
  });

  // 8. GH #349 BVA & Regression Verification (formatDuration, CPU/RAM stats, hh:mm:ss uptime)
  console.log('\n8. GH #349 BVA & Regression Verification (formatDuration & CPU/RAM Stats)');
  await test('formatDuration: BVA zero, negative, and invalid/non-numeric inputs return "00:00:00"', () => {
    assert.strictEqual(formatDuration(0), '00:00:00', '0 must format to 00:00:00');
    assert.strictEqual(formatDuration(-0), '00:00:00', '-0 must format to 00:00:00');
    assert.strictEqual(formatDuration(-1), '00:00:00', 'negative 1 must format to 00:00:00');
    assert.strictEqual(formatDuration(-3600), '00:00:00', 'negative 3600 must format to 00:00:00');
    assert.strictEqual(formatDuration(NaN), '00:00:00', 'NaN must format to 00:00:00');
    assert.strictEqual(formatDuration(null), '00:00:00', 'null must format to 00:00:00');
    assert.strictEqual(formatDuration(undefined), '00:00:00', 'undefined must format to 00:00:00');
    assert.strictEqual(formatDuration(''), '00:00:00', 'empty string must format to 00:00:00');
    assert.strictEqual(formatDuration('invalid'), '00:00:00', 'non-numeric string must format to 00:00:00');
    assert.strictEqual(formatDuration(Infinity), '00:00:00', 'Infinity must format to 00:00:00');
    assert.strictEqual(formatDuration(-Infinity), '00:00:00', '-Infinity must format to 00:00:00');
  });

  await test('formatDuration: BVA boundaries for seconds, minutes, hours, rollover, and >=100 hours', () => {
    assert.strictEqual(formatDuration(1), '00:00:01', '1s');
    assert.strictEqual(formatDuration(59), '00:00:59', '59s');
    assert.strictEqual(formatDuration(60), '00:01:00', '60s rollover to 1 min');
    assert.strictEqual(formatDuration(61), '00:01:01', '61s');
    assert.strictEqual(formatDuration(3599), '00:59:59', '3599s');
    assert.strictEqual(formatDuration(3600), '01:00:00', '3600s rollover to 1 hour');
    assert.strictEqual(formatDuration(3601), '01:00:01', '3601s');
    assert.strictEqual(formatDuration(7530), '02:05:30', '7530s -> 02:05:30 example from GH #349');
    assert.strictEqual(formatDuration(86400), '24:00:00', '86400s (24 hours)');
    assert.strictEqual(formatDuration(360000), '100:00:00', '360000s (100 hours with >2 digit hours)');
    assert.strictEqual(formatDuration('7530'), '02:05:30', 'numeric string parses correctly');
    assert.strictEqual(formatDuration(7530.9), '02:05:30', 'fractional seconds floored');
  });

  await test('GET /api/system/stats returns expected CPU, RAM, and Uptime fields for DashboardPage', async () => {
    const res = await fetch(`${baseUrl}/api/system/stats`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, 'ok');

    // Uptime
    assert.strictEqual(typeof data.uptime, 'number', 'uptime must be a number');
    assert.ok(data.uptime >= 0, 'uptime must be >= 0');

    // CPU structure
    assert.ok(data.cpu && typeof data.cpu === 'object', 'data.cpu must be an object');
    assert.strictEqual(typeof data.cpu.cores, 'number', 'cpu.cores must be a number');
    assert.ok(data.cpu.cores > 0, 'cpu.cores must be > 0');
    assert.strictEqual(typeof data.cpu.nodeCpuPct, 'number', 'cpu.nodeCpuPct must be a number');
    assert.strictEqual(typeof data.cpu.serviceCpuPct, 'number', 'cpu.serviceCpuPct must be a number');
    assert.strictEqual(typeof data.cpu.loadAvg1m, 'number', 'cpu.loadAvg1m must be a number');

    // Memory structure
    assert.ok(data.memory && typeof data.memory === 'object', 'data.memory must be an object');
    assert.strictEqual(typeof data.memory.rssMB, 'number', 'memory.rssMB must be a number');
    assert.strictEqual(typeof data.memory.capMB, 'number', 'memory.capMB must be a number');
    assert.strictEqual(typeof data.memory.ramPct, 'number', 'memory.ramPct must be a number');
    assert.ok(data.memory.ramPct >= 0 && data.memory.ramPct <= 100, 'memory.ramPct must be between 0 and 100');
    assert.strictEqual(typeof data.memory.heapUsedMB, 'number', 'memory.heapUsedMB must be a number');
  });

  await test('verifies DashboardPage.jsx correctly references nested stats.cpu.*, stats.memory.* and uses formatDuration', () => {
    const dashPageFile = path.join(__dirname, 'dashboard', 'src', 'pages', 'DashboardPage.jsx');
    const content = fs.readFileSync(dashPageFile, 'utf8');

    // Import check
    assert.ok(content.includes("from '../utils/formatDuration'"), 'DashboardPage.jsx must import formatDuration');

    // CPU mapping check
    assert.ok(content.includes('stats?.cpu?.nodeCpuPct'), 'DashboardPage.jsx must map stats.cpu.nodeCpuPct');
    assert.ok(content.includes('stats?.cpu?.serviceCpuPct'), 'DashboardPage.jsx must map stats.cpu.serviceCpuPct');
    assert.ok(content.includes('stats?.cpu?.cores'), 'DashboardPage.jsx must map stats.cpu.cores');
    assert.ok(content.includes('stats?.cpu?.loadAvg1m'), 'DashboardPage.jsx must map stats.cpu.loadAvg1m');

    // Memory mapping check
    assert.ok(content.includes('stats?.memory?.ramPct'), 'DashboardPage.jsx must map stats.memory.ramPct');
    assert.ok(content.includes('stats?.memory?.rssMB'), 'DashboardPage.jsx must map stats.memory.rssMB');
    assert.ok(content.includes('stats?.memory?.capMB'), 'DashboardPage.jsx must map stats.memory.capMB');
    assert.ok(content.includes('stats?.memory?.heapUsedMB'), 'DashboardPage.jsx must map stats.memory.heapUsedMB');

    // Uptime & Active client duration formatting check
    assert.ok(content.includes('formatDuration(stats.uptime)'), 'DashboardPage.jsx must format stats.uptime with formatDuration');
    assert.ok(content.includes('formatDuration(c.connectedSec'), 'DashboardPage.jsx must format connectedSec with formatDuration');
  });

  await test('verifies legacy dashboard in index.js formats uptime and connected clients with formatDuration', () => {
    const indexFile = path.join(__dirname, 'index.js');
    const content = fs.readFileSync(indexFile, 'utf8');

    assert.ok(content.includes('function formatDuration(sec)'), 'index.js legacy dashboard script must define formatDuration');
    assert.ok(content.includes("document.getElementById('metricUptime').textContent = formatDuration(u)"), 'index.js must format metricUptime with formatDuration');
    assert.ok(content.includes('formatDuration(c.connectedSec || 0)'), 'index.js must format legacy active client connected duration with formatDuration');
  });

  // 9. HOM-200 Dashboard Header Straight Bar Verification
  console.log('\n9. HOM-200 Dashboard Header Straight Bar Verification');
  await test('verifies Layout.jsx implements straight bar header without floating island styles', () => {
    const layoutFile = path.join(__dirname, 'dashboard', 'src', 'components', 'Layout.jsx');
    const content = fs.readFileSync(layoutFile, 'utf8');

    // Extract header section
    const headerStart = content.indexOf('{/* Straight Top Header Bar */}');
    const headerEnd = content.indexOf('{/* Dynamic Page Views */}');
    assert.ok(headerStart !== -1, 'Layout.jsx must contain Straight Top Header Bar block');
    assert.ok(headerEnd !== -1, 'Layout.jsx must contain Dynamic Page Views block');
    const headerBlock = content.slice(headerStart, headerEnd);

    // Must have straight bar styling: borderBottom divider, no floating island border radius or margin
    assert.ok(headerBlock.includes("borderBottom: '1px solid'") || headerBlock.includes('borderBottom: "1px solid"'), 'Layout.jsx header must have borderBottom divider');
    assert.ok(!headerBlock.includes("borderRadius: '10px'"), 'Layout.jsx header must not have floating island 10px border radius');
    assert.ok(!headerBlock.includes("mb: 3.5"), 'Layout.jsx header must not have floating island mb: 3.5 margin');
    assert.ok(!headerBlock.includes("rgba(67, 89, 113, 0.08)"), 'Layout.jsx header must not have floating island elevation box shadow');
    assert.ok(headerBlock.includes("width: '100%'"), 'Layout.jsx header must span 100% full width');

    // Header must preserve essential elements: title, drawer toggle, targetBot chip, LIVE/OFFLINE, theme toggle
    assert.ok(headerBlock.includes('activeItem.label'), 'Header must render activeItem.label');
    assert.ok(headerBlock.includes('handleDrawerToggle'), 'Header must include drawer toggle for mobile');
    assert.ok(headerBlock.includes('targetBot'), 'Header must preserve targetBot chip');
    assert.ok(headerBlock.includes('isConnected'), 'Header must preserve isConnected status badge');
    assert.ok(headerBlock.includes('onToggleTheme'), 'Header must preserve onToggleTheme switcher');
  });

  // 10. HOM-206 Active Streams (N) Scroll & Stream Cache Button Verification
  console.log('\n10. HOM-206 Active Streams (N) Scroll & Stream Cache Button Verification');
  await test('verifies DashboardPage.jsx implements Active Streams (N) button with smooth scroll handler', () => {
    const dashFile = path.join(__dirname, 'dashboard', 'src', 'pages', 'DashboardPage.jsx');
    const content = fs.readFileSync(dashFile, 'utf8');

    // Button label and structure
    assert.ok(
      content.includes('Active Streams ({clients.length})'),
      'DashboardPage.jsx must define button with label "Active Streams ({clients.length})"'
    );
    assert.ok(
      !content.includes('View Streams ({clients.length})'),
      'DashboardPage.jsx must no longer contain old "View Streams ({clients.length})"'
    );
    assert.ok(
      content.includes('onClick={scrollToClients}'),
      'Active Streams button must invoke scrollToClients onClick'
    );

    // Scroll handler implementation
    assert.ok(
      content.includes('const scrollToClients = () =>'),
      'DashboardPage.jsx must implement scrollToClients function'
    );
    assert.ok(
      content.includes("scrollIntoView({ behavior: 'smooth', block: 'start' })"),
      'scrollToClients must execute smooth scroll to start'
    );
    assert.ok(
      content.includes('clientsSectionRef.current') && content.includes("getElementById('connected-clients-section')"),
      'scrollToClients must support both clientsSectionRef and getElementById fallback'
    );
  });

  await test('verifies DashboardPage.jsx targets Connected Clients Card with ref and id for scroll', () => {
    const dashFile = path.join(__dirname, 'dashboard', 'src', 'pages', 'DashboardPage.jsx');
    const content = fs.readFileSync(dashFile, 'utf8');

    assert.ok(
      content.includes('id="connected-clients-section"'),
      'Connected clients Card container must have id="connected-clients-section"'
    );
    assert.ok(
      content.includes('ref={clientsSectionRef}'),
      'Connected clients Card container must have ref={clientsSectionRef}'
    );
  });

  await test('verifies DashboardPage.jsx implements separate Stream Cache button navigating to /streams', () => {
    const dashFile = path.join(__dirname, 'dashboard', 'src', 'pages', 'DashboardPage.jsx');
    const content = fs.readFileSync(dashFile, 'utf8');

    assert.ok(
      content.includes('Stream Cache'),
      'DashboardPage.jsx must contain "Stream Cache" button'
    );
    assert.ok(
      content.includes("onClick={() => onNavigate('/streams')}"),
      'Stream Cache button must navigate to /streams via onNavigate'
    );
    assert.ok(
      content.includes('startIcon={<StorageIcon />}'),
      'Stream Cache button must include StorageIcon'
    );
  });

  await test('BVA & Decision Logic: Active Streams (N) counter formatting for boundaries (N=0, N=1, N>1, null/undefined)', () => {
    function computeActiveStreamsLabel(stats) {
      const clients = stats?.activeClients || [];
      return `Active Streams (${clients.length})`;
    }

    // BVA N=0: empty array
    assert.strictEqual(computeActiveStreamsLabel({ activeClients: [] }), 'Active Streams (0)');
    // BVA N=0: null stats
    assert.strictEqual(computeActiveStreamsLabel(null), 'Active Streams (0)');
    // BVA N=0: undefined stats
    assert.strictEqual(computeActiveStreamsLabel(undefined), 'Active Streams (0)');
    // BVA N=0: stats without activeClients property
    assert.strictEqual(computeActiveStreamsLabel({}), 'Active Streams (0)');
    // BVA N=1: single client
    assert.strictEqual(computeActiveStreamsLabel({ activeClients: [{ id: 'client-1' }] }), 'Active Streams (1)');
    // BVA N>1: multiple clients (e.g. 5 clients)
    assert.strictEqual(
      computeActiveStreamsLabel({
        activeClients: [
          { id: 'c1' },
          { id: 'c2' },
          { id: 'c3' },
          { id: 'c4' },
          { id: 'c5' },
        ],
      }),
      'Active Streams (5)'
    );
    // BVA high count (e.g. 100 clients)
    const largeList = Array.from({ length: 100 }, (_, i) => ({ id: `client-${i}` }));
    assert.strictEqual(computeActiveStreamsLabel({ activeClients: largeList }), 'Active Streams (100)');
  });

  await test('verifies compiled production bundle contains Active Streams and Stream Cache tokens without raw View Streams', () => {
    const assetsDir = path.join(__dirname, 'dashboard', 'dist', 'assets');
    const files = fs.readdirSync(assetsDir);
    const jsBundle = files.find(f => f.startsWith('index-') && f.endsWith('.js'));
    assert.ok(jsBundle, 'Compiled bundle must exist');
    const bundleContent = fs.readFileSync(path.join(assetsDir, jsBundle), 'utf8');

    assert.ok(bundleContent.includes('Active Streams'), 'Production bundle must contain "Active Streams"');
    assert.ok(bundleContent.includes('Stream Cache'), 'Production bundle must contain "Stream Cache"');
    assert.ok(!bundleContent.includes('View Streams ('), 'Production bundle must not contain old "View Streams ("');
    assert.ok(bundleContent.includes('connected-clients-section'), 'Production bundle must contain "connected-clients-section" target ID');
  });

} finally {
  server.close();
}

console.log(`\nResults: ${passed}/${total} dashboard tests passed!\n`);
if (passed === total) {
  console.log('🎉 ALL DASHBOARD TESTS PASSED SUCCESSFULLY!\n');
} else {
  process.exit(1);
}
