import { dbService } from './db';
import { tmdbApi } from './tmdb';
import type { TMDBMediaItem } from '../types/tmdb';

export interface SuggestionResult {
  items: TMDBMediaItem[];
  subtitle: string;
}

/**
 * Resolves personalized suggestions based on user My Space activity with strict priority:
 * 1. Likes (Favorites)
 * 2. Watchlist
 * 3. Watch History
 * 4. Fallback (Top Rated / Trending when My Space is empty)
 */
export async function getPersonalizedSuggestions(): Promise<SuggestionResult> {
  try {
    // 1. Priority 1: Likes
    const likes = await dbService.getLikes();
    if (likes && likes.length > 0) {
      const seedItems = likes.slice(0, 3);
      const recPromises = seedItems.map((seed) =>
        tmdbApi.getRecommendations(seed.mediaType, seed.tmdbId)
          .catch(() => tmdbApi.getSimilar(seed.mediaType, seed.tmdbId))
          .catch(() => ({ results: [] as TMDBMediaItem[] }))
      );
      const recResults = await Promise.all(recPromises);
      const combined = recResults.flatMap((r) => r.results || []);

      const likedIds = new Set(likes.map((l) => `${l.tmdbId}-${l.mediaType}`));
      const uniqueMap = new Map<number, TMDBMediaItem>();
      for (const item of combined) {
        const type = item.title ? 'movie' : 'tv';
        const key = `${item.id}-${type}`;
        if (!likedIds.has(key) && !uniqueMap.has(item.id)) {
          uniqueMap.set(item.id, item);
        }
      }
      const finalItems = Array.from(uniqueMap.values());
      if (finalItems.length >= 4) {
        return {
          items: finalItems,
          subtitle: 'Based on titles you liked and added to favorites'
        };
      }
    }

    // 2. Priority 2: Watchlist
    const watchlist = await dbService.getWatchlist();
    if (watchlist && watchlist.length > 0) {
      const seedItems = watchlist.slice(0, 3);
      const recPromises = seedItems.map((seed) =>
        tmdbApi.getRecommendations(seed.mediaType, seed.tmdbId)
          .catch(() => tmdbApi.getSimilar(seed.mediaType, seed.tmdbId))
          .catch(() => ({ results: [] as TMDBMediaItem[] }))
      );
      const recResults = await Promise.all(recPromises);
      const combined = recResults.flatMap((r) => r.results || []);

      const watchlistIds = new Set(watchlist.map((w) => `${w.tmdbId}-${w.mediaType}`));
      const uniqueMap = new Map<number, TMDBMediaItem>();
      for (const item of combined) {
        const type = item.title ? 'movie' : 'tv';
        const key = `${item.id}-${type}`;
        if (!watchlistIds.has(key) && !uniqueMap.has(item.id)) {
          uniqueMap.set(item.id, item);
        }
      }
      const finalItems = Array.from(uniqueMap.values());
      if (finalItems.length >= 4) {
        return {
          items: finalItems,
          subtitle: 'Based on titles saved to your watchlist'
        };
      }
    }

    // 3. Priority 3: Watch History
    const history = await dbService.getHistory(5);
    if (history && history.length > 0) {
      const seedItems = history.slice(0, 3);
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
          subtitle: 'Based on your recent viewing activity'
        };
      }
    }

    // 4. Fallback: Top Rated / Acclaimed titles
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
