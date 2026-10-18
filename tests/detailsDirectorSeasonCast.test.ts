import assert from 'node:assert';
import type { TMDBCast, TMDBCrew, TMDBMovieDetails, TMDBTVDetails } from '../src/types/tmdb';
import { extractCrewMembers } from '../src/utils/crewHelper';

console.log('\n--- Details Page Crew & Season Cast Test Suite (Issue #211) ---\n');

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

// 1. Movie crew extraction with Directing, Writing, Production departments
runTest('Extracts Directing, Writing, and Production crew for movie (max 3 per department)', () => {
  const movieDetails: Partial<TMDBMovieDetails> = {
    id: 872585,
    title: 'Oppenheimer',
    credits: {
      cast: [],
      crew: [
        { id: 525, name: 'Christopher Nolan', job: 'Director', department: 'Directing' },
        { id: 525, name: 'Christopher Nolan', job: 'Screenplay', department: 'Writing' },
        { id: 999, name: 'Emma Thomas', job: 'Producer', department: 'Production' },
        { id: 1000, name: 'Charles Roven', job: 'Producer', department: 'Production' },
        { id: 525, name: 'Christopher Nolan', job: 'Producer', department: 'Production' },
        { id: 1001, name: 'Extra Producer 4', job: 'Executive Producer', department: 'Production' }, // Exceeds max 3
        { id: 1002, name: 'Sound Designer', job: 'Sound Designer', department: 'Sound' } // Different department
      ]
    }
  };

  const crew = extractCrewMembers(movieDetails as TMDBMovieDetails, 'movie', null);

  const directing = crew.filter((c) => c.department === 'Directing');
  const writing = crew.filter((c) => c.department === 'Writing');
  const production = crew.filter((c) => c.department === 'Production');
  const sound = crew.filter((c) => c.department === 'Sound');

  assert.strictEqual(directing.length, 1);
  assert.strictEqual(directing[0].name, 'Christopher Nolan');
  assert.strictEqual(directing[0].job, 'Director');

  assert.strictEqual(writing.length, 1);
  assert.strictEqual(writing[0].name, 'Christopher Nolan');
  assert.strictEqual(writing[0].job, 'Screenplay');

  assert.strictEqual(production.length, 3, 'Max 3 people in Production department');
  assert.strictEqual(production[0].name, 'Emma Thomas');
  assert.strictEqual(production[1].name, 'Charles Roven');
  assert.strictEqual(production[2].name, 'Christopher Nolan');

  assert.strictEqual(sound.length, 0, 'Departments outside Directing, Writing, Production should not be included');
});

// 2. Movie multiple directors and deduplication within department
runTest('Enforces max 3 and deduplicates duplicate entries within the same department', () => {
  const movieDetails: Partial<TMDBMovieDetails> = {
    id: 299534,
    title: 'Avengers: Endgame',
    credits: {
      cast: [],
      crew: [
        { id: 19271, name: 'Anthony Russo', job: 'Director', department: 'Directing' },
        { id: 19272, name: 'Joe Russo', job: 'Director', department: 'Directing' },
        { id: 19271, name: 'Anthony Russo', job: 'Director', department: 'Directing' }, // Duplicate entry
        { id: 19273, name: 'Assistant Director 1', job: 'First Assistant Director', department: 'Directing' },
        { id: 19274, name: 'Assistant Director 2', job: 'Second Assistant Director', department: 'Directing' } // 4th unique Directing
      ]
    }
  };

  const crew = extractCrewMembers(movieDetails as TMDBMovieDetails, 'movie', null);
  const directing = crew.filter((c) => c.department === 'Directing');

  assert.strictEqual(directing.length, 3, 'Max 3 entries in Directing');
  assert.strictEqual(directing[0].name, 'Anthony Russo');
  assert.strictEqual(directing[1].name, 'Joe Russo');
  assert.strictEqual(directing[2].name, 'Assistant Director 1');
});

// 3. TV show creators (created_by) mapped to Writing department
runTest('TV series created_by entries are included in Writing department (max 3)', () => {
  const tvDetails: Partial<TMDBTVDetails> = {
    id: 1396,
    name: 'Breaking Bad',
    created_by: [
      { id: 66633, name: 'Vince Gilligan', profile_path: '/vg.jpg' }
    ],
    credits: {
      cast: [],
      crew: [
        { id: 100, name: 'Peter Gould', job: 'Writer', department: 'Writing' }
      ]
    }
  };

  const crew = extractCrewMembers(tvDetails as TMDBTVDetails, 'tv', null);
  const writing = crew.filter((c) => c.department === 'Writing');

  assert.strictEqual(writing.length, 2);
  assert.strictEqual(writing[0].name, 'Vince Gilligan');
  assert.strictEqual(writing[0].job, 'Creator');
  assert.strictEqual(writing[1].name, 'Peter Gould');
  assert.strictEqual(writing[1].job, 'Writer');
});

// 4. TV show season-specific crew
runTest('Extracts season-specific crew when season credits are present', () => {
  const tvDetails: Partial<TMDBTVDetails> = {
    id: 87108,
    name: 'Chernobyl',
    created_by: [
      { id: 7490, name: 'Craig Mazin', profile_path: null }
    ],
    credits: {
      cast: [],
      crew: [
        { id: 1, name: 'Show Producer', job: 'Producer', department: 'Production' }
      ]
    }
  };

  const season1Data = {
    season: 1,
    cast: [],
    crew: [
      { id: 54444, name: 'Johan Renck', job: 'Director', department: 'Directing' },
      { id: 7490, name: 'Craig Mazin', job: 'Writer', department: 'Writing' },
      { id: 2, name: 'Jane Featherstone', job: 'Executive Producer', department: 'Production' }
    ]
  };

  const crew = extractCrewMembers(tvDetails as TMDBTVDetails, 'tv', season1Data);

  const directing = crew.filter((c) => c.department === 'Directing');
  assert.strictEqual(directing.length, 1);
  assert.strictEqual(directing[0].name, 'Johan Renck');

  const writing = crew.filter((c) => c.department === 'Writing');
  assert.strictEqual(writing.length, 1, 'Craig Mazin not duplicated despite being in created_by and season writing');
  assert.strictEqual(writing[0].name, 'Craig Mazin');

  const production = crew.filter((c) => c.department === 'Production');
  assert.strictEqual(production.length, 2, 'Contains season producer Jane Featherstone and series producer');
  assert.strictEqual(production[0].name, 'Jane Featherstone');
  assert.strictEqual(production[1].name, 'Show Producer');
});

// 5. Season-specific cast replaces series cast
runTest('Series Cast updates dynamically when a season is selected', () => {
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
