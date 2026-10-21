import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { COUNTRY_TO_LANGUAGES } from '../src/services/tmdb';

// Simulate the search country filter logic as used in Search.mobile.tsx and Search.tv.tsx
function filterItemByCountry(item: any, selectedCountry: string): boolean {
  if (!selectedCountry) return true;
  const originCountries: string[] = item.origin_country || [];
  if (originCountries.includes(selectedCountry)) return true;
  const langs = COUNTRY_TO_LANGUAGES[selectedCountry];
  if (langs && item.original_language && langs.includes(item.original_language)) {
    if (originCountries.length > 0) {
      return originCountries.includes(selectedCountry);
    }
    return true;
  }
  return false;
}

console.log('--- Testing Search Country Filter (Issue #244) ---');

// 1. Verify COUNTRY_TO_LANGUAGES mapping for Malaysia
assert.ok(Array.isArray(COUNTRY_TO_LANGUAGES.MY), 'MY should be defined in COUNTRY_TO_LANGUAGES');
assert.ok(COUNTRY_TO_LANGUAGES.MY.includes('ms'), 'MY should include ms (Malay)');
assert.ok(!COUNTRY_TO_LANGUAGES.MY.includes('en'), 'MY must NOT include en (would leak Hollywood titles)');
assert.ok(!COUNTRY_TO_LANGUAGES.MY.includes('zh'), 'MY must NOT include zh (would leak Chinese titles)');
assert.ok(!COUNTRY_TO_LANGUAGES.MY.includes('ta'), 'MY must NOT include ta (would leak Indian titles)');
console.log('✓ Verified COUNTRY_TO_LANGUAGES.MY does not leak global languages');

// 2. Test Hollywood titles rejection when MY Malaysia is selected
const finalDestinationMovie = {
  id: 574475,
  title: 'Final Destination: Bloodlines',
  media_type: 'movie',
  original_language: 'en',
  origin_country: ['US']
};

const finalDestinationWithoutCountry = {
  id: 574475,
  title: 'Final Destination: Bloodlines',
  media_type: 'movie',
  original_language: 'en'
};

const alvinMovie = {
  id: 258509,
  title: 'Alvin and the Chipmunks: The Road Chip',
  media_type: 'movie',
  original_language: 'en',
  origin_country: ['US']
};

const madMaxMovie = {
  id: 76163,
  title: 'Mad Max 2',
  media_type: 'movie',
  original_language: 'en',
  origin_country: ['AU', 'US']
};

assert.strictEqual(
  filterItemByCountry(finalDestinationMovie, 'MY'),
  false,
  'Final Destination with US origin must be rejected when filtering by MY'
);
assert.strictEqual(
  filterItemByCountry(finalDestinationWithoutCountry, 'MY'),
  false,
  'Final Destination with only original_language: en must be rejected when filtering by MY'
);
assert.strictEqual(
  filterItemByCountry(alvinMovie, 'MY'),
  false,
  'Alvin and the Chipmunks must be rejected when filtering by MY'
);
assert.strictEqual(
  filterItemByCountry(madMaxMovie, 'MY'),
  false,
  'Mad Max 2 must be rejected when filtering by MY'
);
console.log('✓ Hollywood & foreign titles successfully filtered out when MY Malaysia is selected');

// 3. Test Malaysian content acceptance
const celaTvSeries = {
  id: 123456,
  name: 'Cela',
  media_type: 'tv',
  original_language: 'ms',
  origin_country: ['MY']
};

const matKilauMovie = {
  id: 988595,
  title: 'Mat Kilau',
  media_type: 'movie',
  original_language: 'ms',
  origin_country: ['MY']
};

const abangAdikMovie = {
  id: 1027982,
  title: 'Abang Adik',
  media_type: 'movie',
  original_language: 'zh',
  origin_country: ['MY', 'TW']
};

assert.strictEqual(
  filterItemByCountry(celaTvSeries, 'MY'),
  true,
  'Cela TV series from MY must be accepted'
);
assert.strictEqual(
  filterItemByCountry(matKilauMovie, 'MY'),
  true,
  'Mat Kilau movie from MY must be accepted'
);
assert.strictEqual(
  filterItemByCountry(abangAdikMovie, 'MY'),
  true,
  'Abang Adik (Malaysian multilingual production in zh) with MY origin must be accepted'
);
console.log('✓ Genuine Malaysian titles (TV series & movies) successfully match MY Malaysia filter');

// 4. Source file inspection
const tmdbSrc = fs.readFileSync(path.join(process.cwd(), 'src/services/tmdb.ts'), 'utf-8');
assert.ok(
  tmdbSrc.includes('getMovieOriginCountries'),
  'src/services/tmdb.ts must export getMovieOriginCountries helper'
);

const searchMobileSrc = fs.readFileSync(path.join(process.cwd(), 'src/pages/Search/Search.mobile.tsx'), 'utf-8');
assert.ok(
  searchMobileSrc.includes('getMovieOriginCountries'),
  'Search.mobile.tsx must call getMovieOriginCountries for movie enrichment'
);

const searchTvSrc = fs.readFileSync(path.join(process.cwd(), 'src/pages/Search/Search.tv.tsx'), 'utf-8');
assert.ok(
  searchTvSrc.includes('getMovieOriginCountries'),
  'Search.tv.tsx must call getMovieOriginCountries for movie enrichment'
);

console.log('✓ All Search Country Filter tests passed successfully!');
