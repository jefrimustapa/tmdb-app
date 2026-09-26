import type { TMDBTVDetails } from '../types/tmdb';
import type { WatchHistoryItem } from '../types/db';

export interface SeriesPlaybackTarget {
  season: number;
  episode: number;
  isResumable: boolean;
  isNextEpisode: boolean;
  timestamp: number;
  duration: number;
  progressPercent: number;
}

/**
 * Resolves the target episode and playback state for a TV series.
 *
 * Rules:
 * 1. If no history exists, returns S1 E1 as fresh play.
 * 2. If the current/last-watched episode is in-progress (progress > 1% or > 15s and < 92%),
 *    returns that episode as resumable with its saved timestamp.
 * 3. If the current episode has been completed (progress >= 92%), advances to the next
 *    sequential episode:
 *    - episode + 1 within the same season if episode < season's episode_count.
 *    - season + 1, episode 1 if the season has concluded.
 *    - Cross-references tvHistory: if the next episode was also completed in the past,
 *      continues advancing until an unwatched or in-progress episode is found.
 *    - If all episodes across all seasons are completed, falls back to the series finale.
 */
export function resolveSeriesPlaybackTarget(
  tvDetails: TMDBTVDetails | null,
  lastWatched: { season: number; episode: number } | null,
  watchProgress: { timestamp: number; duration: number; progressPercent: number } | null,
  tvHistory: WatchHistoryItem[] = []
): SeriesPlaybackTarget {
  if (!lastWatched || !tvDetails) {
    return {
      season: 1,
      episode: 1,
      isResumable: false,
      isNextEpisode: false,
      timestamp: 0,
      duration: 0,
      progressPercent: 0,
    };
  }

  // Fast lookup map for all recorded episode progress
  const historyMap = new Map<string, WatchHistoryItem>();
  for (const item of tvHistory) {
    if (item.season && item.episode) {
      historyMap.set(`s${item.season}e${item.episode}`, item);
    }
  }

  const currentEpHistory = historyMap.get(`s${lastWatched.season}e${lastWatched.episode}`);
  const currentPercent = watchProgress?.progressPercent ?? currentEpHistory?.progressPercent ?? 0;
  const isCurrentCompleted = currentPercent >= 92;

  // In-progress: not completed, and has non-trivial watch time
  if (!isCurrentCompleted && watchProgress && (watchProgress.timestamp > 15 || watchProgress.progressPercent > 1)) {
    return {
      season: lastWatched.season,
      episode: lastWatched.episode,
      isResumable: true,
      isNextEpisode: false,
      timestamp: watchProgress.timestamp,
      duration: watchProgress.duration,
      progressPercent: watchProgress.progressPercent,
    };
  }

  // Not completed, but also not resumable (e.g. at 0s)
  if (!isCurrentCompleted) {
    return {
      season: lastWatched.season,
      episode: lastWatched.episode,
      isResumable: false,
      isNextEpisode: false,
      timestamp: 0,
      duration: watchProgress?.duration ?? 0,
      progressPercent: 0,
    };
  }

  // Current episode IS COMPLETED! Find the next episode.
  const regularSeasons = (tvDetails.seasons || [])
    .filter((s) => s.season_number > 0 && s.episode_count > 0)
    .sort((a, b) => a.season_number - b.season_number);

  const getSeasonEpCount = (sNum: number): number => {
    const s = regularSeasons.find((item) => item.season_number === sNum);
    return s?.episode_count || 0;
  };

  const advance = (s: number, e: number): { season: number; episode: number } | null => {
    const epCount = getSeasonEpCount(s);
    if (e < epCount) {
      return { season: s, episode: e + 1 };
    }
    const nextSeason = regularSeasons.find((item) => item.season_number > s);
    if (nextSeason && nextSeason.episode_count > 0) {
      return { season: nextSeason.season_number, episode: 1 };
    }
    return null;
  };

  const nextTarget = advance(lastWatched.season, lastWatched.episode);
  if (!nextTarget) {
    // Reached the end of the entire series
    return {
      season: lastWatched.season,
      episode: lastWatched.episode,
      isResumable: false,
      isNextEpisode: false,
      timestamp: 0,
      duration: 0,
      progressPercent: 100,
    };
  }

  let candidateSeason = nextTarget.season;
  let candidateEpisode = nextTarget.episode;

  // Scan forward if subsequent episodes are also already completed
  let safetyLoop = 0;
  while (safetyLoop < 300) {
    safetyLoop++;
    const candHistory = historyMap.get(`s${candidateSeason}e${candidateEpisode}`);
    const candPercent = candHistory?.progressPercent || 0;

    if (candPercent >= 92) {
      const further = advance(candidateSeason, candidateEpisode);
      if (further) {
        candidateSeason = further.season;
        candidateEpisode = further.episode;
      } else {
        // Reached end of series
        break;
      }
    } else if (candHistory && (candHistory.timestamp > 15 || candHistory.progressPercent > 1)) {
      // Found an in-progress episode
      return {
        season: candidateSeason,
        episode: candidateEpisode,
        isResumable: true,
        isNextEpisode: true,
        timestamp: candHistory.timestamp,
        duration: candHistory.duration,
        progressPercent: candHistory.progressPercent,
      };
    } else {
      // Found an unwatched episode
      return {
        season: candidateSeason,
        episode: candidateEpisode,
        isResumable: false,
        isNextEpisode: true,
        timestamp: 0,
        duration: 0,
        progressPercent: 0,
      };
    }
  }

  return {
    season: candidateSeason,
    episode: candidateEpisode,
    isResumable: false,
    isNextEpisode: true,
    timestamp: 0,
    duration: 0,
    progressPercent: 0,
  };
}
