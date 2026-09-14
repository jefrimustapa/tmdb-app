import React, { useState, useEffect } from 'react';
import { tmdbApi } from '../../services/tmdb';
import type { TMDBMediaItem } from '../../types/tmdb';
import type { WatchHistoryItem } from '../../types/db';
import { dbService } from '../../services/db';
import { getPersonalizedSuggestions, type SuggestionResult } from '../../services/suggestionService';
import { HeroBanner } from '../../components/common/HeroBanner';
import { MediaRow } from '../../components/common/MediaRow';
import { MediaCard } from '../../components/common/MediaCard';

interface HomeFeedCache {
  trending: TMDBMediaItem[];
  popularMovies: TMDBMediaItem[];
  popularTV: TMDBMediaItem[];
  suggestions: TMDBMediaItem[];
  suggestionSubtitle: string;
  newReleaseMovies: TMDBMediaItem[];
  newReleaseTV: TMDBMediaItem[];
  history: WatchHistoryItem[];
  timestamp: number;
}

const HOME_CACHE_KEY = 'tmdb_home_feed_cache';

const loadSavedCache = (): HomeFeedCache | null => {
  try {
    const raw = localStorage.getItem(HOME_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Cache valid for 30 minutes on cold starts
      if (parsed && Array.isArray(parsed.trending) && parsed.trending.length > 0) {
        return parsed;
      }
    }
  } catch {}
  return null;
};

let homeFeedCache: HomeFeedCache | null = loadSavedCache();

