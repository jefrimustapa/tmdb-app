import React, { useState, useRef, useEffect, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Heart, Bookmark, MoreVertical, Trash2 } from 'lucide-react';
import type { TMDBMediaItem } from '../../types/tmdb';
import { tmdbImages } from '../../services/tmdb';
import { RatingBadge } from './RatingBadge';
import { dbService } from '../../services/db';

interface MediaCardProps {
  item: TMDBMediaItem;
  type?: 'movie' | 'tv';
  variant?: 'poster' | 'landscape';
  season?: number;
  episode?: number;
  episodeTitle?: string;
  progress?: number;
  onDelete?: () => void;
}

const MediaCardComponent: React.FC<MediaCardProps> = ({
  item,
  type,
  variant = 'poster',
  season,
  episode,
  episodeTitle,
  progress,
  onDelete
}) => {
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

  const imageUrl = variant === 'landscape'
    ? tmdbImages.backdrop(item.backdrop_path || item.poster_path, isPerfMode ? 'w300' : 'w1280')
    : tmdbImages.poster(item.poster_path, isPerfMode ? 'w185' : 'w500');

  const [menuOpen, setMenuOpen] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [isWatchlisted, setIsWatchlisted] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

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

  // Close menu on click outside only when menu is open
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

  const handleCardClick = () => {
    if (menuOpen) {
      setMenuOpen(false);
      return;
    }

    if (variant === 'landscape') {
      // One-click instant resume
      if (mediaType === 'tv' && season && episode) {
        navigate(`/watch/tv/${item.id}?s=${season}&e=${episode}`);
      } else {
        navigate(`/watch/${mediaType}/${item.id}`);
      }
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
    if (mediaType === 'tv' && season && episode) {
      navigate(`/watch/tv/${item.id}?s=${season}&e=${episode}`);
    } else {
      navigate(`/watch/${mediaType}/${item.id}`);
    }
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

  const isLandscape = variant === 'landscape';

  return (
    <div
      ref={cardRef}
      tabIndex={0}
      role="button"
      aria-label={`View ${title}`}
      onKeyDown={handleKeyDown}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleTouchStart}
      onMouseUp={handleTouchEnd}
      onClick={handleCardClick}
      className={`group relative flex-shrink-0 rounded-xl overflow-hidden bg-hbo-card border border-hbo-border/40 tv-focus-target cursor-pointer focus:outline-none transform-gpu ${
        isLandscape
          ? 'w-[164px] sm:w-[172px] lg:w-[176px] max-w-[180px]'
          : 'w-[130px] sm:w-[140px] lg:w-[144px] max-w-[148px]'
      }`}
    >
      <div className={`block relative w-full overflow-hidden bg-gray-900 ${
        isLandscape ? 'aspect-video' : 'aspect-[2/3]'
      }`}>
        <img
          src={imageUrl}
          alt={title}
          loading="lazy"
          decoding="async"
          onError={(e) => tmdbImages.handleImgError(e, isLandscape)}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />

        {/* Pure Play Icon on Bottom-Left Corner for Landscape Continue Watching Cards */}
        {isLandscape && (
          <div className="absolute bottom-2 left-2.5 z-10 pointer-events-none flex items-center">
            <Play className="w-4 h-4 text-white fill-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] transition-all duration-200 group-hover:scale-110 group-focus:scale-110 group-hover:text-hbo-cyan group-focus:text-hbo-cyan group-hover:fill-hbo-cyan group-focus:fill-hbo-cyan" />
          </div>
        )}

        {/* Rating badge for poster cards */}
        {!isLandscape && item.vote_average > 0 && (
          <div className="absolute top-2 left-2 z-10">
            <RatingBadge score={item.vote_average} />
          </div>
        )}

        {/* 3-Vertical-Dots Consolidated Menu Trigger Button */}
        <div className="absolute top-2 right-2 z-20" ref={menuRef}>
          <button
            type="button"
            onClick={handleMenuToggle}
            aria-label="More options"
            className="p-1 text-white/90 hover:text-white transition-all hover:scale-110 focus:outline-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.85)]"
          >
            <MoreVertical className="w-4 h-4 text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.85)]" />
          </button>

          {/* Consolidated Menu Popup */}
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

              {/* Optional Delete Icon */}
              {onDelete && (
                <button
                  type="button"
                  onClick={handleDelete}
                  title="Remove"
                  aria-label="Remove"
                  className="w-9 h-9 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/40 flex items-center justify-center transition hover:scale-105 tv-focus-target"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Progress Bar for Standard Posters (Omitted for Landscape continue watching) */}
        {!isLandscape && progress !== undefined && progress > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/60 z-10">
            <div
              className="h-full bg-gradient-to-r from-hbo-purple-light to-hbo-cyan"
              style={{ width: `${Math.min(100, progress)}%` }}
            />
          </div>
        )}
      </div>

      {/* Title & Metadata Footer */}
      <div className="p-2.5">
        <h4 className="text-xs sm:text-sm font-bold text-white line-clamp-1 group-hover:text-hbo-cyan transition-colors">
          {title}
        </h4>
        {isLandscape ? (
          <p className="text-[11px] sm:text-xs text-gray-400 truncate mt-0.5">
            {mediaType === 'tv' && season && episode
              ? `S${season} : E${episode}${episodeTitle ? ` • ${episodeTitle}` : ''}`
              : (releaseYear ? `${releaseYear} • Film` : 'Film')}
          </p>
        ) : (
          <div className="flex items-center justify-between mt-1 text-[11px] text-gray-400">
            <span>{releaseYear || mediaType.toUpperCase()}</span>
            <span className="uppercase text-[10px] font-bold px-1.5 py-0.5 rounded bg-hbo-purple/20 text-hbo-purple-light border border-hbo-purple/30">
              {mediaType === 'movie' ? 'Film' : 'Series'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export const MediaCard = memo(MediaCardComponent);
