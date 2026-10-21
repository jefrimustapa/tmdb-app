import type { TMDBMovieDetails, TMDBTVDetails, TMDBSeasonDetails } from '../types/tmdb';

/**
 * Extracts the release year or season air year for the watch page header.
 * - For series: uses the currently selected season's air date year,
 *   falling back to the show's first air date year.
 * - For movies: uses the movie's release date year.
 */
export function getWatchHeaderYear(params: {
  mediaType: 'movie' | 'tv';
  details: TMDBMovieDetails | TMDBTVDetails | null | undefined;
  seasonParam?: number;
  seasonDetails?: TMDBSeasonDetails | null;
}): string | null {
  const { mediaType, details, seasonParam, seasonDetails } = params;
  if (!details) return null;

  if (mediaType === 'tv') {
    // 1. Check if seasonDetails has air_date
    if (seasonDetails?.air_date) {
      const year = seasonDetails.air_date.split('-')[0]?.trim();
      if (year && !isNaN(Number(year))) return year;
    }

    // 2. Check if details.seasons summary has air_date for seasonParam
    const tvDetails = details as TMDBTVDetails;
    if (tvDetails.seasons && Array.isArray(tvDetails.seasons)) {
      const seasonSummary = tvDetails.seasons.find((s) => s.season_number === seasonParam);
      if (seasonSummary?.air_date) {
        const year = seasonSummary.air_date.split('-')[0]?.trim();
        if (year && !isNaN(Number(year))) return year;
      }
    }

    // 3. Fallback to first_air_date
    if (details.first_air_date) {
      const year = details.first_air_date.split('-')[0]?.trim();
      if (year && !isNaN(Number(year))) return year;
    }

    return null;
  }

  // Movie
  const movieDetails = details as TMDBMovieDetails;
  if (movieDetails.release_date) {
    const year = movieDetails.release_date.split('-')[0]?.trim();
    if (year && !isNaN(Number(year))) return year;
  }

  return null;
}
