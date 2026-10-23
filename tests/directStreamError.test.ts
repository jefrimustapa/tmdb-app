import assert from 'node:assert';
import { getDirectStreamErrorView } from '../src/utils/directStreamError';

console.log('\n--- Direct Stream Error Screen Message Test Suite (Issue #262) ---\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name: string, fn: () => void) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err: any) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

runTest('embed + telegram enabled: no "disabled" claim, reason passed through (screenshot case)', () => {
  const view = getDirectStreamErrorView(['embed', 'telegram'], 'No stream found in Telegram Provider.');
  assert.strictEqual(view.embedDisabled, false);
  assert.strictEqual(view.reason, 'No stream found in Telegram Provider.');
  assert.strictEqual(view.engines, 'Embed Resolver, TGStrm');
});

runTest('embed enabled with empty or blank status: reason is null', () => {
  assert.strictEqual(getDirectStreamErrorView(['embed'], '').reason, null);
  assert.strictEqual(getDirectStreamErrorView(['embed'], '   ').reason, null);
  assert.strictEqual(getDirectStreamErrorView(['embed'], undefined).reason, null);
  assert.strictEqual(getDirectStreamErrorView(['embed'], null).reason, null);
});

runTest('embed enabled: reason is trimmed', () => {
  assert.strictEqual(getDirectStreamErrorView(['embed'], '  No stream found in LARI21.  ').reason, 'No stream found in LARI21.');
});

runTest('embed disabled (telegram only): disabled flag set and reason suppressed', () => {
  const view = getDirectStreamErrorView(['telegram'], 'No stream found in Telegram Provider.');
  assert.strictEqual(view.embedDisabled, true);
  assert.strictEqual(view.reason, null);
  assert.strictEqual(view.engines, 'TGStrm');
});

runTest('maps engine names: telegram -> TGStrm, embed -> Embed Resolver, order preserved', () => {
  assert.strictEqual(getDirectStreamErrorView(['telegram', 'embed']).engines, 'TGStrm, Embed Resolver');
  assert.strictEqual(getDirectStreamErrorView(['embed']).engines, 'Embed Resolver');
});

console.log(`\nTests completed: ${passedTests}/${totalTests} passed.\n`);
