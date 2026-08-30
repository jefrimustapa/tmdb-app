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

let homeFeedCache: HomeFeedCache | null = null;

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

      // 2. If we already have fresh cached data (< 5 minutes old) and not forced, no need to re-fetch
      const isCacheFresh = homeFeedCache && (Date.now() - homeFeedCache.timestamp < 5 * 60 * 1000);
      if (isCacheFresh && !forceRefresh) {
        if (isLoading) setIsLoading(false);
        return;
      }

      // If no cache at all, show the loading spinner during initial cold load
      if (!homeFeedCache) {
        setIsLoading(true);
      }

      try {
        // Stage 1: Load Hero Billboard & Top 2 rails first for instant cold start
        const [trendRes, popMRes, histRes] = await Promise.all([
          tmdbApi.getTrending('all', 'day'),
          tmdbApi.getPopularMovies(1),
          dbService.getHistory(10)
        ]);

        if (!isMounted) return;

        setTrending(trendRes.results || []);
        setPopularMovies(popMRes.results || []);
        setHistory(histRes || []);
        setIsLoading(false);

        // Stage 2: Load secondary lower rails & personalized suggestions in background
        const [popTVRes, suggRes, newMRes, newTVRes] = await Promise.all([
          tmdbApi.getPopularTV(1),
          getPersonalizedSuggestions(),
          tmdbApi.getNowPlayingMovies(1),
          tmdbApi.getOnTheAirTV(1)
        ]);

        if (!isMounted) return;

        const newCache: HomeFeedCache = {
          trending: trendRes.results || [],
          popularMovies: popMRes.results || [],
          popularTV: popTVRes.results || [],
          suggestions: suggRes.items || [],
          suggestionSubtitle: suggRes.subtitle,
          newReleaseMovies: newMRes.results || [],
          newReleaseTV: newTVRes.results || [],
          history: histRes || [],
          timestamp: Date.now()
        };

        homeFeedCache = newCache;

        setPopularTV(newCache.popularTV);
        setSuggestions(newCache.suggestions);
        setSuggestionSubtitle(newCache.suggestionSubtitle);
        setNewReleaseMovies(newCache.newReleaseMovies);
        setNewReleaseTV(newCache.newReleaseTV);
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
      loadHomeData(true);
    };

    window.addEventListener('tmdb_settings_changed', handleSettingsChanged);
    return () => {
      isMounted = false;
      window.removeEventListener('tmdb_settings_changed', handleSettingsChanged);
    };
  }, []);

  if (isLoading && !trending.length) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-hbo-dark">
        <div className="w-14 h-14 border-4 border-hbo-purple border-t-hbo-cyan rounded-full animate-spin shadow-hbo-glow mb-4" />
        <h2 className="text-lg font-bold font-display text-white tracking-wider">PREPARING CINEMA...</h2>
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
                progress={hist.progressPercent}
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
