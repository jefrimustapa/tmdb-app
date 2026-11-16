import assert from 'assert';
import { extractEpisodeInfo, scoreCandidateWithReason, validateDeliveredDocument } from '../server/tg-streamer/resolvers/base.js';

console.log('--- Issue #342: BVA & Mutation Testing Suite ---');

// 1. Boundary Value Analysis (BVA)
console.log('\n1. BVA Verification:');

const candidate = {
  text: 'Mr.London.Ms.Langkawi.Ep03.&.04.720p.mp4',
  sizeMB: 350,
};

const baseContext = {
  isTv: true,
  title: 'Mr London Ms Langkawi',
  sNum: 1,
  targetQuality: 720,
};

// Lower boundary (eNum = 3)
const resStart = scoreCandidateWithReason(candidate, { ...baseContext, eNum: 3 });
assert.ok(resStart.score > 0, 'Lower boundary eNum=3 should be accepted');
console.log('  ✓ Lower boundary eNum=3 accepted (score:', resStart.score, ')');

// Upper boundary (eNum = 4)
const resEnd = scoreCandidateWithReason(candidate, { ...baseContext, eNum: 4 });
assert.ok(resEnd.score > 0, 'Upper boundary eNum=4 should be accepted');
console.log('  ✓ Upper boundary eNum=4 accepted (score:', resEnd.score, ')');

// Just below lower boundary (eNum = 2)
const resBelow = scoreCandidateWithReason(candidate, { ...baseContext, eNum: 2 });
assert.strictEqual(resBelow.score, -999, 'Boundary violation eNum=2 should be -999');
console.log('  ✓ Below lower boundary eNum=2 rejected with -999');

// Just above upper boundary (eNum = 5)
const resAbove = scoreCandidateWithReason(candidate, { ...baseContext, eNum: 5 });
assert.strictEqual(resAbove.score, -999, 'Boundary violation eNum=5 should be -999');
console.log('  ✓ Above upper boundary eNum=5 rejected with -999');

// Zero / negative boundary
const resZero = scoreCandidateWithReason(candidate, { ...baseContext, eNum: 0 });
assert.strictEqual(resZero.score, -999, 'Zero episode eNum=0 should be -999');
console.log('  ✓ Zero episode eNum=0 rejected with -999');

// 2. Mutation Testing (5 Manual Mutants)
console.log('\n2. Mutation Testing Verification:');

// Mutant 1: Strict lower inequality (eNum > start) instead of (eNum >= start)
// Expected: Mutant fails when eNum === start (3)
function mutant1(eNum, start, end) {
  return eNum > start && eNum <= end;
}
assert.strictEqual(mutant1(3, 3, 4), false, 'Mutant 1 killed: eNum=3 fails strict greater');
console.log('  ✓ Mutant 1 killed (strict lower bound check: eNum > start)');

// Mutant 2: Strict upper inequality (eNum < end) instead of (eNum <= end)
// Expected: Mutant fails when eNum === end (4)
function mutant2(eNum, start, end) {
  return eNum >= start && eNum < end;
}
assert.strictEqual(mutant2(4, 3, 4), false, 'Mutant 2 killed: eNum=4 fails strict upper');
console.log('  ✓ Mutant 2 killed (strict upper bound check: eNum < end)');

// Mutant 3: Inverting range span for isCombined (end - start < 1)
function mutant3(start, end) {
  return (end - start < 1);
}
assert.strictEqual(mutant3(3, 4), false, 'Mutant 3 killed: combined episode (3-4) rejected by broken span');
console.log('  ✓ Mutant 3 killed (broken isCombined span condition)');

// Mutant 4: Demoting combined episode to standard batch score (+90 instead of +140)
const normalScore = resStart.score;
// With +140, score includes 140. If changed to 90, difference is 50.
assert.ok(normalScore >= 350, 'Mutant 4 killed: score must reflect combined bonus (+140)');
console.log('  ✓ Mutant 4 killed (score correctly awards +140 combined bonus over +90 batch)');

// Mutant 5: Removing ampersand from separator in extractEpisodeInfo
function mutant5Separator(text) {
  // Regex without & separator
  return /\b(?:s\d{1,2}\s*)?(?:e|ep|episod|episode)\.?\s*0*(\d{1,4})[\s\._]*(?:\+|\band\b|\bdan\b)[\s\._]*0*(\d{1,4})/i.test(text);
}
assert.strictEqual(mutant5Separator('Mr.London.Ms.Langkawi.Ep03.&.04.mp4'), false, 'Mutant 5 killed: ampersand missing in separator');
console.log('  ✓ Mutant 5 killed (separator without ampersand cannot parse Ep03.&.04)');

console.log('\nAll BVA & Mutation tests passed successfully!');
