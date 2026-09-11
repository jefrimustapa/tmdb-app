import type {
  TMDBMediaItem,
  TMDBMovieDetails,
  TMDBTVDetails,
  TMDBSeasonDetails,
  TMDBGenre,
  TMDBResponse
} from '../types/tmdb';

import { dbService } from './db';
import {
  ADULT_KEYWORDS_CSV,
  getExplicitAdultRating,
  isExplicitAdultCertification,
  checkMovieIsExplicitAdult,
  checkTVIsExplicitAdult,
  clearExplicitRatingCache,
  getResolvedMediaCertification,
  getCachedMediaCertification,
  containsExplicitAdultText,
  extractMovieCertification,
  extractTVCertification
} from './contentRatingFilter';

export {
  getExplicitAdultRating,
  isExplicitAdultCertification,
  checkMovieIsExplicitAdult,
  checkTVIsExplicitAdult,
  getCachedMediaCertification
};

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
export const TMDB_API_KEY = '1c7b97dd8b1108d34ffdd5280fa13ac6';
export const TMDB_READ_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIxYzdiOTdkZDhiMTEwOGQzNGZmZGQ1MjgwZmExM2FjNiIsIm5iZiI6MTQyNjE3ODM0Ny43MzgsInN1YiI6IjU1MDFjMTJiYzNhMzY4NWJhMjAwMzY3NiIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.tD9x-NtxAYt1gCWqvgrSlgNyi8rU4qZsX-onZEmLMa0';

const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';

export const TMDB_FALLBACK_POSTER = `${import.meta.env.BASE_URL}placeholder-poster.svg`;
export const TMDB_FALLBACK_BACKDROP = `${import.meta.env.BASE_URL}placeholder-backdrop.svg`;

export const tmdbImages = {
  poster: (path: string | null, size: 'w92' | 'w154' | 'w185' | 'w342' | 'w500' | 'w780' | 'original' = 'w500') =>
    path ? `${IMAGE_BASE_URL}/${size}${path}` : TMDB_FALLBACK_POSTER,
  backdrop: (path: string | null, size: 'w300' | 'w780' | 'w1280' | 'original' = 'w1280') =>
    path ? `${IMAGE_BASE_URL}/${size}${path}` : TMDB_FALLBACK_BACKDROP,
  profile: (path: string | null, size: 'w185' | 'h632' | 'original' = 'w185') =>
    path ? `${IMAGE_BASE_URL}/${size}${path}` : TMDB_FALLBACK_POSTER,
  still: (path: string | null, size: 'w300' | 'original' = 'w300') =>
    path ? `${IMAGE_BASE_URL}/${size}${path}` : TMDB_FALLBACK_BACKDROP,
  handleImgError: (e: React.SyntheticEvent<HTMLImageElement, Event>, isBackdrop = false) => {
    const target = e.currentTarget;
    const fallback = isBackdrop ? TMDB_FALLBACK_BACKDROP : TMDB_FALLBACK_POSTER;
    if (!target.src.endsWith(fallback)) {
      target.src = fallback;
    }
  }
};

