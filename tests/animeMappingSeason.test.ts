import assert from 'node:assert';
import {
  walkFranchise,
  orderSeasonsForTmdb,
  groupSeasons,
  routeEpisode,
  type AniListFetchById,
} from '../src/services/animeMappingService';

console.log('\n--- Anime season mapping (Issues #288, #298) ---\n');

let passedTests = 0;
const TOTAL = 9;

async function runTest(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err: any) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

type Spec = { id: number; format?: string; eps?: number; year?: number; title: string; sequels?: number[]; sides?: number[] };

/** Builds an in-memory AniList graph; AniList returns related nodes without their own relations. */
function graph(specs: Spec[]) {
  const byId = new Map(specs.map((s) => [s.id, s]));
  const stub = (id: number) => {
    const s = byId.get(id)!;
    return { id: s.id, idMal: s.id, format: s.format ?? 'TV', episodes: s.eps, seasonYear: s.year, title: { english: s.title } };
  };
  const full = (id: number) => ({
    ...stub(id),
    relations: {
      edges: [
        ...(byId.get(id)!.sides ?? []).map((n) => ({ relationType: 'SIDE_STORY', node: stub(n) })),
        ...(byId.get(id)!.sequels ?? []).map((n) => ({ relationType: 'SEQUEL', node: stub(n) })),
      ],
    },
  });
  const requests: number[] = [];
  const fetchById: AniListFetchById = async (id) => {
    requests.push(id);
    return byId.has(id) ? (full(id) as any) : null;
  };
  return { root: (id: number) => full(id) as any, fetchById, requests };
}

const ids = (list: { malId: number }[]) => list.map((e) => e.malId);
const seasonIds = (entries: Parameters<typeof orderSeasonsForTmdb>[0]) =>
  groupSeasons(orderSeasonsForTmdb(entries)).map((s) => s.parts.map((p) => p.malId));

