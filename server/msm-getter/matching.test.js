import assert from 'assert';
import {
  extractEpisodeInfo,
  extractSeasonInfo,
  cleanBotEchoHeader,
  cleanSearchTitle,
  isBareButton,
  scoreCandidateButton,
  generateSeriesSearchQueries,
} from './index.js';

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

console.log('\n--- MSM-Getter Episode & Search Matching Test Suite ---\n');

console.log('1. Episode Parsing (extractEpisodeInfo)');
it('extracts single-digit and two-digit episodes with word boundaries', () => {
  assert.strictEqual(extractEpisodeInfo('Ep 16')?.episode, 16);
  assert.strictEqual(extractEpisodeInfo('Ep 1')?.episode, 1);
  assert.strictEqual(extractEpisodeInfo('Episod 01')?.episode, 1);
  assert.strictEqual(extractEpisodeInfo('Episode 16')?.episode, 16);
  assert.strictEqual(extractEpisodeInfo('S01E01')?.episode, 1);
  assert.strictEqual(extractEpisodeInfo('S01E16')?.episode, 16);
  assert.strictEqual(extractEpisodeInfo('[ 01 ]')?.episode, 1);
  assert.strictEqual(extractEpisodeInfo('[ 16 ]')?.episode, 16);
  assert.strictEqual(extractEpisodeInfo('( 01 )')?.episode, 1);
});

it('extracts episode numbers from dot/underscore delimited file names', () => {
  assert.strictEqual(extractEpisodeInfo('Hantu.Punya.Boss.01.720p.mkv')?.episode, 1);
  assert.strictEqual(extractEpisodeInfo('Hantu_Punya_Boss_16_1080p.mp4')?.episode, 16);
});

it('detects episode ranges and batches', () => {
  const range = extractEpisodeInfo('Hantu Punya Boss Ep 01-16 END');
  assert.ok(range && range.isRange);
  assert.strictEqual(range.start, 1);
  assert.strictEqual(range.end, 16);
});

console.log('\n2. Season Parsing (extractSeasonInfo)');
it('extracts single and two-digit seasons and Roman numerals', () => {
  assert.strictEqual(extractSeasonInfo('S01'), 1);
  assert.strictEqual(extractSeasonInfo('Season 1'), 1);
  assert.strictEqual(extractSeasonInfo('Musim 2'), 2);
  assert.strictEqual(extractSeasonInfo('Season 10'), 10);
  assert.strictEqual(extractSeasonInfo('Season II'), 2);
  assert.strictEqual(extractSeasonInfo('Musim III'), 3);
});

console.log('\n3. Bot Echo Header Stripping (cleanBotEchoHeader)');
it('strips emoji-prefixed and multi-line echo headers', () => {
  const echoed = '🔍 Hasil carian untuk "Hantu Punya Boss Episod 1":\nHantu Punya Boss Episod 16 [720p]';
  const cleaned = cleanBotEchoHeader(echoed);
  assert.strictEqual(cleaned, 'Hantu Punya Boss Episod 16 [720p]');

  const plainEcho = '2 Results for Gadis Masa E04 (1/1)\r\nGadis Masa E04 720p';
  assert.strictEqual(cleanBotEchoHeader(plainEcho), 'Gadis Masa E04 720p');
});

console.log('\n4. Title Sanitization (cleanSearchTitle)');
it('sanitizes titles and acronym punctuation cleanly', () => {
  assert.strictEqual(cleanSearchTitle('Spider-Man: No Way Home (2021)'), 'Spider Man No Way Home');
  assert.strictEqual(cleanSearchTitle('S.W.A.T.'), 'S W A T');
  assert.strictEqual(cleanSearchTitle('Hantu Punya Boss [Astro]'), 'Hantu Punya Boss');
});

console.log('\n5. Bare Button Detection (isBareButton)');
it('correctly identifies bare action/quality buttons', () => {
  assert.strictEqual(isBareButton('[ 720p ]'), true);
  assert.strictEqual(isBareButton('[ WebRip 720p ]'), true);
  assert.strictEqual(isBareButton('[ WEB-DL 1080p ]'), true);
  assert.strictEqual(isBareButton('[ HEVC 720p ]'), true);
  assert.strictEqual(isBareButton('[ 01 ]'), true);
  assert.strictEqual(isBareButton('[ Download ]'), true);
  assert.strictEqual(isBareButton('Hantu Punya Boss S01E01 720p'), false);
});

