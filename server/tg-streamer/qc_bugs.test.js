import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

process.env.TG_API_ID = process.env.TG_API_ID || '12345';
process.env.TG_API_HASH = process.env.TG_API_HASH || 'abcdef1234567890abcdef1234567890';

const { app } = await import('./index.js');

let total = 0;
let failed = 0;
let passed = 0;

async function verifyFix(desc, fn) {
  total++;
  try {
    await fn();
    console.log(`  ✓ [FIX VERIFIED] ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ [FAILED] ${desc}: ${err.message}`);
    failed++;
  }
}

console.log('\n--- HOM-181 Bug Verification Tests (SDLC Step 8: Must Pass on New Code) ---\n');

const server = app.listen(0);
const port = server.address().port;
const baseUrl = `http://127.0.0.1:${port}`;

try {
  // Bug 1: GET /api/logs?lines=-3 should NOT return all lines, but validate to positive integer (default 200)
  await verifyFix('GET /api/logs?lines=-3 validates lines as positive integer', async () => {
    const res = await fetch(`${baseUrl}/api/logs?lines=-3`);
    const data = await res.json();
    assert.ok(data.success);
    assert.ok(data.logs.length <= 200, `Expected <= 200 lines, but got ${data.logs.length} lines`);
  });

  // Bug 2: LogsPage.jsx must listen to SSE message event and handle { lines: [...] }
  await verifyFix('LogsPage.jsx listens to message event and unpacks parsed.lines', async () => {
    const logsPageSrc = fs.readFileSync(path.join(__dirname, 'dashboard', 'src', 'pages', 'LogsPage.jsx'), 'utf8');
    assert.ok(
      logsPageSrc.includes('onmessage') || logsPageSrc.includes("addEventListener('message'"),
      'LogsPage.jsx must listen to SSE message event'
    );
    assert.ok(
      logsPageSrc.includes('.lines') || logsPageSrc.includes('lines:'),
      'LogsPage.jsx must unpack payload.lines array'
    );
  });

  // Bug 3: LogsPage.jsx terminal container must have bounded height for autoscroll
  await verifyFix('LogsPage.jsx Card/Terminal container has bounded height/maxHeight', async () => {
    const logsPageSrc = fs.readFileSync(path.join(__dirname, 'dashboard', 'src', 'pages', 'LogsPage.jsx'), 'utf8');
    const cardMatch = logsPageSrc.match(/\{\/\* Terminal Container \*\/\}\s*<Card[\s\S]*?sx=\{\{([\s\S]*?)\}\}/);
    const cardSx = cardMatch ? cardMatch[1] : '';
    assert.ok(
      /(?<!min)height\s*:|maxHeight\s*:/.test(cardSx),
      'Card terminal container must have height or maxHeight constraint'
    );
  });

  // Bug 4: SettingsPage.jsx range alignment with server
  await verifyFix('SettingsPage.jsx minMovieSizeMb min is 50 to match server', async () => {
    const settingsSrc = fs.readFileSync(path.join(__dirname, 'dashboard', 'src', 'pages', 'SettingsPage.jsx'), 'utf8');
    assert.ok(!settingsSrc.includes('minMovieSizeMb: Math.max(20,'), 'minMovieSizeMb min should not be 20');
    assert.ok(settingsSrc.includes('min: 50'), 'minMovieSizeMb input min must be 50');
  });

  await verifyFix('SettingsPage.jsx resolverMaxPages max is 20 to match server', async () => {
    const settingsSrc = fs.readFileSync(path.join(__dirname, 'dashboard', 'src', 'pages', 'SettingsPage.jsx'), 'utf8');
    assert.ok(!settingsSrc.includes('Math.min(15,'), 'resolverMaxPages max should not be 15');
    assert.ok(settingsSrc.includes('max: 20'), 'resolverMaxPages input max must be 20');
  });

} finally {
  server.close();
}

console.log(`\nFix verification: ${passed}/${total} fixes verified successfully.\n`);
if (failed > 0) process.exit(1);
