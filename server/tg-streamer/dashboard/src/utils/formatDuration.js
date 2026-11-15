/**
 * Formats a duration in seconds into 'hh:mm:ss' format.
 *
 * Rules:
 * - Always at least 2 digits for hours, minutes, and seconds (e.g. '00:00:00', '02:05:30').
 * - Hours can exceed 2 digits if >= 100 (e.g. 360000 -> '100:00:00').
 * - Zero, negative numbers, NaN, null, undefined, or invalid inputs return '00:00:00'.
 *
 * @param {number|string} sec - Duration in seconds
 * @returns {string} Formatted duration string 'hh:mm:ss'
 */
export function formatDuration(sec) {
  const n = Number(sec);
  if (!Number.isFinite(n) || n <= 0) {
    return '00:00:00';
  }

  const totalSec = Math.floor(n);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');

  return `${hh}:${mm}:${ss}`;
}

export default formatDuration;
