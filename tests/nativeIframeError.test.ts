import assert from 'node:assert';
import { shouldIgnoreNativeIframeError } from '../src/utils/nativeIframeError';

console.log('\n--- Native iframe error filter (Issue #295) ---\n');

let passedTests = 0;
const TOTAL = 4;

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

runTest('404 is ignored for a flagged provider', () => {
  assert.strictEqual(shouldIgnoreNativeIframeError({ ignoreHttp404: true }, { code: 404 }), true);
});

runTest('404 still fails an unflagged provider', () => {
  assert.strictEqual(shouldIgnoreNativeIframeError({}, { code: 404 }), false);
});

runTest('other errors still fail a flagged provider', () => {
  for (const code of [403, 500, 503, -6]) {
    assert.strictEqual(shouldIgnoreNativeIframeError({ ignoreHttp404: true }, { code }), false, String(code));
  }
});

runTest('missing detail is not ignored', () => {
  assert.strictEqual(shouldIgnoreNativeIframeError({ ignoreHttp404: true }, undefined), false);
});

console.log(`\nTests completed: ${passedTests}/${TOTAL} passed.`);
