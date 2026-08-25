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

export const Home: React.FC = () => {
  const [trending, setTrending] = useState<TMDBMediaItem[]>([]);
  const [popularMovies, setPopularMovies] = useState<TMDBMediaItem[]>([]);
  const [popularTV, setPopularTV] = useState<TMDBMediaItem[]>([]);
  const [topRated, setTopRated] = useState<TMDBMediaItem[]>([]);
  const [history, setHistory] = useState<WatchHistoryItem[]>([]);
  const [actionMovies, setActionMovies] = useState<TMDBMediaItem[]>([]);
  const [sciFiMovies, setSciFiMovies] = useState<TMDBMediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadHomeData = async () => {
      setIsLoading(true);
      try {
        const [trendRes, popMRes, popTVRes, topRes, actRes, sciRes, histRes] = await Promise.all([
          tmdbApi.getTrending('all', 'day'),
          tmdbApi.getPopularMovies(1),
          tmdbApi.getPopularTV(1),
          tmdbApi.getTopRatedMovies(1),
          tmdbApi.discoverMovies({ with_genres: '28', sort_by: 'popularity.desc' }),
          tmdbApi.discoverMovies({ with_genres: '878', sort_by: 'popularity.desc' }),
          dbService.getHistory(10)
        ]);

        setTrending(trendRes.results || []);
        setPopularMovies(popMRes.results || []);
        setPopularTV(popTVRes.results || []);
        setTopRated(topRes.results || []);
        setActionMovies(actRes.results || []);
        setSciFiMovies(sciRes.results || []);
        setHistory(histRes || []);
      } catch (err) {
        console.error('Failed to load home feed:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadHomeData();
  }, []);

  // When data loading is finished and DOM mounts, move focus immediately to Billboard "Watch Now" button
  useEffect(() => {
    if (!isLoading && trending.length > 0) {
      const focusWatchNow = () => {
        const watchNowBtn = document.querySelector<HTMLElement>('[data-hero-watch-now="true"]') ||
                            Array.from(document.querySelectorAll<HTMLElement>('.tv-focus-target')).find(
                              el => el.textContent?.trim().toLowerCase().includes('watch now')
                            );
        if (watchNowBtn) {
          watchNowBtn.focus();
          window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
        }
      };

      const t1 = setTimeout(focusWatchNow, 50);
      const t2 = setTimeout(focusWatchNow, 300);
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
        title="Action Packed Cinema"
        subtitle="High-octane thrillers and blockbusters"
        items={actionMovies}
        type="movie"
      />

      <MediaRow
        title="Sci-Fi & Fantasy Worlds"
        subtitle="Epic space sagas and alternate realities"
        items={sciFiMovies}
        type="movie"
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
