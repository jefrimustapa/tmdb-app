import assert from 'node:assert';
import { CentralDatabase } from '../server/tg-streamer/db.js';
import { needsAudioTranscode, isDualOrMultiAudioFilename } from '../src/utils/audioTranscode';
import type { TgStreamerResolveResult } from '../src/services/tgStreamerService';

console.log('\n--- Dual-Audio English Audio Selection E2E Integration Suite (Issue #357) ---\n');

let passed = 0;
let total = 0;

function it(name: string, fn: () => void | Promise<void>) {
  total++;
  try {
    const res = fn();
    if (res instanceof Promise) {
      res
        .then(() => {
          console.log(`  ✓ ${name}`);
          passed++;
        })
        .catch((err) => {
          console.error(`  ✗ ${name}`);
          console.error(`    ${err.message}`);
          process.exitCode = 1;
        });
    } else {
      console.log(`  ✓ ${name}`);
      passed++;
    }
  } catch (err: any) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

// 1. Database persistence of multi-audio metadata
it('CentralDatabase persists audioTrackCount and hasMultipleAudio', () => {
  const db = new CentralDatabase('/tmp/test_streams_e2e.json');
  const docId = '99901';
  db.byDocId.set(docId, {
    docId,
    queryKey: 'play_dead_2022',
    filename: 'Play Dead (2022) 1080p Dual Audio [Hindi + English].mkv',
    size: 2000000000,
  });

  const updated = db.updateAudioInfo(docId, 'aac', 2, 2, true);
  assert.strictEqual(updated, true);

  const record = db.getByDocId(docId);
  assert.strictEqual(record?.audioCodec, 'aac');
  assert.strictEqual(record?.audioChannels, 2);
  assert.strictEqual(record?.audioTrackCount, 2);
  assert.strictEqual(record?.hasMultipleAudio, true);
});

// 2. FFprobe output parsing & English stream mapping logic
it('Probed streams logic maps to English audio track index when Hindi is track 0', () => {
  // Simulate ffprobe streams output for Play Dead (2022) [Hindi + English]
  const mockFfprobeStreams = [
    { index: 0, codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080 },
    { index: 1, codec_type: 'audio', codec_name: 'aac', channels: 2, tags: { language: 'hin', title: 'Hindi [Default]' } },
    { index: 2, codec_type: 'audio', codec_name: 'aac', channels: 2, tags: { language: 'eng', title: 'English' } },
  ];

  const audioStreams = mockFfprobeStreams.filter(s => s.codec_type === 'audio');
  const audioTrackCount = audioStreams.length;
  const hasMultipleAudio = audioTrackCount > 1;

  let audioSpec = '0:a:0';
  if (audioStreams.length === 1) {
    audioSpec = `0:${audioStreams[0].index}`;
  } else if (audioStreams.length > 1) {
    const engStream = audioStreams.find(s => {
      const lang = String(s.tags?.language || '').toLowerCase();
      const title = String(s.tags?.title || '').toLowerCase();
      return /^(en|eng|english|en-.*)$/i.test(lang) || /\b(eng|english|original|orig)\b/i.test(title);
    });
    if (engStream) {
      audioSpec = `0:${engStream.index}`;
    }
  }

  assert.strictEqual(audioTrackCount, 2);
  assert.strictEqual(hasMultipleAudio, true);
  assert.strictEqual(audioSpec, '0:2', 'Should select English audio track at index 2');

  const chosenAudio = audioStreams.find(s => `0:${s.index}` === audioSpec) || audioStreams[0];
  assert.strictEqual(chosenAudio?.tags?.language, 'eng');
});

// 3. E2E User Scenario: Dual-audio video triggers transcode=audio with English audio output
it('E2E: Dual-audio video item resolves and triggers transcode=audio pipe', () => {
  // Server resolve response for dual-audio video
  const resolveResult: TgStreamerResolveResult = {
    streamUrl: 'http://127.0.0.1:3033/stream/99901',
    filename: 'Play Dead (2022) 1080p WEBRip Dual Audio [Hindi + English].mkv',
    size: 2147483648,
    cached: true,
    videoCodec: 'h264',
    audioCodec: 'aac',
    audioChannels: 2,
    hasMultipleAudio: true,
    audioTrackCount: 2,
  };

  // Client VideoPlayer logic
  const isSurroundOrDolbyAudio = needsAudioTranscode({
    filename: resolveResult.filename,
    audioCodec: resolveResult.audioCodec,
    audioChannels: resolveResult.audioChannels,
    hasMultipleAudio: resolveResult.hasMultipleAudio,
    audioTrackCount: resolveResult.audioTrackCount,
  });

  let finalUrl = resolveResult.streamUrl;
  if (isSurroundOrDolbyAudio) {
    const sep = finalUrl.includes('?') ? '&' : '?';
    if (!finalUrl.includes('transcode=')) {
      finalUrl = `${finalUrl}${sep}transcode=audio`;
    }
  }

  assert.strictEqual(isSurroundOrDolbyAudio, true);
  assert.strictEqual(finalUrl, 'http://127.0.0.1:3033/stream/99901?transcode=audio');
});

// 4. E2E User Scenario: Single-audio video item continues direct stream without transcode=audio
it('E2E: Single-audio video item plays direct stream without transcode=audio', () => {
  const resolveResult: TgStreamerResolveResult = {
    streamUrl: 'http://127.0.0.1:3033/stream/99902',
    filename: 'Standard.Show.S01E01.720p.HDTV.x264.mkv',
    size: 524288000,
    cached: true,
    videoCodec: 'h264',
    audioCodec: 'aac',
    audioChannels: 2,
    hasMultipleAudio: false,
    audioTrackCount: 1,
  };

  const isSurroundOrDolbyAudio = needsAudioTranscode({
    filename: resolveResult.filename,
    audioCodec: resolveResult.audioCodec,
    audioChannels: resolveResult.audioChannels,
    hasMultipleAudio: resolveResult.hasMultipleAudio,
    audioTrackCount: resolveResult.audioTrackCount,
  });

  let finalUrl = resolveResult.streamUrl;
  if (isSurroundOrDolbyAudio) {
    const sep = finalUrl.includes('?') ? '&' : '?';
    if (!finalUrl.includes('transcode=')) {
      finalUrl = `${finalUrl}${sep}transcode=audio`;
    }
  }

  assert.strictEqual(isSurroundOrDolbyAudio, false);
  assert.strictEqual(finalUrl, 'http://127.0.0.1:3033/stream/99902', 'Should keep direct URL without transcode=audio');
});

console.log(`\nResults: ${passed}/${total} E2E tests passed!\n`);
