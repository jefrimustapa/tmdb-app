import assert from 'assert';

console.log('\n--- Audio Transcode & Player Fallback Test Suite (Issue #250) ---');

let passed = 0;
let total = 0;

function it(desc: string, fn: () => void) {
  total++;
  try {
    fn();
    console.log(`  ✓ ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${desc}`);
    console.error(err);
    process.exit(1);
  }
}

// 1. Audio Transcode Trigger Regex
// Standard stereo MKV files must NOT trigger transcode, preserving 0% CPU direct stream.
// Multi-channel surround sound files (DD5.1, EAC3, Atmos, DTS, 6CH) MUST trigger transcode.
const isSurroundOrDolbyAudioRegex = /(ddp|dd\+|ac3|ac-3|eac3|e-ac-3|atmos|dts|truehd|thd|[345678]ch|surround|(?<!\d)5[._-]1(?!\d)|(?<!\d)7[._-]1(?!\d))/i;

it('does not trigger audio transcode on standard stereo MKV and MP4 files (#250)', () => {
  const stereoFiles = [
    'Abang_Imam_Minah_Skuter_S01E05_1080p_VIU_WEB_DL_AAC2_0_H_264_OMG.mkv',
    'Abang_Imam_Minah_Skuter_S01E01_1080p_VIU_WEB_DL_AAC2_0_H_264_OMG.mkv',
    'Abang Imam Minah Skuter (2025) EP11 MalaySub.mp4',
    'Standard.Show.S01E01.720p.HDTV.x264.mkv',
    'Movie.2024.1080p.WEB-DL.AAC2.0.x264.mkv',
    'Simple_Video.mkv',
    'Test_Sample.mp4',
    'Show.E05_1080p.mkv',
  ];

  for (const fn of stereoFiles) {
    assert.strictEqual(
      isSurroundOrDolbyAudioRegex.test(fn),
      false,
      `File "${fn}" should NOT trigger audio transcode (should stream direct)`
    );
  }
});

it('triggers audio transcode on multi-channel surround sound and Dolby/DTS files (#250)', () => {
  const surroundFiles = [
    'Imam_Instant_Ustazah_Scammer_EP02_1080p_WEB_DL_x264_DD5_1_KIKI.mkv',
    'Imam_Instant_Ustazah_Scammer_S01E02_1080p_AOTG_WEB_DL_DD5_1_H264.mkv',
    'Avatar.Seven.Havens.S01E01.1080p.PMTP.WEB.DL.DDP5.1.mkv',
    'Action.Movie.2024.2160p.UHD.EAC3.Atmos.mkv',
    'Concert.Live.1080p.BluRay.DTS-HD.MA.7.1.x264.mkv',
    'Series.S01E04.720p.WEB-DL.6CH.x264.mkv',
    'Cinema.TrueHD.7.1.Surround.mkv',
    'Classic.Film.AC3.5.1.mkv',
  ];

  for (const fn of surroundFiles) {
    assert.strictEqual(
      isSurroundOrDolbyAudioRegex.test(fn),
      true,
      `File "${fn}" MUST trigger audio transcode`
    );
  }
});

// 2. Bidirectional URL Fallback
function getAudioTranscodeUrl(url: string): string {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}transcode=audio`;
}

function getDirectStreamFallbackUrl(url: string): string {
  return url.replace(/([?&])transcode=audio(&?)/, (match, p1, p2) => (p1 === '?' && p2 ? '?' : '')).replace(/\?$/, '');
}

it('adds transcode=audio when direct stream playback errors out (#250)', () => {
  const directUrl1 = 'http://router:3033/stream/12345';
  const directUrl2 = 'http://router:3033/stream/12345?direct=1';

  assert.strictEqual(getAudioTranscodeUrl(directUrl1), 'http://router:3033/stream/12345?transcode=audio');
  assert.strictEqual(getAudioTranscodeUrl(directUrl2), 'http://router:3033/stream/12345?direct=1&transcode=audio');
});

it('strips transcode=audio cleanly when transcode playback errors out (#250)', () => {
  const transcodeUrl1 = 'http://router:3033/stream/12345?transcode=audio';
  const transcodeUrl2 = 'http://router:3033/stream/12345?direct=1&transcode=audio';
  const transcodeUrl3 = 'http://router:3033/stream/12345?transcode=audio&track=0:a:1';

  assert.strictEqual(getDirectStreamFallbackUrl(transcodeUrl1), 'http://router:3033/stream/12345');
  assert.strictEqual(getDirectStreamFallbackUrl(transcodeUrl2), 'http://router:3033/stream/12345?direct=1');
  assert.strictEqual(getDirectStreamFallbackUrl(transcodeUrl3), 'http://router:3033/stream/12345?track=0:a:1');
});

console.log(`\nTests completed: ${passed}/${total} passed.\n`);
