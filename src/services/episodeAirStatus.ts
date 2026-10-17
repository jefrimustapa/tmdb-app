import type { TMDBTVDetails } from '../types/tmdb';

/**
 * Determines whether a given TV episode has officially aired.
 *
 * Evaluation checks:
 * 1. Checks TMDB's `details.last_episode_to_air`. If present, any episode with
 *    season > last.season_number OR (season === last.season_number && episode > last.episode_number)
 *    is definitively unaired.
 * 2. Checks TMDB's `details.next_episode_to_air`. If present, any episode with
 *    season > next.season_number OR (season === next.season_number && episode >= next.episode_number)
 *    is definitively unaired.
 * 3. Checks `airDate`. If missing/null/empty, it cannot be confirmed as aired -> returns false.
 * 4. Compares `airDate` (YYYY-MM-DD) against the current date in local timezone and UTC.
 *    Only returns true if airDate <= today.
 */
export function isEpisodeAired(
  season: number,
  episode: number,
  airDate?: string | null,
  details?: TMDBTVDetails | null
): boolean {
  if (typeof season !== 'number' || typeof episode !== 'number' || isNaN(season) || isNaN(episode)) {
    return false;
  }

  // 1. Check against last_episode_to_air
  if (details?.last_episode_to_air) {
    const last = details.last_episode_to_air;
    if (typeof last.season_number === 'number' && typeof last.episode_number === 'number') {
      if (season > last.season_number) return false;
      if (season === last.season_number && episode > last.episode_number) return false;
    }
  }

  // 2. Check against next_episode_to_air
  if (details?.next_episode_to_air) {
    const next = details.next_episode_to_air;
    if (typeof next.season_number === 'number' && typeof next.episode_number === 'number') {
      if (season > next.season_number) return false;
      if (season === next.season_number && episode >= next.episode_number) return false;
    }
  }

  // 3. If airDate is missing, cannot confirm that the episode has aired
  if (!airDate || typeof airDate !== 'string' || !airDate.trim()) {
    return false;
  }

  // 4. Multi-timezone current date comparison
  const trimmedAirDate = airDate.trim();
  const utcToday = new Date().toISOString().split('T')[0];
  const localToday = new Date().toLocaleDateString('en-CA'); // Standard ISO date (YYYY-MM-DD) in local time
  const effectiveToday = localToday > utcToday ? localToday : utcToday;

  return trimmedAirDate <= effectiveToday;
}
