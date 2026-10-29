import assert from 'node:assert';
import { collectFranchiseEntries, orderSeasonsForTmdb } from '../src/services/animeMappingService';

console.log('\n--- Anime season mapping (Issue #288) ---\n');

let passedTests = 0;
const TOTAL = 5;

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

// Full Metal Panic!: Second Raid is the sequel, Fumoffu a TV side story, Invisible Victory the next sequel.
const iv = { id: 4, idMal: 31931, format: 'TV', episodes: 12, seasonYear: 2018, title: { english: 'Full Metal Panic! Invisible Victory' } };
const tsr = {
  id: 3, idMal: 73, format: 'TV', episodes: 13, seasonYear: 2005, title: { english: 'Full Metal Panic! The Second Raid' },
  relations: { edges: [{ relationType: 'SEQUEL', node: iv }] },
};
const fumoffu = { id: 2, idMal: 72, format: 'TV', episodes: 12, seasonYear: 2003, title: { english: 'Full Metal Panic? Fumoffu' } };
const fmp = {
  id: 1, idMal: 71, format: 'TV', episodes: 24, seasonYear: 2002, title: { english: 'Full Metal Panic!' },
  relations: {
    edges: [
      { relationType: 'SIDE_STORY', node: fumoffu },
      { relationType: 'SEQUEL', node: tsr },
      { relationType: 'SUMMARY', node: { id: 9, idMal: 36344, format: 'MOVIE', seasonYear: 2018 } },
    ],
  },
};

const ids = (list: { malId: number }[]) => list.map((e) => e.malId);

runTest('seasons follow the TMDB order, side story included', () => {
  assert.deepStrictEqual(ids(orderSeasonsForTmdb(collectFranchiseEntries(fmp, 'x'))), [71, 72, 73, 31931]);
});

runTest('the sequel chain alone excludes the side story', () => {
  const chain = collectFranchiseEntries(fmp, 'x').filter((e) => !e.sideStory);
  assert.deepStrictEqual(ids(chain), [71, 73, 31931]);
});

runTest('non-TV side stories and other relations are ignored', () => {
  const root = { id: 1, idMal: 1, format: 'TV', seasonYear: 2000, relations: { edges: [
    { relationType: 'SIDE_STORY', node: { id: 2, idMal: 2, format: 'MOVIE', seasonYear: 2001 } },
    { relationType: 'SIDE_STORY', node: { id: 3, idMal: 3, format: 'TV' } },
    { relationType: 'SPIN_OFF', node: { id: 4, idMal: 4, format: 'TV', seasonYear: 2002 } },
  ] } };
  assert.deepStrictEqual(ids(collectFranchiseEntries(root, 'x')), [1]);
});

runTest('a side story newer than the whole chain goes last', () => {
  const root = { id: 1, idMal: 1, format: 'TV', seasonYear: 2000, relations: { edges: [
    { relationType: 'SIDE_STORY', node: { id: 5, idMal: 5, format: 'TV', seasonYear: 2010 } },
    { relationType: 'SEQUEL', node: { id: 2, idMal: 2, format: 'TV', seasonYear: 2005 } },
  ] } };
  assert.deepStrictEqual(ids(orderSeasonsForTmdb(collectFranchiseEntries(root, 'x'))), [1, 2, 5]);
});

runTest('a title without side stories keeps its chain order', () => {
  const root = { id: 1, idMal: 1, format: 'TV', seasonYear: 2000, relations: { edges: [
    { relationType: 'SEQUEL', node: { id: 2, idMal: 2, format: 'TV', seasonYear: 2001 } },
  ] } };
  assert.deepStrictEqual(ids(orderSeasonsForTmdb(collectFranchiseEntries(root, 'x'))), [1, 2]);
});

console.log(`\nTests completed: ${passedTests}/${TOTAL} passed.`);
