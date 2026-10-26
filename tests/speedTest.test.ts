import assert from 'node:assert';
import { toMbps, computeVerdict, computeBottleneck, formatMbps } from '../src/utils/speedTest';

console.log('\n--- Network Speed Analytics Helper Test Suite (#281) ---\n');

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

runTest('toMbps converts bytes and milliseconds to megabits per second', () => {
  assert.strictEqual(toMbps(1_250_000, 1000), 10); // 1.25 MB in 1 s = 10 Mbps
  assert.strictEqual(toMbps(16 * 1024 * 1024, 12000).toFixed(2), '11.18');
});

runTest('toMbps is 0 for nothing measured', () => {
  assert.strictEqual(toMbps(0, 1000), 0);
  assert.strictEqual(toMbps(1000, 0), 0);
  assert.strictEqual(toMbps(-5, 100), 0);
});

runTest('computeVerdict uses 1.0x and 1.5x of the Netflix minimum', () => {
  assert.strictEqual(computeVerdict(4.9, 5), 'slow');
  assert.strictEqual(computeVerdict(5, 5), 'marginal');
  assert.strictEqual(computeVerdict(7.4, 5), 'marginal');
  assert.strictEqual(computeVerdict(7.5, 5), 'ok');
  assert.strictEqual(computeVerdict(10, 15), 'slow'); // 4K at 10 Mbps
  assert.strictEqual(computeVerdict(22.5, 15), 'ok');
});

runTest('computeVerdict treats a missing minimum as OK', () => {
  assert.strictEqual(computeVerdict(1, 0), 'ok');
});

runTest('computeBottleneck: stream near the baseline means the network is the limit', () => {
  assert.strictEqual(computeBottleneck(90, 100), 'network');
  assert.strictEqual(computeBottleneck(85, 100), 'network');
});

runTest('computeBottleneck: stream far below the baseline means the server side is the limit', () => {
  assert.strictEqual(computeBottleneck(10, 187), 'server');
  assert.strictEqual(computeBottleneck(84, 100), 'server');
});

runTest('computeBottleneck is null without a usable baseline', () => {
  assert.strictEqual(computeBottleneck(10, null), null);
  assert.strictEqual(computeBottleneck(10, 0), null);
  assert.strictEqual(computeBottleneck(10, undefined), null);
});

runTest('formatMbps keeps one decimal below 100 and none above', () => {
  assert.strictEqual(formatMbps(10.24), '10.2');
  assert.strictEqual(formatMbps(187.4), '187');
  assert.strictEqual(formatMbps(0), '0');
});

console.log(`\nResults: ${passedTests}/${totalTests} tests passed!\n`);
