import {
  isExplicitAdultCertification,
  getExplicitAdultMovieRating,
  getExplicitAdultTVRating,
  isMediaExplicitAdult
} from '../src/services/contentRatingFilter.ts';

const cases = [
  { cert: '18SX', country: 'MY', expected: true },
  { cert: '18-SX', country: 'MY', expected: true },
  { cert: '19', country: 'KR', expected: true },
  { cert: 'R18+', country: 'JP', expected: true },
  { cert: 'R-18', country: 'JP', expected: true },
  { cert: 'R 18+', country: 'AU', expected: true },
  { cert: 'NC-17', country: 'US', expected: true },
  { cert: 'R18', country: 'GB', expected: true },
  { cert: 'X 18+', country: 'AU', expected: true },
  { cert: 'X18+', country: 'ZA', expected: true },
  { cert: 'R21', country: 'SG', expected: true },
  { cert: 'Cat III', country: 'HK', expected: true },
  { cert: 'III', country: 'HK', expected: true },
  { cert: '21+', country: 'ID', expected: true },
  { cert: 'D', country: 'MX', expected: true },
  { cert: 'X', country: 'ES', expected: true },
  { cert: 'PG-13', country: 'US', expected: false },
  { cert: 'PG', country: 'US', expected: false },
  { cert: 'G', country: 'US', expected: false },
  { cert: '12', country: 'GB', expected: false },
  { cert: '15', country: 'GB', expected: false },
  { cert: 'TV-14', country: 'US', expected: false },
  { cert: 'TV-PG', country: 'US', expected: false }
];

let failed = 0;
for (const testCase of cases) {
  const result = isExplicitAdultCertification(testCase.cert, testCase.country);
  if (result !== testCase.expected) {
    console.error(`FAIL: ${testCase.cert} (${testCase.country}) expected ${testCase.expected}, got ${result}`);
    failed++;
  }
}

// Test Movie Release Dates Object
const mockMovie = {
  id: 12345,
  title: 'Test Adult Movie',
  overview: 'Test',
  vote_average: 7,
  vote_count: 10,
  popularity: 100,
  original_language: 'en',
  poster_path: null,
  backdrop_path: null,
  runtime: 120,
  tagline: '',
  status: 'Released',
  budget: 0,
  revenue: 0,
  genres: [],
  release_dates: {
    results: [
      {
        iso_3166_1: 'US',
        release_dates: [{ certification: 'R' }]
      },
      {
        iso_3166_1: 'MY',
        release_dates: [{ certification: '18SX' }]
      }
    ]
  }
};

const detectedRating = getExplicitAdultMovieRating(mockMovie);
if (detectedRating !== '18SX') {
  console.error(`FAIL: expected 18SX from movie release dates, got ${detectedRating}`);
  failed++;
}

if (!isMediaExplicitAdult(mockMovie)) {
  console.error('FAIL: expected isMediaExplicitAdult to return true');
  failed++;
}

if (failed === 0) {
  console.log(`✅ All ${cases.length + 2} rating filter test cases passed!`);
  process.exit(0);
} else {
  console.error(`❌ ${failed} tests failed`);
  process.exit(1);
}
