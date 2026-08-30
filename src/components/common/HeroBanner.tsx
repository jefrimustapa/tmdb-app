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

  if (totalItems === 0) return null;

  return (
    <div
      ref={bannerRef}
      data-hero-banner="true"
      data-total-slides={totalItems}
      className="relative w-full h-[65vh] sm:h-[75vh] min-h-[460px] max-h-[750px] overflow-hidden bg-hbo-dark select-none"
      onKeyDownCapture={trigger5sRemotePause}
      onMouseEnter={() => { isAutoPlayPaused.current = true; }}
      onMouseLeave={() => { isAutoPlayPaused.current = false; }}
      onFocusCapture={() => { isAutoPlayPaused.current = true; }}
      onBlurCapture={() => { isAutoPlayPaused.current = false; }}
    >
      {/* Continuous Full-Width Sliding Track */}
      <div
        className="flex h-full transition-transform duration-700 ease-out transform-gpu"
        style={{
          width: `${totalItems * 100}%`,
          transform: `translate3d(-${(currentIndex * 100) / totalItems}%, 0, 0)`
        }}
      >
        {displayItems.map((featured, idx) => {
          const title = featured.title || featured.name || 'Featured Title';
          const releaseDate = featured.release_date || featured.first_air_date;
          const releaseYear = releaseDate ? new Date(releaseDate).getFullYear() : '';
          const mediaType: 'movie' | 'tv' = featured.media_type === 'tv' ? 'tv' : 'movie';
          const backdropUrl = tmdbImages.backdrop(featured.backdrop_path, isPerfMode ? 'w780' : 'original');

          return (
            <div
              key={featured.id}
              style={{ width: `${100 / totalItems}%` }}
              className="h-full relative flex-shrink-0 overflow-hidden"
            >
              {/* Background Backdrop Image */}
              <div className="absolute inset-0 select-none pointer-events-none">
                <img
                  src={backdropUrl}
                  alt={title}
                  draggable={false}
                  loading={idx === 0 ? 'eager' : 'lazy'}
                  decoding="async"
                  onError={(e) => tmdbImages.handleImgError(e, true)}
                  className="w-full h-full object-cover object-center pointer-events-none"
                />
                {/* Cinematic HBO Gradients */}
                <div className="absolute inset-0 hero-gradient-overlay" />
                <div className="absolute inset-0 hero-side-gradient hidden sm:block" />
              </div>

              {/* Hero Content Overlay (Left Aligned) */}
              <div className="relative z-10 h-full w-full px-6 sm:px-12 flex flex-col justify-end pb-12 sm:pb-16 max-w-3xl">
                {/* Brand Tag & Meta */}
                <div className="flex items-center gap-2.5 mb-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full bg-hbo-purple/60 border border-hbo-purple-light text-white text-xs font-bold uppercase tracking-wider backdrop-blur-md">
                    {mediaType === 'movie' ? 'FILM' : 'SERIES'}
                  </span>
                  <RatingBadge score={featured.vote_average} size="md" />
                  <span className="text-sm font-medium text-gray-300">{releaseYear}</span>
                </div>

                {/* Scaled Refined Title */}
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black font-display text-white tracking-tight leading-snug mb-2 drop-shadow-lg line-clamp-2">
                  {title}
                </h1>

                {/* Overview */}
                <p className="text-xs sm:text-sm text-gray-300 line-clamp-3 mb-4 max-w-xl leading-relaxed drop-shadow-md">
                  {featured.overview}
                </p>

                {/* Vertical Action Buttons Stack */}
                <div className="flex flex-col gap-2.5 w-fit">
                  <Link
                    to={`/watch/${mediaType}/${featured.id}`}
                    data-hero-btn="play"
                    data-hero-index={idx}
                    tabIndex={idx === currentIndex ? 0 : -1}
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
                    className="flex items-center gap-2 px-5 sm:px-6 py-2.5 rounded-xl bg-gradient-to-r from-hbo-purple to-hbo-cyan text-white font-bold text-xs sm:text-sm shadow-hbo-glow hover:scale-105 transition-all tv-focus-target"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>Watch Now</span>
                  </Link>

                  <Link
                    to={`/details/${mediaType}/${featured.id}`}
                    data-hero-btn="details"
                    data-hero-index={idx}
                    tabIndex={idx === currentIndex ? 0 : -1}
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
                    className="flex items-center gap-2 px-4 sm:px-5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white font-semibold text-xs sm:text-sm backdrop-blur-md border border-white/20 transition-all hover:scale-105 tv-focus-target"
                  >
                    <Info className="w-4 h-4" />
                    <span>Details</span>
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Slide Indicators */}
      <div className="absolute bottom-4 left-4 sm:left-12 z-20 flex items-center gap-2">
        {displayItems.map((_, idx) => (
          <button
            key={idx}
            onClick={() => {
              isAutoPlayPaused.current = true;
              setCurrentIndex(idx);
            }}
            className={`h-1.5 rounded-full transition-all duration-500 ${
              idx === currentIndex ? 'w-8 bg-gradient-to-r from-hbo-purple to-hbo-cyan' : 'w-2 bg-white/30'
            }`}
            aria-label={`Slide ${idx + 1}`}
          />
        ))}
      </div>
    </div>
  );
};
