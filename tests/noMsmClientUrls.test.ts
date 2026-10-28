import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

console.log('\n--- No /msm/ URL paths in client (Issue #290) ---\n');

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
}

const offenders = walk('src').filter((f) => /\/msm\//.test(fs.readFileSync(f, 'utf8')));
assert.deepStrictEqual(offenders, [], `/msm/ URL path found in: ${offenders.join(', ')}`);
console.log('  ✓ no client source references a /msm/ URL path');
