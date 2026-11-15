import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

} finally {
  server.close();
}

console.log(`\nResults: ${passed}/${total} dashboard tests passed!\n`);
if (passed === total) {
  console.log('🎉 ALL DASHBOARD TESTS PASSED SUCCESSFULLY!\n');
} else {
  process.exit(1);
}
