import assert from 'node:assert';
import { needsAudioTranscode, isDualOrMultiAudioFilename, DUAL_OR_MULTI_AUDIO_FILENAME_RE } from '../src/utils/audioTranscode';

console.log('\n--- Audio Transcode Decision & Dual-Audio Selection Test Suite (#284, #357) ---\n');

let passed = 0;
let total = 0;

function it(name: string, fn: () => void) {
  total++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

const SILENT_NAME = 'Slow Horses (2022) - S01E01 - Failure’s Contagious (1080.mkv';

// --- Existing tests for surround & codec decisions (#284) ---
it('transcodes E-AC-3 even when the filename gives no hint (#284)', () => {
  assert.strictEqual(needsAudioTranscode({ filename: SILENT_NAME, audioCodec: 'eac3', audioChannels: 6 }), true);
});

it('transcodes AC-3, DTS, TrueHD and MLP', () => {
  for (const audioCodec of ['ac3', 'dts', 'truehd', 'mlp']) {
    assert.strictEqual(needsAudioTranscode({ filename: SILENT_NAME, audioCodec, audioChannels: 2 }), true, audioCodec);
  }
});

it('transcodes any codec with more than 2 channels', () => {
  assert.strictEqual(needsAudioTranscode({ audioCodec: 'aac', audioChannels: 6 }), true);
});

it('plays stereo AAC/Opus/MP3 directly', () => {
  for (const audioCodec of ['aac', 'opus', 'mp3']) {
    assert.strictEqual(needsAudioTranscode({ filename: SILENT_NAME, audioCodec, audioChannels: 2 }), false, audioCodec);
  }
});

it('trusts the real codec over a misleading filename (HDTS = camera source, AAC audio)', () => {
  assert.strictEqual(needsAudioTranscode({ filename: 'Street Fighter 2026-HDTS.mp4', audioCodec: 'aac', audioChannels: 2 }), false);
});

it('falls back to the filename when the codec is unknown', () => {
  assert.strictEqual(needsAudioTranscode({ filename: 'Crystal.Lake.2026.S01E03.1080p.WEB-DL.DDP5.mkv' }), true);
  assert.strictEqual(needsAudioTranscode({ filename: 'Standard.Show.S01E01.720p.HDTV.x264.mkv' }), false);
  assert.strictEqual(needsAudioTranscode({}), false);
});

// --- Issue #357: Dual-Audio Filename Regex & BVA ---
it('BVA: detects dual-audio tags across uppercase, lowercase, and mixed-case (#357)', () => {
  const dualAudioVariants = [
    'Play Dead (2022) 1080p WEBRip Dual Audio [Hindi + English]',
    'Play dead (2022) 1080p webrip dual audio [hindi + english]',
    'PLAY DEAD (2022) 1080P WEBRIP DUAL AUDIO [HINDI + ENGLISH]',
    'Play.Dead.2022.Dual.Audio.1080p.WEBRip.mkv',
    'Play.Dead.2022.dual-audio.1080p.mkv',
    'Play.Dead.2022.DualAudio.1080p.mkv',
    'Movie.2024.Multi.Audio.1080p.mkv',
    'Movie.2024.Tri.Audio.1080p.mkv',
    'Movie (2023) [Hindi + English].mkv',
    'Movie (2023) [English + Hindi].mkv',
    'Movie (2023) [Hin + Eng].mkv',
    'Movie (2023) [Eng + Hin].mkv',
    'Movie (2023) (Hindi + English).mkv',
    'Movie.2023.Hindi-English.mkv',
    'Movie.2023.English-Hindi.mkv',
    'Movie.2023.Hin+Eng.mkv',
  ];

  for (const fn of dualAudioVariants) {
    assert.strictEqual(isDualOrMultiAudioFilename(fn), true, `Should detect dual audio for "${fn}"`);
    assert.strictEqual(needsAudioTranscode({ filename: fn }), true, `needsAudioTranscode should be true for "${fn}"`);
  }
});

it('BVA: does NOT trigger dual-audio detection on single-audio or subtitle tags (#357)', () => {
  const singleAudioFiles = [
    'Standard.Show.S01E01.720p.HDTV.x264.mkv',
    'Movie.2024.1080p.WEB-DL.AAC2.0.x264.mkv',
    'Abang Imam Minah Skuter (2025) EP11 MalaySub.mp4',
    'Anime.Series.S01E01.1080p.mkv',
    'Movie.2024.1080p.[Eng Sub].mkv',
    'Movie.2024.1080p.English.Subtitles.mkv',
    'Simple_Video.mkv',
    'Test_Sample.mp4',
  ];

  for (const fn of singleAudioFiles) {
    assert.strictEqual(isDualOrMultiAudioFilename(fn), false, `Should NOT detect dual audio for "${fn}"`);
    assert.strictEqual(needsAudioTranscode({ filename: fn }), false, `needsAudioTranscode should be false for "${fn}"`);
  }
});

// --- Branch Coverage: audioTrackCount & hasMultipleAudio ---
it('Branch Coverage: hasMultipleAudio === true forces audio transcode (#357)', () => {
  // Even if chosen track is stereo AAC, multi-audio requires transcode to isolate English track
  assert.strictEqual(
    needsAudioTranscode({
      filename: 'Play Dead (2022).mkv',
      audioCodec: 'aac',
      audioChannels: 2,
      hasMultipleAudio: true,
      audioTrackCount: 2,
    }),
    true
  );
});

it('Branch Coverage: audioTrackCount > 1 forces audio transcode (#357)', () => {
  assert.strictEqual(
    needsAudioTranscode({
      audioCodec: 'aac',
      audioChannels: 2,
      audioTrackCount: 3,
    }),
    true
  );
});

it('Branch Coverage: single audio stereo AAC direct stream preserved (#357)', () => {
  assert.strictEqual(
    needsAudioTranscode({
      filename: 'Standard.Show.S01E01.720p.HDTV.x264.mkv',
      audioCodec: 'aac',
      audioChannels: 2,
      hasMultipleAudio: false,
      audioTrackCount: 1,
    }),
    false
  );
});

it('Branch Coverage: zero audio streams does not force transcode (#357)', () => {
  assert.strictEqual(
    needsAudioTranscode({
      filename: 'Silent_Video.mp4',
      hasMultipleAudio: false,
      audioTrackCount: 0,
    }),
    false
  );
});

it('Branch Coverage: probe confirming single audio overrides misleading dual audio filename tag (#357)', () => {
  assert.strictEqual(
    needsAudioTranscode({
      filename: 'Misleading.Title.Dual.Audio.mkv',
      audioCodec: 'aac',
      audioChannels: 2,
      hasMultipleAudio: false,
      audioTrackCount: 1,
    }),
    false
  );
});

it('Branch Coverage: surround/Dolby codec still forces transcode even if single audio (#357)', () => {
  assert.strictEqual(
    needsAudioTranscode({
      filename: 'Movie.2024.mkv',
      audioCodec: 'eac3',
      audioChannels: 6,
      hasMultipleAudio: false,
      audioTrackCount: 1,
    }),
    true
  );
});

console.log(`\nResults: ${passed}/${total} tests passed!\n`);
