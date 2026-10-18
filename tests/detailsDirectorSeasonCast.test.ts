import assert from 'node:assert';
import type { TMDBCast, TMDBCrew, TMDBMovieDetails, TMDBTVDetails, TMDBSeasonDetails } from '../src/types/tmdb';

console.log('\n--- Details Page Director & Season Cast Test Suite (Issue #211) ---\n');

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

// Helper duplicating the extraction logic used in Details.mobile.tsx & Details.tv.tsx
function extractDirectorsAndCreators(
  details: (TMDBMovieDetails | TMDBTVDetails) | null,
  mediaType: 'movie' | 'tv',
  selectedSeasonData: { season: number; cast: TMDBCast[]; crew: TMDBCrew[] } | null
) {
  if (!details) return { directors: [], creators: [] };

  let rawDirectors: TMDBCrew[] = [];
  if (mediaType === 'movie') {
    rawDirectors = details.credits?.crew?.filter((c) => c.job === 'Director') || [];
  } else {
    const seasonDirectors = selectedSeasonData?.crew?.filter((c) => c.job === 'Director') || [];
    const showDirectors = details.credits?.crew?.filter((c) => c.job === 'Director') || [];
    rawDirectors = seasonDirectors.length > 0 ? seasonDirectors : showDirectors;
  }

  const seenDirectorIds = new Set<number>();
  const uniqueDirectors = rawDirectors.filter((d) => {
    if (!d || !d.id || seenDirectorIds.has(d.id)) return false;
    seenDirectorIds.add(d.id);
    return true;
  });

  let tvCreators: { id: number; name: string; profile_path: string | null }[] = [];
  if (mediaType === 'tv' && 'created_by' in details && Array.isArray(details.created_by)) {
    tvCreators = details.created_by;
  }

  return { directors: uniqueDirectors, creators: tvCreators };
}

function resolveDisplayCast(
  details: (TMDBMovieDetails | TMDBTVDetails) | null,
  mediaType: 'movie' | 'tv',
  selectedSeasonData: { season: number; cast: TMDBCast[]; crew: TMDBCrew[] } | null
) {
  if (mediaType === 'tv' && selectedSeasonData?.cast && selectedSeasonData.cast.length > 0) {
    return selectedSeasonData.cast;
  }
  return details?.credits?.cast || [];
}

// 1. Movie director extraction
runTest('Extracts single director for a movie', () => {
  const movieDetails: Partial<TMDBMovieDetails> = {
    id: 872585,
    title: 'Oppenheimer',
    credits: {
      cast: [],
      crew: [
        { id: 525, name: 'Christopher Nolan', job: 'Director', department: 'Directing' },
        { id: 999, name: 'Emma Thomas', job: 'Producer', department: 'Production' }
      ]
    }
  };

  const { directors, creators } = extractDirectorsAndCreators(movieDetails as TMDBMovieDetails, 'movie', null);
  assert.strictEqual(directors.length, 1);
  assert.strictEqual(directors[0].name, 'Christopher Nolan');
  assert.strictEqual(creators.length, 0);
});

// 2. Movie multiple directors and deduplication
runTest('Extracts multiple directors and deduplicates duplicate job entries', () => {
  const movieDetails: Partial<TMDBMovieDetails> = {
    id: 299534,
    title: 'Avengers: Endgame',
    credits: {
      cast: [],
      crew: [
        { id: 19271, name: 'Anthony Russo', job: 'Director', department: 'Directing' },
        { id: 19272, name: 'Joe Russo', job: 'Director', department: 'Directing' },
        { id: 19271, name: 'Anthony Russo', job: 'Director', department: 'Directing' } // Duplicate
      ]
    }
  };

  const { directors } = extractDirectorsAndCreators(movieDetails as TMDBMovieDetails, 'movie', null);
  assert.strictEqual(directors.length, 2);
  assert.strictEqual(directors[0].name, 'Anthony Russo');
  assert.strictEqual(directors[1].name, 'Joe Russo');
});

