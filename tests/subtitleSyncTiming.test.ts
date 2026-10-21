import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

// Core timing calculation as used in SubtitleOverlay.tsx
function getEffectiveTime(currentTime: number, offsetSeconds: number): number {
  return Math.max(0, currentTime - offsetSeconds);
}

// Active cue lookup simulation as used in SubtitleOverlay.tsx
function findActiveCue(
  cues: Array<{ start: number; end: number; text: string }>,
  currentTime: number,
  offsetSeconds: number
) {
  const effectiveTime = getEffectiveTime(currentTime, offsetSeconds);
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    if (effectiveTime >= cue.start && effectiveTime <= cue.end) {
      return cue;
    }
    if (cue.start > effectiveTime + 2) {
      break;
    }
  }
  return null;
}

// Label formatter as used in WatchSettingsModal.tsx
function getSyncDescription(syncOffset: number): { primary: string; hint: string } {
  if (syncOffset === 0) {
    return {
      primary: 'In sync with video audio',
      hint: ''
    };
  }
  if (syncOffset > 0) {
    return {
      primary: `Delayed by +${syncOffset.toFixed(1)}s`,
      hint: 'Appears later • for subs showing too early'
    };
  }
  return {
    primary: `Advanced by ${Math.abs(syncOffset).toFixed(1)}s`,
    hint: 'Appears earlier • for subs showing too late'
  };
}

console.log('--- Testing Subtitle Sync Timing Logic (Issue #242) ---');

// 1. Basic offset calculation
assert.strictEqual(getEffectiveTime(10, 0), 10, 'Offset 0 should keep time unchanged');
assert.strictEqual(getEffectiveTime(10, 2), 8, 'Positive offset (+2s delay) should yield effective time 8s at currentTime 10s');
assert.strictEqual(getEffectiveTime(10, -2), 12, 'Negative offset (-2s advance) should yield effective time 12s at currentTime 10s');
assert.strictEqual(getEffectiveTime(1, 3), 0, 'Effective time should not be negative (clamped to 0)');
console.log('✓ Timing calculation verifies positive delay and negative advance correctly');

// 2. Cue playback behavior verification
const cues = [
  { start: 10.0, end: 12.0, text: 'Hello World' }
];

// In-sync (offset = 0)
assert.strictEqual(findActiveCue(cues, 9.9, 0), null, 'At 9.9s, cue not visible');
assert.strictEqual(findActiveCue(cues, 10.0, 0)?.text, 'Hello World', 'At 10.0s, cue visible');
assert.strictEqual(findActiveCue(cues, 12.0, 0)?.text, 'Hello World', 'At 12.0s, cue visible');
assert.strictEqual(findActiveCue(cues, 12.1, 0), null, 'At 12.1s, cue ended');

// Delay (+2.0s): Subtitle should appear 2.0s LATER (at video time 12.0s to 14.0s)
assert.strictEqual(findActiveCue(cues, 10.0, 2.0), null, 'Delayed: at 10.0s cue should NOT show yet (effectiveTime is 8.0s)');
assert.strictEqual(findActiveCue(cues, 11.9, 2.0), null, 'Delayed: at 11.9s cue should still NOT show (effectiveTime is 9.9s)');
assert.strictEqual(findActiveCue(cues, 12.0, 2.0)?.text, 'Hello World', 'Delayed: at 12.0s cue starts (effectiveTime is 10.0s)');
assert.strictEqual(findActiveCue(cues, 14.0, 2.0)?.text, 'Hello World', 'Delayed: at 14.0s cue ends (effectiveTime is 12.0s)');
assert.strictEqual(findActiveCue(cues, 14.1, 2.0), null, 'Delayed: at 14.1s cue ended (effectiveTime is 12.1s)');
console.log('✓ Positive offset (+2s) successfully delays cue by 2.0s of video playback');

// Advance (-2.0s): Subtitle should appear 2.0s EARLIER (at video time 8.0s to 10.0s)
assert.strictEqual(findActiveCue(cues, 7.9, -2.0), null, 'Advanced: at 7.9s cue should not show yet (effectiveTime is 9.9s)');
assert.strictEqual(findActiveCue(cues, 8.0, -2.0)?.text, 'Hello World', 'Advanced: at 8.0s cue starts (effectiveTime is 10.0s)');
assert.strictEqual(findActiveCue(cues, 10.0, -2.0)?.text, 'Hello World', 'Advanced: at 10.0s cue ends (effectiveTime is 12.0s)');
assert.strictEqual(findActiveCue(cues, 10.1, -2.0), null, 'Advanced: at 10.1s cue ended (effectiveTime is 12.1s)');
console.log('✓ Negative offset (-2s) successfully advances cue by 2.0s earlier in video playback');

// 3. UI label formatting (prevent double negative)
const zeroDesc = getSyncDescription(0);
assert.strictEqual(zeroDesc.primary, 'In sync with video audio');

const delayDesc = getSyncDescription(2.5);
assert.strictEqual(delayDesc.primary, 'Delayed by +2.5s');
assert.strictEqual(delayDesc.hint, 'Appears later • for subs showing too early');

const advanceDesc = getSyncDescription(-2.0);
assert.strictEqual(advanceDesc.primary, 'Advanced by 2.0s');
assert.strictEqual(advanceDesc.hint, 'Appears earlier • for subs showing too late');
assert.ok(!advanceDesc.primary.includes('--'), 'Should never contain double minus');
assert.ok(!advanceDesc.primary.includes('by -'), 'Should never display "by -2.0s"');
console.log('✓ UI descriptions correctly format labels without double negative (Advanced by 2.0s)');

// 4. Source file inspection
const overlaySrc = fs.readFileSync(path.join(process.cwd(), 'src/components/player/SubtitleOverlay.tsx'), 'utf-8');
assert.ok(
  overlaySrc.includes('Math.max(0, currentTime - offsetSeconds)'),
  'SubtitleOverlay.tsx must use currentTime - offsetSeconds'
);

const modalSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/player/WatchSettingsModal.tsx'), 'utf-8');
assert.ok(
  modalSrc.includes('Math.abs(syncOffset)'),
  'WatchSettingsModal.tsx must use Math.abs(syncOffset) to avoid double negative'
);
assert.ok(
  modalSrc.includes('Earlier 0.5s') && modalSrc.includes('Later 0.5s'),
  'WatchSettingsModal.tsx stepper controls must include Earlier / Later directional indicators'
);

console.log('✓ All Subtitle Sync Timing tests passed successfully!');
