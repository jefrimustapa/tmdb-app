import assert from 'node:assert';
import { guessContentType, canNativeCast, shouldOfferNativeCast, nativeCast } from '../src/utils/nativeCast';

console.log('\n--- Native Cast Test Suite (Issue #334) ---\n');

let total = 0;
function runTest(name: string, fn: () => void) {
  total++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

const g = globalThis as any;
const hadWindow = 'window' in g;
const originalWindow = g.window;
function withWindow(win: any, fn: () => void) {
  g.window = win;
  try {
    fn();
  } finally {
    if (hadWindow) g.window = originalWindow;
    else delete g.window;
  }
}

const STREAM = 'https://tgstrm.julietmike.net/stream/abc/movie.mkv?token=1';
const fullBridge = { startNativeCast: () => {}, nativeCastAvailable: () => true };

runTest('content type is guessed from extension and ignores the query string', () => {
  assert.strictEqual(guessContentType(STREAM), 'video/x-matroska');
  assert.strictEqual(guessContentType('https://x/y/a.mp4?x=.mkv'), 'video/mp4');
  assert.strictEqual(guessContentType('https://x/y/live.m3u8'), 'application/x-mpegURL');
  assert.strictEqual(guessContentType('https://x/y/a.webm'), 'video/webm');
  assert.strictEqual(guessContentType('https://x/y/noext'), 'video/mp4');
});

runTest('no native cast on web (no AndroidBridge)', () => {
  withWindow({}, () => {
    assert.strictEqual(canNativeCast(), false);
    assert.strictEqual(shouldOfferNativeCast(STREAM), false);
  });
});

runTest('no native cast on an old APK whose bridge lacks the cast methods', () => {
  withWindow({ AndroidBridge: { openGoogleCast: () => {} } }, () => {
    assert.strictEqual(canNativeCast(), false);
  });
});

runTest('no native cast when Play Services Cast is unavailable', () => {
  withWindow({ AndroidBridge: { ...fullBridge, nativeCastAvailable: () => false } }, () => {
    assert.strictEqual(shouldOfferNativeCast(STREAM), false);
  });
});

runTest('native cast is offered only for a direct http(s) stream (TGStrm), not for embeds', () => {
  withWindow({ AndroidBridge: fullBridge }, () => {
    assert.strictEqual(shouldOfferNativeCast(STREAM), true);
    assert.strictEqual(shouldOfferNativeCast(null), false);
    assert.strictEqual(shouldOfferNativeCast(''), false);
    assert.strictEqual(shouldOfferNativeCast('blob:abc'), false);
  });
});

runTest('start passes url, title, content type, position in ms and poster to the bridge', () => {
  let args: any[] = [];
  withWindow({ AndroidBridge: { ...fullBridge, startNativeCast: (...a: any[]) => { args = a; } } }, () => {
    nativeCast.start(STREAM, 'Movie', 'https://img/p.jpg', 12.5);
    nativeCast.stop();
    nativeCast._reset();
  });
  assert.deepStrictEqual(args, [STREAM, 'Movie', 'video/x-matroska', 12500, 'https://img/p.jpg']);
});

runTest('stop is a no-op when not casting', () => {
  let stopped = false;
  withWindow({ AndroidBridge: { ...fullBridge, nativeCastStop: () => { stopped = true; } } }, () => {
    nativeCast._reset();
    nativeCast.stop();
  });
  assert.strictEqual(stopped, false);
});

console.log(`\n${total} tests run`);
process.exit(process.exitCode || 0);
