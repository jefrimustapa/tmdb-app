import type {
  TMDBMediaItem,
  TMDBMovieDetails,
  TMDBTVDetails,
  TMDBSeasonDetails,
  TMDBGenre,
  TMDBResponse
} from '../types/tmdb';

import { dbService } from './db';

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
  window.addEventListener('tmdb_settings_changed', () => apiCache.clear());
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
    if (maturityLevel === 'pg13') {
      url.searchParams.set('certification_country', 'US');
      url.searchParams.set('certification.lte', 'PG-13');
    } else if (maturityLevel === 'family') {
      url.searchParams.set('certification_country', 'US');
      url.searchParams.set('certification.lte', 'PG');
    }
  } else if (endpoint.includes('/discover/tv')) {
    if (filterUnreleased && !params['first_air_date.lte']) {
      url.searchParams.set('first_air_date.lte', todayStr);
    }
    if (maturityLevel === 'pg13') {
      url.searchParams.set('certification_country', 'US');
      url.searchParams.set('certification.lte', 'TV-14');
    } else if (maturityLevel === 'family') {
      url.searchParams.set('certification_country', 'US');
      url.searchParams.set('certification.lte', 'TV-PG');
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

  // Filter adult items if filterAdult is active
  if (filterAdult && data && Array.isArray(data.results)) {
    data.results = data.results.filter((item: any) => !item.adult);
  }

  // Filter unreleased/future items if filterUnreleased is active (except explicit upcoming endpoints)
  if (filterUnreleased && !endpoint.includes('/upcoming') && data && Array.isArray(data.results)) {
    data.results = data.results.filter((item: any) => {
      if (item.release_date && item.release_date > todayStr) return false;
      if (item.first_air_date && item.first_air_date > todayStr) return false;
      if (item.status === 'Planned' || item.status === 'In Production' || item.status === 'Post Production') return false;
      return true;
    });
  }

  apiCache.set(cacheKey, { data, expiry: Date.now() + CACHE_TTL_MS });

  return data as T;
}

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
  getNowPlayingMovies: (page = 1) =>
    tmdbFetch<TMDBResponse<TMDBMediaItem>>('/movie/now_playing', { page }),
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

  // Discovery & Filtering
  discoverMovies: (params: {
    with_genres?: string;
    with_watch_providers?: string;
    watch_region?: string;
    with_networks?: string;
    certification_country?: string;
    certification?: string;
    'certification.lte'?: string;
    sort_by?: string;
    primary_release_year?: number;
    page?: number;
    [key: string]: any;
  } = {}) =>
    tmdbFetch<TMDBResponse<TMDBMediaItem>>('/discover/movie', params),
  discoverTV: (params: {
    with_genres?: string;
    with_watch_providers?: string;
    watch_region?: string;
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
    // TMDB has no official Horror genre for TV (ID 27). If '27' is selected, map to TMDB horror keywords.
    if (queryParams.with_genres && queryParams.with_genres.split(',').includes('27')) {
      const genreList = queryParams.with_genres
        .split(',')
        .map((s: string) => s.trim())
        .filter((id: string) => id !== '27');
      queryParams.with_genres = genreList.length > 0 ? genreList.join(',') : undefined;

      const horrorKeywords = '315058|256183|295907|250593|12339';
      if (queryParams.with_keywords) {
        queryParams.with_keywords = `${queryParams.with_keywords}|${horrorKeywords}`;
      } else {
        queryParams.with_keywords = horrorKeywords;
      }
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

  // Genres
  getMovieGenres: () =>
    tmdbFetch<{ genres: TMDBGenre[] }>('/genre/movie/list'),
  getTVGenres: async () => {
    const res = await tmdbFetch<{ genres: TMDBGenre[] }>('/genre/tv/list');
    const genres = res.genres ? [...res.genres] : [];
    // Inject 'Horror' (ID 27 matching movies) into TV series genre list
    if (!genres.some((g) => g.id === 27 || g.name.toLowerCase() === 'horror')) {
      genres.push({ id: 27, name: 'Horror' });
      genres.sort((a, b) => a.name.localeCompare(b.name));
    }
    return { genres };
  },
};

/** Helper to extract content rating (PG-13, R, TV-MA, etc.) */
export function extractContentRating(details: TMDBMovieDetails | TMDBTVDetails | null): string | null {
  if (!details) return null;

  // If Movie
  if ('release_dates' in details && details.release_dates?.results) {
    const usResult = details.release_dates.results.find((r) => r.iso_3166_1 === 'US');
    if (usResult) {
      const match = usResult.release_dates.find((d) => d.certification && d.certification.trim().length > 0);
      if (match) return match.certification;
    }
    // Fallback to any country certification
    for (const country of details.release_dates.results) {
      const match = country.release_dates.find((d) => d.certification && d.certification.trim().length > 0);
      if (match) return match.certification;
    }
  }

  // If TV
  if ('content_ratings' in details && details.content_ratings?.results) {
    const usResult = details.content_ratings.results.find((r) => r.iso_3166_1 === 'US');
    if (usResult && usResult.rating) return usResult.rating;
    const anyResult = details.content_ratings.results.find((r) => r.rating && r.rating.trim().length > 0);
    if (anyResult) return anyResult.rating;
  }

  return null;
}
