import assert from 'assert';
import { isEpisodeAired } from '../src/services/episodeAirStatus.ts';

let passed = 0;
let total = 0;

function it(desc, fn) {
  total++;
  try {
    fn();
    console.log(`  ✓ ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${desc}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

console.log('\n--- Episode Air Status Test Suite ---\n');

const mockVisionQuestDetails = {
  id: 213375,
  name: 'VisionQuest',
  status: 'Returning Series',
  number_of_seasons: 1,
  number_of_episodes: 8,
  last_episode_to_air: {
    id: 6412926,
    name: 'Theseus',
    air_date: '2026-10-13',
    episode_number: 2,
    season_number: 1,
  },
  next_episode_to_air: {
    id: 6412927,
    name: 'Reboot',
    air_date: '2026-10-20',
    episode_number: 3,
    season_number: 1,
  },
};

it('confirms aired episode when at or before last_episode_to_air with past airDate', () => {
  // S1E1 and S1E2 aired on 2026-10-13
  assert.strictEqual(
    isEpisodeAired(1, 1, '2026-10-13', mockVisionQuestDetails),
    true
  );
  assert.strictEqual(
    isEpisodeAired(1, 2, '2026-10-13', mockVisionQuestDetails),
    true
  );
});

it('rejects unaired episode when after last_episode_to_air in same season', () => {
  // S1E3 has not aired yet (last_episode_to_air is S1E2)
  assert.strictEqual(
    isEpisodeAired(1, 3, '2026-10-20', mockVisionQuestDetails),
    false
  );
  // Even if air_date erroneously held past date, last_episode_to_air protects it:
  assert.strictEqual(
    isEpisodeAired(1, 3, '2026-10-13', mockVisionQuestDetails),
    false
  );
});

it('rejects episode when next_episode_to_air indicates it is upcoming', () => {
  // S1E3 is next_episode_to_air
  assert.strictEqual(
    isEpisodeAired(1, 3, '2026-10-20', mockVisionQuestDetails),
    false
  );
  // S1E4 is after next_episode_to_air
  assert.strictEqual(
    isEpisodeAired(1, 4, '2026-10-20', mockVisionQuestDetails),
    false
  );
});

it('rejects episodes in future seasons beyond last_episode_to_air', () => {
  assert.strictEqual(
    isEpisodeAired(2, 1, '2026-10-13', mockVisionQuestDetails),
    false
  );
});

it('rejects episodes with missing or empty airDate', () => {
  assert.strictEqual(isEpisodeAired(1, 1, null, mockVisionQuestDetails), false);
  assert.strictEqual(isEpisodeAired(1, 1, '', mockVisionQuestDetails), false);
  assert.strictEqual(isEpisodeAired(1, 1, undefined, mockVisionQuestDetails), false);
});

it('correctly checks future air dates even without last_episode_to_air metadata', () => {
  // No details provided
  assert.strictEqual(isEpisodeAired(1, 1, '2020-01-01', null), true);
  assert.strictEqual(isEpisodeAired(1, 1, '2099-01-01', null), false);
});

it('handles invalid season/episode parameters safely', () => {
  assert.strictEqual(isEpisodeAired(NaN, 1, '2020-01-01', null), false);
  assert.strictEqual(isEpisodeAired(1, NaN, '2020-01-01', null), false);
});

console.log(`\nTests completed: ${passed}/${total} passed.\n`);
if (passed === total) {
  process.exit(0);
} else {
  process.exit(1);
}