(async () => {
  await runTest('MHA: all 8 TV seasons are reached (one fetch per hop)', async () => {
    const chain = [31964, 33486, 36456, 38408, 41587, 49918, 54789, 60098];
    const g = graph(chain.map((id, i) => ({ id, eps: 13, year: 2016 + i, title: `MHA ${i + 1}`, sequels: chain[i + 1] ? [chain[i + 1]] : [] })));
    const { entries, complete } = await walkFranchise(g.root(31964), g.fetchById, 'MHA');
    assert.deepStrictEqual(ids(entries), chain);
    assert.strictEqual(complete, true);
    assert.strictEqual(g.requests.length, 7);
  });

  await runTest('FMP: the TV side story is placed by air year', async () => {
    const g = graph([
      { id: 71, eps: 24, year: 2002, title: 'Full Metal Panic!', sequels: [73], sides: [72] },
      { id: 72, eps: 12, year: 2003, title: 'Full Metal Panic? Fumoffu' },
      { id: 73, eps: 13, year: 2005, title: 'The Second Raid', sequels: [31931] },
      { id: 31931, eps: 12, year: 2018, title: 'Invisible Victory' },
    ]);
    const { entries } = await walkFranchise(g.root(71), g.fetchById, 'FMP');
    assert.deepStrictEqual(seasonIds(entries), [[71], [72], [73], [31931]]);
  });

  await runTest('SAO: a special sequel is skipped and a movie in the chain is not a season', async () => {
    const g = graph([
      { id: 11757, eps: 25, year: 2012, title: 'Sword Art Online', sequels: [20021, 21881] },
      { id: 20021, format: 'SPECIAL', eps: 1, year: 2013, title: 'EXTRA EDITION' },
      { id: 21881, eps: 24, year: 2014, title: 'Sword Art Online II', sequels: [31765] },
      { id: 31765, format: 'MOVIE', eps: 1, year: 2017, title: 'Ordinal Scale', sequels: [36474] },
      { id: 36474, eps: 24, year: 2018, title: 'Alicization', sequels: [39597] },
      { id: 39597, eps: 12, year: 2019, title: 'Alicization - War of Underworld', sequels: [40540] },
      { id: 40540, eps: 11, year: 2020, title: 'Alicization - War of Underworld Part 2', sequels: [53529] },
      { id: 53529, format: 'MOVIE', title: 'Integral Domain' },
    ]);
    const { entries } = await walkFranchise(g.root(11757), g.fetchById, 'SAO');
    assert.deepStrictEqual(seasonIds(entries), [[11757], [21881], [36474], [39597, 40540]]);
  });

  await runTest('Mushoku: cour 2 and part 2 fold into their season (TMDB numbering)', async () => {
    const g = graph([
      { id: 39535, eps: 11, year: 2021, title: 'Mushoku Tensei', sequels: [45576] },
      { id: 45576, eps: 12, year: 2021, title: 'Mushoku Tensei Cour 2', sequels: [51179] },
      { id: 51179, eps: 13, year: 2023, title: 'Mushoku Tensei Season 2', sequels: [55888] },
      { id: 55888, eps: 12, year: 2024, title: 'Mushoku Tensei Season 2 Part 2', sequels: [59193] },
      { id: 59193, eps: 14, year: 2026, title: 'Mushoku Tensei Season 3' },
    ]);
    const { entries } = await walkFranchise(g.root(39535), g.fetchById, 'Mushoku');
    assert.deepStrictEqual(seasonIds(entries), [[39535, 45576], [51179, 55888], [59193]]);
  });

  await runTest('episodes inside a split season route to the right part', () => {
    const season = { malId: 51179, title: 'S2', episodes: 25, parts: [{ malId: 51179, episodes: 13 }, { malId: 55888, episodes: 12 }] };
    assert.deepStrictEqual(routeEpisode(season, 1), { malId: 51179, episode: 1 });
    assert.deepStrictEqual(routeEpisode(season, 13), { malId: 51179, episode: 13 });
    assert.deepStrictEqual(routeEpisode(season, 14), { malId: 55888, episode: 1 });
    assert.deepStrictEqual(routeEpisode(season, 99), { malId: 55888, episode: 86 });
  });

  await runTest('Slime: an OVA between two seasons is walked through but not counted', async () => {
    const g = graph([
      { id: 37430, eps: 24, year: 2018, title: 'Slime', sequels: [54565] },
      { id: 54565, format: 'OVA', eps: 1, year: 2023, title: 'Visions of Coleus', sequels: [39551] },
      { id: 39551, eps: 12, year: 2021, title: 'Slime Season 2' },
    ]);
    const { entries } = await walkFranchise(g.root(37430), g.fetchById, 'Slime');
    assert.deepStrictEqual(seasonIds(entries), [[37430], [39551]]);
  });

  await runTest('a failed request ends the walk as incomplete, keeping what was found', async () => {
    const g = graph([
      { id: 1, eps: 12, year: 2000, title: 'A', sequels: [2] },
      { id: 2, eps: 12, year: 2001, title: 'A 2', sequels: [3] },
      { id: 3, eps: 12, year: 2002, title: 'A 3' },
    ]);
    const failing: AniListFetchById = async (id) => (id === 3 ? null : g.fetchById(id));
    const { entries, complete } = await walkFranchise(g.root(1), failing, 'A');
    assert.deepStrictEqual(ids(entries), [1, 2]);
    assert.strictEqual(complete, false);
  });

  await runTest('a very long chain stops at the hop cap and is incomplete', async () => {
    const specs: Spec[] = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, eps: 12, year: 2000 + i, title: `T${i + 1}`, sequels: i < 19 ? [i + 2] : [] }));
    const g = graph(specs);
    const { entries, complete } = await walkFranchise(g.root(1), g.fetchById, 'T');
    assert.strictEqual(complete, false);
    assert.strictEqual(entries.length, 12);
  });

  await runTest('non-TV or undated side stories and other relations are ignored', async () => {
    const g = graph([
      { id: 1, eps: 12, year: 2000, title: 'A', sides: [2, 3], sequels: [] },
      { id: 2, format: 'MOVIE', eps: 1, year: 2001, title: 'Movie' },
      { id: 3, format: 'TV', eps: 12, title: 'Undated' },
    ]);
    const { entries } = await walkFranchise(g.root(1), g.fetchById, 'A');
    assert.deepStrictEqual(ids(entries), [1]);
  });

  console.log(`\nTests completed: ${passedTests}/${TOTAL} passed.`);
})();
