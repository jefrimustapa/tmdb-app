import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Play, Info } from 'lucide-react';
import type { TMDBMediaItem } from '../../types/tmdb';
import { tmdbImages } from '../../services/tmdb';
import { RatingBadge } from './RatingBadge';

interface HeroBannerProps {
  items: TMDBMediaItem[];
  onOpenDetails?: (item: TMDBMediaItem) => void;
}

export const HeroBanner: React.FC<HeroBannerProps> = ({ items }) => {
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(0);
  const bannerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(true);
  const isAutoPlayPaused = useRef(false);
  const pauseTimerRef = useRef<NodeJS.Timeout | null>(null);

  const displayItems = items && items.length > 0 ? items.slice(0, 8) : [];
  const totalItems = displayItems.length;

  // Helper to pause for 5 seconds upon remote activity in billboard
  const trigger5sRemotePause = () => {
    isAutoPlayPaused.current = true;
    if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
    pauseTimerRef.current = setTimeout(() => {
      // Resume auto-slide only if focus is still in hero or at top level (not focused in other sections)
      const currActive = document.activeElement;
      const stillInHero = bannerRef.current ? bannerRef.current.contains(currActive) : false;
      const inOtherSection = currActive && currActive !== document.body && currActive !== document.documentElement && !stillInHero;
      if (!inOtherSection) {
        isAutoPlayPaused.current = false;
      }
    }, 5000);
  };

  // Global focus tracking: Pause autoslide whenever focus moves to another section (sidebar, continue watching, trending rows, etc.)
  useEffect(() => {
    const handleFocusIn = () => {
      const active = document.activeElement;
      const isFocusInHero = bannerRef.current ? bannerRef.current.contains(active) : false;
      
      if (!isFocusInHero && active && active !== document.body && active !== document.documentElement) {
        // Focus is at another section: pause autoslide indefinitely
        isAutoPlayPaused.current = true;
        if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
      } else if (isFocusInHero) {
        // Focus arrived or moved within hero: pause for 5 seconds
        trigger5sRemotePause();
      }
    };

    window.addEventListener('focusin', handleFocusIn);
    return () => {
      window.removeEventListener('focusin', handleFocusIn);
      if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
    };
  }, []);

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

  // Auto-play rotation (pauses when user is interacting, remote-active, or focused in other section)
  useEffect(() => {
    if (totalItems <= 1 || !isVisible) return;

    const interval = setInterval(() => {
      if (!isAutoPlayPaused.current) {
        setCurrentIndex((prevIndex) => (prevIndex + 1) % totalItems);
      }
    }, 8000);

    return () => clearInterval(interval);
  }, [totalItems, isVisible]);

  // Listen for custom remote slide change events from useTVNavigation
  useEffect(() => {
    const handleSlideChange = (e: Event) => {
      const custom = e as CustomEvent<{ index: number; btnType?: 'play' | 'details' }>;
      if (custom.detail && typeof custom.detail.index === 'number') {
        const targetIdx = custom.detail.index;
        if (targetIdx >= 0 && targetIdx < totalItems) {
          trigger5sRemotePause();
          setCurrentIndex(targetIdx);

          // Focus the target button on the new slide after state update
          setTimeout(() => {
            const btnType = custom.detail.btnType || 'play';
            const newBtn = bannerRef.current?.querySelector<HTMLElement>(
              `[data-hero-btn="${btnType}"][data-hero-index="${targetIdx}"]`
            );
            newBtn?.focus({ preventScroll: true });
          }, 60);
        }
      }
    };

    window.addEventListener('tmdb_hero_slide_change', handleSlideChange);
    return () => window.removeEventListener('tmdb_hero_slide_change', handleSlideChange);
  }, [totalItems]);

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

  // Preload upcoming backdrops into browser cache to eliminate gray flash
  useEffect(() => {
    if (totalItems <= 1) return;
    const nextIdx = (currentIndex + 1) % totalItems;
    const nextItem = displayItems[nextIdx];
    if (nextItem?.backdrop_path) {
      const img = new Image();
      img.src = tmdbImages.backdrop(nextItem.backdrop_path, isPerfMode ? 'w780' : 'w1280');
    }
  }, [currentIndex, displayItems, isPerfMode, totalItems]);

  if (totalItems === 0) return null;

  const currentFeatured = displayItems[currentIndex] || displayItems[0];
  const title = currentFeatured.title || currentFeatured.name || 'Featured Title';
  const releaseDate = currentFeatured.release_date || currentFeatured.first_air_date;
  const releaseYear = releaseDate ? new Date(releaseDate).getFullYear() : '';
  const mediaType: 'movie' | 'tv' = currentFeatured.media_type === 'tv' ? 'tv' : 'movie';

  // Touch swipe handling for mobile
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchStartTime = useRef<number>(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
      touchStartTime.current = Date.now();
      isAutoPlayPaused.current = true;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) {
      isAutoPlayPaused.current = false;
      return;
    }

    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;
    const deltaTime = Date.now() - touchStartTime.current;

    touchStartX.current = null;
    touchStartY.current = null;
    isAutoPlayPaused.current = false;

    // Must be predominantly horizontal swipe:
    // Min 40px deltaX, horizontal > 1.3x vertical, duration < 800ms
    if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY) * 1.3 && deltaTime < 800) {
      trigger5sRemotePause();
      if (deltaX < 0) {
        // Swiped Left -> Next Slide
        setCurrentIndex((prev) => (prev + 1) % totalItems);
      } else {
        // Swiped Right -> Previous Slide
        setCurrentIndex((prev) => (prev - 1 + totalItems) % totalItems);
      }
    }
  };

  const handleTouchCancel = () => {
    touchStartX.current = null;
    touchStartY.current = null;
    isAutoPlayPaused.current = false;
  };

  return (
    <div
      ref={bannerRef}
      data-hero-banner="true"
      data-total-slides={totalItems}
      className="relative w-full h-[65vh] sm:h-[75vh] min-h-[460px] max-h-[750px] overflow-hidden bg-[#050508] select-none touch-pan-y"
      onKeyDownCapture={trigger5sRemotePause}
      onMouseEnter={() => { isAutoPlayPaused.current = true; }}
      onMouseLeave={() => { isAutoPlayPaused.current = false; }}
      onFocusCapture={() => { isAutoPlayPaused.current = true; }}
      onBlurCapture={() => { isAutoPlayPaused.current = false; }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
    >
      {/* 1. Cinematic Cross-Dissolving Backdrops Layer */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
        {displayItems.map((featured, idx) => {
          const isCurrent = idx === currentIndex;
          const isNearby = Math.abs(idx - currentIndex) <= 1 || (idx === 0 && currentIndex === totalItems - 1) || (idx === totalItems - 1 && currentIndex === 0);
          const backdropUrl = tmdbImages.backdrop(featured.backdrop_path, isPerfMode ? 'w780' : 'w1280');

          return (
            <div
              key={featured.id}
              className={`absolute inset-0 transition-opacity duration-700 ease-in-out transform-gpu will-change-[opacity] ${
                isCurrent ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
              }`}
              style={{
                contentVisibility: isNearby ? 'visible' : 'hidden'
              }}
            >
              <img
                src={backdropUrl}
                alt={featured.title || featured.name || 'Hero Backdrop'}
                draggable={false}
                loading={idx === 0 ? 'eager' : 'lazy'}
                decoding="async"
                onError={(e) => tmdbImages.handleImgError(e, true)}
                className={`w-full h-full object-cover object-center transition-transform duration-1000 ease-out ${
                  isCurrent ? 'scale-100' : 'scale-105'
                }`}
              />
            </div>
          );
        })}
      </div>

      {/* 2. Permanent Static Cinematic HBO Gradients Layer (Zero Seam Flickering) */}
      <div className="absolute inset-0 z-20 pointer-events-none select-none">
        <div className="absolute inset-0 hero-gradient-overlay" />
        <div className="absolute inset-0 hero-side-gradient hidden sm:block" />
        <div className="absolute inset-0 bg-gradient-to-t from-transparent via-transparent to-black/40" />
      </div>

      {/* 3. Staggered Content Animation Layer (Meta -> Title -> Overview -> Buttons) */}
      <div
        key={`hero-content-${currentFeatured.id}-${currentIndex}`}
        className="relative z-30 h-full w-full px-6 sm:px-12 flex flex-col justify-end pb-12 sm:pb-16 max-w-3xl"
      >
        {/* Brand Tag & Meta (0ms delay) */}
        <div className="flex items-center gap-2.5 mb-2 flex-wrap animate-hero-badge">
          <span className="px-2.5 py-0.5 rounded-full bg-hbo-purple/90 border border-hbo-purple-light text-white text-xs font-bold uppercase tracking-wider">
            {mediaType === 'movie' ? 'FILM' : 'SERIES'}
          </span>
          <RatingBadge score={currentFeatured.vote_average} size="md" />
          <span className="text-sm font-medium text-gray-300">{releaseYear}</span>
        </div>

        {/* Scaled Refined Title (60ms delay) */}
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black font-display text-white tracking-tight leading-snug mb-2 drop-shadow-md line-clamp-2 animate-hero-title">
          {title}
        </h1>

        {/* Overview Synopsis (120ms delay) */}
        <p className="text-xs sm:text-sm text-gray-300 line-clamp-3 mb-4 max-w-xl leading-relaxed drop-shadow-sm animate-hero-overview">
          {currentFeatured.overview}
        </p>

        {/* Vertical Action Buttons Stack (180ms delay) */}
        <div className="flex flex-col gap-2.5 w-fit animate-hero-buttons">
          <Link
            to={`/watch/${mediaType}/${currentFeatured.id}`}
            data-hero-btn="play"
            data-hero-index={currentIndex}
            tabIndex={0}
            onClick={(e) => {
              e.preventDefault();
              navigate(`/watch/${mediaType}/${currentFeatured.id}`);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                navigate(`/watch/${mediaType}/${currentFeatured.id}`);
              }
            }}
            className="flex items-center gap-2 px-5 sm:px-6 py-2.5 rounded-xl bg-gradient-to-r from-hbo-purple to-hbo-cyan text-white font-bold text-xs sm:text-sm shadow-hbo-glow hover:scale-105 transition-all tv-focus-target"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Watch Now</span>
          </Link>

          <Link
            to={`/details/${mediaType}/${currentFeatured.id}`}
            data-hero-btn="details"
            data-hero-index={currentIndex}
            tabIndex={0}
            onClick={(e) => {
              e.preventDefault();
              navigate(`/details/${mediaType}/${currentFeatured.id}`);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                navigate(`/details/${mediaType}/${currentFeatured.id}`);
              }
            }}
            className="flex items-center gap-2 px-4 sm:px-5 py-2 rounded-xl bg-white/20 hover:bg-white/30 text-white font-semibold text-xs sm:text-sm border border-white/25 transition-all hover:scale-105 tv-focus-target"
          >
            <Info className="w-4 h-4" />
            <span>Details</span>
          </Link>
        </div>
      </div>

      {/* 4. Slide Indicators with Glowing Active Pill */}
      <div className="absolute bottom-4 left-4 sm:left-12 z-40 flex items-center gap-2">
        {displayItems.map((_, idx) => (
          <button
            key={idx}
            onClick={() => {
              trigger5sRemotePause();
              setCurrentIndex(idx);
            }}
            className={`h-1.5 rounded-full transition-all duration-500 ${
              idx === currentIndex
                ? 'w-8 bg-gradient-to-r from-hbo-purple to-hbo-cyan shadow-[0_0_8px_rgba(144,85,255,0.8)]'
                : 'w-2 bg-white/30 hover:bg-white/50'
            }`}
            aria-label={`Slide ${idx + 1}`}
          />
        ))}
      </div>
    </div>
  );
};