console.log('\n6. Button Scoring & Hard Disqualification (scoreCandidateButton)');
const contextTvEp1 = {
  isTv: true,
  title: 'Hantu Punya Boss',
  year: '2024',
  sNum: 1,
  eNum: 1,
  targetQuality: 720,
};

it('disqualifies Episode 16 when Episode 1 is searched (THE USER BUG)', () => {
  const btnEp16 = { className: 'KeyboardButtonUrlAuth', url: 'https://t.me/msm32bot/link/ep16', text: 'Ep 16 1080p' };
  const msg = { message: 'Hantu Punya Boss' };
  const score = scoreCandidateButton(btnEp16, msg, contextTvEp1);
  assert.strictEqual(score, -999, 'Ep 16 button must be hard disqualified (-999)');
});

it('disqualifies Episode 10 when Episode 1 is searched', () => {
  const btnEp10 = { className: 'KeyboardButtonUrlAuth', url: 'https://t.me/msm32bot/link/ep10', text: 'Ep 10 720p' };
  const msg = { message: 'Hantu Punya Boss' };
  const score = scoreCandidateButton(btnEp10, msg, contextTvEp1);
  assert.strictEqual(score, -999, 'Ep 10 button must be hard disqualified (-999)');
});

it('awards high score for matching Episode 1 buttons', () => {
  const btnEp1 = { className: 'KeyboardButtonUrlAuth', url: 'https://t.me/msm32bot/link/ep1', text: 'Hantu Punya Boss Ep 1 720p' };
  const msg = { message: 'Hantu Punya Boss' };
  const score = scoreCandidateButton(btnEp1, msg, contextTvEp1);
  assert.ok(score >= 200, `Ep 1 button should score >= 200, got ${score}`);
});

it('correctly handles bare buttons by checking parent message context', () => {
  const btnBare = { className: 'KeyboardButtonUrlAuth', url: 'https://t.me/msm32bot/link/bare', text: '[ WebRip 720p ]' };
  
  // Bare button where parent message is Ep 16 -> MUST DISQUALIFY
  const msgEp16 = { message: 'Hantu Punya Boss Episod 16' };
  const scoreWrong = scoreCandidateButton(btnBare, msgEp16, contextTvEp1);
  assert.strictEqual(scoreWrong, -999, 'Bare button with Ep 16 in message must be disqualified');

  // Bare button where parent message is Ep 1 -> MUST MATCH
  const msgEp1 = { message: 'Hantu Punya Boss Episod 1' };
  const scoreRight = scoreCandidateButton(btnBare, msgEp1, contextTvEp1);
  assert.ok(scoreRight >= 200, `Bare button with Ep 1 in message should score >= 200, got ${scoreRight}`);
});

it('disqualifies Ep 16 even when bot echoes search query in header', () => {
  const btnBare = { className: 'KeyboardButtonUrlAuth', url: 'https://t.me/msm32bot/link/bare', text: '[ 720p ]' };
  const msgWithEcho = { message: '🔍 Hasil carian untuk "Hantu Punya Boss Episod 1":\nHantu Punya Boss Episod 16' };
  const score = scoreCandidateButton(btnBare, msgWithEcho, contextTvEp1);
  assert.strictEqual(score, -999, 'Bot echo must be stripped and Ep 16 must be disqualified');
});

it('disqualifies conflicting Season 10 when Season 1 is requested', () => {
  const btnSeason10 = { className: 'KeyboardButtonUrlAuth', url: 'https://t.me/msm32bot/link/s10', text: 'Show Name Season 10 Ep 1' };
  const msg = { message: 'Show Name' };
  const score = scoreCandidateButton(btnSeason10, msg, { isTv: true, title: 'Show Name', sNum: 1, eNum: 1 });
  assert.strictEqual(score, -999, 'Season 10 candidate must be disqualified when searching Season 1');
});

it('disqualifies conflicting release years for movie reboots/remakes', () => {
  const contextMovie2024 = { isTv: false, title: 'Avatar', year: '2024', targetQuality: 720 };
  const btn2005 = { className: 'KeyboardButtonUrlAuth', url: 'https://t.me/msm32bot/link/2005', text: 'Avatar 2005 720p' };
  const btn2024 = { className: 'KeyboardButtonUrlAuth', url: 'https://t.me/msm32bot/link/2024', text: 'Avatar 2024 720p' };
  const msg = { message: '' };

  assert.strictEqual(scoreCandidateButton(btn2005, msg, contextMovie2024), -999, '2005 movie must be disqualified when 2024 requested');
  assert.ok(scoreCandidateButton(btn2024, msg, contextMovie2024) >= 200, '2024 movie should score high');
});

