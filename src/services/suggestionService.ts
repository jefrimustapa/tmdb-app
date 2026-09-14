import { dbService } from './db';
import { tmdbApi } from './tmdb';
import type { TMDBMediaItem } from '../types/tmdb';

export interface SuggestionResult {
  items: TMDBMediaItem[];
  subtitle: string;
}

const SUGGESTIONS_CACHE_KEY = 'tmdb_suggestions_cache';
let memSuggestionsCache: { result: SuggestionResult; timestamp: number } | null = null;

/**
 * Resolves personalized suggestions based on user watch history alone:
 * 1. Watch History (Recent watched titles -> TMDB recommendations/similar)
 * 2. Fallback (Top Rated / Trending when Watch History is empty)
 */
export async function getPersonalizedSuggestions(forceRefresh = false): Promise<SuggestionResult> {
  const now = Date.now();
  // 15-minute cache for personalized suggestions
  if (!forceRefresh) {
    if (memSuggestionsCache && now - memSuggestionsCache.timestamp < 15 * 60 * 1000) {
      return memSuggestionsCache.result;
    }
    try {
      const stored = localStorage.getItem(SUGGESTIONS_CACHE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0 && (now - parsed.timestamp < 15 * 60 * 1000)) {
          memSuggestionsCache = { result: { items: parsed.items, subtitle: parsed.subtitle }, timestamp: parsed.timestamp };
          return memSuggestionsCache.result;
        }
      }
    } catch {}
  }

  try {
    // 1. Watch History (Sample top 2 most recent seed items for fast network response)
    const history = await dbService.getHistory(6);
    if (history && history.length > 0) {
      const seedItems = history.slice(0, 2);
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
        const res: SuggestionResult = {
          items: finalItems,
          subtitle: 'Based on your watch history'
        };
        memSuggestionsCache = { result: res, timestamp: now };
        try {
          localStorage.setItem(SUGGESTIONS_CACHE_KEY, JSON.stringify({ ...res, timestamp: now }));
        } catch {}
        return res;
      }
    }

    // 2. Fallback: Top Rated / Acclaimed titles when watch history is empty
    const fallbackRes = await tmdbApi.getTopRatedMovies(1);
    const res: SuggestionResult = {
      items: fallbackRes.results || [],
      subtitle: 'Top picks and acclaimed masterworks tailored for you'
    };
    memSuggestionsCache = { result: res, timestamp: now };
    try {
      localStorage.setItem(SUGGESTIONS_CACHE_KEY, JSON.stringify({ ...res, timestamp: now }));
    } catch {}
    return res;
  } catch (err) {
    console.error('Failed to get personalized suggestions:', err);
    const fallback = await tmdbApi.getTopRatedMovies(1).catch(() => ({ results: [] as TMDBMediaItem[] }));
    return {
      items: fallback.results || [],
      subtitle: 'Top picks and acclaimed masterworks tailored for you'
    };
  }
}

