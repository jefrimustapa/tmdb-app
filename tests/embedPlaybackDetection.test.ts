import assert from 'node:assert';
import {
  KNOWN_REPORTER_IDS,
  UNVERIFIABLE_GRACE_MS,
  loadReporters,
  saveReporters,
  isPlaybackUnverifiable,
} from '../src/utils/embedPlaybackDetection';

console.log('\n--- Embed playback detection (Issue #294) ---\n');

let passedTests = 0;
const TOTAL = 8;

function runTest(name: string, fn: () => void) {
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

const base = { hasNativeBridge: false, providerId: 'flaxmovies', frameMessageCount: 0, reporters: new Set<string>() };

function fakeStorage(initial?: string) {
  let value = initial ?? null;
  return {
    getItem: () => value,
    setItem: (_k: string, v: string) => { value = v; },
  };
}

runTest('silent unknown provider on web is unverifiable', () => {
  assert.strictEqual(isPlaybackUnverifiable(base), true);
});

runTest('never unverifiable inside the Android app (audio check exists)', () => {
  assert.strictEqual(isPlaybackUnverifiable({ ...base, hasNativeBridge: true }), false);
});

runTest('not unverifiable once the embed has posted a message', () => {
  assert.strictEqual(isPlaybackUnverifiable({ ...base, frameMessageCount: 1 }), false);
});

runTest('providers with a dedicated handler keep the failover', () => {
  for (const id of KNOWN_REPORTER_IDS) {
    assert.strictEqual(isPlaybackUnverifiable({ ...base, providerId: id }), false, id);
  }
});

runTest('providers learned as reporters keep the failover', () => {
  assert.strictEqual(isPlaybackUnverifiable({ ...base, reporters: new Set(['flaxmovies']) }), false);
});

runTest('reporters round-trip through storage', () => {
  const storage = fakeStorage();
  saveReporters(new Set(['a', 'b']), storage);
  assert.deepStrictEqual([...loadReporters(storage)].sort(), ['a', 'b']);
});

runTest('corrupt or missing storage gives an empty set', () => {
  assert.strictEqual(loadReporters(fakeStorage('not json')).size, 0);
  assert.strictEqual(loadReporters(fakeStorage()).size, 0);
  assert.strictEqual(loadReporters(null).size, 0);
});

runTest('grace period is 10 seconds', () => {
  assert.strictEqual(UNVERIFIABLE_GRACE_MS, 10000);
});

console.log(`\nTests completed: ${passedTests}/${TOTAL} passed.`);
