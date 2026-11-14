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

} finally {
  server.close();
}

console.log(`\nResults: ${passed}/${total} dashboard tests passed!\n`);
if (passed === total) {
  console.log('🎉 ALL DASHBOARD TESTS PASSED SUCCESSFULLY!\n');
} else {
  process.exit(1);
}
