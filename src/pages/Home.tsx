import React, { useState, useEffect } from 'react';
import { tmdbApi } from '../services/tmdb';
import type { TMDBMediaItem } from '../types/tmdb';
import type { WatchHistoryItem } from '../types/db';
import { dbService } from '../services/db';
import { HeroBanner } from '../components/common/HeroBanner';
import { MediaRow } from '../components/common/MediaRow';
import { MediaCard } from '../components/common/MediaCard';
import { PlatformHubs } from '../components/common/PlatformHubs';
import { Play, Sparkles, Flame, Trophy, Film, Tv, Compass } from 'lucide-react';
import { Link } from 'react-router-dom';

interface HomeFeedCache {
  trending: TMDBMediaItem[];
  popularMovies: TMDBMediaItem[];
  popularTV: TMDBMediaItem[];
  topRated: TMDBMediaItem[];
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
  const [topRated, setTopRated] = useState<TMDBMediaItem[]>(() => homeFeedCache?.topRated || []);
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

      // 2. If we already have fresh cached data (< 5 minutes old) and not forced, no need to re-fetch all 6 TMDB rows
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
        const [trendRes, popMRes, popTVRes, topRes, newMRes, newTVRes, histRes] = await Promise.all([
          tmdbApi.getTrending('all', 'day'),
          tmdbApi.getPopularMovies(1),
          tmdbApi.getPopularTV(1),
          tmdbApi.getTopRatedMovies(1),
          tmdbApi.getNowPlayingMovies(1),
          tmdbApi.getOnTheAirTV(1),
          dbService.getHistory(10)
        ]);

        if (!isMounted) return;

        const newCache: HomeFeedCache = {
          trending: trendRes.results || [],
          popularMovies: popMRes.results || [],
          popularTV: popTVRes.results || [],
          topRated: topRes.results || [],
          newReleaseMovies: newMRes.results || [],
          newReleaseTV: newTVRes.results || [],
          history: histRes || [],
          timestamp: Date.now()
        };

        homeFeedCache = newCache;

        setTrending(newCache.trending);
        setPopularMovies(newCache.popularMovies);
        setPopularTV(newCache.popularTV);
        setTopRated(newCache.topRated);
        setNewReleaseMovies(newCache.newReleaseMovies);
        setNewReleaseTV(newCache.newReleaseTV);
        setHistory(newCache.history);
      } catch (err) {
        console.error('Failed to load home feed:', err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadHomeData();

    // Listen for settings changes (e.g. maturity filter, unreleased filter) to invalidate cache
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

  // When data loading is finished and DOM mounts, move focus immediately to Billboard "Watch Now" button
  useEffect(() => {
    if (!isLoading && trending.length > 0) {
      const focusWatchNow = () => {
        if (!document.activeElement || document.activeElement === document.body || document.activeElement === document.documentElement) {
          const watchNowBtn = document.querySelector<HTMLElement>('[data-hero-watch-now="true"]') ||
                              Array.from(document.querySelectorAll<HTMLElement>('.tv-focus-target')).find(
                                el => el.textContent?.trim().toLowerCase().includes('watch now')
                              );
          if (watchNowBtn) {
            watchNowBtn.focus();
          }
        }
      };

      const t1 = setTimeout(focusWatchNow, 50);
      const t2 = setTimeout(focusWatchNow, 250);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [isLoading, trending]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-hbo-dark">
        <div className="w-14 h-14 border-4 border-hbo-purple border-t-hbo-cyan rounded-full animate-spin shadow-hbo-glow mb-4" />
        <h2 className="text-lg font-bold font-display text-white tracking-wider">PREPARING CINEMA...</h2>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-16 bg-hbo-dark">
      {/* Hero Billboard Carousel */}
      <HeroBanner items={trending} />

      {/* Streaming Platform Hubs (Apple TV, HBO, Disney+, Netflix, Prime Video, Viu, Netflix Kids) */}
      <PlatformHubs />

      {/* Continue Watching Section */}
      {history.length > 0 && (
        <section className="my-8 px-4 sm:px-8 max-w-7xl mx-auto">
          <h2 className="text-lg sm:text-2xl font-bold font-display text-white tracking-tight flex items-center gap-2 mb-3">
            <span className="w-1.5 h-5 bg-hbo-cyan rounded-full inline-block"></span>
            Continue Watching
          </h2>
          <div className="flex items-center gap-4 sm:gap-6 lg:gap-7 overflow-x-auto no-scrollbar py-3 px-2">
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
        title="All-Time Top Rated"
        subtitle="Masterpieces recognized by global film critics"
        items={topRated}
        type="movie"
      />
    </div>
  );
};
