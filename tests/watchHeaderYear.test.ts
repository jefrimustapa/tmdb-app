import assert from 'node:assert';
import type { TMDBMovieDetails, TMDBTVDetails, TMDBSeasonDetails } from '../src/types/tmdb';
import { getWatchHeaderYear } from '../src/utils/watchHeader';

console.log('\n--- Watch Page Header Year Test Suite (Issue #249) ---\n');

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

// 1. Movie release year
runTest('Extracts movie release year from details.release_date', () => {
  const movieDetails: Partial<TMDBMovieDetails> = {
    id: 27205,
    title: 'Inception',
    release_date: '2010-07-16'
  };

  const year = getWatchHeaderYear({
    mediaType: 'movie',
    details: movieDetails as TMDBMovieDetails
  });

  assert.strictEqual(year, '2010');
});

// 2. TV series with active seasonDetails air_date
runTest('Extracts TV season air year from seasonDetails.air_date', () => {
  const tvDetails: Partial<TMDBTVDetails> = {
    id: 83631,
    name: 'What We Do in the Shadows',
    first_air_date: '2019-03-27'
  };

  const seasonDetails: Partial<TMDBSeasonDetails> = {
    season_number: 5,
    air_date: '2023-07-13'
  };

  const year = getWatchHeaderYear({
    mediaType: 'tv',
    details: tvDetails as TMDBTVDetails,
    seasonParam: 5,
    seasonDetails: seasonDetails as TMDBSeasonDetails
  });

  assert.strictEqual(year, '2023');
});

// 3. TV series season air date from details.seasons summary
runTest('Extracts TV season air year from details.seasons summary when seasonDetails has no air_date', () => {
  const tvDetails: Partial<TMDBTVDetails> = {
    id: 83631,
    name: 'What We Do in the Shadows',
    first_air_date: '2019-03-27',
    seasons: [
      { id: 1, name: 'Season 1', overview: '', poster_path: null, season_number: 1, episode_count: 10, air_date: '2019-03-27' },
      { id: 2, name: 'Season 2', overview: '', poster_path: null, season_number: 2, episode_count: 10, air_date: '2020-04-15' },
      { id: 3, name: 'Season 3', overview: '', poster_path: null, season_number: 3, episode_count: 10, air_date: '2021-09-02' }
    ]
  };

  const yearS1 = getWatchHeaderYear({
    mediaType: 'tv',
    details: tvDetails as TMDBTVDetails,
    seasonParam: 1
  });
  assert.strictEqual(yearS1, '2019');

  const yearS2 = getWatchHeaderYear({
    mediaType: 'tv',
    details: tvDetails as TMDBTVDetails,
    seasonParam: 2
  });
  assert.strictEqual(yearS2, '2020');

  const yearS3 = getWatchHeaderYear({
    mediaType: 'tv',
    details: tvDetails as TMDBTVDetails,
    seasonParam: 3
  });
  assert.strictEqual(yearS3, '2021');
});

// 4. Fallback to first_air_date if season air_date is missing or empty
runTest('Falls back to first_air_date if season air_date is missing', () => {
  const tvDetails: Partial<TMDBTVDetails> = {
    id: 99999,
    name: 'Upcoming Show',
    first_air_date: '2024-01-01',
    seasons: [
      { id: 1, name: 'Season 1', overview: '', poster_path: null, season_number: 1, episode_count: 10, air_date: '' }
    ]
  };

  const year = getWatchHeaderYear({
    mediaType: 'tv',
    details: tvDetails as TMDBTVDetails,
    seasonParam: 1
  });

  assert.strictEqual(year, '2024');
});

// 5. Handles null/empty details safely
runTest('Handles null or missing details safely', () => {
  const yearNull = getWatchHeaderYear({
    mediaType: 'movie',
    details: null
  });
  assert.strictEqual(yearNull, null);

  const yearEmptyMovie = getWatchHeaderYear({
    mediaType: 'movie',
    details: { id: 1, title: 'No Date Movie', release_date: '' } as TMDBMovieDetails
  });
  assert.strictEqual(yearEmptyMovie, null);
});

console.log(`Tests completed: ${passedTests}/5 passed.\n`);
