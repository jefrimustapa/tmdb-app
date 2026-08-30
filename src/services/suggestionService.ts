import { dbService } from './db';
import { tmdbApi } from './tmdb';
import type { TMDBMediaItem } from '../types/tmdb';

export interface SuggestionResult {
  items: TMDBMediaItem[];
  subtitle: string;
}

/**
 * Resolves personalized suggestions based on user watch history alone:
 * 1. Watch History (Recent watched titles -> TMDB recommendations/similar)
 * 2. Fallback (Top Rated / Trending when Watch History is empty)
 */
export async function getPersonalizedSuggestions(): Promise<SuggestionResult> {
  try {
    // 1. Watch History
    const history = await dbService.getHistory(10);
    if (history && history.length > 0) {
      const seedItems = history.slice(0, 5);
      const recPromises = seedItems.map((seed) =>
        tmdbApi.getRecommendations(seed.mediaType, seed.tmdbId)
          .catch(() => tmdbApi.getSimilar(seed.mediaType, seed.tmdbId))
          .catch(() => ({ results: [] as TMDBMediaItem[] }))
      );
      const recResults = await Promise.all(recPromises);
      const combined = recResults.flatMap((r) => r.results || []);

      const historyIds = new Set(history.map((h) => `${h.tmdbId}-${h.mediaType}`));
      const uniqueMap = new Map<number, TMDBMediaItem>();
      for (const item of combined) {
        const type = item.title ? 'movie' : 'tv';
        const key = `${item.id}-${type}`;
        if (!historyIds.has(key) && !uniqueMap.has(item.id)) {
          uniqueMap.set(item.id, item);
        }
      }
      const finalItems = Array.from(uniqueMap.values());
      if (finalItems.length >= 4) {
        return {
          items: finalItems,
          subtitle: 'Based on your watch history'
        };
      }
    }

    // 2. Fallback: Top Rated / Acclaimed titles when watch history is empty
    const fallbackRes = await tmdbApi.getTopRatedMovies(1);
    return {
      items: fallbackRes.results || [],
      subtitle: 'Top picks and acclaimed masterworks tailored for you'
    };
  } catch (err) {
    console.error('Failed to get personalized suggestions:', err);
    const fallback = await tmdbApi.getTopRatedMovies(1).catch(() => ({ results: [] as TMDBMediaItem[] }));
    return {
      items: fallback.results || [],
      subtitle: 'Top picks and acclaimed masterworks tailored for you'
    };
  }
}