export const Home: React.FC = () => {
  const [trending, setTrending] = useState<TMDBMediaItem[]>(() => homeFeedCache?.trending || []);
  const [popularMovies, setPopularMovies] = useState<TMDBMediaItem[]>(() => homeFeedCache?.popularMovies || []);
  const [popularTV, setPopularTV] = useState<TMDBMediaItem[]>(() => homeFeedCache?.popularTV || []);
  const [suggestions, setSuggestions] = useState<TMDBMediaItem[]>(() => homeFeedCache?.suggestions || []);
  const [suggestionSubtitle, setSuggestionSubtitle] = useState<string>(
    () => homeFeedCache?.suggestionSubtitle || 'Top picks and acclaimed masterworks tailored for you'
  );
  const [history, setHistory] = useState<WatchHistoryItem[]>(() => homeFeedCache?.history || []);
  const [newReleaseMovies, setNewReleaseMovies] = useState<TMDBMediaItem[]>(() => homeFeedCache?.newReleaseMovies || []);
  const [newReleaseTV, setNewReleaseTV] = useState<TMDBMediaItem[]>(() => homeFeedCache?.newReleaseTV || []);
  const [isLoading, setIsLoading] = useState(() => !homeFeedCache);

  useEffect(() => {
    let isMounted = true;

    const loadHomeData = async (forceRefresh = false) => {
      // 1. Immediately refresh watch history from IndexedDB so "Continue Watching" is always 100% fresh
      dbService.getHistory(10).then((hist) => {
        if (isMounted) {
          setHistory(hist || []);
          if (homeFeedCache) homeFeedCache.history = hist || [];
        }
      });

      // 2. Stale-While-Revalidate: If we have cached data (< 10 minutes old) and not forced, skip network
      const isCacheFresh = homeFeedCache && (Date.now() - homeFeedCache.timestamp < 10 * 60 * 1000);
      if (isCacheFresh && !forceRefresh) {
        if (isLoading) setIsLoading(false);
        return;
      }

      // If no cache at all, show the loading skeleton during initial cold load
      if (!homeFeedCache) {
        setIsLoading(true);
      }

      try {
        // Fire ALL primary rails concurrently in a single parallel batch (Zero Stage 1 -> Stage 2 waterfall)
        const [trendRes, popMRes, popTVRes, newMRes, newTVRes] = await Promise.all([
          tmdbApi.getTrending('all', 'day'),
          tmdbApi.getPopularMovies(1),
          tmdbApi.getPopularTV(1),
          tmdbApi.getNowPlayingMovies(1),
          tmdbApi.getOnTheAirTV(1)
        ]);

        if (!isMounted) return;

        const trendItems = trendRes.results || [];
        const popMItems = popMRes.results || [];
        const popTVItems = popTVRes.results || [];
        const newMItems = newMRes.results || [];
        const newTVItems = newTVRes.results || [];

        // Preload first hero billboard backdrop immediately so it renders without delay
        if (trendItems.length > 0 && trendItems[0]?.backdrop_path) {
          const img = new Image();
          img.src = `https://image.tmdb.org/t/p/w780${trendItems[0].backdrop_path}`;
        }

        setTrending(trendItems);
        setPopularMovies(popMItems);
        setPopularTV(popTVItems);
        setNewReleaseMovies(newMItems);
        setNewReleaseTV(newTVItems);
        setIsLoading(false);

        // Fetch personalized suggestions asynchronously in background without blocking rail display
        getPersonalizedSuggestions(forceRefresh).then((suggRes) => {
          if (!isMounted) return;
          setSuggestions(suggRes.items || []);
          setSuggestionSubtitle(suggRes.subtitle);

          const updatedCache: HomeFeedCache = {
            trending: trendItems,
            popularMovies: popMItems,
            popularTV: popTVItems,
            suggestions: suggRes.items || [],
            suggestionSubtitle: suggRes.subtitle,
            newReleaseMovies: newMItems,
            newReleaseTV: newTVItems,
            history: homeFeedCache?.history || [],
            timestamp: Date.now()
          };
          homeFeedCache = updatedCache;
          try {
            localStorage.setItem(HOME_CACHE_KEY, JSON.stringify(updatedCache));
          } catch {}
        }).catch(() => {});

      } catch (err) {
        console.error('Failed to load home feed:', err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadHomeData();

    // Listen for settings or library changes to invalidate cache and refresh suggestions
    const handleSettingsChanged = () => {
      homeFeedCache = null;
      try {
        localStorage.removeItem(HOME_CACHE_KEY);
        localStorage.removeItem('tmdb_suggestions_cache');
      } catch {}
      loadHomeData(true);
    };

    window.addEventListener('tmdb_settings_changed', handleSettingsChanged);
    return () => {
      isMounted = false;
      window.removeEventListener('tmdb_settings_changed', handleSettingsChanged);
    };
  }, []);

  // If cold boot and no trending cached yet, show Hero skeleton with immediate active Watch Now button
  if (isLoading && !trending.length) {
    return (
      <div className="min-h-screen pb-16 bg-hbo-dark">
        <div data-hero-banner="true" className="relative w-full h-[65vh] sm:h-[75vh] min-h-[460px] max-h-[750px] overflow-hidden bg-[#050508] select-none">
          <div className="absolute inset-0 bg-gradient-to-t from-hbo-dark via-hbo-dark/60 to-transparent z-10" />
          <div className="relative z-20 h-full flex flex-col justify-end p-6 sm:p-12 lg:p-16 max-w-4xl">
            <div className="h-6 w-32 bg-white/10 rounded-full mb-3 animate-pulse" />
            <div className="h-10 sm:h-14 w-3/4 bg-white/10 rounded-xl mb-4 animate-pulse" />
            <div className="h-4 w-full max-w-xl bg-white/10 rounded mb-2 animate-pulse" />
            <div className="h-4 w-2/3 max-w-xl bg-white/10 rounded mb-5 animate-pulse" />
            <div className="flex flex-col gap-2.5 w-fit">
              <button
                type="button"
                data-hero-btn="play"
                data-hero-index={0}
                tabIndex={0}
                className="flex items-center gap-2 px-5 sm:px-6 py-2.5 rounded-xl bg-gradient-to-r from-hbo-purple to-hbo-cyan text-white font-bold text-xs sm:text-sm shadow-hbo-glow tv-focus-target opacity-80"
              >
                <span>Loading Cinema...</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-16 bg-hbo-dark">
      {/* Hero Billboard Full-Width Sliding Carousel */}
      <HeroBanner items={trending} />

      {/* Continue Watching Section (HBO Max 16:9 Landscape Widescreen Cards) */}
      {history.length > 0 && (
        <section className="mb-7 sm:mb-9 w-full" data-content-rail="true">
          <div className="px-4 sm:px-8 mb-2.5">
            <h2 className="text-lg sm:text-2xl font-bold font-display text-white tracking-tight flex items-center gap-2">
              <span className="w-1.5 h-5 bg-hbo-cyan rounded-full inline-block"></span>
              Continue Watching
            </h2>
          </div>
          <div className="flex items-center gap-3.5 overflow-x-auto no-scrollbar py-4 pl-4 sm:pl-8 pr-6 sm:pr-8 -my-2 scroll-smooth transform-gpu snap-x snap-mandatory scroll-pl-4 sm:scroll-pl-8">
            {history.map((hist) => (
              <MediaCard
                key={hist.id || `${hist.tmdbId}-${hist.mediaType}`}
                item={{
                  id: hist.tmdbId,
                  title: hist.title,
                  overview: '',
                  poster_path: hist.posterPath,
                  backdrop_path: hist.backdropPath,
                  vote_average: hist.voteAverage || 0,
                  vote_count: 0,
                  popularity: 0,
                  original_language: 'en'
                }}
                type={hist.mediaType}
                variant="landscape"
                season={hist.season}
                episode={hist.episode}
                episodeTitle={hist.episodeTitle}
                stillPath={hist.stillPath}
                progress={hist.progressPercent}
                timestamp={hist.timestamp}
              />
            ))}
          </div>
        </section>
      )}

      {/* Content Rails */}
      <MediaRow
        title="Trending Now"
        subtitle="Most watched titles across the world this week"
        items={trending}
      />

      <MediaRow
        title="Popular Movies"
        subtitle="Critically acclaimed and high grossing films"
        items={popularMovies}
        type="movie"
      />

      <MediaRow
        title="Trending TV Shows"
        subtitle="Captivating series and multi-season dramas"
        items={popularTV}
        type="tv"
      />

      <MediaRow
        title="New Release Movie"
        subtitle="Latest blockbuster films and digital premieres"
        items={newReleaseMovies}
        type="movie"
      />

      <MediaRow
        title="New Release Series"
        subtitle="Fresh seasons and newly premiering shows"
        items={newReleaseTV}
        type="tv"
      />

      <MediaRow
        title="Suggestions"
        subtitle={suggestionSubtitle}
        items={suggestions}
      />
    </div>
  );
};
