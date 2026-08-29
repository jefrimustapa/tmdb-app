import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Heart, Bookmark, MoreVertical, Info, Check, Trash2 } from 'lucide-react';
import type { TMDBMediaItem } from '../../types/tmdb';
import { tmdbImages } from '../../services/tmdb';
import { RatingBadge } from './RatingBadge';
import { dbService } from '../../services/db';

interface MediaCardProps {
  item: TMDBMediaItem;
  type?: 'movie' | 'tv';
  progress?: number;
  onDelete?: () => void;
}

export const MediaCard: React.FC<MediaCardProps> = ({ item, type, progress, onDelete }) => {
  const navigate = useNavigate();
  const mediaType: 'movie' | 'tv' = (type === 'tv' || item.media_type === 'tv' || (!item.title && !!item.name)) ? 'tv' : 'movie';
  const title = item.title || item.name || 'Untitled';
  const releaseYear = (item.release_date || item.first_air_date || '').split('-')[0];
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

  const posterUrl = tmdbImages.poster(item.poster_path, isPerfMode ? 'w342' : 'w500');

  const [menuOpen, setMenuOpen] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [isWatchlisted, setIsWatchlisted] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Lazy-load liked/watchlisted state only when menu is opened
  useEffect(() => {
    if (!menuOpen) return;
    let active = true;
    Promise.all([
      dbService.isLiked(item.id, mediaType),
      dbService.isWatchlisted(item.id, mediaType)
    ]).then(([liked, watchlisted]) => {
      if (active) {
        setIsLiked(liked);
        setIsWatchlisted(watchlisted);
      }
    });
    return () => { active = false; };
  }, [menuOpen, item.id, mediaType]);

  const cardRef = useRef<HTMLDivElement>(null);

  // Listen for TV long press custom event
  useEffect(() => {
    const cardEl = cardRef.current;
    if (!cardEl) return;
    const handleTvLongPress = (e: Event) => {
      e.stopPropagation();
      setMenuOpen((prev) => !prev);
    };
    cardEl.addEventListener('tv_long_press', handleTvLongPress);
    return () => cardEl.removeEventListener('tv_long_press', handleTvLongPress);
  }, []);

  // Close menu on click outside
  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [menuOpen]);

  const handleCardClick = (e?: React.MouseEvent) => {
    if (menuOpen) {
      setMenuOpen(false);
      return;
    }
    navigate(`/details/${mediaType}/${item.id}`);
  };

  const handleMenuToggle = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen((prev) => !prev);
  };

  const handlePlay = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen(false);
    navigate(`/watch/${mediaType}/${item.id}`);
  };

  const handleDetails = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen(false);
    navigate(`/details/${mediaType}/${item.id}`);
  };

  const handleLike = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await dbService.toggleLike({
      tmdbId: item.id,
      mediaType,
      title,
      posterPath: item.poster_path,
      backdropPath: item.backdrop_path,
      voteAverage: item.vote_average,
      releaseDate: item.release_date || item.first_air_date
    });
    const status = await dbService.isLiked(item.id, mediaType);
    setIsLiked(status);
  };

  const handleWatchlist = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await dbService.toggleWatchlist({
      tmdbId: item.id,
      mediaType,
      title,
      posterPath: item.poster_path,
      backdropPath: item.backdrop_path,
      voteAverage: item.vote_average,
      releaseDate: item.release_date || item.first_air_date
    });
    const status = await dbService.isWatchlisted(item.id, mediaType);
    setIsWatchlisted(status);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen(false);
    if (onDelete) onDelete();
  };

  // Long press handler for Android TV / D-pad / Touch
  const handleTouchStart = () => {
    longPressTimerRef.current = setTimeout(() => {
      setMenuOpen(true);
    }, 600);
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ContextMenu' || (e.key === 'Enter' && e.altKey)) {
      e.preventDefault();
      e.stopPropagation();
      setMenuOpen((prev) => !prev);
    } else if (e.key === 'Enter' || e.key === ' ') {
      if (!menuOpen) {
        e.preventDefault();
        handleCardClick();
      }
    }
  };

  const handleFocus = () => {
    cardRef.current?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
  };

  return (
    <div
      ref={cardRef}
      tabIndex={0}
      role="button"
      aria-label={`View ${title}`}
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleTouchStart}
      onMouseUp={handleTouchEnd}
      onClick={handleCardClick}
      className="group relative flex-shrink-0 w-36 sm:w-44 md:w-48 lg:w-52 max-w-full rounded-xl overflow-hidden bg-hbo-card border border-hbo-border/40 tv-focus-target cursor-pointer focus:outline-none transform-gpu"
    >
      <div className="block relative aspect-[2/3] w-full overflow-hidden bg-gray-900">
        <img
          src={posterUrl}
          alt={title}
          loading="lazy"
          decoding="async"
          onError={tmdbImages.handleImgError}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
        />

        {/* Rating badge */}
        <div className="absolute top-2 left-2 z-10">
          <RatingBadge score={item.vote_average} />
        </div>

        {/* 3-Vertical-Dots Consolidated Menu Trigger Button */}
        <div className="absolute top-2 right-2 z-20" ref={menuRef}>
          <button
            type="button"
            onClick={handleMenuToggle}
            aria-label="More options"
            className="w-8 h-8 rounded-full bg-black/70 hover:bg-black text-white border border-white/20 backdrop-blur-md flex items-center justify-center transition-transform hover:scale-110 shadow-md focus:outline-none"
          >
            <MoreVertical className="w-4 h-4 text-white" />
          </button>

          {/* Consolidated Menu Popup - Vertical Icon Only */}
          {menuOpen && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute top-10 right-0 bg-hbo-card/95 backdrop-blur-xl border border-hbo-purple-light/50 rounded-2xl shadow-2xl p-1.5 z-30 flex flex-col items-center gap-1.5 animate-in fade-in zoom-in-95 duration-150"
            >
              {/* Play Icon */}
              <button
                type="button"
                onClick={handlePlay}
                title="Play Now"
                aria-label="Play Now"
                className="w-9 h-9 rounded-xl bg-hbo-purple/40 hover:bg-hbo-purple flex items-center justify-center text-hbo-cyan border border-hbo-cyan/30 transition hover:scale-105 tv-focus-target"
              >
                <Play className="w-4 h-4 fill-current ml-0.5" />
              </button>

              {/* Like Icon */}
              <button
                type="button"
                onClick={handleLike}
                title={isLiked ? 'Liked' : 'Like'}
                aria-label={isLiked ? 'Liked' : 'Like'}
                className={`w-9 h-9 rounded-xl flex items-center justify-center border transition hover:scale-105 tv-focus-target ${
                  isLiked
                    ? 'bg-red-500/20 text-red-500 border-red-500/40'
                    : 'bg-white/10 text-gray-300 border-white/10 hover:text-white hover:bg-white/20'
                }`}
              >
                <Heart className={`w-4 h-4 ${isLiked ? 'fill-current' : ''}`} />
              </button>

              {/* Watchlist Icon */}
              <button
                type="button"
                onClick={handleWatchlist}
                title={isWatchlisted ? 'In Watchlist' : 'Add to Watchlist'}
                aria-label={isWatchlisted ? 'In Watchlist' : 'Add to Watchlist'}
                className={`w-9 h-9 rounded-xl flex items-center justify-center border transition hover:scale-105 tv-focus-target ${
                  isWatchlisted
                    ? 'bg-hbo-cyan/20 text-hbo-cyan border-hbo-cyan/40'
                    : 'bg-white/10 text-gray-300 border-white/10 hover:text-white hover:bg-white/20'
                }`}
              >
                <Bookmark className={`w-4 h-4 ${isWatchlisted ? 'fill-current' : ''}`} />
              </button>

              {/* Optional Delete Icon (for My Space) */}
              {onDelete && (
                <button
                  type="button"
                  onClick={handleDelete}
                  title="Remove from My Space"
                  aria-label="Remove"
                  className="w-9 h-9 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/40 flex items-center justify-center transition hover:scale-105 tv-focus-target"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Watch Progress Bar */}
        {progress !== undefined && progress > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/60 z-10">
            <div
              className="h-full bg-gradient-to-r from-hbo-purple-light to-hbo-cyan"
              style={{ width: `${Math.min(100, progress)}%` }}
            />
          </div>
        )}
      </div>

      {/* Static title footer for clear visibility on TV / Mobile */}
      <div className="p-2.5">
        <h4 className="text-xs sm:text-sm font-semibold text-gray-100 line-clamp-1 group-hover:text-hbo-cyan transition-colors">
          {title}
        </h4>
        <div className="flex items-center justify-between mt-1 text-[11px] text-gray-400">
          <span>{releaseYear || mediaType.toUpperCase()}</span>
          <span className="uppercase text-[10px] font-bold px-1.5 py-0.5 rounded bg-hbo-purple/20 text-hbo-purple-light border border-hbo-purple/30">
            {mediaType === 'movie' ? 'Film' : 'Series'}
          </span>
        </div>
      </div>
    </div>
  );
};
