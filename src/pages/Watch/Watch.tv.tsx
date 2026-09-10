import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { tmdbApi } from '../../services/tmdb';
import type { TMDBMovieDetails, TMDBTVDetails, TMDBSeasonDetails } from '../../types/tmdb';
import { VideoPlayer } from '../../components/player/VideoPlayer';
import { ProviderPickerTV } from '../../components/player/ProviderPickerTV';
import { TVVirtualCursor } from '../../components/player/TVVirtualCursor';
import { dbService } from '../../services/db';
import { isAnimeMedia } from '../../services/animeMappingService';
import { isAseanMedia, isKoreanMedia } from '../../services/lk21MappingService';
import { ArrowLeft, SkipForward, SkipBack } from 'lucide-react';

import type { VirtualCursorStyle } from '../../types/db';

export const Watch: React.FC = () => {
  const { type, id } = useParams<{ type: 'movie' | 'tv'; id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const seasonParam = parseInt(searchParams.get('s') || '1', 10);
  const episodeParam = parseInt(searchParams.get('e') || '1', 10);
  const timestampParam = searchParams.has('t') ? parseInt(searchParams.get('t') || '0', 10) : undefined;

  const [details, setDetails] = useState<TMDBMovieDetails | TMDBTVDetails | null>(null);
  const [seasonDetails, setSeasonDetails] = useState<TMDBSeasonDetails | null>(null);
  const [providerId, setProviderId] = useState('vidlink');
  const [userSelectedProvider, setUserSelectedProvider] = useState(false);
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
    style: 'hbo_max'
  });

  const tmdbId = parseInt(id || '0', 10);
  const mediaType = (type === 'tv' ? 'tv' : 'movie') as 'movie' | 'tv';

  const [enabledResolvers, setEnabledResolvers] = useState<('embed' | 'private_extractor' | 'torbox')[]>(['embed']);

  const isKorean = useMemo(() => isKoreanMedia(details), [details]);
  const isAnime = useMemo(() => isAnimeMedia(details), [details]);
  const isAsian = useMemo(() => isAseanMedia(details), [details]);

  const [isProbing, setIsProbing] = useState(false);
  const [serverIndex, setServerIndex] = useState(1);
  const [headerVisible, setHeaderVisible] = useState(true);
  const [headerTimeoutSeconds, setHeaderTimeoutSeconds] = useState(5);
  const headerTimeoutRef = React.useRef(5);
  const [isPortrait, setIsPortrait] = useState(() => window.innerHeight > window.innerWidth);
  const hideTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetHeaderTimer = React.useCallback(() => {
    setHeaderVisible(true);

    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }

    const timeoutSec = headerTimeoutRef.current;
    if (timeoutSec === 0) return;

    const delayMs = (timeoutSec > 0 ? timeoutSec : 5) * 1000;
    hideTimerRef.current = setTimeout(() => {
      const isDropdownOpen = !!document.querySelector('[data-provider-dropdown-open="true"]');
      if (isDropdownOpen) {
        resetHeaderTimer();
        return;
      }

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
    }, delayMs);
  }, []);

  // Parallelized initial load: TMDB details, TV season details, and DB settings all fetched together
  useEffect(() => {
    if (!tmdbId) return;

    let isMounted = true;
    setIsLoading(true);

    const detailsPromise = mediaType === 'movie'
      ? tmdbApi.getMovieDetails(tmdbId)
      : tmdbApi.getTVDetails(tmdbId);

    const seasonPromise = mediaType === 'tv'
      ? tmdbApi.getSeasonDetails(tmdbId, seasonParam).catch(() => null)
      : Promise.resolve(null);

    const settingsPromise = dbService.getSettings().catch(() => null);

    Promise.all([detailsPromise, seasonPromise, settingsPromise])
      .then(([fetchedDetails, fetchedSeason, s]) => {
        if (!isMounted) return;

        if (fetchedDetails) setDetails(fetchedDetails);
        if (fetchedSeason) setSeasonDetails(fetchedSeason);

        if (s) {
          if (!userSelectedProvider) {
            const koreanFlag = isKoreanMedia(fetchedDetails);
            const animeFlag = isAnimeMedia(fetchedDetails);
            const asianFlag = isAseanMedia(fetchedDetails);
            const defaultProvider = koreanFlag
              ? (s.topKoreanProviders?.[0] || 'kisskh-kdrama')
              : asianFlag
              ? (s.topAsianProviders?.[0] || 'vidlink')
              : animeFlag
              ? (s.topAnimeProviders?.[0] || 'megaplay-anime')
              : (s.topProviders?.[0] || s.preferredProvider || 'vidlink');
            setProviderId(defaultProvider);
          }
          if (s.streamHeaderTimeout !== undefined) {
            setHeaderTimeoutSeconds(s.streamHeaderTimeout);
            headerTimeoutRef.current = s.streamHeaderTimeout;
          }
          if (s.enabledResolvers && s.enabledResolvers.length > 0) {
            setEnabledResolvers(s.enabledResolvers);
          }
          setCursorSettings({
            enabled: s.virtualCursorEnabled ?? true,
            clicks: s.virtualCursorClicks ?? 2,
            timeout: s.virtualCursorTimeout ?? 10,
            speed: s.virtualCursorSpeed ?? 'normal',
            style: s.virtualCursorStyle ?? 'hbo_max'
          });
        }
        resetHeaderTimer();
      })
      .catch((err) => {
        console.error('Failed to load watch page data in parallel:', err);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [tmdbId, mediaType, seasonParam, userSelectedProvider, resetHeaderTimer]);

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

    const onResetHeaderTimer = () => {
      resetHeaderTimer();
    };
    const onHideHeaderFocusPlayer = () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      setHeaderVisible(false);
      window.dispatchEvent(new CustomEvent('tmdb_close_dropdowns'));
      (window as any).__tmdbHeaderFocused = false;
      if (document.activeElement && typeof (document.activeElement as HTMLElement).blur === 'function') {
        (document.activeElement as HTMLElement).blur();
      }
      const iframe = document.querySelector<HTMLIFrameElement>('iframe');
      if (iframe) {
        try { iframe.focus(); } catch {}
      }
    };

    window.addEventListener('tmdb_exit_watch', onExitWatch);
    window.addEventListener('tmdb_show_header_focus_back', onShowHeaderFocusBack);
    window.addEventListener('tmdb_reset_header_timer', onResetHeaderTimer);
    window.addEventListener('tmdb_hide_header_and_focus_player', onHideHeaderFocusPlayer);
    (window as any).tmdbExitWatch = handleExitWatch;
    (window as any).__tmdbHeaderFocused = false;
    return () => {
      window.removeEventListener('tmdb_exit_watch', onExitWatch);
      window.removeEventListener('tmdb_show_header_focus_back', onShowHeaderFocusBack);
      window.removeEventListener('tmdb_reset_header_timer', onResetHeaderTimer);
      window.removeEventListener('tmdb_hide_header_and_focus_player', onHideHeaderFocusPlayer);
      delete (window as any).tmdbExitWatch;
      delete (window as any).__tmdbHeaderFocused;
    };
  }, [handleExitWatch, resetHeaderTimer]);

  // Global TV key listener for header navigation
  useEffect(() => {
    const handleTVHeaderNav = (e: KeyboardEvent) => {
      // If dropdown is open, let the dropdown handle its own navigation
      if (document.querySelector('[data-provider-dropdown-open="true"]')) {
        return;
      }
      const backBtn = document.getElementById('watch-back-btn');
      const prevBtn = document.getElementById('watch-prev-ep-btn');
      const nextBtn = document.getElementById('watch-next-ep-btn');
      const trigger = document.getElementById('watch-provider-trigger');

      const currentActive = document.activeElement;
      const isHeaderActive = currentActive === backBtn || 
                             currentActive === prevBtn || 
                             currentActive === nextBtn || 
                             currentActive === trigger;

      if (!isHeaderActive) return;

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (currentActive === backBtn) {
          if (trigger) trigger.focus();
        } else if (currentActive === prevBtn) {
          if (nextBtn) nextBtn.focus();
          else if (trigger) trigger.focus();
        } else if (currentActive === nextBtn) {
          if (trigger) trigger.focus();
        }
        resetHeaderTimer();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (currentActive === trigger) {
          if (nextBtn) nextBtn.focus();
          else if (prevBtn) prevBtn.focus();
          else if (backBtn) backBtn.focus();
        } else if (currentActive === nextBtn) {
          if (prevBtn) prevBtn.focus();
          else if (backBtn) backBtn.focus();
        } else if (currentActive === prevBtn) {
          if (backBtn) backBtn.focus();
        }
        resetHeaderTimer();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (currentActive === backBtn) {
          if (prevBtn) prevBtn.focus();
          else if (nextBtn) nextBtn.focus();
          else window.dispatchEvent(new CustomEvent('tmdb_hide_header_and_focus_player'));
        } else if (currentActive === trigger) {
          if (nextBtn) nextBtn.focus();
          else if (prevBtn) prevBtn.focus();
          else window.dispatchEvent(new CustomEvent('tmdb_hide_header_and_focus_player'));
        } else {
          // Already in row 2 (prevBtn or nextBtn)
          window.dispatchEvent(new CustomEvent('tmdb_hide_header_and_focus_player'));
        }
        resetHeaderTimer();
      } else if (e.key === 'ArrowUp') {
        if (currentActive === prevBtn || currentActive === nextBtn) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          if (currentActive === prevBtn && backBtn) {
            backBtn.focus();
          } else if (currentActive === nextBtn && trigger) {
            trigger.focus();
          } else if (backBtn) {
            backBtn.focus();
          }
          resetHeaderTimer();
        }
      }
    };

    window.addEventListener('keydown', handleTVHeaderNav, true);
    return () => window.removeEventListener('keydown', handleTVHeaderNav, true);
  }, [resetHeaderTimer]);

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
    resetHeaderTimer();

    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };
  }, [resetHeaderTimer]);

  const currentEpisode = mediaType === 'tv' && seasonDetails
    ? seasonDetails.episodes?.find((e) => e.episode_number === episodeParam)
    : null;

  const nextEpisodeInfo = React.useMemo(() => {
    if (mediaType !== 'tv' || !details) return null;
    const tvDetails = details as TMDBTVDetails;

    // 1. Next episode in the same season
    if (seasonDetails && seasonDetails.episodes) {
      const nextInSeason = seasonDetails.episodes.find((e) => e.episode_number === episodeParam + 1);
      if (nextInSeason) {
        return {
          season: seasonParam,
          episode: episodeParam + 1,
          title: nextInSeason.name,
          stillPath: nextInSeason.still_path
        };
      }
    }

    // 2. Season rollover (e.g. S1 E10 -> S2 E1)
    if (tvDetails.number_of_seasons && seasonParam < tvDetails.number_of_seasons) {
      return {
        season: seasonParam + 1,
        episode: 1,
        title: 'Season Premiere',
        stillPath: null
      };
    }

    return null;
  }, [mediaType, details, seasonDetails, seasonParam, episodeParam]);

  const prevEpisodeInfo = React.useMemo(() => {
    if (mediaType !== 'tv' || !details) return null;

    // 1. Previous episode in the same season
    if (episodeParam > 1) {
      const prevInSeason = seasonDetails?.episodes?.find((e) => e.episode_number === episodeParam - 1);
      return {
        season: seasonParam,
        episode: episodeParam - 1,
        title: prevInSeason?.name,
        stillPath: prevInSeason?.still_path || null
      };
    }

    // 2. Previous season (e.g. S2 E1 -> S1)
    if (seasonParam > 1) {
      return {
        season: seasonParam - 1,
        episode: 1,
        title: 'Previous Season',
        stillPath: null
      };
    }

    return null;
  }, [mediaType, details, seasonDetails, seasonParam, episodeParam]);

  const handleNextEpisode = React.useCallback(() => {
    if (!nextEpisodeInfo) return;
    navigate(`/watch/tv/${tmdbId}?s=${nextEpisodeInfo.season}&e=${nextEpisodeInfo.episode}`, { replace: true });
  }, [nextEpisodeInfo, navigate, tmdbId]);

  const handlePrevEpisode = React.useCallback(() => {
    if (!prevEpisodeInfo) return;
    navigate(`/watch/tv/${tmdbId}?s=${prevEpisodeInfo.season}&e=${prevEpisodeInfo.episode}`, { replace: true });
  }, [prevEpisodeInfo, navigate, tmdbId]);

  // Dim-fade the episode title only when it extends past the horizontal centre of the screen.
  // Must live here (before any early return) to satisfy Rules of Hooks.
  const episodeTitleRef = useRef<HTMLSpanElement>(null);
  const [episodeTitleOverflows, setEpisodeTitleOverflows] = useState(false);
  const checkEpisodeTitleOverflow = useCallback(() => {
    if (!episodeTitleRef.current) return;
    setEpisodeTitleOverflows(episodeTitleRef.current.getBoundingClientRect().right > window.innerWidth / 2);
  }, []);
  useEffect(() => {
    checkEpisodeTitleOverflow();
    const ro = new ResizeObserver(checkEpisodeTitleOverflow);
    if (episodeTitleRef.current) ro.observe(episodeTitleRef.current);
    window.addEventListener('resize', checkEpisodeTitleOverflow);
    return () => { ro.disconnect(); window.removeEventListener('resize', checkEpisodeTitleOverflow); };
  }, [checkEpisodeTitleOverflow, currentEpisode?.name]);

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
  const episodeLabel = mediaType === 'tv' ? `S${seasonParam}:E${episodeParam}` : null;

  return (
    <div
      className="relative w-screen h-screen min-h-screen bg-black overflow-hidden flex flex-col justify-start select-none"
    >
      {/* Stream Player Area with Overlay Header */}
      <div className="relative w-full h-full flex-1 bg-black overflow-hidden group">
        {/* Overlay Top Header Nav: Row 1 (Back + Center-aligned Title, Provider Switcher) & Row 2 (Season/Episode info + Prev/Next buttons) */}
        <div
          data-watch-header="true"
          className={`absolute top-0 left-0 right-0 z-40 flex flex-col gap-2 px-3 sm:px-6 pt-[max(0.75rem,env(safe-area-inset-top,1.75rem))] pb-8 bg-gradient-to-b from-black via-black/90 to-transparent transition-all duration-300 pointer-events-auto ${
            headerVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'
          }`}
        >
          {/* Row 1: Back Button + Vertically Centered Title (Left) and Provider Switcher (Right) */}
          <div className="flex items-center justify-between gap-3 w-full">
            {/* Left: Back Button Icon Only + Vertically Centered Title */}
            <div className="flex items-center gap-3 min-w-0 flex-1 mr-2">
              <button
                onClick={handleExitWatch}
                id="watch-back-btn"
                data-watch-back="true"
                data-watch-header-item="true"
                aria-label="Back"
                tabIndex={0}
                className="p-2.5 rounded-full bg-black/70 hover:bg-black text-white border border-white/20 backdrop-blur-md transition hover:scale-110 flex-shrink-0 tv-focus-target focus:outline-none focus:border-hbo-cyan focus:ring-2 focus:ring-hbo-cyan"
                title="Go Back"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>

              <h1 className="text-sm sm:text-base md:text-lg font-black font-display text-white tracking-tight drop-shadow-md truncate flex-1 leading-normal">
                {title}
              </h1>
            </div>

            {/* Right: Quick Provider Switcher Dropdown */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {enabledResolvers.includes('embed') ? (
                <ProviderPickerTV
                  currentProviderId={providerId}
                  onSelect={(p) => {
                    setUserSelectedProvider(true);
                    setProviderId(p.id);
                  }}
                  compact={true}
                  isProbing={isProbing}
                  serverIndex={serverIndex}
                  isAnime={isAnime}
                  isAsian={isAsian}
                  isKorean={isKorean}
                />
              ) : (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-hbo-card/90 border border-hbo-border text-xs font-bold shadow-md">
                  {enabledResolvers.includes('torbox') ? (
                    <span className="text-emerald-400 font-mono flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span>TorBox 4K Cloud</span>
                    </span>
                  ) : (
                    <span className="text-hbo-cyan font-mono flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-hbo-cyan animate-pulse" />
                      <span>Private Extractor</span>
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Row 2: Season & Episode Info (Left) + Episode Navigation (Prev & Next) (Right) */}
          {mediaType === 'tv' && (episodeLabel || prevEpisodeInfo || nextEpisodeInfo) && (
            <div className="flex items-center justify-between gap-3 w-full pl-0.5 sm:pl-1">
              {/* Left: S1:E4 • Episode Title without box (with smooth gradient fade edge) */}
              <div className="flex items-center gap-2 min-w-0 flex-1 max-w-[calc(100%-160px)] sm:max-w-xl">
                {episodeLabel && (
                  <span className="text-xs sm:text-sm font-semibold tracking-wider text-white/90 flex-shrink-0">
                    {episodeLabel}
                  </span>
                )}
                {currentEpisode?.name && (
                  <div
                    className="overflow-hidden whitespace-nowrap min-w-0"
                    style={episodeTitleOverflows ? {
                      WebkitMaskImage: 'linear-gradient(to right, black 85%, transparent 100%)',
                      maskImage: 'linear-gradient(to right, black 85%, transparent 100%)'
                    } : undefined}
                  >
                    <span ref={episodeTitleRef} className="text-xs sm:text-sm text-white/75 font-medium">
                      • {currentEpisode.name}
                    </span>
                  </div>
                )}
              </div>

              {/* Right: Prev & Next Episode Buttons (Unified Style) */}
              <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
                {prevEpisodeInfo && (
                  <button
                    type="button"
                    onClick={handlePrevEpisode}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === 'Select') {
                        e.preventDefault();
                        e.stopPropagation();
                        handlePrevEpisode();
                      }
                    }}
                    id="watch-prev-ep-btn"
                    data-watch-header-item="true"
                    tabIndex={0}
                    title={`Previous: S${prevEpisodeInfo.season} E${prevEpisodeInfo.episode}${prevEpisodeInfo.title ? ` - ${prevEpisodeInfo.title}` : ''}`}
                    aria-label={`Previous Episode: S${prevEpisodeInfo.season} E${prevEpisodeInfo.episode}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 hover:bg-white/15 text-white/80 hover:text-white border border-white/15 text-xs font-semibold transition hover:scale-105 tv-focus-target focus:ring-2 focus:ring-hbo-cyan focus:bg-white/20"
                  >
                    <SkipBack className="w-3.5 h-3.5" />
                    <span>Prev</span>
                  </button>
                )}

                {nextEpisodeInfo && (
                  <button
                    type="button"
                    onClick={handleNextEpisode}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === 'Select') {
                        e.preventDefault();
                        e.stopPropagation();
                        handleNextEpisode();
                      }
                    }}
                    id="watch-next-ep-btn"
                    data-watch-header-item="true"
                    tabIndex={0}
                    title={`Next: S${nextEpisodeInfo.season} E${nextEpisodeInfo.episode}${nextEpisodeInfo.title ? ` - ${nextEpisodeInfo.title}` : ''}`}
                    aria-label={`Next Episode: S${nextEpisodeInfo.season} E${nextEpisodeInfo.episode}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 hover:bg-white/15 text-white/80 hover:text-white border border-white/15 text-xs font-semibold transition hover:scale-105 tv-focus-target focus:ring-2 focus:ring-hbo-cyan focus:bg-white/20"
                  >
                    <span>Next</span>
                    <SkipForward className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Video Player (Full Viewport with dynamic bottom safe area offset in portrait) */}
        <div className={`absolute top-0 left-0 right-0 w-full z-10 ${isPortrait ? 'bottom-20' : 'bottom-0'}`}>
          <VideoPlayer
            key={`${mediaType}-${tmdbId}-${seasonParam}-${episodeParam}`}
            mediaType={mediaType}
            tmdbId={tmdbId}
            title={title || ''}
            posterPath={details.poster_path}
            backdropPath={details.backdrop_path}
            stillPath={currentEpisode?.still_path || null}
            voteAverage={details.vote_average}
            season={seasonParam}
            episode={episodeParam}
            episodeTitle={currentEpisode?.name}
            episodeRuntimeMinutes={mediaType === 'movie' ? ('runtime' in details ? details.runtime : undefined) : currentEpisode?.runtime}
            providerId={providerId}
            initialTimestamp={timestampParam}
            isAnime={isAnime}
            isAsian={isAsian}
            isKorean={isKorean}
            releaseYear={releaseYear}
            originalTitle={details.original_title || details.original_name}
            onProviderChange={(p) => {
              setUserSelectedProvider(true);
              setProviderId(p.id);
            }}
            onProbingStatusChange={(probing, idx) => {
              setIsProbing(probing);
              setServerIndex(idx);
            }}
            nextEpisodeInfo={nextEpisodeInfo}
            onNextEpisode={handleNextEpisode}
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