// 3. TV show creators (created_by)
runTest('Extracts creators for TV show', () => {
  const tvDetails: Partial<TMDBTVDetails> = {
    id: 1396,
    name: 'Breaking Bad',
    created_by: [
      { id: 66633, name: 'Vince Gilligan', profile_path: '/vg.jpg' }
    ],
    credits: {
      cast: [],
      crew: []
    }
  };

  const { directors, creators } = extractDirectorsAndCreators(tvDetails as TMDBTVDetails, 'tv', null);
  assert.strictEqual(creators.length, 1);
  assert.strictEqual(creators[0].name, 'Vince Gilligan');
  assert.strictEqual(directors.length, 0);
});

// 4. TV show season-specific directors
runTest('Extracts season-specific director when season credits are present', () => {
  const tvDetails: Partial<TMDBTVDetails> = {
    id: 87108,
    name: 'Chernobyl',
    created_by: [
      { id: 7490, name: 'Craig Mazin', profile_path: null }
    ],
    credits: {
      cast: [],
      crew: []
    }
  };

  const season1Data = {
    season: 1,
    cast: [],
    crew: [
      { id: 54444, name: 'Johan Renck', job: 'Director', department: 'Directing' }
    ]
  };

  const { directors, creators } = extractDirectorsAndCreators(tvDetails as TMDBTVDetails, 'tv', season1Data);
  assert.strictEqual(creators.length, 1);
  assert.strictEqual(creators[0].name, 'Craig Mazin');
  assert.strictEqual(directors.length, 1);
  assert.strictEqual(directors[0].name, 'Johan Renck');
});

// 5. Season-specific cast replaces series cast
runTest('Series Cast & Crew updates dynamically when a season is selected', () => {
  const tvDetails: Partial<TMDBTVDetails> = {
    id: 1399,
    name: 'Game of Thrones',
    credits: {
      cast: [
        { id: 100, name: 'Emilia Clarke', character: 'Daenerys Targaryen', profile_path: null, order: 0 },
        { id: 101, name: 'Kit Harington', character: 'Jon Snow', profile_path: null, order: 1 }
      ],
      crew: []
    }
  };

  // Initially before season selection: show series cast
  const initialCast = resolveDisplayCast(tvDetails as TMDBTVDetails, 'tv', null);
  assert.strictEqual(initialCast.length, 2);
  assert.strictEqual(initialCast[0].name, 'Emilia Clarke');

  // Season 1 selected (with Sean Bean as Ned Stark)
  const season1Data = {
    season: 1,
    cast: [
      { id: 48, name: 'Sean Bean', character: 'Ned Stark', profile_path: null, order: 0 },
      { id: 49, name: 'Mark Addy', character: 'Robert Baratheon', profile_path: null, order: 1 }
    ],
    crew: []
  };

  const season1Cast = resolveDisplayCast(tvDetails as TMDBTVDetails, 'tv', season1Data);
  assert.strictEqual(season1Cast.length, 2);
  assert.strictEqual(season1Cast[0].name, 'Sean Bean');
  assert.strictEqual(season1Cast[0].character, 'Ned Stark');

  // Season 4 selected (with Pedro Pascal as Oberyn Martell)
  const season4Data = {
    season: 4,
    cast: [
      { id: 1253360, name: 'Pedro Pascal', character: 'Oberyn Martell', profile_path: null, order: 0 }
    ],
    crew: []
  };

  const season4Cast = resolveDisplayCast(tvDetails as TMDBTVDetails, 'tv', season4Data);
  assert.strictEqual(season4Cast.length, 1);
  assert.strictEqual(season4Cast[0].name, 'Pedro Pascal');
});

// 6. Fallback to series cast if season credits are empty
runTest('Falls back to show credits cast if season cast is empty', () => {
  const tvDetails: Partial<TMDBTVDetails> = {
    id: 100,
    name: 'Special Show',
    credits: {
      cast: [
        { id: 1, name: 'Actor A', character: 'Role A', profile_path: null, order: 0 }
      ],
      crew: []
    }
  };

  const emptySeasonData = {
    season: 1,
    cast: [],
    crew: []
  };

  const cast = resolveDisplayCast(tvDetails as TMDBTVDetails, 'tv', emptySeasonData);
  assert.strictEqual(cast.length, 1);
  assert.strictEqual(cast[0].name, 'Actor A');
});

console.log(`\nTests completed: ${passedTests}/6 passed.\n`);
