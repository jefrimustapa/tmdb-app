import assert from 'node:assert';
import { hasAndroidBridge, canCast } from '../src/utils/platform';

console.log('\n--- Platform Helper Test Suite (Cast hidden on web) ---\n');

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

const g = globalThis as any;
const hadWindow = 'window' in g;
const originalWindow = g.window;

function withWindow(win: any, fn: () => void) {
  g.window = win;
  try {
    fn();
  } finally {
    if (hadWindow) g.window = originalWindow;
    else delete g.window;
  }
}

runTest('no window (SSR / tests): not native, cannot cast', () => {
  withWindow(undefined, () => {
    delete g.window;
    assert.strictEqual(hasAndroidBridge(), false);
    assert.strictEqual(canCast(), false);
  });
});

runTest('web browser (window without AndroidBridge): cannot cast', () => {
  withWindow({}, () => {
    assert.strictEqual(hasAndroidBridge(), false);
    assert.strictEqual(canCast(), false);
  });
});

runTest('Android app (window.AndroidBridge present): can cast', () => {
  withWindow({ AndroidBridge: { openCastMenu() {} } }, () => {
    assert.strictEqual(hasAndroidBridge(), true);
    assert.strictEqual(canCast(), true);
  });
});

console.log(`\nTests completed: ${passedTests}/${totalTests} passed.\n`);