const apiCache = new Map<string, { data: any; expiry: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes in-memory cache for instant 0ms back-navigation

// Clear cache on settings changes
if (typeof window !== 'undefined') {
  window.addEventListener('tmdb_settings_changed', () => {
    apiCache.clear();
    clearExplicitRatingCache();
  });
}

async function tmdbFetch<T>(endpoint: string, params: Record<string, string | number> = {}): Promise<T> {
  const settings = await dbService.getSettings();
  const filterAdult = settings.filterAdult !== false; // Default true
  const filterUnreleased = settings.filterUnreleased !== false; // Default true
  const maturityLevel = settings.maturityLevel || 'all';
  const todayStr = new Date().toISOString().split('T')[0];

  const url = new URL(`${TMDB_BASE_URL}${endpoint}`);
  url.searchParams.set('api_key', TMDB_API_KEY);
  url.searchParams.set('language', 'en-US');
  url.searchParams.set('include_adult', filterAdult ? 'false' : 'true');

  if (endpoint.includes('/discover/movie')) {
    if (filterUnreleased && !params['primary_release_date.lte']) {
      url.searchParams.set('primary_release_date.lte', todayStr);
    }
    if (maturityLevel === 'mature') {
      // 16+ / 17+: Up to R (excludes NC-17, explicit adult)
      url.searchParams.set('certification_country', 'US');
      url.searchParams.set('certification.lte', 'R');
    } else if (maturityLevel === 'teen' || maturityLevel === 'pg13') {
      // 13+: Up to PG-13 (excludes R, NC-17)
      url.searchParams.set('certification_country', 'US');
      url.searchParams.set('certification.lte', 'PG-13');
    } else if (maturityLevel === 'older_kids' || maturityLevel === 'family') {
      // 7+: Up to PG (excludes PG-13, R)
      url.searchParams.set('certification_country', 'US');
      url.searchParams.set('certification.lte', 'PG');
    } else if (maturityLevel === 'kids') {
      // 0+: Strictly G / All Ages
      url.searchParams.set('certification_country', 'US');
      url.searchParams.set('certification.lte', 'G');
    }
    if (filterAdult) {
      const existingWithout = url.searchParams.get('without_keywords');
      url.searchParams.set(
        'without_keywords',
        existingWithout ? `${existingWithout},${ADULT_KEYWORDS_CSV}` : ADULT_KEYWORDS_CSV
      );
    }
  } else if (endpoint.includes('/discover/tv')) {
    if (filterUnreleased && !params['first_air_date.lte']) {
      url.searchParams.set('first_air_date.lte', todayStr);
    }
    if (maturityLevel === 'mature') {
      // 16+: Up to TV-14 / mild TV-MA
      url.searchParams.set('certification_country', 'US');
      url.searchParams.set('certification.lte', 'TV-MA');
    } else if (maturityLevel === 'teen' || maturityLevel === 'pg13') {
      // 13+: Up to TV-14
      url.searchParams.set('certification_country', 'US');
      url.searchParams.set('certification.lte', 'TV-14');
    } else if (maturityLevel === 'older_kids' || maturityLevel === 'family') {
      // 7+: Up to TV-PG
      url.searchParams.set('certification_country', 'US');
      url.searchParams.set('certification.lte', 'TV-PG');
    } else if (maturityLevel === 'kids') {
      // 0+: Strictly TV-Y / TV-G
      url.searchParams.set('certification_country', 'US');
      url.searchParams.set('certification.lte', 'TV-G');
    }
    if (filterAdult) {
      const existingWithout = url.searchParams.get('without_keywords');
      url.searchParams.set(
        'without_keywords',
        existingWithout ? `${existingWithout},${ADULT_KEYWORDS_CSV}` : ADULT_KEYWORDS_CSV
      );
    }
  }

  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      const strVal = String(v);
      if (strVal.includes('&')) {
        // Handle compound query strings like "vote_average.desc&vote_count.gte=200"
        strVal.split('&').forEach((pair, index) => {
          if (index === 0 && !pair.includes('=')) {
            url.searchParams.set(k, pair);
          } else if (pair.includes('=')) {
            const [subKey, subVal] = pair.split('=');
            url.searchParams.set(subKey, subVal);
          }
        });
      } else {
        url.searchParams.set(k, strVal);
      }
    }
  });

  const cacheKey = url.toString();
  const cached = apiCache.get(cacheKey);
  if (cached && Date.now() < cached.expiry) {
    return cached.data as T;
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${TMDB_READ_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });

  if (!res.ok) {
    throw new Error(`TMDB Error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();

  // Helper to filter adult/NSFW items from any TMDB item array (e.g. data.results, data.similar.results, data.recommendations.results)
  const filterMediaItemList = async (items: any[], defaultMediaType?: 'movie' | 'tv'): Promise<any[]> => {
    if (!Array.isArray(items) || items.length === 0) return items;

    // Fast filter by item.adult flag
    let filtered = items.filter((item: any) => !item?.adult);

    const isPerfMode = settings.performanceMode === true;
    if (!isPerfMode) {
      // Strategy 5: Filter by title and overview heuristics (immediate synchronous check)
      filtered = filtered.filter((item: any) => {
        if (!item) return false;
        const textToCheck = `${item.title || item.name || ''} ${item.overview || ''}`;
        return !containsExplicitAdultText(textToCheck);
      });

      // Strategy 4 & genre rules: Deep filter by release dates / content ratings & descriptors across all countries
      const fetchReleaseDates = async (id: number) => {
        const relUrl = `${TMDB_BASE_URL}/movie/${id}/release_dates?api_key=${TMDB_API_KEY}`;
        const relRes = await fetch(relUrl, {
          headers: { Authorization: `Bearer ${TMDB_READ_TOKEN}` }
        });
        return relRes.ok ? relRes.json() : null;
      };

      const fetchContentRatings = async (id: number) => {
        const crUrl = `${TMDB_BASE_URL}/tv/${id}/content_ratings?api_key=${TMDB_API_KEY}`;
        const crRes = await fetch(crUrl, {
          headers: { Authorization: `Bearer ${TMDB_READ_TOKEN}` }
        });
        return crRes.ok ? crRes.json() : null;
      };

      const isMovieEndpoint = endpoint.includes('/movie') || endpoint.includes('mediaType=movie');
      const isTvEndpoint = endpoint.includes('/tv') || endpoint.includes('mediaType=tv');
      const fallbackType = defaultMediaType || (isTvEndpoint ? 'tv' : isMovieEndpoint ? 'movie' : undefined);

      // Concurrency-limited batching (batches of 5) to prevent network congestion
      const BATCH_SIZE = 5;
      const deepFiltered: any[] = [];

      for (let i = 0; i < filtered.length; i += BATCH_SIZE) {
        const batch = filtered.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(async (item: any) => {
            if (!item || !item.id) return item;
            const itemType = item.media_type || (item.title ? 'movie' : (item.name ? 'tv' : fallbackType || 'movie'));
            const genreIds = Array.isArray(item.genre_ids) ? item.genre_ids : (Array.isArray(item.genres) ? item.genres.map((g: any) => g.id) : undefined);

            if (itemType === 'movie') {
              const isAdult = await checkMovieIsExplicitAdult(item.id, fetchReleaseDates, genreIds);
              return isAdult ? null : item;
            } else if (itemType === 'tv') {
              const isAdult = await checkTVIsExplicitAdult(item.id, fetchContentRatings, genreIds);
              return isAdult ? null : item;
            }
            return item;
          })
        );
        deepFiltered.push(...batchResults);
      }

      filtered = deepFiltered.filter(Boolean);
    }

    return filtered;
  };

  // Helper for fast synchronous adult filtering (item.adult + Strategy 5 text check)
  const fastFilterMediaItemList = (items: any[]): any[] => {
    if (!Array.isArray(items) || items.length === 0) return items;
    let filtered = items.filter((item: any) => !item?.adult);
    if (settings.performanceMode !== true) {
      filtered = filtered.filter((item: any) => {
        if (!item) return false;
        const textToCheck = `${item.title || item.name || ''} ${item.overview || ''}`;
        return !containsExplicitAdultText(textToCheck);
      });
    }
    return filtered;
  };

  // Filter adult items and explicit sexual/adult ratings if filterAdult is active
  if (filterAdult && data) {
    if (Array.isArray(data.results) && data.results.length > 0) {
      data.results = await filterMediaItemList(data.results);
    }
    // Fast-filter nested similar / recommendations from append_to_response on details endpoints
    // so details pages load instantaneously without blocking on 40 sub-requests
    if (data.similar && Array.isArray(data.similar.results) && data.similar.results.length > 0) {
      data.similar.results = fastFilterMediaItemList(data.similar.results);
    }
    if (data.recommendations && Array.isArray(data.recommendations.results) && data.recommendations.results.length > 0) {
      data.recommendations.results = fastFilterMediaItemList(data.recommendations.results);
    }
  }

  // Filter unreleased/future items if filterUnreleased is active (except explicit upcoming endpoints)
  if (filterUnreleased && !endpoint.includes('/upcoming') && data) {
    if (Array.isArray(data.results)) {
      data.results = data.results.filter((item: any) => {
        if (item.release_date && item.release_date > todayStr) return false;
        if (item.first_air_date && item.first_air_date > todayStr) return false;
        if (item.status === 'Planned' || item.status === 'In Production' || item.status === 'Post Production') return false;
        return true;
      });
    }
    if (data.similar && Array.isArray(data.similar.results)) {
      data.similar.results = data.similar.results.filter((item: any) => {
        if (item.release_date && item.release_date > todayStr) return false;
        if (item.first_air_date && item.first_air_date > todayStr) return false;
        return true;
      });
    }
    if (data.recommendations && Array.isArray(data.recommendations.results)) {
      data.recommendations.results = data.recommendations.results.filter((item: any) => {
        if (item.release_date && item.release_date > todayStr) return false;
        if (item.first_air_date && item.first_air_date > todayStr) return false;
        return true;
      });
    }
  }

  apiCache.set(cacheKey, { data, expiry: Date.now() + CACHE_TTL_MS });

  return data as T;
}

export const ANIME_GENRE_ID = 210024;

export interface UnifiedGenre {
  id: number;
  name: string;
  movieGenreId: number;
  tvGenreId: number;
  isCustom?: boolean;
}

export const UNIFIED_GENRES: UnifiedGenre[] = [
  { id: 28, name: 'Action', movieGenreId: 28, tvGenreId: 10759 },
  { id: 12, name: 'Adventure', movieGenreId: 12, tvGenreId: 10759 },
  { id: 16, name: 'Animation', movieGenreId: 16, tvGenreId: 16 },
  { id: ANIME_GENRE_ID, name: 'Anime', movieGenreId: ANIME_GENRE_ID, tvGenreId: ANIME_GENRE_ID, isCustom: true },
  { id: 35, name: 'Comedy', movieGenreId: 35, tvGenreId: 35 },
  { id: 80, name: 'Crime', movieGenreId: 80, tvGenreId: 80 },
  { id: 99, name: 'Documentary', movieGenreId: 99, tvGenreId: 99 },
  { id: 18, name: 'Drama', movieGenreId: 18, tvGenreId: 18 },
  { id: 10751, name: 'Family', movieGenreId: 10751, tvGenreId: 10751 },
  { id: 14, name: 'Fantasy', movieGenreId: 14, tvGenreId: 10765 },
  { id: 36, name: 'History', movieGenreId: 36, tvGenreId: 36 },
  { id: 27, name: 'Horror', movieGenreId: 27, tvGenreId: 27, isCustom: true },
  { id: 10762, name: 'Kids', movieGenreId: 10751, tvGenreId: 10762 },
  { id: 10402, name: 'Music', movieGenreId: 10402, tvGenreId: 10402 },
  { id: 9648, name: 'Mystery', movieGenreId: 9648, tvGenreId: 9648 },
  { id: 10764, name: 'Reality', movieGenreId: 10770, tvGenreId: 10764 },
  { id: 10749, name: 'Romance', movieGenreId: 10749, tvGenreId: 10749, isCustom: true },
  { id: 878, name: 'Sci-Fi', movieGenreId: 878, tvGenreId: 10765 },
  { id: 53, name: 'Thriller', movieGenreId: 53, tvGenreId: 9648 },
  { id: 10752, name: 'War', movieGenreId: 10752, tvGenreId: 10768 },
  { id: 37, name: 'Western', movieGenreId: 37, tvGenreId: 37 },
];

export interface CountryOption {
  code: string;
  name: string;
  flag: string;
}

export const COUNTRY_OPTIONS: CountryOption[] = [
  { code: '', name: 'All Countries', flag: '🌍' },
  { code: 'US', name: 'United States', flag: '🇺🇸' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' },
  { code: 'MY', name: 'Malaysia', flag: '🇲🇾' },
  { code: 'KR', name: 'South Korea', flag: '🇰🇷' },
  { code: 'JP', name: 'Japan', flag: '🇯🇵' },
  { code: 'IN', name: 'India', flag: '🇮🇳' },
  { code: 'FR', name: 'France', flag: '🇫🇷' },
  { code: 'DE', name: 'Germany', flag: '🇩🇪' },
  { code: 'ES', name: 'Spain', flag: '🇪🇸' },
  { code: 'CN', name: 'China', flag: '🇨🇳' },
  { code: 'HK', name: 'Hong Kong', flag: '🇭🇰' },
  { code: 'ID', name: 'Indonesia', flag: '🇮🇩' },
  { code: 'TH', name: 'Thailand', flag: '🇹🇭' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦' },
  { code: 'AU', name: 'Australia', flag: '🇦🇺' },
  { code: 'IT', name: 'Italy', flag: '🇮🇹' },
];

export const COUNTRY_TO_LANGUAGES: Record<string, string[]> = {
  US: ['en'],
  GB: ['en'],
  MY: ['ms', 'en', 'zh', 'ta'],
  KR: ['ko'],
  JP: ['ja'],
  IN: ['hi', 'ta', 'te', 'ml', 'kn', 'bn', 'mr', 'pa'],
  FR: ['fr'],
  DE: ['de'],
  ES: ['es'],
  CN: ['zh'],
  HK: ['zh', 'yue', 'cn'],
  ID: ['id'],
  TH: ['th'],
  CA: ['en', 'fr'],
  AU: ['en'],
  IT: ['it'],
};

export const tmdbApi = {
  // Trending
  getTrending: (mediaType: 'all' | 'movie' | 'tv' = 'all', timeWindow: 'day' | 'week' = 'week') =>
    tmdbFetch<TMDBResponse<TMDBMediaItem>>(`/trending/${mediaType}/${timeWindow}`),

  // Movies
  getPopularMovies: (page = 1) =>
    tmdbFetch<TMDBResponse<TMDBMediaItem>>('/movie/popular', { page }),
  getTopRatedMovies: (page = 1) =>
    tmdbFetch<TMDBResponse<TMDBMediaItem>>('/movie/top_rated', { page }),
  getUpcomingMovies: (page = 1) =>
    tmdbFetch<TMDBResponse<TMDBMediaItem>>('/movie/upcoming', { page }),
  getNowPlayingMovies: async (page = 1) => {
    const res = await tmdbFetch<TMDBResponse<TMDBMediaItem>>('/movie/now_playing', { page });
    if (res && Array.isArray(res.results)) {
      // Exclude theatrical re-releases whose primary release date was older than 6 months ago
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - 6);
      const cutoffStr = cutoff.toISOString().split('T')[0];
      const todayStr = new Date().toISOString().split('T')[0];

      res.results = res.results
        .filter((item) => {
          if (!item.release_date) return false;
          return item.release_date >= cutoffStr && item.release_date <= todayStr;
        })
        .sort((a, b) => (b.release_date || '').localeCompare(a.release_date || ''));
    }
    return res;
  },
  getMovieDetails: (id: number) =>
    tmdbFetch<TMDBMovieDetails>(`/movie/${id}`, { append_to_response: 'credits,videos,similar,recommendations,release_dates' }),

  // TV Shows
  getPopularTV: (page = 1) =>
    tmdbFetch<TMDBResponse<TMDBMediaItem>>('/tv/popular', { page }),
  getTopRatedTV: (page = 1) =>
    tmdbFetch<TMDBResponse<TMDBMediaItem>>('/tv/top_rated', { page }),
  getOnTheAirTV: (page = 1) =>
    tmdbFetch<TMDBResponse<TMDBMediaItem>>('/tv/on_the_air', { page }),
  getTVDetails: (id: number) =>
    tmdbFetch<TMDBTVDetails>(`/tv/${id}`, { append_to_response: 'credits,videos,similar,recommendations,content_ratings' }),
  getSeasonDetails: (tvId: number, seasonNumber: number) =>
    tmdbFetch<TMDBSeasonDetails>(`/tv/${tvId}/season/${seasonNumber}`),

  // Recommendations & Similar
  getRecommendations: (type: 'movie' | 'tv', id: number, page = 1) =>
    tmdbFetch<TMDBResponse<TMDBMediaItem>>(`/${type}/${id}/recommendations`, { page }),
  getSimilar: (type: 'movie' | 'tv', id: number, page = 1) =>
    tmdbFetch<TMDBResponse<TMDBMediaItem>>(`/${type}/${id}/similar`, { page }),

  /**
   * Asynchronously deep-filters recommendation/similar items in the background
   * without blocking details page load time.
   */
  filterRecommendationsAsync: async (
    items: TMDBMediaItem[],
    defaultMediaType: 'movie' | 'tv' = 'movie'
  ): Promise<TMDBMediaItem[]> => {
    if (!Array.isArray(items) || items.length === 0) return items;
    const settings = await dbService.getSettings();
    if (settings.filterAdult === false || settings.performanceMode === true) {
      return items;
    }

    const fetchReleaseDates = async (id: number) => {
      const relUrl = `${TMDB_BASE_URL}/movie/${id}/release_dates?api_key=${TMDB_API_KEY}`;
      const relRes = await fetch(relUrl, {
        headers: { Authorization: `Bearer ${TMDB_READ_TOKEN}` }
      });
      return relRes.ok ? relRes.json() : null;
    };

    const fetchContentRatings = async (id: number) => {
      const crUrl = `${TMDB_BASE_URL}/tv/${id}/content_ratings?api_key=${TMDB_API_KEY}`;
      const crRes = await fetch(crUrl, {
        headers: { Authorization: `Bearer ${TMDB_READ_TOKEN}` }
      });
      return crRes.ok ? crRes.json() : null;
    };

    // Filter up to top 20 recommendations in batches of 5 to avoid network congestion
    const slice = items.slice(0, 20);
    const rest = items.slice(20);
    const BATCH_SIZE = 5;
    const checkedSlice: any[] = [];

    for (let i = 0; i < slice.length; i += BATCH_SIZE) {
      const batch = slice.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (item: any) => {
          if (!item || !item.id) return item;
          const itemType = item.media_type || (item.title ? 'movie' : (item.name ? 'tv' : defaultMediaType));
          const genreIds = Array.isArray(item.genre_ids) ? item.genre_ids : (Array.isArray(item.genres) ? item.genres.map((g: any) => g.id) : undefined);

          if (itemType === 'movie') {
            const isAdult = await checkMovieIsExplicitAdult(item.id, fetchReleaseDates, genreIds);
            return isAdult ? null : item;
          } else if (itemType === 'tv') {
            const isAdult = await checkTVIsExplicitAdult(item.id, fetchContentRatings, genreIds);
            return isAdult ? null : item;
          }
          return item;
        })
      );
      checkedSlice.push(...batchResults);
    }

    return [...checkedSlice.filter(Boolean) as TMDBMediaItem[], ...rest];
  },

  // Cached Content Rating Certification
  getCertification: (id: number, type: 'movie' | 'tv'): Promise<string | null> => {
    return getResolvedMediaCertification(id, type, async (mediaId, mediaType) => {
      const endpoint = mediaType === 'movie' ? `/movie/${mediaId}/release_dates` : `/tv/${mediaId}/content_ratings`;
      return tmdbFetch<any>(endpoint);
    });
  },

  // Discovery & Filtering
  discoverMovies: (params: {
    with_genres?: string;
    with_watch_providers?: string;
    watch_region?: string;
    with_origin_country?: string;
    certification_country?: string;
    certification?: string;
    'certification.lte'?: string;
    sort_by?: string;
    primary_release_year?: number;
    page?: number;
    with_keywords?: string;
    [key: string]: any;
  } = {}) => {
    const queryParams: Record<string, any> = { ...params };

    // Translate any selected TV/unified genres to movie genres
    if (queryParams.with_genres) {
      const inputIds = queryParams.with_genres.split(',').map((s: string) => s.trim()).filter(Boolean);
      const mappedMovieIds = new Set<string>();
      let isAnime = false;

      for (const idStr of inputIds) {
        const idNum = Number(idStr);
        if (idNum === ANIME_GENRE_ID) {
          isAnime = true;
          continue;
        }
        const unified = UNIFIED_GENRES.find((g) => g.id === idNum || g.tvGenreId === idNum || g.movieGenreId === idNum);
        if (unified) {
          mappedMovieIds.add(String(unified.movieGenreId));
        } else if (!isNaN(idNum)) {
          mappedMovieIds.add(String(idNum));
        }
      }

      if (isAnime) {
        mappedMovieIds.add('16');
        queryParams.with_original_language = 'ja';
      }

      queryParams.with_genres = mappedMovieIds.size > 0 ? Array.from(mappedMovieIds).join(',') : undefined;
    }

    return tmdbFetch<TMDBResponse<TMDBMediaItem>>('/discover/movie', queryParams);
  },
  discoverTV: (params: {
    with_genres?: string;
    with_watch_providers?: string;
    watch_region?: string;
    with_origin_country?: string;
    with_networks?: string;
    certification_country?: string;
    certification?: string;
    'certification.lte'?: string;
    sort_by?: string;
    first_air_date_year?: number;
    page?: number;
    with_keywords?: string;
    [key: string]: any;
  } = {}) => {
    const queryParams: Record<string, any> = { ...params };

    // Translate any selected Movie/unified genres to TV genres
    if (queryParams.with_genres) {
      const inputIds = queryParams.with_genres.split(',').map((s: string) => s.trim()).filter(Boolean);
      const mappedTvIds = new Set<string>();
      let hasHorror = false;
      let hasRomance = false;
      let isAnime = false;

      for (const idStr of inputIds) {
        const idNum = Number(idStr);
        if (idNum === ANIME_GENRE_ID) {
          isAnime = true;
          continue;
        }
        if (idNum === 27) {
          hasHorror = true;
          continue;
        }
        if (idNum === 10749) {
          hasRomance = true;
          continue;
        }
        const unified = UNIFIED_GENRES.find((g) => g.id === idNum || g.movieGenreId === idNum || g.tvGenreId === idNum);
        if (unified) {
          if (unified.id === 10749) {
            hasRomance = true;
          } else {
            mappedTvIds.add(String(unified.tvGenreId));
          }
        } else if (!isNaN(idNum)) {
          mappedTvIds.add(String(idNum));
        }
      }

      const extraKeywords: string[] = [];
      if (hasHorror) {
        extraKeywords.push('315058|256183|295907|250593|12339');
      }
      if (hasRomance) {
        extraKeywords.push('9840|9799|282984');
      }

      if (extraKeywords.length > 0) {
        const joinedExtra = extraKeywords.join(',');
        queryParams.with_keywords = queryParams.with_keywords
          ? `${queryParams.with_keywords},${joinedExtra}`
          : joinedExtra;
      }

      if (isAnime) {
        mappedTvIds.add('16');
        queryParams.with_original_language = 'ja';
      }

      queryParams.with_genres = mappedTvIds.size > 0 ? Array.from(mappedTvIds).join(',') : undefined;
    }

    return tmdbFetch<TMDBResponse<TMDBMediaItem>>('/discover/tv', queryParams);
  },

  // Person / Cast Credits
  getPersonCredits: (personId: number) =>
    tmdbFetch<{ id: number; cast: TMDBMediaItem[]; crew: TMDBMediaItem[] }>(`/person/${personId}/combined_credits`),
  getPersonDetails: (personId: number) =>
    tmdbFetch<{ id: number; name: string; profile_path: string | null; biography: string; known_for_department: string }>(`/person/${personId}`),

  // Search
  searchMulti: (query: string, page = 1) =>
    tmdbFetch<TMDBResponse<TMDBMediaItem>>('/search/multi', { query, page }),
  searchMovies: (query: string, page = 1) =>
    tmdbFetch<TMDBResponse<TMDBMediaItem>>('/search/movie', { query, page }),
  searchTV: (query: string, page = 1) =>
    tmdbFetch<TMDBResponse<TMDBMediaItem>>('/search/tv', { query, page }),
  searchKeywords: (query: string, page = 1) =>
    tmdbFetch<TMDBResponse<{ id: number; name: string }>>('/search/keyword', { query, page }),
  searchPerson: (query: string, page = 1) =>
    tmdbFetch<TMDBResponse<{ id: number; name: string; profile_path: string | null; known_for_department?: string; known_for?: TMDBMediaItem[] }>>('/search/person', { query, page }),

  // Genres
  getMovieGenres: async () => {
    const res = await tmdbFetch<{ genres: TMDBGenre[] }>('/genre/movie/list');
    const genres = res.genres ? [...res.genres] : [];
    // Inject 'Anime' (ID 210024)
    if (!genres.some((g) => g.id === ANIME_GENRE_ID || g.name.toLowerCase() === 'anime')) {
      genres.push({ id: ANIME_GENRE_ID, name: 'Anime' });
      genres.sort((a, b) => a.name.localeCompare(b.name));
    }
    return { genres };
  },
  getTVGenres: async () => {
    const res = await tmdbFetch<{ genres: TMDBGenre[] }>('/genre/tv/list');
    const genres = res.genres ? [...res.genres] : [];
    // Inject 'Horror' (ID 27 matching movies) into TV series genre list
    if (!genres.some((g) => g.id === 27 || g.name.toLowerCase() === 'horror')) {
      genres.push({ id: 27, name: 'Horror' });
    }
    // Inject 'Anime' (ID 210024)
    if (!genres.some((g) => g.id === ANIME_GENRE_ID || g.name.toLowerCase() === 'anime')) {
      genres.push({ id: ANIME_GENRE_ID, name: 'Anime' });
    }
    genres.sort((a, b) => a.name.localeCompare(b.name));
    return { genres };
  },
};

/** Static TMDB genre lookup map for instant 0ms genre name resolution from genre_ids */
export const TMDB_GENRE_MAP: Record<number, string> = {
  28: 'Action',
  12: 'Adventure',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Drama',
  10751: 'Family',
  14: 'Fantasy',
  36: 'History',
  27: 'Horror',
  10402: 'Music',
  9648: 'Mystery',
  10749: 'Romance',
  878: 'Sci-Fi',
  10770: 'TV Movie',
  53: 'Thriller',
  10752: 'War',
  37: 'Western',
  // TV specific
  10759: 'Action & Adventure',
  10762: 'Kids',
  10763: 'News',
  10764: 'Reality',
  10765: 'Sci-Fi & Fantasy',
  10766: 'Soap',
  10767: 'Talk',
  10768: 'War & Politics',
  // Custom
  210024: 'Anime'
};

export function resolveGenresFromIds(genreIds?: number[]): { id: number; name: string }[] {
  if (!genreIds || !Array.isArray(genreIds)) return [];
  return genreIds
    .map((id) => ({ id, name: TMDB_GENRE_MAP[id] || '' }))
    .filter((g) => g.name.length > 0);
}

/** Helper to extract content rating (PG-13, R, TV-MA, 18SX, 19, R18+, etc.) */
export function extractContentRating(details: TMDBMovieDetails | TMDBTVDetails | null): string | null {
  if (!details) return null;

  // Check for explicit sexual/adult certification across all countries first
  const explicitRating = getExplicitAdultRating(details);
  if (explicitRating) return explicitRating;

  // If Movie
  if ('release_dates' in details && details.release_dates) {
    return extractMovieCertification(details.release_dates);
  }

  // If TV
  if ('content_ratings' in details && details.content_ratings) {
    return extractTVCertification(details.content_ratings);
  }

  return null;
}
