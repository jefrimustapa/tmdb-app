import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Play, Info, Plus, Check } from 'lucide-react';
import type { TMDBMediaItem } from '../../types/tmdb';
import { tmdbImages } from '../../services/tmdb';
import { RatingBadge } from './RatingBadge';
import { dbService } from '../../services/db';

interface HeroBannerProps {
  items: TMDBMediaItem[];
  onOpenDetails?: (item: TMDBMediaItem) => void;
}

export const HeroBanner: React.FC<HeroBannerProps> = ({ items }) => {
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isWatchlisted, setIsWatchlisted] = useState(false);

  const featured = items[currentIndex] || items[0];

  useEffect(() => {
    if (!featured) return;
    const mediaType: 'movie' | 'tv' = featured.media_type === 'tv' ? 'tv' : 'movie';
    dbService.isWatchlisted(featured.id, mediaType).then(setIsWatchlisted);
  }, [featured]);

  const bannerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(true);

  // Pause carousel when scrolled out of view to save CPU/GPU cycles
  useEffect(() => {
    const el = bannerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { threshold: 0.1 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const totalItems = items.length;
  const isAutoPlayPaused = useRef(false);

  useEffect(() => {
    if (totalItems <= 1 || !isVisible) return;

    const interval = setInterval(() => {
      if (!isAutoPlayPaused.current) {
        setCurrentIndex((prevIndex) => (prevIndex + 1) % totalItems);
      }
    }, 8000);

    return () => clearInterval(interval);
  }, [totalItems, isVisible]);

  const [isPerfMode, setIsPerfMode] = useState(() => 
    typeof document !== 'undefined' && document.documentElement.getAttribute('data-perf-mode') === 'true'
  );

  useEffect(() => {
    const handleSettings = (e: Event) => {
      const custom = e as CustomEvent<any>;
      if (custom.detail && typeof custom.detail.performanceMode === 'boolean') {
        setIsPerfMode(custom.detail.performanceMode);
      }
    };
    window.addEventListener('tmdb_settings_changed', handleSettings);
    return () => window.removeEventListener('tmdb_settings_changed', handleSettings);
  }, []);

  if (!featured) return null;

  const title = featured.title || featured.name || 'Featured Title';
  const releaseDate = featured.release_date || featured.first_air_date;
  const releaseYear = releaseDate ? new Date(releaseDate).getFullYear() : '';
  const mediaType: 'movie' | 'tv' = featured.media_type === 'tv' ? 'tv' : 'movie';
  const backdropUrl = tmdbImages.backdrop(featured.backdrop_path, isPerfMode ? 'w780' : 'original');

  const handleToggleWatchlist = async () => {
    const status = await dbService.toggleWatchlist({
      tmdbId: featured.id,
      mediaType,
      title,
      posterPath: featured.poster_path,
      backdropPath: featured.backdrop_path,
      voteAverage: featured.vote_average,
      releaseDate: releaseDate
    });
    setIsWatchlisted(status);
  };

  return (
    <div
      ref={bannerRef}
      data-hero-banner="true"
      className="relative w-full h-[65vh] sm:h-[75vh] min-h-[460px] max-h-[750px] overflow-hidden bg-hbo-dark"
      onMouseEnter={() => { isAutoPlayPaused.current = true; }}
      onMouseLeave={() => { isAutoPlayPaused.current = false; }}
    >
      {/* Background Backdrop Image */}
      <div className="absolute inset-0 select-none">
        <img
          src={backdropUrl}
          alt={title}
          loading="eager"
          decoding="async"
          onError={(e) => tmdbImages.handleImgError(e, true)}
          className="w-full h-full object-cover object-center animate-fade-in transition-opacity duration-1000"
        />
        {/* Cinematic HBO Gradients */}
        <div className="absolute inset-0 hero-gradient-overlay" />
        <div className="absolute inset-0 hero-side-gradient hidden sm:block" />
      </div>

      {/* Hero Content Overlay */}
      <div className="relative z-10 h-full max-w-7xl mx-auto px-4 sm:px-8 flex flex-col justify-end pb-12 sm:pb-16 max-w-2xl lg:max-w-3xl">
        {/* Brand Tag & Meta */}
        <div className="flex items-center gap-2.5 mb-3 flex-wrap">
          <span className="px-2.5 py-0.5 rounded-full bg-hbo-purple/60 border border-hbo-purple-light text-white text-xs font-bold uppercase tracking-wider backdrop-blur-md">
            {mediaType === 'movie' ? 'FILM' : 'SERIES'}
          </span>
          <RatingBadge score={featured.vote_average} size="md" />
          <span className="text-sm font-medium text-gray-300">{releaseYear}</span>
        </div>

        {/* Title */}
        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black font-display text-white tracking-tight leading-tight mb-3 drop-shadow-lg">
          {title}
        </h1>

        {/* Overview */}
        <p className="text-sm sm:text-base text-gray-300 line-clamp-3 mb-6 max-w-2xl leading-relaxed drop-shadow-md">
          {featured.overview}
        </p>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
          <Link
            to={`/watch/${mediaType}/${featured.id}`}
            data-hero-watch-now="true"
            onClick={(e) => {
              e.preventDefault();
              navigate(`/watch/${mediaType}/${featured.id}`);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                navigate(`/watch/${mediaType}/${featured.id}`);
              }
            }}
            className="flex items-center gap-2.5 px-6 sm:px-8 py-3.5 rounded-xl bg-gradient-to-r from-hbo-purple to-hbo-cyan text-white font-bold text-sm sm:text-base shadow-hbo-glow hover:scale-105 transition-all tv-focus-target"
          >
            <Play className="w-5 h-5 fill-current" />
            <span>Watch Now</span>
          </Link>

          <Link
            to={`/details/${mediaType}/${featured.id}`}
            onClick={(e) => {
              e.preventDefault();
              navigate(`/details/${mediaType}/${featured.id}`);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                navigate(`/details/${mediaType}/${featured.id}`);
              }
            }}
            className="flex items-center gap-2 px-5 sm:px-6 py-3.5 rounded-xl bg-white/15 hover:bg-white/25 text-white font-semibold text-sm sm:text-base backdrop-blur-md border border-white/20 transition-all hover:scale-105 tv-focus-target"
          >
            <Info className="w-5 h-5" />
            <span>Details</span>
          </Link>

          <button
            onClick={handleToggleWatchlist}
            className={`p-3.5 rounded-full backdrop-blur-md border transition-all hover:scale-105 tv-focus-target ${
              isWatchlisted
                ? 'bg-hbo-purple-light/30 border-hbo-purple-light text-hbo-cyan'
                : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
            }`}
            title={isWatchlisted ? 'In Watchlist' : 'Add to Watchlist'}
          >
            {isWatchlisted ? <Check className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
          </button>
        </div>

        {/* Carousel Indicators */}
        <div className="flex items-center gap-2 mt-6">
          {items.slice(0, 5).map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentIndex(idx)}
              className={`h-1.5 rounded-full transition-all duration-500 ${
                idx === currentIndex ? 'w-8 bg-gradient-to-r from-hbo-purple to-hbo-cyan' : 'w-2 bg-white/30'
              }`}
              aria-label={`Slide ${idx + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
