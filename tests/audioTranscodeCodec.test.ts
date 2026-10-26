import assert from 'node:assert';
import { needsAudioTranscode } from '../src/utils/audioTranscode';

console.log('\n--- Audio Transcode Decision by Real Codec Test Suite (#284) ---\n');

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

console.log(`\nResults: ${passed}/${total} tests passed!\n`);
