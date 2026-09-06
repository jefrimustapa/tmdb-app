import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { tmdbApi } from '../../services/tmdb';
import type { TMDBMovieDetails, TMDBTVDetails, TMDBSeasonDetails } from '../../types/tmdb';
import { VideoPlayer } from '../../components/player/VideoPlayer';
import { ProviderPickerMobile } from '../../components/player/ProviderPickerMobile';
import { dbService } from '../../services/db';
import { isAnimeMedia } from '../../services/animeMappingService';
import { isAsianMedia } from '../../services/lk21MappingService';
import { ArrowLeft, SkipForward, SkipBack } from 'lucide-react';

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

  const tmdbId = parseInt(id || '0', 10);
  const mediaType = (type === 'tv' ? 'tv' : 'movie') as 'movie' | 'tv';

  const [enabledResolvers, setEnabledResolvers] = useState<('embed' | 'private_extractor' | 'torbox')[]>(['embed']);

  const isAnime = useMemo(() => isAnimeMedia(details), [details]);
  const isAsian = useMemo(() => isAsianMedia(details), [details]);

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
            const animeFlag = isAnimeMedia(fetchedDetails);
            const asianFlag = isAsianMedia(fetchedDetails);
            const defaultProvider = asianFlag
              ? (s.topAsianProviders?.[0] || 'cinesrc')
              : animeFlag
              ? (s.topAnimeProviders?.[0] || 'megaplay-anime')
              : (s.topProviders?.[0] || s.preferredProvider || 'vidlink');
            setProviderId(defaultProvider);
          }
          if (s.enabledResolvers && s.enabledResolvers.length > 0) {
            setEnabledResolvers(s.enabledResolvers);
          }
          if (s.streamHeaderTimeout !== undefined) {
            setHeaderTimeoutSeconds(s.streamHeaderTimeout);
          }
        }
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
  }, [tmdbId, mediaType, seasonParam, userSelectedProvider]);

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
        {/* Overlay Top Header Nav: Row 1 (Back + Center-aligned Title, Provider Switcher) & Row 2 (Season/Episode info + Prev/Next buttons) */}
        <div
          data-watch-header="true"
          className={`absolute top-0 left-0 right-0 z-40 flex flex-col gap-2 px-3 sm:px-6 pt-[max(0.75rem,env(safe-area-inset-top,1.75rem))] pb-5 bg-gradient-to-b from-black/95 via-black/60 to-transparent transition-all duration-300 pointer-events-auto ${
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
                onKeyDown={(e) => {
                  if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    const trigger = document.getElementById('watch-provider-trigger');
                    if (trigger) {
                      trigger.focus();
                    }
                  } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    const prevBtn = document.getElementById('watch-prev-ep-btn');
                    const nextBtn = document.getElementById('watch-next-ep-btn');
                    if (prevBtn) {
                      prevBtn.focus();
                    } else if (nextBtn) {
                      nextBtn.focus();
                    } else {
                      (window as any).__tmdbHeaderFocused = false;
                      setHeaderVisible(false);
                      (document.getElementById('watch-back-btn') as HTMLElement)?.blur();
                      const iframe = document.querySelector<HTMLIFrameElement>('iframe');
                      if (iframe) {
                        try { iframe.focus(); } catch {}
                      }
                    }
                  }
                }}
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
                <ProviderPickerMobile
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
            <div className="flex items-center justify-between gap-3 w-full pl-1 sm:pl-2">
              {/* Left: Season & Episode Label */}
              <div className="flex items-center gap-2 min-w-0">
                {episodeLabel && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-md bg-hbo-purple/90 text-hbo-cyan border border-hbo-cyan/30 text-[11px] sm:text-xs font-black tracking-wider uppercase flex-shrink-0 shadow-sm">
                    {episodeLabel}
                  </span>
                )}
                {currentEpisode?.name && (
                  <span className="text-xs text-white/80 font-medium truncate max-w-[180px] sm:max-w-xs">
                    {currentEpisode.name}
                  </span>
                )}
              </div>

              {/* Right: Prev & Next Episode Buttons */}
              <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
                {prevEpisodeInfo && (
                  <button
                    type="button"
                    onClick={handlePrevEpisode}
                    id="watch-prev-ep-btn"
                    data-watch-header-item="true"
                    title={`Play Previous: S${prevEpisodeInfo.season} E${prevEpisodeInfo.episode}`}
                    aria-label={`Play Previous: S${prevEpisodeInfo.season} E${prevEpisodeInfo.episode}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 hover:bg-hbo-purple/80 text-white/90 hover:text-white border border-white/20 hover:border-hbo-cyan/30 text-xs font-bold backdrop-blur-md shadow-md transition active:scale-95 hover:scale-105"
                  >
                    <SkipBack className="w-3.5 h-3.5" />
                    <span className="inline">Prev: S{prevEpisodeInfo.season} E{prevEpisodeInfo.episode}</span>
                  </button>
                )}

                {nextEpisodeInfo && (
                  <button
                    type="button"
                    onClick={handleNextEpisode}
                    id="watch-next-ep-btn"
                    data-watch-header-item="true"
                    title={`Play Next: S${nextEpisodeInfo.season} E${nextEpisodeInfo.episode}`}
                    aria-label={`Play Next: S${nextEpisodeInfo.season} E${nextEpisodeInfo.episode}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-hbo-purple/70 hover:bg-hbo-purple text-hbo-cyan border border-hbo-cyan/30 text-xs font-bold backdrop-blur-md shadow-md transition active:scale-95 hover:scale-105"
                  >
                    <SkipForward className="w-3.5 h-3.5" />
                    <span className="inline">Next: S{nextEpisodeInfo.season} E{nextEpisodeInfo.episode}</span>
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
      </div>
    </div>
  );
};

