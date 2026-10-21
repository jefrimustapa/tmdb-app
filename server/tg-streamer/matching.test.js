import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CentralDatabase } from './db.js';
import {
  extractEpisodeInfo,
  extractSeasonInfo,
  cleanBotEchoHeader,
  cleanSearchTitle,
  isBareButton,
  normalizeTitle,
  scoreCandidateWithReason,
  scoreCandidateButton,
  scoreCandidateButtonWithReason,
  parseSizeFromText,
  generateSeriesSearchQueries,
  detectVideoQualityTier,
  DEFAULT_PIPELINE_BUFFERS,
  getBlockCacheMaxEntries,
  isAllowedTitleSuffix,
  validateTitleBoundaries,
  savedSettings,
  isJunkMedia,
  JUNK_MEDIA_REGEX,
  getActiveTargetBot,
} from './index.js';
import {
  createResolver,
  listResolvers,
  MsmResolver,
  PencuriResolver,
  BaseResolver,
  formatDiagnosticResults,
  formatFileSize,
} from './resolvers/index.js';
import {
  buildSearchQueries,
  generateMovieSearchQueries,
} from './resolvers/queries.js';

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

console.log('\n4. Title Sanitization (cleanSearchTitle) & Normalization (normalizeTitle)');
it('sanitizes titles and acronym punctuation cleanly', () => {
  assert.strictEqual(cleanSearchTitle('Spider-Man: No Way Home (2021)'), 'Spider Man No Way Home');
  assert.strictEqual(cleanSearchTitle('S.W.A.T.'), 'S W A T');
  assert.strictEqual(cleanSearchTitle('Hantu Punya Boss [Astro]'), 'Hantu Punya Boss');
});

it('strips apostrophes and smart quotes without inserting whitespace (#198)', () => {
  // cleanSearchTitle
  assert.strictEqual(cleanSearchTitle("Isn't"), 'Isnt');
  assert.strictEqual(cleanSearchTitle("Isn't It Romantic"), 'Isnt It Romantic');
  assert.strictEqual(cleanSearchTitle("Grey's Anatomy"), 'Greys Anatomy');
  assert.strictEqual(cleanSearchTitle("Marvel’s Agents of S.H.I.E.L.D."), 'Marvels Agents of S H I E L D');
  assert.strictEqual(cleanSearchTitle("Don't Look Up"), 'Dont Look Up');
  assert.strictEqual(cleanSearchTitle("`Backtick's`"), 'Backticks');

  // normalizeTitle
  assert.strictEqual(normalizeTitle("Isn't"), 'isnt');
  assert.strictEqual(normalizeTitle("Isn't It Romantic"), 'isnt it romantic');
  assert.strictEqual(normalizeTitle("Grey's Anatomy"), 'greys anatomy');
  assert.strictEqual(normalizeTitle("Marvel’s"), 'marvels');
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
  const btnEp16 = { className: 'KeyboardButtonUrlAuth', url: 'https://t.me/msmbot/link/ep16', text: 'Ep 16 1080p' };
  const msg = { message: 'Hantu Punya Boss' };
  const score = scoreCandidateButton(btnEp16, msg, contextTvEp1);
  assert.strictEqual(score, -999, 'Ep 16 button must be hard disqualified (-999)');
});

it('disqualifies Episode 10 when Episode 1 is searched', () => {
  const btnEp10 = { className: 'KeyboardButtonUrlAuth', url: 'https://t.me/msmbot/link/ep10', text: 'Ep 10 720p' };
  const msg = { message: 'Hantu Punya Boss' };
  const score = scoreCandidateButton(btnEp10, msg, contextTvEp1);
  assert.strictEqual(score, -999, 'Ep 10 button must be hard disqualified (-999)');
});

it('awards high score for matching Episode 1 buttons (both KeyboardButtonUrlAuth and KeyboardButtonUrl)', () => {
  const btnEp1Auth = { className: 'KeyboardButtonUrlAuth', url: 'https://t.me/msmbot/link/ep1', text: 'Hantu Punya Boss Ep 1 720p' };
  const btnEp1Direct = { className: 'KeyboardButtonUrl', url: 'https://getlink.msmbot.club/ep1', text: 'Hantu Punya Boss Ep 1 720p' };
  const msg = { message: 'Hantu Punya Boss' };
  const scoreAuth = scoreCandidateButton(btnEp1Auth, msg, contextTvEp1);
  const scoreDirect = scoreCandidateButton(btnEp1Direct, msg, contextTvEp1);
  assert.ok(scoreAuth >= 200, `Ep 1 auth button should score >= 200, got ${scoreAuth}`);
  assert.ok(scoreDirect >= 200, `Ep 1 direct button should score >= 200, got ${scoreDirect}`);
  assert.strictEqual(scoreAuth, scoreDirect, 'Auth and direct buttons should receive identical scores');
});

it('correctly handles bare buttons by checking parent message context', () => {
  const btnBare = { className: 'KeyboardButtonUrlAuth', url: 'https://t.me/msmbot/link/bare', text: '[ WebRip 720p ]' };
  
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
  const btnBare = { className: 'KeyboardButtonUrlAuth', url: 'https://t.me/msmbot/link/bare', text: '[ 720p ]' };
  const msgWithEcho = { message: '🔍 Hasil carian untuk "Hantu Punya Boss Episod 1":\nHantu Punya Boss Episod 16' };
  const score = scoreCandidateButton(btnBare, msgWithEcho, contextTvEp1);
  assert.strictEqual(score, -999, 'Bot echo must be stripped and Ep 16 must be disqualified');
});

it('disqualifies conflicting Season 10 when Season 1 is requested', () => {
  const btnSeason10 = { className: 'KeyboardButtonUrlAuth', url: 'https://t.me/msmbot/link/s10', text: 'Show Name Season 10 Ep 1' };
  const msg = { message: 'Show Name' };
  const score = scoreCandidateButton(btnSeason10, msg, { isTv: true, title: 'Show Name', sNum: 1, eNum: 1 });
  assert.strictEqual(score, -999, 'Season 10 candidate must be disqualified when searching Season 1');
});

it('disqualifies conflicting release years for movie reboots/remakes', () => {
  const contextMovie2024 = { isTv: false, title: 'Avatar', year: '2024', targetQuality: 720 };
  const btn2005 = { className: 'KeyboardButtonUrlAuth', url: 'https://t.me/msmbot/link/2005', text: 'Avatar 2005 720p' };
  const btn2024 = { className: 'KeyboardButtonUrlAuth', url: 'https://t.me/msmbot/link/2024', text: 'Avatar 2024 720p' };
  const msg = { message: '' };

  assert.strictEqual(scoreCandidateButton(btn2005, msg, contextMovie2024), -999, '2005 movie must be disqualified when 2024 requested');
  assert.ok(scoreCandidateButton(btn2024, msg, contextMovie2024) >= 200, '2024 movie should score high');
});

it('disqualifies un-versioned candidates with no matching year when Season > 1 is requested', () => {
  const contextS2 = { isTv: true, title: 'Reacher', year: '2023', sNum: 2, eNum: 1, totalSeasons: 2, targetQuality: 720 };
  const btnBareS1 = { className: 'KeyboardButtonUrlAuth', url: 'https://t.me/msmbot/link/bare', text: 'Reacher Episod 1 720p' };
  const btnMatchedS2 = { className: 'KeyboardButtonUrlAuth', url: 'https://t.me/msmbot/link/s2', text: 'Reacher S02E01 720p' };
  const btnMatchedYear = { className: 'KeyboardButtonUrlAuth', url: 'https://t.me/msmbot/link/year', text: 'Reacher 2023 Episod 1 720p' };
  const msg = { message: '' };

  assert.strictEqual(scoreCandidateButton(btnBareS1, msg, contextS2), -999, 'Un-versioned episode must be disqualified for Season 2');
  assert.ok(scoreCandidateButton(btnMatchedS2, msg, contextS2) >= 150, 'S02E01 button should match Season 2');
  assert.ok(scoreCandidateButton(btnMatchedYear, msg, contextS2) >= 150, 'Matching release year button should match Season 2');
});

