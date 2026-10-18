import { readFileSync } from 'fs';
import { resolve } from 'path';

function assertNoHooksAfterEarlyReturn(filePath: string) {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  let inComponent = false;
  let earlyReturnLine = -1;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i];

    if (/export const Details: React\.FC/.test(line)) {
      inComponent = true;
    }

    if (inComponent) {
      // Detect top-level loading check early return
      if (/if\s*\(isLoading\s*\|\|\s*!details\)/.test(line)) {
        earlyReturnLine = lineNum;
      }

      // If we are past the early return, check if any hooks are defined before the final component return
      if (earlyReturnLine !== -1 && lineNum > earlyReturnLine) {
        if (/^\s*(const|let)\s+.*\s*=\s*(React\.)?use[A-Z]/.test(line)) {
          throw new Error(
            `[Rules of Hooks Violation] Found hook declaration after early return at ${filePath}:${lineNum}: "${line.trim()}"`
          );
        }
      }
    }
  }
}

console.log('\n--- Details Page Rules of Hooks Test Suite (Issue #217) ---');

try {
  const mobilePath = resolve(process.cwd(), 'src/pages/Details/Details.mobile.tsx');
  const tvPath = resolve(process.cwd(), 'src/pages/Details/Details.tv.tsx');

  assertNoHooksAfterEarlyReturn(mobilePath);
  console.log('  ✓ Verified Details.mobile.tsx has no hook calls after early return');

  assertNoHooksAfterEarlyReturn(tvPath);
  console.log('  ✓ Verified Details.tv.tsx has no hook calls after early return');

  console.log('\nTests completed: 2/2 passed.\n');
} catch (err: any) {
  console.error('\nTest failed:', err.message);
  process.exit(1);
}
