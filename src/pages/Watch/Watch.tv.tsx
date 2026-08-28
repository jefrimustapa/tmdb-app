import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { tmdbApi } from '../../services/tmdb';
import type { TMDBMovieDetails, TMDBTVDetails } from '../../types/tmdb';
import { VideoPlayer } from '../../components/player/VideoPlayer';
import { ProviderPickerTV } from '../../components/player/ProviderPickerTV';
import { TVVirtualCursor } from '../../components/player/TVVirtualCursor';
import { dbService } from '../../services/db';
import { ArrowLeft } from 'lucide-react';

import type { VirtualCursorStyle } from '../../types/db';

export const Watch: React.FC = () => {
  const { type, id } = useParams<{ type: 'movie' | 'tv'; id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const seasonParam = parseInt(searchParams.get('s') || '1', 10);
  const episodeParam = parseInt(searchParams.get('e') || '1', 10);

  const [details, setDetails] = useState<TMDBMovieDetails | TMDBTVDetails | null>(null);
  const [providerId, setProviderId] = useState('vidlink');
  const [isLoading, setIsLoading] = useState(true);

  const [cursorActive, setCursorActive] = useState(false);
  const [cursorSettings, setCursorSettings] = useState<{
    enabled: boolean;
    clicks: 2 | 3;
    timeout: number;
    speed: 'slow' | 'normal' | 'fast';
    style: VirtualCursorStyle;
  }>({
    enabled: true,
    clicks: 2,
    timeout: 10,
    speed: 'normal',
    style: 'cyan_glow'
  });

  const tmdbId = parseInt(id || '0', 10);
  const mediaType = (type === 'tv' ? 'tv' : 'movie') as 'movie' | 'tv';

  // Load default user settings for preferred provider and virtual cursor
  useEffect(() => {
    dbService.getSettings().then((s) => {
      if (s) {
        if (s.preferredProvider) setProviderId(s.preferredProvider);
        if (s.streamHeaderTimeout !== undefined) setHeaderTimeoutSeconds(s.streamHeaderTimeout);
        setCursorSettings({
          enabled: s.virtualCursorEnabled ?? true,
          clicks: s.virtualCursorClicks ?? 2,
          timeout: s.virtualCursorTimeout ?? 10,
          speed: s.virtualCursorSpeed ?? 'normal',
          style: s.virtualCursorStyle ?? 'cyan_glow'
        });
      }
    });
  }, []);

  useEffect(() => {
    if (!tmdbId) return;

    const fetchDetails = async () => {
      setIsLoading(true);
      try {
        if (mediaType === 'movie') {
          const res = await tmdbApi.getMovieDetails(tmdbId);
          setDetails(res);
        } else {
          const res = await tmdbApi.getTVDetails(tmdbId);
          setDetails(res);
        }
      } catch (err) {
        console.error('Failed to load video details:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDetails();
  }, [tmdbId, mediaType]);

  const [isProbing, setIsProbing] = useState(false);
  const [serverIndex, setServerIndex] = useState(1);
  const [headerVisible, setHeaderVisible] = useState(true);
  const [headerTimeoutSeconds, setHeaderTimeoutSeconds] = useState(5);
  const [isPortrait, setIsPortrait] = useState(() => window.innerHeight > window.innerWidth);
  const hideTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dynamically track portrait vs landscape across orientation changes and window resizes
  useEffect(() => {
    const handleOrientation = () => {
      setIsPortrait(window.innerHeight >= window.innerWidth);
    };
    window.addEventListener('resize', handleOrientation);
    window.addEventListener('orientationchange', handleOrientation);
    window.addEventListener('tmdb_fullscreen_changed', (e: any) => {
      if (e.detail?.fullscreen) {
        setIsPortrait(false);
      } else {
        handleOrientation();
      }
    });
    return () => {
      window.removeEventListener('resize', handleOrientation);
      window.removeEventListener('orientationchange', handleOrientation);
    };
  }, []);

  // Load user settings for preferred provider and header auto-hide timeout
  useEffect(() => {
    dbService.getSettings().then((s) => {
      const initialProvider = s?.topProviders?.[0] || s?.preferredProvider;
      if (initialProvider) setProviderId(initialProvider);
      if (s?.streamHeaderTimeout !== undefined) {
        setHeaderTimeoutSeconds(s.streamHeaderTimeout);
      }
    });
  }, []);

  const resetHeaderTimer = React.useCallback(() => {
    setHeaderVisible(true);

    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }

    if (headerTimeoutSeconds > 0) {
      hideTimerRef.current = setTimeout(() => {
        setHeaderVisible(false);
        window.dispatchEvent(new CustomEvent('tmdb_close_dropdowns'));

        (window as any).__tmdbHeaderFocused = false;
        if (document.activeElement && (document.activeElement.tagName === 'BUTTON' || (document.activeElement as HTMLElement).dataset?.watchHeaderItem === 'true')) {
          (document.activeElement as HTMLElement).blur();
        }
        const iframe = document.querySelector<HTMLIFrameElement>('iframe');
        if (iframe) {
          try {
            iframe.focus();
          } catch {}
        }
      }, headerTimeoutSeconds * 1000);
    }
  }, [headerTimeoutSeconds]);

  // Robust exit watch navigation that cannot be trapped by iframe history
  const handleExitWatch = React.useCallback(() => {
    const targetId = id || details?.id;
    if (mediaType && targetId) {
      navigate(`/details/${mediaType}/${targetId}`, { replace: true });
    } else {
      navigate('/', { replace: true });
    }
  }, [navigate, mediaType, id, details?.id]);

  useEffect(() => {
    const onExitWatch = () => handleExitWatch();
    const onShowHeaderFocusBack = () => {
      setHeaderVisible(true);
      (window as any).__tmdbHeaderFocused = true;
      resetHeaderTimer();
      setTimeout(() => {
        const backBtn = document.getElementById('watch-back-btn') || document.querySelector<HTMLElement>('[data-watch-back="true"]');
        if (backBtn) {
          backBtn.focus();
        }
      }, 30);
    };

    window.addEventListener('tmdb_exit_watch', onExitWatch);
    window.addEventListener('tmdb_show_header_focus_back', onShowHeaderFocusBack);
    (window as any).tmdbExitWatch = handleExitWatch;
    (window as any).__tmdbHeaderFocused = false;
    return () => {
      window.removeEventListener('tmdb_exit_watch', onExitWatch);
      window.removeEventListener('tmdb_show_header_focus_back', onShowHeaderFocusBack);
      delete (window as any).tmdbExitWatch;
      delete (window as any).__tmdbHeaderFocused;
    };
  }, [handleExitWatch, resetHeaderTimer]);

  // Global TV key listener for header navigation
  useEffect(() => {
    const handleTVHeaderNav = (e: KeyboardEvent) => {
      const backBtn = document.getElementById('watch-back-btn');
      const trigger = document.getElementById('watch-provider-trigger');
      if (e.key === 'ArrowRight' && (document.activeElement === backBtn || (window as any).__tmdbHeaderFocused)) {
        if (trigger) {
          e.preventDefault();
          trigger.focus();
        }
      } else if (e.key === 'ArrowLeft' && document.activeElement === trigger) {
        if (backBtn) {
          e.preventDefault();
          backBtn.focus();
        }
      }
    };

    window.addEventListener('keydown', handleTVHeaderNav, true);
    return () => window.removeEventListener('keydown', handleTVHeaderNav, true);
  }, []);

  // Multi-press OK listener for TV Virtual Cursor activation/toggle
  const okPressCountRef = React.useRef(0);
  const okPressTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleGlobalOkPress = (e: KeyboardEvent) => {
      if (!cursorSettings.enabled) return;
      if (e.key === 'Enter' || e.key === 'Select') {
        const header = document.querySelector('[data-watch-header="true"]');
        const isHeaderFocused = !!(window as any).__tmdbHeaderFocused || (header && header.contains(document.activeElement));
        
        // Only detect multi-press OK when focus is on player area / iframe
        if (!isHeaderFocused) {
          okPressCountRef.current += 1;
          if (okPressTimerRef.current) clearTimeout(okPressTimerRef.current);
          okPressTimerRef.current = setTimeout(() => {
            okPressCountRef.current = 0;
          }, 450);

          if (okPressCountRef.current >= cursorSettings.clicks) {
            okPressCountRef.current = 0;
            if (okPressTimerRef.current) clearTimeout(okPressTimerRef.current);
            setCursorActive((prev) => !prev);
          }
        }
      }
    };

    const handleCloseCursor = () => {
      console.log('[TMDB Streamer] tmdb_close_cursor received');
      setCursorActive(false);
    };
    const handleToggleCursor = () => {
      console.log('[TMDB Streamer] tmdb_toggle_cursor received, enabled:', cursorSettings.enabled);
      if (cursorSettings.enabled) {
        setCursorActive((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleGlobalOkPress, true);
    window.addEventListener('tmdb_close_cursor', handleCloseCursor);
    window.addEventListener('tmdb_toggle_cursor', handleToggleCursor);

    return () => {
      window.removeEventListener('keydown', handleGlobalOkPress, true);
      window.removeEventListener('tmdb_close_cursor', handleCloseCursor);
      window.removeEventListener('tmdb_toggle_cursor', handleToggleCursor);
      if (okPressTimerRef.current) clearTimeout(okPressTimerRef.current);
    };
  }, [cursorSettings]);

  // Notify native Android bridge that Watch page is active
  useEffect(() => {
    try {
      if (typeof (window as any).AndroidBridge?.setWatchPage === 'function') {
        (window as any).AndroidBridge.setWatchPage(true);
      }
    } catch {}
    return () => {
      try {
        if (typeof (window as any).AndroidBridge?.setWatchPage === 'function') {
          (window as any).AndroidBridge.setWatchPage(false);
        }
      } catch {}
    };
  }, []);

  const lastMousePosRef = React.useRef({ x: -1, y: -1 });

  useEffect(() => {
    const handleKeyOrTouch = () => {
      resetHeaderTimer();
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (
        lastMousePosRef.current.x === -1 ||
        Math.abs(e.clientX - lastMousePosRef.current.x) > 3 ||
        Math.abs(e.clientY - lastMousePosRef.current.y) > 3
      ) {
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
        resetHeaderTimer();
      }
    };

    // Genuine user input listeners
    window.addEventListener('keydown', handleKeyOrTouch, true);
    window.addEventListener('touchstart', handleKeyOrTouch, true);
    window.addEventListener('click', handleKeyOrTouch, true);
    window.addEventListener('mousemove', handleMouseMove, true);
    window.addEventListener('tmdb_screen_touched', handleKeyOrTouch);
    window.addEventListener('tmdb_user_action', handleKeyOrTouch);

    resetHeaderTimer();

    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      window.removeEventListener('keydown', handleKeyOrTouch, true);
      window.removeEventListener('touchstart', handleKeyOrTouch, true);
      window.removeEventListener('click', handleKeyOrTouch, true);
      window.removeEventListener('mousemove', handleMouseMove, true);
      window.removeEventListener('tmdb_screen_touched', handleKeyOrTouch);
      window.removeEventListener('tmdb_user_action', handleKeyOrTouch);
    };
  }, [resetHeaderTimer]);

  if (isLoading || !details) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-hbo-dark">
        <div className="w-12 h-12 border-4 border-hbo-purple border-t-hbo-cyan rounded-full animate-spin shadow-hbo-glow mb-4" />
        <h2 className="text-sm font-bold font-display text-white tracking-widest">LOADING STREAM...</h2>
      </div>
    );
  }

  const title = details.title || details.name;
  const releaseYear = (details.release_date || details.first_air_date || '').split('-')[0];
  const episodeLabel = mediaType === 'tv' ? `S${seasonParam}E${episodeParam}` : null;

  return (
    <div
      className="relative w-screen h-screen min-h-screen bg-black overflow-hidden flex flex-col justify-start select-none"
      onClick={resetHeaderTimer}
      onTouchStart={resetHeaderTimer}
      onMouseMove={resetHeaderTimer}
    >
      {/* Stream Player Area with Overlay Header */}
      <div className="relative w-full h-full flex-1 bg-black overflow-hidden group">
        {/* Overlay Top Header Nav: Back Button (icon only), Title stacked with [S1E1] underneath, Provider Switcher & HUD */}
        <div
          data-watch-header="true"
          className={`absolute top-0 left-0 right-0 z-40 flex items-center justify-between gap-3 px-3 sm:px-6 pt-[max(0.75rem,env(safe-area-inset-top,1.75rem))] pb-5 bg-gradient-to-b from-black/95 via-black/60 to-transparent transition-all duration-300 pointer-events-auto ${
            headerVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'
          }`}
        >
          {/* Left: Back Button Icon Only + Title with [S1E1] underneath */}
          <div className="flex items-center gap-3 min-w-0 flex-1 mr-2">
            <button
              onClick={handleExitWatch}
              id="watch-back-btn"
              data-watch-back="true"
              data-watch-header-item="true"
              aria-label="Back"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight') {
                  e.preventDefault();
                  const trigger = document.getElementById('watch-provider-trigger');
                  if (trigger) {
                    trigger.focus();
                  }
                } else if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  (window as any).__tmdbHeaderFocused = false;
                  setHeaderVisible(false);
                  (document.getElementById('watch-back-btn') as HTMLElement)?.blur();
                  const iframe = document.querySelector<HTMLIFrameElement>('iframe');
                  if (iframe) {
                    try { iframe.focus(); } catch {}
                  }
                }
              }}
              className="p-2.5 rounded-full bg-black/70 hover:bg-black text-white border border-white/20 backdrop-blur-md transition hover:scale-110 flex-shrink-0 tv-focus-target focus:outline-none focus:border-hbo-cyan focus:ring-2 focus:ring-hbo-cyan"
              title="Go Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <div className="flex flex-col min-w-0 flex-1">
              <h1 className="text-sm sm:text-base md:text-lg font-black font-display text-white tracking-tight drop-shadow-md truncate max-w-[220px] sm:max-w-md">
                {title}
              </h1>
              {episodeLabel && (
                <span className="inline-block mt-0.5 px-2 py-0.5 rounded bg-hbo-purple text-hbo-cyan border border-hbo-cyan/30 text-[10px] sm:text-xs font-black tracking-wider uppercase flex-shrink-0 shadow-sm w-max">
                  {episodeLabel}
                </span>
              )}
            </div>
          </div>

          {/* Right: Quick Provider Switcher Dropdown & In-Header Probing HUD */}
          <div className="flex-shrink-0">
            <ProviderPickerTV
              currentProviderId={providerId}
              onSelect={(p) => setProviderId(p.id)}
              compact={true}
              isProbing={isProbing}
              serverIndex={serverIndex}
            />
          </div>
        </div>

        {/* Video Player (Full Viewport with dynamic bottom safe area offset in portrait) */}
        <div className={`absolute top-0 left-0 right-0 w-full z-10 ${isPortrait ? 'bottom-20' : 'bottom-0'}`}>
          <VideoPlayer
            mediaType={mediaType}
            tmdbId={tmdbId}
            title={title || ''}
            posterPath={details.poster_path}
            backdropPath={details.backdrop_path}
            voteAverage={details.vote_average}
            season={seasonParam}
            episode={episodeParam}
            providerId={providerId}
            onProviderChange={(p) => setProviderId(p.id)}
            onProbingStatusChange={(probing, idx) => {
              setIsProbing(probing);
              setServerIndex(idx);
            }}
          />
        </div>

        {/* TV Virtual On-Demand Cursor */}
        <TVVirtualCursor
          active={cursorActive}
          onClose={() => setCursorActive(false)}
          speed={cursorSettings.speed}
          timeoutSeconds={cursorSettings.timeout}
          cursorStyle={cursorSettings.style}
        />
      </div>
    </div>
  );
};