it('ignores bot prefixes such as msm34, msm32, or film for single-word titles', () => {
  const contextMovieSingleWord = { isTv: false, title: 'Inception', year: '2010', targetQuality: 1080 };
  const btnMsm34 = { className: 'KeyboardButtonUrlAuth', url: 'https://t.me/msm34bot/link/1', text: 'MSM34 Inception 1080p' };
  const btnUnrelated = { className: 'KeyboardButtonUrlAuth', url: 'https://t.me/msm34bot/link/2', text: 'Fake Inception 1080p' };
  const msg = { message: '' };

  assert.ok(scoreCandidateButton(btnMsm34, msg, contextMovieSingleWord) >= 150, 'MSM34 prefix must not disqualify single-word title');
  assert.strictEqual(scoreCandidateButton(btnUnrelated, msg, contextMovieSingleWord), -999, 'Unrelated prefix must disqualify single-word title');
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

console.log('\n8. Video Quality Detection & Pipeline Buffers (detectVideoQualityTier)');
it('correctly detects SD tier (≤480p, 360p, 540p)', () => {
  assert.strictEqual(detectVideoQualityTier('Series.S01E01.480p.mp4'), 'sd');
  assert.strictEqual(detectVideoQualityTier('Movie.360p.WEBRip.mp4'), 'sd');
  assert.strictEqual(detectVideoQualityTier('Show.540p.mp4'), 'sd');
  assert.strictEqual(detectVideoQualityTier('Video.mp4', '', { attributes: [{ className: 'DocumentAttributeVideo', h: 480, w: 854 }] }), 'sd');
});

it('correctly detects 720p HD tier', () => {
  assert.strictEqual(detectVideoQualityTier('Movie.2024.720p.HDTV.mkv'), '720p');
  assert.strictEqual(detectVideoQualityTier('Show.HD.mp4'), '720p');
  assert.strictEqual(detectVideoQualityTier('Unknown.mp4', 'title_720p'), '720p');
  assert.strictEqual(detectVideoQualityTier('Video.mp4', '', { attributes: [{ className: 'DocumentAttributeVideo', h: 720, w: 1280 }] }), '720p');
  // Fallback default is 720p
  assert.strictEqual(detectVideoQualityTier('Unknown.mp4'), '720p');
});

it('correctly detects 1080p FHD tier', () => {
  assert.strictEqual(detectVideoQualityTier('Movie.2024.1080p.WEBRip.mp4'), '1080p');
  assert.strictEqual(detectVideoQualityTier('Show.FHD.mkv'), '1080p');
  assert.strictEqual(detectVideoQualityTier('Unknown.mp4', 'title_1080p'), '1080p');
  assert.strictEqual(detectVideoQualityTier('Video.mp4', '', { attributes: [{ className: 'DocumentAttributeVideo', h: 1080, w: 1920 }] }), '1080p');
});

it('correctly detects 4K UHD tier', () => {
  assert.strictEqual(detectVideoQualityTier('Movie.2024.2160p.UHD.Remux.mkv'), '4k');
  assert.strictEqual(detectVideoQualityTier('Movie.4K.HDR.mkv'), '4k');
  assert.strictEqual(detectVideoQualityTier('Video.mp4', '', { attributes: [{ className: 'DocumentAttributeVideo', h: 2160, w: 3840 }] }), '4k');
});

it('provides expected default pipeline buffer values per tier', () => {
  assert.strictEqual(DEFAULT_PIPELINE_BUFFERS.sd, 2);      // 2 x 512KB = 1.0 MB
  assert.strictEqual(DEFAULT_PIPELINE_BUFFERS['720p'], 4); // 4 x 512KB = 2.0 MB
  assert.strictEqual(DEFAULT_PIPELINE_BUFFERS['1080p'], 6); // 6 x 512KB = 3.0 MB
  assert.strictEqual(DEFAULT_PIPELINE_BUFFERS['4k'], 8);    // 8 x 512KB = 4.0 MB
});

console.log('\n9. 480p and 4K Candidate Scoring & Dynamic Block Cache');
it('prioritizes 480p/360p and penalizes 1080p/4K when targetQuality is 480', () => {
  const context480 = { isTv: true, title: 'Series Name', sNum: 1, eNum: 1, targetQuality: 480 };
  const btn480 = { className: 'KeyboardButtonUrlAuth', url: 'https://t.me/b/1', text: 'Series Name S01E01 480p' };
  const btn720 = { className: 'KeyboardButtonUrlAuth', url: 'https://t.me/b/2', text: 'Series Name S01E01 720p' };
  const btn1080 = { className: 'KeyboardButtonUrlAuth', url: 'https://t.me/b/3', text: 'Series Name S01E01 1080p' };
  const msg = { message: '' };

  const score480 = scoreCandidateButton(btn480, msg, context480);
  const score720 = scoreCandidateButton(btn720, msg, context480);
  const score1080 = scoreCandidateButton(btn1080, msg, context480);

  assert.ok(score480 > score720, `480p score (${score480}) should be higher than 720p score (${score720})`);
  assert.ok(score720 > score1080, `720p score (${score720}) should be higher than 1080p score (${score1080})`);
});

it('prioritizes 4K/2160p when targetQuality is 2160', () => {
  const context4k = { isTv: false, title: 'Action Movie', year: '2024', targetQuality: 2160 };
  const btn4k = { className: 'KeyboardButtonUrlAuth', url: 'https://t.me/b/1', text: 'Action Movie 2024 4K UHD' };
  const btn1080 = { className: 'KeyboardButtonUrlAuth', url: 'https://t.me/b/2', text: 'Action Movie 2024 1080p' };
  const msg = { message: '' };

  const score4k = scoreCandidateButton(btn4k, msg, context4k);
  const score1080 = scoreCandidateButton(btn1080, msg, context4k);

  assert.ok(score4k > score1080, `4K score (${score4k}) should be higher than 1080p score (${score1080})`);
});

it('calculates router RAM block cache max entries accurately', () => {
  const entries = getBlockCacheMaxEntries();
  assert.strictEqual(typeof entries, 'number');
  assert.ok(entries >= 16 && entries <= 128, `Block cache entries (${entries}) should be within expected range`);
});

console.log('\n10. Configurable TV and Movie Minimum File Size Validation');
it('accepts Episode 27 of Opsss Terpikat Cik Sombong (101.41 MB) with default 80 MB TV threshold', () => {
  const btnEp27 = {
    className: 'KeyboardButtonUrlAuth',
    url: 'https://go.msmbot.club/?redirect_to=/link/44d03b',
    text: '🔥🎞 Opsss.Terpikat.Cik.Sombong.Episod.27.mp4 101.41 MB',
  };
  const msg = { message: '' };
  const contextEp27 = {
    isTv: true,
    title: 'Opsss Terpikat Cik Sombong',
    year: '2018',
    sNum: 1,
    eNum: 27,
    totalSeasons: 1,
    targetQuality: 720,
  };

  const score = scoreCandidateButton(btnEp27, msg, contextEp27);
  assert.ok(score >= 200, `Ep 27 button (101.41 MB) should score >= 200 with default 80MB min size, got: ${score}`);
});

it('disqualifies TV episodes below the minimum size threshold (e.g. 50 MB promo clip)', () => {
  const btnClip = {
    className: 'KeyboardButtonUrlAuth',
    url: 'https://t.me/b/clip',
    text: 'Opsss Terpikat Cik Sombong Ep 27 Teaser 50.0 MB',
  };
  const msg = { message: '' };
  const context = {
    isTv: true,
    title: 'Opsss Terpikat Cik Sombong',
    sNum: 1,
    eNum: 27,
  };

  const score = scoreCandidateButton(btnClip, msg, context);
  assert.strictEqual(score, -999, 'Files under default 80MB TV min size must be disqualified (-999)');
});

it('honors context minTvSizeMb override', () => {
  const btnEp27 = {
    className: 'KeyboardButtonUrlAuth',
    url: 'https://t.me/b/ep27',
    text: 'Opsss Terpikat Cik Sombong Ep 27 101.41 MB',
  };
  const msg = { message: '' };

  // When overridden to 110 MB -> 101.41 MB must be disqualified
  const scoreDisqualified = scoreCandidateButton(btnEp27, msg, {
    isTv: true,
    title: 'Opsss Terpikat Cik Sombong',
    sNum: 1,
    eNum: 27,
    minTvSizeMb: 110,
  });
  assert.strictEqual(scoreDisqualified, -999, 'Overridden 110MB threshold must disqualify 101.41MB');

  // When overridden to 60 MB -> 101.41 MB must be accepted
  const scoreAccepted = scoreCandidateButton(btnEp27, msg, {
    isTv: true,
    title: 'Opsss Terpikat Cik Sombong',
    sNum: 1,
    eNum: 27,
    minTvSizeMb: 60,
  });
  assert.ok(scoreAccepted >= 200, `Overridden 60MB threshold should accept 101.41MB with score >= 200, got: ${scoreAccepted}`);
});

it('disqualifies movies below the default 180 MB movie threshold and accepts movies above it', () => {
  const msg = { message: '' };
  const contextMovie = { isTv: false, title: 'Hantu Movie', year: '2024' };

  const btnSmall = {
    className: 'KeyboardButtonUrlAuth',
    url: 'https://t.me/b/small',
    text: 'Hantu Movie 2024 150.0 MB',
  };
  const btnValid = {
    className: 'KeyboardButtonUrlAuth',
    url: 'https://t.me/b/valid',
    text: 'Hantu Movie 2024 220.0 MB',
  };

  const scoreSmall = scoreCandidateButton(btnSmall, msg, contextMovie);
  const scoreValid = scoreCandidateButton(btnValid, msg, contextMovie);

  assert.strictEqual(scoreSmall, -999, 'Movie < 180MB must be disqualified (-999)');
  assert.ok(scoreValid >= 200, `Movie >= 180MB should be accepted with score >= 200, got: ${scoreValid}`);
});

it('honors context minMovieSizeMb override', () => {
  const msg = { message: '' };
  const btn = {
    className: 'KeyboardButtonUrlAuth',
    url: 'https://t.me/b/m',
    text: 'Indie Drama 2024 120.0 MB',
  };

  // Default 180MB rejects 120MB
  const scoreDefault = scoreCandidateButton(btn, msg, { isTv: false, title: 'Indie Drama', year: '2024' });
  assert.strictEqual(scoreDefault, -999);

  // Overridden 100MB accepts 120MB
  const scoreOverride = scoreCandidateButton(btn, msg, { isTv: false, title: 'Indie Drama', year: '2024', minMovieSizeMb: 100 });
  assert.ok(scoreOverride >= 200, `Overridden 100MB threshold should accept 120MB, got: ${scoreOverride}`);
});

console.log('11. Dual-Title Matching, Punctuation & Large Comma-Formatted File Sizes');

it('correctly parses sizes with commas (e.g. 1,018.52 MB)', () => {
  assert.strictEqual(parseSizeFromText('🔥🎞 1. Projek.Exit.2024.S01E06.1080p.Finale.WEB-DL.mkv - 1,018.52 MB'), 1018.52);
  assert.strictEqual(parseSizeFromText('Movie.2024.mkv - 2,450.5 MB'), 2450.5);
  assert.strictEqual(parseSizeFromText('Movie.2024.mkv - 1,200 MB'), 1200);
  assert.strictEqual(parseSizeFromText('Movie.2024.mkv - 1.5 GB'), 1536);
});

it('strips semicolons from cleanSearchTitle (e.g. Project; Exit -> Project Exit)', () => {
  assert.strictEqual(cleanSearchTitle('Project; Exit'), 'Project Exit');
  assert.strictEqual(cleanSearchTitle('Project; Exit: Season 1'), 'Project Exit Season 1');
});

it('accepts button matching alternative title (Projek Exit) when primary title is Project; Exit', () => {
  const msg = { message: '' };
  const btn = {
    className: 'KeyboardButtonUrlAuth',
    url: 'https://t.me/b/projexit6',
    text: '🔥🎞 1. Projek.Exit.2024.S01E06.1080p.Finale.WEB-DL.AAC2.0.H.264-tGx.mkv - 1,018.52 MB',
  };
  const context = {
    isTv: true,
    title: 'Project; Exit',
    altTitle: 'Projek: Exit',
    year: '2024',
    sNum: 1,
    eNum: 6,
  };

  const { score, reason } = scoreCandidateButtonWithReason(btn, msg, context);
  assert.ok(reason.startsWith('accepted'), `Candidate should be accepted, got reason: ${reason}`);
  assert.ok(score >= 350, `Score should be >= 350, got: ${score}`);
});

it('accepts button matching primary title (Project Exit) when alternative title is Projek: Exit', () => {
  const msg = { message: '' };
  const btn = {
    className: 'KeyboardButtonUrlAuth',
    url: 'https://t.me/b/projexit1',
    text: '🔥🎞 1. Project.Exit.2024.S01E01.720p.WEB-DL.mkv - 520.15 MB',
  };
  const context = {
    isTv: true,
    title: 'Projek: Exit',
    altTitle: 'Project: Exit',
    year: '2024',
    sNum: 1,
    eNum: 1,
  };

  const { score, reason } = scoreCandidateButtonWithReason(btn, msg, context);
  assert.ok(reason.startsWith('accepted'), `Candidate should be accepted, got reason: ${reason}`);
  assert.ok(score >= 350, `Score should be >= 350, got: ${score}`);
});

it('returns informative rejection reason on episode mismatch with scoreCandidateButtonWithReason', () => {
  const msg = { message: '' };
  const btn = {
    className: 'KeyboardButtonUrlAuth',
    url: 'https://t.me/b/projexit5',
    text: '🔥🎞 1. Projek.Exit.2024.S01E05.1080p.WEB-DL.mkv - 950 MB',
  };
  const context = {
    isTv: true,
    title: 'Project; Exit',
    altTitle: 'Projek: Exit',
    year: '2024',
    sNum: 1,
    eNum: 6,
  };

  const { score, reason } = scoreCandidateButtonWithReason(btn, msg, context);
  assert.strictEqual(score, -999);
  assert.ok(reason.includes('episode mismatch'), `Reason should mention episode mismatch, got: ${reason}`);
});

it('correctly scores candidate matching title with apostrophe without splitting into single letters (#198)', () => {
  const msg = { message: '' };
  const btn = {
    className: 'KeyboardButtonUrlAuth',
    url: 'https://t.me/b/isntitromantic',
    text: '🔥🎞 1. Isnt.It.Romantic.2019.720p.WEBRip.x264.mkv - 850 MB',
  };
  const context = {
    isTv: false,
    title: "Isn't It Romantic",
    year: '2019',
    targetQuality: 720,
  };

  const { score, reason } = scoreCandidateButtonWithReason(btn, msg, context);
  assert.ok(score >= 200, `Expected score >= 200 for matching apostrophe title, got ${score} (reason: ${reason})`);
});

console.log('12. Resolver Max Paging Settings');

it('has valid resolverMaxPages configured', () => {
  assert.ok(typeof savedSettings.resolverMaxPages === 'number' && savedSettings.resolverMaxPages >= 1);
});

console.log('\n13. Short Title Boundary & Suffix Collision Protection (#203)');

it('disqualifies Street Fighter: Legend of Chun Li when Street Fighter is searched (#203)', () => {
  const msg = { message: '' };
  const btn = {
    className: 'KeyboardButtonUrlAuth',
    url: 'https://t.me/b/sfchunli',
    text: '🔥🎞 1. Street.Fighter.Legend.of.Chun.Li.2009.1080p.mkv - 2.1 GB',
  };
  const context = {
    isTv: false,
    title: 'Street Fighter',
    year: '1994',
    targetQuality: 1080,
  };

  const { score, reason } = scoreCandidateButtonWithReason(btn, msg, context);
  assert.strictEqual(score, -999);
  assert.ok(reason.includes('conflicting title suffix "legend"'), `Reason should mention conflicting suffix "legend", got: ${reason}`);
});

it('accepts matching Street Fighter 1994 candidate (#203)', () => {
  const msg = { message: '' };
  const btn = {
    className: 'KeyboardButtonUrlAuth',
    url: 'https://t.me/b/sf1994',
    text: '🔥🎞 1. Street.Fighter.1994.1080p.BluRay.x264.mkv - 1.8 GB',
  };
  const context = {
    isTv: false,
    title: 'Street Fighter',
    year: '1994',
    targetQuality: 1080,
  };

  const { score, reason } = scoreCandidateButtonWithReason(btn, msg, context);
  assert.ok(score >= 200, `Expected score >= 200 for matching Street Fighter 1994, got ${score} (reason: ${reason})`);
});

it('disqualifies The Office Mover when The Office is searched (#203)', () => {
  const msg = { message: '' };
  const btn = {
    className: 'KeyboardButtonUrlAuth',
    url: 'https://t.me/b/officemover',
    text: '🔥🎞 1. The.Office.Mover.S01E01.720p.HDTV.mkv - 450 MB',
  };
  const context = {
    isTv: true,
    title: 'The Office',
    year: '2005',
    sNum: 1,
    eNum: 1,
    totalSeasons: 9,
    targetQuality: 720,
  };

  const { score, reason } = scoreCandidateButtonWithReason(btn, msg, context);
  assert.strictEqual(score, -999);
  assert.ok(reason.includes('conflicting title suffix "mover"'), `Reason should mention conflicting suffix "mover", got: ${reason}`);
});

it('accepts matching The Office S01E01 candidate (#203)', () => {
  const msg = { message: '' };
  const btn = {
    className: 'KeyboardButtonUrlAuth',
    url: 'https://t.me/b/theoffice',
    text: '🔥🎞 1. The.Office.S01E01.720p.HDTV.x264.mkv - 400 MB',
  };
  const context = {
    isTv: true,
    title: 'The Office',
    year: '2005',
    sNum: 1,
    eNum: 1,
    totalSeasons: 9,
    targetQuality: 720,
  };

  const { score, reason } = scoreCandidateButtonWithReason(btn, msg, context);
  assert.ok(score >= 200, `Expected score >= 200 for matching The Office S01E01, got ${score} (reason: ${reason})`);
});

it('accepts regional adaptation title suffix like The Office US S01E01 (#203)', () => {
  const msg = { message: '' };
  const btn = {
    className: 'KeyboardButtonUrlAuth',
    url: 'https://t.me/b/theofficeus',
    text: '🔥🎞 The.Office.US.S01E01.720p.WEB-DL.mkv - 350 MB',
  };
  const context = {
    isTv: true,
    title: 'The Office',
    year: '2005',
    sNum: 1,
    eNum: 1,
    totalSeasons: 9,
    targetQuality: 720,
  };

  const { score, reason } = scoreCandidateButtonWithReason(btn, msg, context);
  assert.ok(score >= 200, `Expected score >= 200 for matching The Office US, got ${score} (reason: ${reason})`);
});

it('disqualifies Street Fighter with "The" leading suffix like Street Fighter: The Legend of Chun-Li (#203)', () => {
  const msg = { message: '' };
  const btn = {
    className: 'KeyboardButtonUrlAuth',
    url: 'https://t.me/b/sfthelegend',
    text: 'Street Fighter The Legend of Chun-Li 1080p',
  };
  const context = {
    isTv: false,
    title: 'Street Fighter',
    year: '1994',
    targetQuality: 1080,
  };

  const { score, reason } = scoreCandidateButtonWithReason(btn, msg, context);
  assert.strictEqual(score, -999);
  assert.ok(reason.includes('conflicting title suffix'), `Reason should mention conflicting title suffix, got: ${reason}`);
});

console.log('\n14. Quality-Specific Caching & Multi-Tier DB Persistence (#201)');

const __testFilename = fileURLToPath(import.meta.url);
const __testDirname = path.dirname(__testFilename);
const TEST_DB_FILE = path.join(__testDirname, 'data', 'test_streams_201.json');

try {
  if (fs.existsSync(TEST_DB_FILE)) fs.unlinkSync(TEST_DB_FILE);
  if (fs.existsSync(`${TEST_DB_FILE}.tmp`)) fs.unlinkSync(`${TEST_DB_FILE}.tmp`);
} catch {}

it('stores different quality cache entries for the same title without overwriting (#201)', () => {
  const testDb = new CentralDatabase(TEST_DB_FILE);
  
  testDb.set('oppenheimer_2023_720p', {
    docId: '1001',
    filename: 'Oppenheimer.2023.720p.BluRay.mp4',
    size: '1500000000',
  });
  testDb.set('oppenheimer_2023_1080p', {
    docId: '2002',
    filename: 'Oppenheimer.2023.1080p.BluRay.mp4',
    size: '3500000000',
  });
  testDb.set('oppenheimer_2023_4k', {
    docId: '3003',
    filename: 'Oppenheimer.2023.2160p.UHD.mp4',
    size: '8000000000',
  });

  // Verify all 3 qualities exist in memory
  const rec720 = testDb.get('oppenheimer_2023_720p');
  const rec1080 = testDb.get('oppenheimer_2023_1080p');
  const rec4k = testDb.get('oppenheimer_2023_4k');

  assert.strictEqual(rec720?.docId, '1001');
  assert.strictEqual(rec1080?.docId, '2002');
  assert.strictEqual(rec4k?.docId, '3003');

  // Verify lookup by docId returns each distinct stream
  assert.strictEqual(testDb.getByDocId('1001')?.filename, 'Oppenheimer.2023.720p.BluRay.mp4');
  assert.strictEqual(testDb.getByDocId('2002')?.filename, 'Oppenheimer.2023.1080p.BluRay.mp4');
  assert.strictEqual(testDb.getByDocId('3003')?.filename, 'Oppenheimer.2023.2160p.UHD.mp4');
});

it('persists all distinct quality tiers to streams.json without dropping any queryKey (#201)', () => {
  const testDb = new CentralDatabase(TEST_DB_FILE);
  testDb.set('oppenheimer_2023_720p', { docId: '1001', filename: 'Oppenheimer.2023.720p.mp4' });
  testDb.set('oppenheimer_2023_1080p', { docId: '2002', filename: 'Oppenheimer.2023.1080p.mp4' });
  testDb.set('oppenheimer_2023_4k', { docId: '3003', filename: 'Oppenheimer.2023.2160p.mp4' });
  testDb.saveSync();

  // Reload from fresh database instance
  const reloadedDb = new CentralDatabase(TEST_DB_FILE);
  assert.strictEqual(reloadedDb.get('oppenheimer_2023_720p')?.docId, '1001');
  assert.strictEqual(reloadedDb.get('oppenheimer_2023_1080p')?.docId, '2002');
  assert.strictEqual(reloadedDb.get('oppenheimer_2023_4k')?.docId, '3003');
  assert.strictEqual(reloadedDb.getAll().length, 3);
});

it('preserves multiple quality tiers when pointing to the same media file docId (#201)', () => {
  const testDb = new CentralDatabase(TEST_DB_FILE);
  testDb.clear();

  // For example, 720p and 480p queries both mapped to docId 5005
  testDb.set('short_film_720p', { docId: '5005', filename: 'short_film.mp4' });
  testDb.set('short_film_480p', { docId: '5005', filename: 'short_film.mp4' });
  testDb.saveSync();

  const reloadedDb = new CentralDatabase(TEST_DB_FILE);
  assert.strictEqual(reloadedDb.get('short_film_720p')?.docId, '5005');
  assert.strictEqual(reloadedDb.get('short_film_480p')?.docId, '5005');
  assert.strictEqual(reloadedDb.getByDocId('5005')?.docId, '5005');
});

it('does not purge remaining quality cache entries when one quality is deleted (#201)', () => {
  const testDb = new CentralDatabase(TEST_DB_FILE);
  testDb.clear();
  testDb.set('title_720p', { docId: '777', filename: 'title_720p.mp4' });
  testDb.set('title_1080p', { docId: '888', filename: 'title_1080p.mp4' });

  // Delete 720p
  const evicted = testDb.delete('title_720p');
  assert.strictEqual(evicted, true);
  assert.strictEqual(testDb.get('title_720p'), undefined);
  assert.strictEqual(testDb.getByDocId('777'), undefined);

  // 1080p remains untouched and intact
  assert.strictEqual(testDb.get('title_1080p')?.docId, '888');
  assert.strictEqual(testDb.getByDocId('888')?.filename, 'title_1080p.mp4');
});

it('maps delivered video document to actual quality tier key regardless of requested quality (#201)', () => {
  // Scenario 1: User requested 1080p, but delivered document is 720p
  const doc720 = {
    id: 9911,
    attributes: [{ className: 'DocumentAttributeVideo', w: 1280, h: 720 }],
  };
  const tier720 = detectVideoQualityTier('Show.S01E01.720p.mp4', '', doc720);
  assert.strictEqual(tier720, '720p');

  let suffix720 = '_720p';
  if (tier720 === '4k') suffix720 = '_4k';
  else if (tier720 === '1080p') suffix720 = '_1080p';
  else if (tier720 === 'sd') suffix720 = '_480p';
  assert.strictEqual(suffix720, '_720p');

  // Scenario 2: User requested 4K, but delivered document is 1080p
  const doc1080 = {
    id: 9922,
    attributes: [{ className: 'DocumentAttributeVideo', w: 1920, h: 1080 }],
  };
  const tier1080 = detectVideoQualityTier('Movie.2024.1080p.BluRay.mp4', '', doc1080);
  assert.strictEqual(tier1080, '1080p');

  let suffix1080 = '_720p';
  if (tier1080 === '4k') suffix1080 = '_4k';
  else if (tier1080 === '1080p') suffix1080 = '_1080p';
  else if (tier1080 === 'sd') suffix1080 = '_480p';
  assert.strictEqual(suffix1080, '_1080p');

  // Scenario 3: Real 4K file delivered
  const doc4k = {
    id: 9933,
    attributes: [{ className: 'DocumentAttributeVideo', w: 3840, h: 2160 }],
  };
  const tier4k = detectVideoQualityTier('Nature.2024.2160p.UHD.mp4', '', doc4k);
  assert.strictEqual(tier4k, '4k');

  let suffix4k = '_720p';
  if (tier4k === '4k') suffix4k = '_4k';
  else if (tier4k === '1080p') suffix4k = '_1080p';
  else if (tier4k === 'sd') suffix4k = '_480p';
  assert.strictEqual(suffix4k, '_4k');
});

console.log('\n15. Junk Media & Review Candidate Disqualification (#221)');
it('identifies exact issue candidate BADUT GENDONG - Movie Review.mp4 as junk media (#221)', () => {
  const isJunk = isJunkMedia('BADUT GENDONG - Movie Review.mp4', 'Badut Gendong');
  assert.strictEqual(isJunk, true, 'BADUT GENDONG - Movie Review.mp4 must be flagged as junk media');
});

it('disqualifies candidate button for BADUT GENDONG - Movie Review.mp4 with score -999 (#221)', () => {
  const btnReview = {
    className: 'KeyboardButtonUrlAuth',
    url: 'https://t.me/msmbot/link/review',
    text: 'BADUT GENDONG - Movie Review 720p (260.9 MB)',
  };
  const msg = { message: 'BADUT GENDONG - Movie Review.mp4' };
  const contextMovie = {
    isTv: false,
    title: 'Badut Gendong',
    year: '2026',
    targetQuality: 720,
    significantTokens: ['badut', 'gendong'],
    minMovieSizeMb: 180,
  };

  const res = scoreCandidateButtonWithReason(btnReview, msg, contextMovie);
  assert.strictEqual(res.score, -999, 'Movie review candidate must be hard-disqualified with -999');
  assert.ok(res.reason.includes('junk media'), `Reason must specify junk media, got: ${res.reason}`);
});

it('identifies various regional review, recap, and synopsis patterns as junk media (#221)', () => {
  assert.strictEqual(isJunkMedia('Badut Gendong (2026) 720p Review.mkv', 'Badut Gendong'), true);
  assert.strictEqual(isJunkMedia('Badut Gendong Recap 1080p.mp4', 'Badut Gendong'), true);
  assert.strictEqual(isJunkMedia('Ulasan Filem Badut Gendong 720p.mp4', 'Badut Gendong'), true);
  assert.strictEqual(isJunkMedia('Badut Gendong Alur Cerita.mp4', 'Badut Gendong'), true);
  assert.strictEqual(isJunkMedia('Badut Gendong Sinopsis.mp4', 'Badut Gendong'), true);
  assert.strictEqual(isJunkMedia('Badut Gendong Reaction.mp4', 'Badut Gendong'), true);
  assert.strictEqual(isJunkMedia('Badut Gendong Bedah Film.mp4', 'Badut Gendong'), true);
  assert.strictEqual(isJunkMedia('Badut Gendong Ringkasan Cerita.mp4', 'Badut Gendong'), true);
});

it('accepts legitimate movie candidate without review/recap keywords (#221)', () => {
  assert.strictEqual(isJunkMedia('Badut Gendong 2026 720p WEB-DL.mp4', 'Badut Gendong'), false);

  const btnValid = {
    className: 'KeyboardButtonUrlAuth',
    url: 'https://t.me/msmbot/link/valid',
    text: 'Badut Gendong 2026 720p WEB-DL (850 MB)',
  };
  const msg = { message: 'Badut Gendong 2026' };
  const contextMovie = {
    isTv: false,
    title: 'Badut Gendong',
    year: '2026',
    targetQuality: 720,
    significantTokens: ['badut', 'gendong'],
    minMovieSizeMb: 180,
  };

  const res = scoreCandidateButtonWithReason(btnValid, msg, contextMovie);
  assert.ok(res.score > 0, `Legitimate candidate must receive positive score, got: ${res.score} (${res.reason})`);
});

it('preserves legitimate movie whose title legitimately contains a keyword (#221)', () => {
  // If the searched title itself is "The Great Review"
  const isJunk = isJunkMedia('The.Great.Review.2024.1080p.WEB-DL.mp4', 'The Great Review');
  assert.strictEqual(isJunk, false, 'Title containing review keyword must not be falsely disqualified');
});

console.log('\n16. Metadata Document Dimension Inspection (#218)');
it('inspects actual document dimensions (1100x619) for Nak Dengar Cerita Hantu S02EP03 and classifies as 720p instead of demoting to SD (#218)', () => {
  const doc = {
    attributes: [{ className: 'DocumentAttributeVideo', w: 1100, h: 619 }]
  };
  const tier = detectVideoQualityTier(
    'Nak Dengar Cerita Hantu (2026) S02EP03 1080p MVSVAP.mp4',
    'nak dengar cerita hantu s02e03_480p',
    doc
  );
  assert.strictEqual(tier, '720p', '1100x619 document dimensions must classify as 720p, not demoted to SD');
});

it('inspects actual document dimensions (1920x1080) and detects 1080p even if filename says 720p (#218)', () => {
  const doc = {
    attributes: [{ className: 'DocumentAttributeVideo', w: 1920, h: 1080 }]
  };
  const tier = detectVideoQualityTier('Animals.2026.720p.MalaySub.WEB.MSM.mp4', '', doc);
  assert.strictEqual(tier, '1080p', 'Actual 1920x1080 metadata must classify as 1080p regardless of 720p in filename');
});

it('inspects actual document dimensions (1280x720) and detects 720p even if filename says 1080p (#218)', () => {
  const doc = {
    attributes: [{ className: 'DocumentAttributeVideo', w: 1280, h: 720 }]
  };
  const tier = detectVideoQualityTier('Kudrat_1968_High_Council_2026_EP04_END_1080p_MalaySub_MV.mp4', '', doc);
  assert.strictEqual(tier, '720p', 'Actual 1280x720 metadata must classify as 720p regardless of 1080p in filename');
});

it('correctly classifies cinemascope widescreen 1080p (e.g. 1920x800) from metadata (#218)', () => {
  const doc = {
    attributes: [{ className: 'DocumentAttributeVideo', w: 1920, h: 800 }]
  };
  const tier = detectVideoQualityTier('Dune.Part.Two.2024.mp4', '', doc);
  assert.strictEqual(tier, '1080p', '1920x800 video metadata must classify as 1080p');
});

it('correctly classifies cinemascope widescreen 720p (e.g. 1280x536 or 1280x640) from metadata (#218)', () => {
  const doc = {
    attributes: [{ className: 'DocumentAttributeVideo', w: 1280, h: 640 }]
  };
  const tier = detectVideoQualityTier('Dont.Move.2024.mp4', '', doc);
  assert.strictEqual(tier, '720p', '1280x640 video metadata must classify as 720p');
});

it('correctly classifies cinemascope widescreen 4K (e.g. 3840x1600) from metadata (#218)', () => {
  const doc = {
    attributes: [{ className: 'DocumentAttributeVideo', w: 3840, h: 1600 }]
  };
  const tier = detectVideoQualityTier('Avatar.The.Way.Of.Water.2022.mp4', '', doc);
  assert.strictEqual(tier, '4k', '3840x1600 video metadata must classify as 4k');
});

it('falls back to filename quality tag only when document dimension metadata is absent (#218)', () => {
  assert.strictEqual(detectVideoQualityTier('Show.S01E01.1080p.HDTV.mp4', '', null), '1080p');
  assert.strictEqual(detectVideoQualityTier('Show.S01E01.720p.HDTV.mp4', '', null), '720p');
  assert.strictEqual(detectVideoQualityTier('Show.S01E01.480p.mp4', '', null), 'sd');
});

it('ignores 320x180 poster DocumentAttributeImageSize attribute on 1.59 GB MKV and classifies as 720p (#218)', () => {
  const doc = {
    size: 1705792572, // 1.59 GB
    attributes: [
      { className: 'DocumentAttributeFilename', fileName: 'Imam.Instant.Ustazah.Scammer.2023.S1EP01.720p.WEB-DL.x264.mkv' },
      { className: 'DocumentAttributeImageSize', w: 320, h: 180 } // Poster/thumbnail preview
    ]
  };
  const tier = detectVideoQualityTier(
    'Imam.Instant.Ustazah.Scammer.2023.S1EP01.720p.WEB-DL.x264.mkv',
    'imam instant ustazah scammer s01e01_480p',
    doc
  );
  assert.strictEqual(tier, '720p', 'Poster image size 320x180 must not demote 1.59 GB 720p MKV to SD');
});

it('ignores 320x180 poster DocumentAttributeImageSize attribute on 2.44 GB MKV and classifies as 1080p (#218)', () => {
  const doc = {
    size: 2616489316, // 2.44 GB
    attributes: [
      { className: 'DocumentAttributeFilename', fileName: 'Imam.Instant.Ustazah.Scammer.EP03.1080p.WEB-DL.x264.AAC-KIKI.mkv' },
      { className: 'DocumentAttributeImageSize', w: 320, h: 180 } // Poster/thumbnail preview
    ]
  };
  const tier = detectVideoQualityTier(
    'Imam.Instant.Ustazah.Scammer.EP03.1080p.WEB-DL.x264.AAC-KIKI.mkv',
    'imam instant ustazah scammer s01e03_480p',
    doc
  );
  assert.strictEqual(tier, '1080p', 'Poster image size 320x180 must not demote 2.44 GB 1080p MKV to SD');
});

it('treats sub-HD video dimensions (< 960x530) on large files (> 600MB) as preview anomaly and falls back to filename (#218)', () => {
  const doc = {
    size: 1500000000, // 1.5 GB
    attributes: [
      { className: 'DocumentAttributeVideo', w: 480, h: 270 }
    ]
  };
  const tier = detectVideoQualityTier('Series.S01E01.720p.mkv', '', doc);
  assert.strictEqual(tier, '720p', 'Sub-HD dimensions on 1.5 GB file must not override explicit 720p filename tag');
});

it('detects 1080p for multi-gigabyte file (> 2GB) when filename lacks explicit quality tag and metadata is absent (#218)', () => {
  const doc = {
    size: 2500000000, // 2.5 GB
    attributes: []
  };
  const tier = detectVideoQualityTier('UnknownMovie.2024.mkv', '', doc);
  assert.strictEqual(tier, '1080p', 'Multi-gigabyte video (> 2GB) without tags defaults to 1080p');
});

it('preserves genuine SD detection for small files (< 500MB) with SD dimensions (#218)', () => {
  const doc = {
    size: 200000000, // 200 MB
    attributes: [
      { className: 'DocumentAttributeVideo', w: 640, h: 360 }
    ]
  };
  const tier = detectVideoQualityTier('ClassicShow.S01E01.mp4', '', doc);
  assert.strictEqual(tier, 'sd', 'Small file with 640x360 dimensions must be detected as SD');
});

console.log('\n17. Clean Cache Keys, Scenario A & Scenario B Quality Matching (#229)');

it('Scenario A: Coexistence of 1080p and 4K documents under the exact same clean queryKey (#229)', () => {
  const testDb = new CentralDatabase(TEST_DB_FILE);
  testDb.clear();

  const cleanKey = 'abang imam minah skuter s01e04';

  // 1. Initial 1080p file cached from a 720p request (phone client)
  const doc1080 = testDb.set(cleanKey, {
    docId: '6199269105426503425',
    filename: 'Abang.Imam.Minah.Skuter.S01E04.1080p.mkv',
    actualQuality: '1080p',
    requestedQualities: ['720p'],
  });

  assert.strictEqual(doc1080.queryKey, cleanKey, 'queryKey must have no quality suffix');
  assert.strictEqual(doc1080.actualQuality, '1080p');
  assert.deepStrictEqual(doc1080.requestedQualities, ['720p']);

  // 2. Next, 4K is requested and bot successfully delivers 4K file (Scenario A)
  const doc4k = testDb.set(cleanKey, {
    docId: '6199269105426509999',
    filename: 'Abang.Imam.Minah.Skuter.S01E04.2160p.UHD.mkv',
    actualQuality: '4k',
    requestedQualities: ['4k'],
  });

  assert.strictEqual(doc4k.queryKey, cleanKey, '4K queryKey must also have no quality suffix');
  assert.strictEqual(doc4k.actualQuality, '4k');
  assert.deepStrictEqual(doc4k.requestedQualities, ['4k']);

  // Both documents must coexist in DB
  assert.strictEqual(testDb.size(), 2, 'Both 1080p and 4K documents must coexist');

  // Verify lookups for each quality tier:
  // - 720p request: hits 1080p doc because requestedQualities includes '720p'
  const hit720 = testDb.get(cleanKey, '720p');
  assert.ok(hit720, '720p request must hit');
  assert.strictEqual(hit720.docId, '6199269105426503425');

  // - 1080p request: hits 1080p doc because actualQuality is '1080p'
  const hit1080 = testDb.get(cleanKey, '1080p');
  assert.ok(hit1080, '1080p request must hit');
  assert.strictEqual(hit1080.docId, '6199269105426503425');

  // - 4K request: hits 4K doc because actualQuality is '4k'
  const hit4k = testDb.get(cleanKey, '4k');
  assert.ok(hit4k, '4K request must hit');
  assert.strictEqual(hit4k.docId, '6199269105426509999');

  // Also verify legacy calls with suffix are cleanly parsed
  assert.strictEqual(testDb.get(`${cleanKey}_720p`)?.docId, '6199269105426503425');
  assert.strictEqual(testDb.get(`${cleanKey}_1080p`)?.docId, '6199269105426503425');
  assert.strictEqual(testDb.get(`${cleanKey}_4k`)?.docId, '6199269105426509999');
});

it('Scenario B: 4K requested, not found, fallback to 1080p updates requestedQualities to ["720p", "4k"] (#229)', () => {
  const testDb = new CentralDatabase(TEST_DB_FILE);
  testDb.clear();

  const cleanKey = 'abang imam minah skuter s01e04';

  // 1. Initial 1080p file cached with requestedQualities: ['720p']
  testDb.set(cleanKey, {
    docId: '6199269105426503425',
    filename: 'Abang.Imam.Minah.Skuter.S01E04.1080p.mkv',
    actualQuality: '1080p',
    requestedQualities: ['720p'],
  });

  // 2. Next client requests 4K: cache lookup must miss initially so bot is queried
  const initial4kCheck = testDb.get(cleanKey, '4k');
  assert.strictEqual(initial4kCheck, undefined, 'Initial 4K check must be cache miss');

  // 3. Fallback candidate is found
  const fallback = testDb.getFallback(cleanKey, '4k');
  assert.ok(fallback, 'Fallback must find 1080p file');
  assert.strictEqual(fallback.docId, '6199269105426503425');

  // 4. Bot does not find 4K -> resolver uses fallback and stamps requestedQualities
  const added = testDb.addRequestedQuality(fallback.docId, '4k');
  assert.strictEqual(added, true, 'addRequestedQuality should return true on new quality');
  assert.deepStrictEqual(fallback.requestedQualities, ['720p', '4k'], 'requestedQualities must now contain both 720p and 4k');

  // Calling again should be idempotent
  assert.strictEqual(testDb.addRequestedQuality(fallback.docId, '4k'), false, 'Should be idempotent');

  // 5. Subsequent 4K request now HITS directly without bot query (<1ms)!
  const next4kCheck = testDb.get(cleanKey, '4k');
  assert.ok(next4kCheck, 'Subsequent 4K request must hit cache directly');
  assert.strictEqual(next4kCheck.docId, '6199269105426503425');

  // 720p and 1080p requests also still hit
  assert.strictEqual(testDb.get(cleanKey, '720p')?.docId, '6199269105426503425');
  assert.strictEqual(testDb.get(cleanKey, '1080p')?.docId, '6199269105426503425');
});

it('persists clean queryKeys and requestedQualities array across disk reloads (#229)', () => {
  const testDb = new CentralDatabase(TEST_DB_FILE);
  testDb.clear();

  const cleanKey = 'sehangat cinta s01e01';

  testDb.set(cleanKey, {
    docId: '999001',
    filename: 'Sehangat.Cinta.S01E01.1080p.mkv',
    actualQuality: '1080p',
    requestedQualities: ['720p', '4k'],
  });
  testDb.saveSync();

  // Inspect raw JSON file on disk to confirm queryKey is clean without suffix
  const rawDisk = JSON.parse(fs.readFileSync(TEST_DB_FILE, 'utf-8'));
  assert.strictEqual(rawDisk.length, 1);
  assert.strictEqual(rawDisk[0].queryKey, cleanKey, 'queryKey in streams.json must be clean');
  assert.deepStrictEqual(rawDisk[0].requestedQualities, ['720p', '4k']);

  // Reload CentralDatabase from disk
  const reloadedDb = new CentralDatabase(TEST_DB_FILE);
  assert.strictEqual(reloadedDb.get(cleanKey, '720p')?.docId, '999001');
  assert.strictEqual(reloadedDb.get(cleanKey, '1080p')?.docId, '999001');
  assert.strictEqual(reloadedDb.get(cleanKey, '4k')?.docId, '999001');
  assert.strictEqual(reloadedDb.get(cleanKey, 'sd'), undefined);
});

it('searches and filters stream cache records by multiple requestedQualities (#231)', () => {
  const testDb = new CentralDatabase(TEST_DB_FILE);
  testDb.clear();

  testDb.set('abang imam minah skuter s01e04', {
    docId: '6199269105426503425',
    filename: 'Abang.Imam.Minah.Skuter.S01E04.1080p.mkv',
    actualQuality: '1080p',
    requestedQualities: ['720p', '4k'],
  });

  testDb.set('kudrat 1968', {
    docId: '6199269105426509999',
    filename: 'Kudrat.1968.720p.mp4',
    actualQuality: '720p',
    requestedQualities: ['720p'],
  });

  // Search by requested quality '4k' finds the 1080p file that answered 4k
  const res4k = testDb.getAll('4k');
  assert.strictEqual(res4k.length, 1);
  assert.strictEqual(res4k[0].docId, '6199269105426503425');

  // Search by requested quality '720p' finds both items
  const res720 = testDb.getAll('720p');
  assert.strictEqual(res720.length, 2);

  // Search by nonexistent quality 'sd' returns empty
  const resSd = testDb.getAll('sd');
  assert.strictEqual(resSd.length, 0);

  // Formats all previous requested qualities into comma-separated list
  const doc = res4k[0];
  const reqList = Array.isArray(doc.requestedQualities) && doc.requestedQualities.length > 0
    ? doc.requestedQualities
    : (doc.requestedQuality ? [doc.requestedQuality] : []);
  assert.strictEqual(reqList.join(', '), '720p, 4k');
});

console.log('\n18. Telegram Stream Resolver Factory & Decoupling (#232)');
it('lists all registered resolvers with metadata', () => {
  const list = listResolvers();
  assert.ok(Array.isArray(list));
  assert.ok(list.some(r => r.id === 'msm'));
  assert.ok(list.some(r => r.id === 'pencuri'));
});

it('instantiates MsmResolver and PencuriResolver correctly', () => {
  const msm = createResolver('msm', null);
  assert.ok(msm instanceof BaseResolver);
  assert.ok(msm instanceof MsmResolver);
  assert.strictEqual(msm.id, 'msm');
  assert.strictEqual(msm.defaultBot, 'msm34bot');

  const pencuri = createResolver('pencuri', null);
  assert.ok(pencuri instanceof BaseResolver);
  assert.ok(pencuri instanceof PencuriResolver);
  assert.strictEqual(pencuri.id, 'pencuri');
  assert.strictEqual(pencuri.defaultBot, 'Pencuri_Movie_Bot');
});

it('falls back to default resolver (msm) on unrecognized ID', () => {
  const fallback = createResolver('unknown_resolver', null);
  assert.ok(fallback instanceof MsmResolver);
  assert.strictEqual(fallback.id, 'msm');
});

console.log('\n19. Shared Search Query Builder (#232)');
it('builds prioritized, deduplicated movie search queries', () => {
  const queries = buildSearchQueries({
    title: 'Polis Evo 3',
    year: '2023',
  });
  assert.deepStrictEqual(queries, [
    'Polis Evo 3 2023',
    'Polis Evo 3',
  ]);
});

it('builds prioritized TV queries with auto-detected alternate title (Project <-> Projek)', () => {
  const queries = buildSearchQueries({
    title: 'Project: Exit',
    year: '2024',
    season: 1,
    episode: 6,
    totalSeasons: 1,
  });

  // Must include variants for 'Project Exit' as well as 'Projek Exit'
  assert.ok(queries.includes('Project Exit EP06'));
  assert.ok(queries.includes('Project Exit S01E06'));
  assert.ok(queries.includes('Projek Exit EP06'));
  assert.ok(queries.includes('Projek Exit S01E06'));
  assert.ok(queries.includes('Project Exit'));
  assert.ok(queries.includes('Projek Exit'));
  // Ensure no duplicated entries
  const unique = new Set(queries);
  assert.strictEqual(queries.length, unique.size);
});

it('builds prioritized TV queries with explicit altTitle and englishTitle', () => {
  const queries = buildSearchQueries({
    title: 'Abang Imam Minah Skuter',
    altTitle: 'Abang Imam',
    year: '2025',
    season: 1,
    episode: 10,
  });

  assert.ok(queries.includes('Abang Imam Minah Skuter EP10'));
  assert.ok(queries.includes('Abang Imam Minah Skuter S01E10'));
  assert.ok(queries.includes('Abang Imam EP10'));
  assert.ok(queries.includes('Abang Imam S01E10'));
  assert.ok(queries.includes('Abang Imam Minah Skuter'));
});

// ==========================================
// 20. Live Query Diagnostic Formatting & Resolver Support (#234)
// ==========================================
console.log('\n20. Live Query Diagnostic Formatting & Resolver Support (#234)');

it('formats Pencuri search API file results into clean diagnostic items with human-readable sizes', () => {
  const mockPencuriFiles = [
    {
      id: 101,
      title: 'Isteri.Halal.2023.EP70.Akhir.mp4',
      file_size: 382205952, // ~364.5 MB
      short_code: '0qIJUN',
      play_url: 'https://unofficialsbot.pencarimovie.com/link/0qIJUN',
    },
    {
      id: 102,
      title: 'Isteri.Halal.2023.EP69.mp4',
      file_size: 375599923, // ~358.2 MB
      short_code: '3BaDpd',
    },
    {
      id: 103,
      title: 'BigMovie.2024.1080p.mkv',
      file_size: 2415919104, // ~2.25 GB
      short_code: 'BIG108',
    }
  ];

  const formatted = formatDiagnosticResults(mockPencuriFiles, 'pencuri');
  assert.strictEqual(formatted.length, 3);
  assert.strictEqual(formatted[0].text, 'Isteri.Halal.2023.EP70.Akhir.mp4 (364.5 MB)');
  assert.strictEqual(formatted[0].url, 'https://unofficialsbot.pencarimovie.com/link/0qIJUN');
  assert.strictEqual(formatted[0].className, 'PencariFileResult');
  assert.strictEqual(formatted[0].shortCode, '0qIJUN');
  assert.strictEqual(formatted[0].size, 382205952);

  // Fallback URL generation from shortcode
  assert.strictEqual(formatted[1].url, 'https://unofficialsbot.pencarimovie.com/link/3BaDpd');

  // Gigabyte formatting
  assert.strictEqual(formatted[2].text, 'BigMovie.2024.1080p.mkv (2.25 GB)');
});

it('formats MSM Telegram inline buttons into clean diagnostic items', () => {
  const mockMsmButtons = [
    {
      text: '🎬 Isteri Halal S01E70 (767 MB)',
      url: 'https://t.me/msmbot/link/valid',
      className: 'KeyboardButtonUrlAuth',
      buttonId: 10,
    },
    {
      text: 'Next Page ➡️',
      url: '',
      className: 'KeyboardButtonCallback',
      buttonId: 11,
    }
  ];

  const formatted = formatDiagnosticResults(mockMsmButtons, 'msm');
  assert.strictEqual(formatted.length, 2);
  assert.strictEqual(formatted[0].text, '🎬 Isteri Halal S01E70 (767 MB)');
  assert.strictEqual(formatted[0].url, 'https://t.me/msmbot/link/valid');
  assert.strictEqual(formatted[0].className, 'KeyboardButtonUrlAuth');
  assert.strictEqual(formatted[0].buttonId, 10);
});

it('handles empty and null results gracefully for diagnostic search', () => {
  assert.deepStrictEqual(formatDiagnosticResults([], 'pencuri'), []);
  assert.deepStrictEqual(formatDiagnosticResults([], 'msm'), []);
  assert.deepStrictEqual(formatDiagnosticResults(null, 'pencuri'), []);
  assert.deepStrictEqual(formatDiagnosticResults(undefined, 'msm'), []);
});

it('resolves active bot handle dynamically based on active resolver configuration', () => {
  savedSettings.activeResolver = 'pencuri';
  savedSettings.targetBotUsernames = { msm: 'msm34bot', pencuri: 'Pencuri_Movie_Bot' };
  assert.strictEqual(getActiveTargetBot(), 'Pencuri_Movie_Bot');

  savedSettings.activeResolver = 'msm';
  assert.strictEqual(getActiveTargetBot(), 'msm34bot');
});

// ==========================================
// 21. Persistent Stream Cache Deduplication of Same Title/Episode & Quality (#246)
// ==========================================
console.log('\n21. Persistent Stream Cache Deduplication of Same Title/Episode & Quality (#246)');

it('supersedes older docId and evicts duplicate when caching same title/episode and quality tier (#246)', () => {
  const testDb = new CentralDatabase(TEST_DB_FILE);
  testDb.clear();

  const cleanKey = 'avatar seven havens s01e01';

  // 1. Initial 1080p file cached (e.g. from 10 days ago)
  testDb.set(cleanKey, {
    docId: '6217714585508519773',
    filename: 'Avatar.Seven.Havens.S01E01.On.The.Horizon.1080p.AMZN.WEB-DL..mkv',
    actualQuality: '1080p',
    requestedQualities: ['720p'],
    createdAt: 1000,
  });

  assert.strictEqual(testDb.byDocId.size, 1);
  assert.strictEqual(testDb.byQuery.get(cleanKey)?.length, 1);
  assert.strictEqual(testDb.getByDocId('6217714585508519773')?.docId, '6217714585508519773');

  // 2. Fresh resolution delivers a newer 1080p file for the exact same episode
  testDb.set(cleanKey, {
    docId: '5352762782603327747',
    filename: 'Avatar_Seven_Havens_S01E01_On_The_Horizon_1080p_PMTP_WEB_DL_DDP5.mkv',
    actualQuality: '1080p',
    requestedQualities: ['720p'],
    createdAt: 2000,
  });

  // Verify that the duplicate 1080p document was evicted and NOT retained
  assert.strictEqual(testDb.byDocId.size, 1, 'byDocId must contain exactly 1 document after re-resolution');
  assert.strictEqual(testDb.byQuery.get(cleanKey)?.length, 1, 'byQuery must contain exactly 1 document for this quality');
  assert.strictEqual(testDb.getAll().length, 1, 'getAll() must not report duplicate records');

  // Verify old docId was evicted and new docId is active
  assert.strictEqual(testDb.getByDocId('6217714585508519773'), undefined, 'Old docId must be evicted from byDocId');
  assert.strictEqual(testDb.getByDocId('5352762782603327747')?.docId, '5352762782603327747');
  assert.strictEqual(testDb.get(cleanKey, '1080p')?.docId, '5352762782603327747');
});

it('automatically prunes pre-existing duplicate records on disk during load() (#246)', () => {
  try { if (fs.existsSync(TEST_DB_FILE)) fs.unlinkSync(TEST_DB_FILE); } catch {}

  // Create disk file containing pre-existing duplicates of the same episode & quality
  const preExistingDuplicates = [
    {
      queryKey: 'avatar seven havens s01e01',
      docId: '6217714585508519773',
      filename: 'Avatar.Seven.Havens.S01E01.On.The.Horizon.1080p.AMZN.WEB-DL..mkv',
      actualQuality: '1080p',
      requestedQualities: ['720p'],
      createdAt: 1000,
    },
    {
      queryKey: 'avatar seven havens s01e01',
      docId: '5352762782603327747',
      filename: 'Avatar_Seven_Havens_S01E01_On_The_Horizon_1080p_PMTP_WEB_DL_DDP5.mkv',
      actualQuality: '1080p',
      requestedQualities: ['720p'],
      createdAt: 2000,
    }
  ];

  fs.writeFileSync(TEST_DB_FILE, JSON.stringify(preExistingDuplicates, null, 2), 'utf-8');

  // Load from disk
  const reloadedDb = new CentralDatabase(TEST_DB_FILE);

  assert.strictEqual(reloadedDb.byDocId.size, 1, 'Startup load must prune duplicates to 1 doc');
  assert.strictEqual(reloadedDb.byQuery.get('avatar seven havens s01e01')?.length, 1);
  assert.strictEqual(reloadedDb.getAll().length, 1);

  // The newer record (createdAt: 2000) must be retained
  assert.strictEqual(reloadedDb.getByDocId('5352762782603327747')?.docId, '5352762782603327747');
  assert.strictEqual(reloadedDb.getByDocId('6217714585508519773'), undefined);
});

it('strictly preserves distinct quality tiers (720p, 1080p, 4K) under the same cleanKey (#201 guardrail)', () => {
  const testDb = new CentralDatabase(TEST_DB_FILE);
  testDb.clear();

  const cleanKey = 'avatar seven havens s01e01';

  testDb.set(cleanKey, { docId: '101', filename: 'Show.S01E01.720p.mp4', actualQuality: '720p' });
  testDb.set(cleanKey, { docId: '202', filename: 'Show.S01E01.1080p.mp4', actualQuality: '1080p' });
  testDb.set(cleanKey, { docId: '303', filename: 'Show.S01E01.2160p.mp4', actualQuality: '4k' });

  // All 3 distinct tiers must coexist
  assert.strictEqual(testDb.byDocId.size, 3, 'Must retain all 3 distinct quality tiers');
  assert.strictEqual(testDb.byQuery.get(cleanKey)?.length, 3, 'Must retain 3 tiers in byQuery');
  assert.strictEqual(testDb.get(cleanKey, '720p')?.docId, '101');
  assert.strictEqual(testDb.get(cleanKey, '1080p')?.docId, '202');
  assert.strictEqual(testDb.get(cleanKey, '4k')?.docId, '303');
});

console.log('\n22. Provider-Agnostic Candidate Scoring & Pencuri Series Episode Resolution (#248)');

it('evaluates raw file candidates (Pencuri style) agnostically without requiring Telegram button objects (#248)', () => {
  const context = {
    isTv: true,
    title: 'Bad Cop',
    year: '2025',
    sNum: 1,
    eNum: 1,
    targetQuality: 720,
    minTvSizeMb: 80,
  };

  const fileCandidate = {
    text: 'Bad.Cop.2025.EP1.MalaySub.kakifilem.mp4',
    sizeMB: 543.8,
  };

  const result = scoreCandidateWithReason(fileCandidate, context);
  assert.ok(result.score > 200, `Expected high score for matching candidate, got ${result.score}`);
  assert.strictEqual(result.tier, '720p');
  assert.ok(result.reason.startsWith('accepted'), `Expected accepted reason, got ${result.reason}`);
});

it('disqualifies conflicting release year for series when explicit year is provided (#248 Bad Cop 2024 vs 2025)', () => {
  const context = {
    isTv: true,
    title: 'Bad Cop',
    year: '2025',
    sNum: 1,
    eNum: 1,
    targetQuality: 720,
    minTvSizeMb: 80,
  };

  // Indian Bad Cop S01E01 from 2024 / different show
  const candidate2024 = {
    text: 'Bad.Cop.2024.S01E01.Karan.Ya.Arjun.720p.WEB.DL.x264.favoriteml2.mkv',
    sizeMB: 375.6,
  };

  const res = scoreCandidateWithReason(candidate2024, context);
  assert.strictEqual(res.score, -999, 'Must disqualify candidate with conflicting release year');
  assert.ok(res.reason.includes('release year mismatch'), `Expected release year mismatch reason, got: ${res.reason}`);
});

it('correctly matches single-digit episode (EP1, EP8) and rejects mismatched single-digit episode (#248)', () => {
  const contextEp1 = {
    isTv: true,
    title: 'Bad Cop',
    year: '2025',
    sNum: 1,
    eNum: 1,
    targetQuality: 720,
  };

  const ep1File = { text: 'Bad.Cop.2025.EP1.MalaySub.mp4', sizeMB: 491.1 };
  const ep8File = { text: 'Bad.Cop.2025.EP8.MalaySub.Akhir.kakifilem.mp4', sizeMB: 543.8 };

  const resEp1 = scoreCandidateWithReason(ep1File, contextEp1);
  assert.ok(resEp1.score > 150, `EP1 file must match Episode 1 search (score: ${resEp1.score})`);

  const resEp8AgainstEp1 = scoreCandidateWithReason(ep8File, contextEp1);
  assert.strictEqual(resEp8AgainstEp1.score, -999, 'EP8 file must be disqualified when searching for Episode 1');
  assert.ok(resEp8AgainstEp1.reason.includes('episode mismatch'), `Reason should indicate episode mismatch, got: ${resEp8AgainstEp1.reason}`);

  // When searching for Ep 8, Ep 8 file must be accepted
  const contextEp8 = {
    isTv: true,
    title: 'Bad Cop',
    year: '2025',
    sNum: 1,
    eNum: 8,
    targetQuality: 720,
  };
  const resEp8 = scoreCandidateWithReason(ep8File, contextEp8);
  assert.ok(resEp8.score > 150, `EP8 file must match Episode 8 search (score: ${resEp8.score})`);
});

// Clean up temporary test files
try {
  if (fs.existsSync(TEST_DB_FILE)) fs.unlinkSync(TEST_DB_FILE);
  if (fs.existsSync(`${TEST_DB_FILE}.tmp`)) fs.unlinkSync(`${TEST_DB_FILE}.tmp`);
} catch {}

console.log(`\nResults: ${passed}/${total} tests passed!\n`);
if (passed === total) {
  console.log('🎉 ALL UNIT TESTS PASSED SUCCESSFULLY!\n');
} else {
  process.exit(1);
}


