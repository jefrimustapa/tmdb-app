import assert from 'node:assert';
import { nextVisibleCount, PROGRESSIVE_PAGE_SIZE } from '../src/hooks/useProgressiveList';

console.log('\n--- Progressive list paging (Issue #291) ---\n');

let passedTests = 0;

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

runTest('page size is 24', () => {
  assert.strictEqual(PROGRESSIVE_PAGE_SIZE, 24);
});

runTest('adds one page when more items remain', () => {
  assert.strictEqual(nextVisibleCount(24, 500), 48);
});

runTest('never exceeds the total', () => {
  assert.strictEqual(nextVisibleCount(24, 30), 30);
  assert.strictEqual(nextVisibleCount(30, 30), 30);
});

runTest('empty list stays at zero', () => {
  assert.strictEqual(nextVisibleCount(0, 0), 0);
});

runTest('custom page size', () => {
  assert.strictEqual(nextVisibleCount(10, 100, 5), 15);
});

console.log(`\nTests completed: ${passedTests}/5 passed.`);