it('disqualifies un-versioned candidates with no matching year when Season > 1 is requested', () => {
  const contextS2 = { isTv: true, title: 'Reacher', year: '2023', sNum: 2, eNum: 1, totalSeasons: 2, targetQuality: 720 };
  const btnBareS1 = { className: 'KeyboardButtonUrlAuth', url: 'https://t.me/msm32bot/link/bare', text: 'Reacher Episod 1 720p' };
  const btnMatchedS2 = { className: 'KeyboardButtonUrlAuth', url: 'https://t.me/msm32bot/link/s2', text: 'Reacher S02E01 720p' };
  const btnMatchedYear = { className: 'KeyboardButtonUrlAuth', url: 'https://t.me/msm32bot/link/year', text: 'Reacher 2023 Episod 1 720p' };
  const msg = { message: '' };

  assert.strictEqual(scoreCandidateButton(btnBareS1, msg, contextS2), -999, 'Un-versioned episode must be disqualified for Season 2');
  assert.ok(scoreCandidateButton(btnMatchedS2, msg, contextS2) >= 150, 'S02E01 button should match Season 2');
  assert.ok(scoreCandidateButton(btnMatchedYear, msg, contextS2) >= 150, 'Matching release year button should match Season 2');
});

console.log('\n7. Search Query Generation (generateSeriesSearchQueries)');
it('generates the adaptive 12 query patterns without episode/episod for Season 1', () => {
  const queries = generateSeriesSearchQueries('Kelas Cikgu Hiragi', 1, 3, 1, '2024');
  const expectedPatterns = [
    'Kelas Cikgu Hiragi EP03',
    'Kelas Cikgu Hiragi E03',
    'Kelas Cikgu Hiragi S01E03',
    'Kelas Cikgu Hiragi 2024 EP03',
    'Kelas Cikgu Hiragi 2024 E03',
    'Kelas Cikgu Hiragi 2024 S01E03',
    'Kelas Cikgu Hiragi EP3',
    'Kelas Cikgu Hiragi E3',
    'Kelas Cikgu Hiragi S1E3',
    'Kelas Cikgu Hiragi 2024',
    'Kelas Cikgu Hiragi S01',
    'Kelas Cikgu Hiragi'
  ];

  assert.strictEqual(queries.length, expectedPatterns.length, `Queries count should be ${expectedPatterns.length}`);
  for (let i = 0; i < expectedPatterns.length; i++) {
    assert.strictEqual(queries[i], expectedPatterns[i], `Query pattern index ${i} should be ${expectedPatterns[i]}`);
  }
  // Ensure no 'episode' or 'episod' appears anywhere in generated queries
  for (const q of queries) {
    assert.ok(!/\bepisod/i.test(q), `Query "${q}" should not contain episod or episode`);
  }
});

it('generates the adaptive 12 query patterns without episode/episod for Multi-Season (sNum > 1)', () => {
  const queries = generateSeriesSearchQueries('Ted Lasso', 4, 9, 4, '2026');
  const expectedPatterns = [
    'Ted Lasso S04E09',
    'Ted Lasso 2026 S04E09',
    'Ted Lasso S4 EP09',
    'Ted Lasso S04 EP09',
    'Ted Lasso 2026 EP09',
    'Ted Lasso 2026 E09',
    'Ted Lasso S04E9',
    'Ted Lasso EP09',
    'Ted Lasso E09',
    'Ted Lasso EP9',
    'Ted Lasso 2026',
    'Ted Lasso'
  ];

  assert.strictEqual(queries.length, expectedPatterns.length, `Queries count should be ${expectedPatterns.length}`);
  for (let i = 0; i < expectedPatterns.length; i++) {
    assert.strictEqual(queries[i], expectedPatterns[i], `Query pattern index ${i} should be ${expectedPatterns[i]}`);
  }
  // Ensure no 'episode' or 'episod' appears anywhere in generated queries
  for (const q of queries) {
    assert.ok(!/\bepisod/i.test(q), `Query "${q}" should not contain episod or episode`);
  }
});

console.log(`\nResults: ${passed}/${total} tests passed!\n`);
if (passed === total) {
  console.log('🎉 ALL UNIT TESTS PASSED SUCCESSFULLY!\n');
} else {
  process.exit(1);
}
