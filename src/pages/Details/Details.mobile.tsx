import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { Play, Heart, Bookmark, Star, ArrowLeft, Plus, Check, RotateCcw, Share2 } from 'lucide-react';
import type { TMDBMovieDetails, TMDBTVDetails, TMDBMediaItem, TMDBImageItem } from '../../types/tmdb';
import { tmdbApi, tmdbImages, extractContentRating, resolveGenresFromIds, isExplicitAdultCertification } from '../../services/tmdb';
import { dbService } from '../../services/db';
import { MediaRow } from '../../components/common/MediaRow';
import { EpisodeGrid } from '../../components/player/EpisodeGrid';
import { useDevice } from '../../hooks/useDevice';

const pickRandomPoster = (
  item: { poster_path?: string | null; backdrop_path?: string | null; images?: { posters?: TMDBImageItem[] } } | null
): string | null => {
  if (!item) return null;
  const posters = item.images?.posters?.filter((p) => Boolean(p.file_path));
  if (posters && posters.length > 0) {
    const idx = Math.floor(Math.random() * posters.length);
    return posters[idx].file_path;
  }
  return item.poster_path || null;
};

const pickRandomBackdrop = (
  item: { backdrop_path?: string | null; poster_path?: string | null; images?: { backdrops?: TMDBImageItem[] } } | null
): string | null => {
  if (!item) return null;
  const backdrops = item.images?.backdrops?.filter((b) => Boolean(b.file_path));
  if (backdrops && backdrops.length > 0) {
    const idx = Math.floor(Math.random() * backdrops.length);
    return backdrops[idx].file_path;
  }
  return item.backdrop_path || item.poster_path || null;
};

const combineRecommendations = (data: TMDBMovieDetails | TMDBTVDetails): TMDBMediaItem[] => {
  const recs = (data.recommendations?.results || []) as TMDBMediaItem[];
  const sims = (data.similar?.results || []) as TMDBMediaItem[];
  const seen = new Set<number>([data.id]);
  const combined: TMDBMediaItem[] = [];

  for (const item of [...recs, ...sims]) {
    if (item && item.id && !seen.has(item.id)) {
      if (item.poster_path || item.backdrop_path) {
        seen.add(item.id);
        combined.push(item);
      }
    }
  }
  return combined;
};

export const Details: React.FC = () => {
  const { type, id } = useParams<{ type: 'movie' | 'tv'; id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { isTV } = useDevice();

  // Dynamic orientation detection for responsive mobile/tablet layout
  const [isLandscape, setIsLandscape] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth > window.innerHeight : false
  );

  useEffect(() => {
    const handleResize = () => {
      setIsLandscape(window.innerWidth > window.innerHeight);
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  const tmdbId = parseInt(id || '0', 10);
  const mediaType: 'movie' | 'tv' = (type === 'tv' ? 'tv' : 'movie');

  // Instant preview from router state (0ms delay) with instantaneous genres resolution
  const initialPreview = (location.state as { item?: TMDBMediaItem } | null)?.item;
  const [details, setDetails] = useState<TMDBMovieDetails | TMDBTVDetails | null>(() => {
    if (initialPreview && initialPreview.id === tmdbId) {
      return {
        ...initialPreview,
        genres: resolveGenresFromIds(initialPreview.genre_ids),
        overview: initialPreview.overview || ''
      } as unknown as (TMDBMovieDetails | TMDBTVDetails);
    }
    return null;
  });
  const [similar, setSimilar] = useState<TMDBMediaItem[]>([]);
  const [isLiked, setIsLiked] = useState(false);
  const [isWatchlist, setIsWatchlist] = useState(false);
  const [lastWatched, setLastWatched] = useState<{ season: number; episode: number } | null>(null);
  const [watchProgress, setWatchProgress] = useState<{ timestamp: number; duration: number; progressPercent: number } | null>(null);
  const [randomPosterPath, setRandomPosterPath] = useState<string | null>(null);
  const [randomBackdropPath, setRandomBackdropPath] = useState<string | null>(null);
  const [activeEpisodeStill, setActiveEpisodeStill] = useState<string | null>(null);
  const [isHeroLoaded, setIsHeroLoaded] = useState(false);
  const [isPosterLoaded, setIsPosterLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(() => !initialPreview || initialPreview.id !== tmdbId);

  useEffect(() => {
    if (!tmdbId) return;

    let isMounted = true;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });

    // Reset previous title state immediately so old watch time/likes don't persist
    setWatchProgress(null);
    setLastWatched(null);
    setRandomPosterPath(null);
    setRandomBackdropPath(null);
    setActiveEpisodeStill(null);
    setIsHeroLoaded(false);
    setIsPosterLoaded(false);
    setIsLiked(false);
    setIsWatchlist(false);

    const preview = (location.state as { item?: TMDBMediaItem } | null)?.item;
    if (preview && preview.id === tmdbId) {
      setDetails({
        ...preview,
        genres: resolveGenresFromIds(preview.genre_ids),
        overview: preview.overview || ''
      } as unknown as (TMDBMovieDetails | TMDBTVDetails));
      setIsLoading(false);
    } else {
      setDetails(null);
      setIsLoading(true);
    }

    // Parallel fetch: TMDB details and DB status simultaneously
    const detailsPromise = mediaType === 'movie'
      ? tmdbApi.getMovieDetails(tmdbId)
      : tmdbApi.getTVDetails(tmdbId);

    const dbPromise = Promise.allSettled([
      dbService.isLiked(tmdbId, mediaType),
      dbService.isWatchlisted(tmdbId, mediaType),
      dbService.getHistoryItem(tmdbId, mediaType)
    ]);

    Promise.all([detailsPromise, dbPromise])
      .then(async ([resData, dbResults]) => {
        if (!isMounted) return;

        if (resData) {
          setDetails(resData);
          const recItems = combineRecommendations(resData);
          setSimilar(recItems);

          // Deep adult filtering in background without delaying details page load
          if (recItems.length > 0) {
            tmdbApi.filterRecommendationsAsync(recItems, mediaType).then((cleaned) => {
              if (isMounted && cleaned) {
                setSimilar(cleaned);
              }
            }).catch(() => {});
          }
        }

        const [liked, watchlisted, historyItem] = dbResults;
        if (liked.status === 'fulfilled') setIsLiked(liked.value);
        if (watchlisted.status === 'fulfilled') setIsWatchlist(watchlisted.value);

        let watchedSeason: number | null = null;
        let watchedEpisode: number | null = null;

        if (historyItem.status === 'fulfilled' && historyItem.value) {
          const item = historyItem.value;
          if (item.season && item.episode) {
            watchedSeason = item.season;
            watchedEpisode = item.episode;
            setLastWatched({ season: item.season, episode: item.episode });
          } else {
            setLastWatched(null);
          }
          if (item.timestamp > 0) {
            setWatchProgress({
              timestamp: item.timestamp,
              duration: item.duration,
              progressPercent: item.progressPercent
            });
          } else {
            setWatchProgress(null);
          }
        } else {
          setLastWatched(null);
          setWatchProgress(null);
        }

        if (resData) {
          // 1. Poster: inspect how many posters available, pick ONE
          // (used for portrait background and landscape poster card)
          const pickedPoster = pickRandomPoster(resData);
          setRandomPosterPath(pickedPoster);

          // 2. Backdrop:
          // For series: check if already watched -> YES: use active episode backdrop
          // Else -> look for available backdrops & pick ONE randomly
          const isSeriesWatched = mediaType === 'tv' && Boolean(watchedSeason && watchedEpisode);
          let episodeStillResolved = false;

          if (isSeriesWatched && watchedSeason && watchedEpisode) {
            try {
              const seasonData = await tmdbApi.getSeasonDetails(tmdbId, watchedSeason);
              if (isMounted) {
                const ep = seasonData?.episodes?.find((e) => e.episode_number === watchedEpisode);
                if (ep?.still_path) {
                  setActiveEpisodeStill(ep.still_path);
                  episodeStillResolved = true;
                }
              }
            } catch (err) {
              console.warn('[Details] Failed to fetch active episode still:', err);
            }
          }

          // If not a watched series, or if episode still was missing, pick ONE backdrop from available backdrops
          if (!episodeStillResolved && isMounted) {
            const pickedBackdrop = pickRandomBackdrop(resData);
            setRandomBackdropPath(pickedBackdrop);
          }
        }
      })
      .catch((err) => {
        console.error('Failed to load details in parallel:', err);
        // Fallback: If network/details fetch fails, use preview artwork so page still displays
        if (isMounted) {
          const preview = (location.state as { item?: TMDBMediaItem } | null)?.item;
          if (preview) {
            setRandomPosterPath((prev) => prev || preview.poster_path || null);
            setRandomBackdropPath((prev) => prev || preview.backdrop_path || null);
          }
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
          setTimeout(() => {
            const mainContent = document.querySelector('main');
            const primaryBtn = mainContent?.querySelector<HTMLElement>('[data-details-primary="true"]') ||
                               mainContent?.querySelector<HTMLElement>('.tv-focus-target, a, button') ||
                               document.querySelector<HTMLElement>('.tv-focus-target');
            if (primaryBtn) {
              primaryBtn.focus({ preventScroll: true });
            }
          }, 80);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [tmdbId, mediaType]);

  // Keep last watched season & episode and progress synchronized when returning to Details
  useEffect(() => {
    const updateLastWatched = async () => {
      if (tmdbId) {
        const historyItem = await dbService.getHistoryItem(tmdbId, mediaType);
        if (historyItem) {
          if (historyItem.season && historyItem.episode) {
            setLastWatched({ season: historyItem.season, episode: historyItem.episode });
          }
          if (historyItem.timestamp > 0) {
            setWatchProgress({
              timestamp: historyItem.timestamp,
              duration: historyItem.duration,
              progressPercent: historyItem.progressPercent
            });
          }
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        updateLastWatched();
      }
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', updateLastWatched);
    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', updateLastWatched);
    };
  }, [tmdbId, mediaType]);

  // Flow 2: For TV series, update active episode still when lastWatched changes
  useEffect(() => {
    if (mediaType !== 'tv' || !tmdbId || !lastWatched) {
      return;
    }

    let isMounted = true;
    const targetSeason = lastWatched.season || 1;
    const targetEpisode = lastWatched.episode || 1;

    tmdbApi.getSeasonDetails(tmdbId, targetSeason)
      .then((seasonData) => {
        if (!isMounted) return;
        const ep = seasonData?.episodes?.find((e) => e.episode_number === targetEpisode);
        if (ep?.still_path) {
          setActiveEpisodeStill(ep.still_path);
        }
      })
      .catch((err) => {
        console.warn('[Details] Failed to fetch active episode still:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [tmdbId, mediaType, lastWatched?.season, lastWatched?.episode]);

  const handleToggleLike = async () => {
    if (!details) return;
    const title = details.title || details.name || 'Untitled';
    const status = await dbService.toggleLike({
      tmdbId,
      mediaType,
      title,
      posterPath: details.poster_path,
      backdropPath: details.backdrop_path,
      voteAverage: details.vote_average,
      releaseDate: details.release_date || details.first_air_date
    });
    setIsLiked(status);
  };

  const handleToggleWatchlist = async () => {
    if (!details) return;
    const title = details.title || details.name || 'Untitled';
    const status = await dbService.toggleWatchlist({
      tmdbId,
      mediaType,
      title,
      posterPath: details.poster_path,
      backdropPath: details.backdrop_path,
      voteAverage: details.vote_average,
      releaseDate: details.release_date || details.first_air_date
    });
    setIsWatchlist(status);
  };

  const [shareToast, setShareToast] = useState(false);

  const handleShare = async () => {
    if (!details) return;
    const itemTitle = details.title || details.name || 'Untitled';
    const webDeepLinkUrl = `https://www.themoviedb.org/${mediaType}/${tmdbId}`;
    const shareText = `Check out ${itemTitle} on TMDB Streamer!`;

    // 1. Try Android Native Bridge
    if (typeof window !== 'undefined' && (window as any).AndroidBridge && typeof (window as any).AndroidBridge.shareDeepLink === 'function') {
      try {
        (window as any).AndroidBridge.shareDeepLink(itemTitle, shareText, webDeepLinkUrl);
        return;
      } catch (e) {
        console.warn('[Share] AndroidBridge share failed:', e);
      }
    }

    // 2. Try standard navigator.share (if supported)
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: itemTitle,
          text: `${shareText}\n${webDeepLinkUrl}`,
          url: webDeepLinkUrl
        });
        return;
      } catch (e: any) {
        if (e.name !== 'AbortError') {
          console.warn('[Share] Web share failed:', e);
        } else {
          return;
        }
      }
    }

    // 3. Fallback: Copy direct link to clipboard
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(webDeepLinkUrl);
        setShareToast(true);
        setTimeout(() => setShareToast(false), 2000);
      } catch (err) {
        console.warn('[Share] Clipboard copy failed:', err);
      }
    }
  };

  const handleBack = () => {
    const currentPath = window.location.pathname;
    if (window.history.state && typeof window.history.state.idx === 'number' && window.history.state.idx > 0) {
      navigate(-1);
      setTimeout(() => {
        if (window.location.pathname === currentPath) {
          navigate('/');
        }
      }, 150);
    } else {
      navigate('/');
    }
  };

  // Failsafe keydown listener for TV remote back button & keyboard Escape/Backspace
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.keyCode === 4 || e.key === 'BrowserBack') {
        // If a modal is open, let modal handle it
        const modalCloseBtn = document.querySelector('[data-modal-close]') as HTMLButtonElement | null;
        if (!modalCloseBtn) {
          e.preventDefault();
          handleBack();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const isPerfMode = typeof document !== 'undefined' && document.documentElement.getAttribute('data-perf-mode') === 'true';

  // Hero background image selection:
  // In Portrait (!isLandscape):
  //   - Background: strictly single randomly chosen poster from title's available posters pool. NEVER load premature preview backdrop or poster to prevent swapping.
  //   - Series: do NOT use active watch episode backdrop
  // In Landscape (isLandscape):
  //   - Watched series: uses active episode backdrop
  //   - Movies / unwatched series: single randomly chosen backdrop from title's backdrops pool
  const heroPath = !isLandscape
    ? randomPosterPath
    : (activeEpisodeStill || randomBackdropPath);
  const heroUrl = heroPath
    ? (!isLandscape
        ? tmdbImages.poster(heroPath, isPerfMode ? 'w500' : 'w780')
        : tmdbImages.backdrop(heroPath, isPerfMode ? 'w780' : 'w1280'))
    : null;

  // Flow 3: Poster card URL (single randomly chosen poster from title's posters pool, used in landscape)
  const posterCardUrl = randomPosterPath ? tmdbImages.poster(randomPosterPath, 'w500') : null;

  // Reset loaded flags when image paths change to enable smooth subtle fade-in
  useEffect(() => {
    setIsHeroLoaded(false);
  }, [heroUrl]);

  useEffect(() => {
    setIsPosterLoaded(false);
  }, [posterCardUrl]);


  if (isLoading || !details) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-hbo-dark">
        <div className="w-12 h-12 border-4 border-hbo-purple border-t-hbo-cyan rounded-full animate-spin shadow-hbo-glow mb-4" />
        <h2 className="text-sm font-bold font-display text-white tracking-widest">LOADING TITLE...</h2>
      </div>
    );
  }

  const title = details.title || details.name || 'Untitled';
  const originalTitle = details.original_title || details.original_name;
  const hasAlternativeTitle = Boolean(
    originalTitle && originalTitle.trim().toLowerCase() !== title.trim().toLowerCase()
  );

  const releaseYear = (details.release_date || details.first_air_date || '').split('-')[0];
  const contentRating = extractContentRating(details);

  return (
    <div className="relative min-h-screen bg-hbo-dark text-white pb-28 sm:pb-36 overflow-x-hidden">
      {/* Top Hero Ambient Backdrop */}
      <div
        className={`absolute top-0 left-0 right-0 ${
          !isLandscape
            ? 'w-full'
            : 'h-[65vh] sm:h-[80vh] lg:h-[90vh]'
        } overflow-hidden pointer-events-none z-0`}
      >
        {heroUrl && (
          <img
            key={heroUrl}
            ref={(img) => {
              if (img && img.complete && img.naturalWidth > 0 && !isHeroLoaded) {
                setIsHeroLoaded(true);
              }
            }}
            src={heroUrl}
            alt={title}
            decoding="async"
            onLoad={() => setIsHeroLoaded(true)}
            onError={(e) => {
              tmdbImages.handleImgError(e, true);
              setIsHeroLoaded(true);
            }}
            className={`${
              !isLandscape
                ? 'w-full h-auto block'
                : 'absolute inset-0 w-full h-full object-cover object-center'
            } transform-gpu will-change-[opacity] transition-opacity duration-700 ease-in-out ${
              isHeroLoaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
        )}

        {/* Cinematic HBO Gradients Layer (Identical to HeroBanner) */}
        <div className="absolute inset-0 hero-gradient-overlay" />
        <div className="absolute inset-0 hero-side-gradient hidden sm:block" />
        <div className="absolute inset-0 bg-gradient-to-t from-transparent via-transparent to-black/40" />
        {!isLandscape && (
          <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-hbo-dark via-hbo-dark/85 to-transparent" />
        )}
      </div>

      {/* Hero Viewport Section (Portrait: dynamic flex-between anchored 15px above bottom nav; Landscape: standard flow) */}
      <div
        className={`relative z-10 max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 ${
          !isLandscape
            ? 'min-h-[calc(100dvh-67px-max(1rem,env(safe-area-inset-bottom,20px)))] flex flex-col justify-between'
            : 'pt-6 sm:pt-8 space-y-8 sm:space-y-10'
        }`}
      >
        {/* Back Navigation Button */}
        <div
          className={`${
            isTV
              ? 'pt-2'
              : 'pt-[max(3.75rem,calc(env(safe-area-inset-top,0px)+3.25rem))]'
          }`}
        >
          <button
            type="button"
            onClick={handleBack}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ' || e.keyCode === 13 || e.keyCode === 23 || e.keyCode === 66) {
                e.preventDefault();
                e.stopPropagation();
                handleBack();
              }
            }}
            data-details-back="true"
            aria-label="Go Back"
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-black/75 hover:bg-black backdrop-blur-md border border-white/20 hover:border-hbo-cyan text-xs sm:text-sm font-bold text-gray-200 hover:text-white transition hover:scale-105 tv-focus-target shadow-2xl cursor-pointer focus:outline-none focus:ring-2 focus:ring-hbo-cyan w-max"
          >
            <ArrowLeft className="w-4 h-4 text-hbo-cyan" />
            <span>Back</span>
          </button>
        </div>

        {/* Hero Title & Poster Card Header */}
        <div
          className={`${
            isLandscape ? 'pt-2' : 'pt-4'
          } flex flex-col sm:flex-row items-center sm:items-end gap-6 sm:gap-8 lg:gap-10`}
        >
          {/* Title Poster Card (Visible in Landscape mode with subtle fade-in) */}
          {isLandscape && (
            <div className="w-36 sm:w-48 md:w-56 lg:w-64 aspect-[2/3] rounded-2xl overflow-hidden border border-white/20 shadow-2xl shadow-black/90 flex-shrink-0 bg-gray-900/60 group relative transition-all duration-500 ease-out">
              {posterCardUrl && (
                <img
                  key={posterCardUrl}
                  ref={(img) => {
                    if (img && img.complete && img.naturalWidth > 0 && !isPosterLoaded) {
                      setIsPosterLoaded(true);
                    }
                  }}
                  src={posterCardUrl}
                  alt={title}
                  decoding="async"
                  onLoad={() => setIsPosterLoaded(true)}
                  onError={(e) => {
                    tmdbImages.handleImgError(e, false);
                    setIsPosterLoaded(true);
                  }}
                  className={`w-full h-full object-cover group-hover:scale-105 transition-all duration-700 ease-out ${
                    isPosterLoaded ? 'opacity-100' : 'opacity-0'
                  }`}
                />
              )}
            </div>
          )}

          {/* Title & Metadata & Action Buttons */}
          <div className={`flex-1 w-full min-w-0 space-y-3.5 sm:space-y-4.5 ${isLandscape ? 'text-left items-start' : 'text-center sm:text-left items-center sm:items-start'} flex flex-col`}>
            <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap min-h-[26px]">
              <span className="px-3 py-0.5 rounded-full bg-hbo-purple/70 text-white border border-hbo-purple-light text-xs font-black uppercase tracking-wider backdrop-blur-md">
                {mediaType === 'movie' ? 'FILM' : 'SERIES'}
              </span>
              {contentRating ? (
                <>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider backdrop-blur-md animate-fade-in ${
                      isExplicitAdultCertification(contentRating)
                        ? 'bg-rose-950/70 text-rose-300 border border-rose-500/60 shadow-sm shadow-rose-950'
                        : 'bg-white/15 text-white border border-white/25'
                    }`}
                  >
                    {contentRating}
                  </span>
                  {isExplicitAdultCertification(contentRating) && (
                    <span className="px-2 py-0.5 rounded-full bg-red-950/60 text-red-300 border border-red-500/40 text-[10px] font-black uppercase tracking-wider backdrop-blur-md">
                      Explicit 18+
                    </span>
                  )}
                </>
              ) : isLoading ? (
                <span className="w-12 h-5 rounded-full bg-white/10 border border-white/10 animate-pulse" />
              ) : null}
            </div>

            <div className="space-y-1">
              <h1 className="text-[25px] sm:text-[30px] md:text-[35px] lg:text-[40px] font-extrabold font-display tracking-tight text-white leading-snug drop-shadow-md">
                {title}
              </h1>
              {hasAlternativeTitle && (
                <div className="flex items-center justify-center sm:justify-start gap-2 pt-0.5 text-sm sm:text-base text-gray-300 font-medium">
                  <span className="px-2 py-0.5 rounded bg-white/10 text-xs font-semibold uppercase tracking-wider text-hbo-cyan border border-white/15">
                    Original Title
                  </span>
                  <span className="text-white/90 italic font-semibold">{originalTitle}</span>
                </div>
              )}
            </div>

            {/* Quick Meta Row */}
            <div className="flex items-center justify-center sm:justify-start gap-3 text-xs sm:text-sm text-gray-300 font-semibold flex-wrap min-h-[22px]">
              <div className="flex items-center gap-1.5 font-bold text-yellow-400">
                <Star className="w-4 h-4 fill-current" />
                <span>{details.vote_average.toFixed(1)}</span>
              </div>
              <span>•</span>
              <span>{releaseYear}</span>
              {details && 'runtime' in details && details.runtime > 0 ? (
                <>
                  <span>•</span>
                  <span className="animate-fade-in">{details.runtime} mins</span>
                </>
              ) : details && 'number_of_seasons' in details && details.number_of_seasons > 0 ? (
                <>
                  <span>•</span>
                  <span className="animate-fade-in">{details.number_of_seasons} Season{details.number_of_seasons > 1 ? 's' : ''}</span>
                </>
              ) : isLoading ? (
                <>
                  <span>•</span>
                  <span className="inline-block w-14 h-3.5 rounded bg-white/10 animate-pulse my-auto" />
                </>
              ) : null}
              {details.genres && details.genres.length > 0 && (
                <>
                  <span>•</span>
                  <span className="text-gray-300">{details.genres.map(g => g.name).join(', ')}</span>
                </>
              )}
            </div>

            {/* Primary Action Buttons */}
            {(() => {
              const isResumable = watchProgress && (watchProgress.timestamp > 15 || watchProgress.progressPercent > 1) && watchProgress.progressPercent < 90;
              const minsLeft = watchProgress && watchProgress.duration > watchProgress.timestamp
                ? Math.max(1, Math.round((watchProgress.duration - watchProgress.timestamp) / 60))
                : 0;

              const targetResumeTime = isResumable ? (watchProgress?.timestamp || 0) : 0;

              const watchUrl = mediaType === 'tv'
                ? `/watch/tv/${tmdbId}?s=${lastWatched?.season || 1}&e=${lastWatched?.episode || 1}${targetResumeTime > 0 ? `&t=${targetResumeTime}` : ''}`
                : `/watch/movie/${tmdbId}${targetResumeTime > 0 ? `?t=${targetResumeTime}` : ''}`;

              const restartUrl = mediaType === 'tv'
                ? `/watch/tv/${tmdbId}?s=${lastWatched?.season || 1}&e=${lastWatched?.episode || 1}&t=0`
                : `/watch/movie/${tmdbId}?t=0`;

              return (
                <div className="flex flex-col gap-3 pt-2 w-full max-w-md mx-auto sm:mx-0">
                  {/* Row 1: Watch / Resume Button full width */}
                  <div className="w-full">
                    <Link
                      to={watchUrl}
                      data-details-primary="true"
                      className="flex items-center justify-center gap-2.5 w-full px-6 py-3.5 rounded-xl bg-gradient-to-r from-hbo-purple to-hbo-cyan text-white font-bold text-sm sm:text-base shadow-hbo-glow hover:scale-[1.02] active:scale-95 transition-all text-center box-border"
                    >
                      <Play className="w-5 h-5 fill-current flex-shrink-0" />
                      <span className="truncate">
                        {isResumable
                          ? (mediaType === 'tv' && lastWatched
                              ? `Resume S${lastWatched.season} E${lastWatched.episode}${minsLeft > 0 ? ` (${minsLeft}m left)` : ''}`
                              : `Resume${minsLeft > 0 ? ` (${minsLeft}m left)` : ''}`)
                          : (mediaType === 'tv' && lastWatched
                              ? `Play S${lastWatched.season} E${lastWatched.episode}`
                              : 'Watch Now')}
                      </span>
                    </Link>
                  </div>

                  {/* Row 2: Secondary circular action buttons */}
                  <div className="flex items-center justify-center sm:justify-start gap-3.5 sm:gap-4 pt-1 w-full">
                    {isResumable && (
                      <button
                        type="button"
                        onClick={() => navigate(restartUrl)}
                        title="Restart from beginning"
                        aria-label="Restart from beginning"
                        className="tv-focus-target group relative w-11 h-11 sm:w-12 sm:h-12 rounded-full border border-white/20 bg-white/[0.08] hover:bg-white/[0.15] text-white/90 hover:text-white hover:border-white/40 backdrop-blur-md transition-all duration-200 active:scale-95 flex items-center justify-center flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-hbo-cyan shadow-sm"
                      >
                        <RotateCcw className="w-5 h-5 text-gray-200 group-hover:text-white group-hover:scale-110 transition-transform" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleToggleWatchlist}
                      className={`tv-focus-target group relative w-11 h-11 sm:w-12 sm:h-12 rounded-full border backdrop-blur-md transition-all duration-200 active:scale-95 flex items-center justify-center flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-hbo-cyan shadow-sm ${
                        isWatchlist
                          ? 'border-hbo-cyan ring-2 ring-hbo-cyan bg-hbo-purple/40 text-hbo-cyan'
                          : 'border-white/20 bg-white/[0.08] hover:bg-white/[0.15] text-white/90 hover:text-white hover:border-white/40'
                      }`}
                      title={isWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
                      aria-label={isWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
                    >
                      <Bookmark className={`w-5 h-5 transition-transform group-hover:scale-110 ${isWatchlist ? 'fill-current text-hbo-cyan' : 'text-gray-200 group-hover:text-white'}`} />
                    </button>

                    <button
                      type="button"
                      onClick={handleToggleLike}
                      className={`tv-focus-target group relative w-11 h-11 sm:w-12 sm:h-12 rounded-full border backdrop-blur-md transition-all duration-200 active:scale-95 flex items-center justify-center flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-hbo-cyan shadow-sm ${
                        isLiked
                          ? 'border-hbo-cyan ring-2 ring-hbo-cyan bg-hbo-purple/40 text-hbo-cyan'
                          : 'border-white/20 bg-white/[0.08] hover:bg-white/[0.15] text-white/90 hover:text-white hover:border-white/40'
                      }`}
                      title={isLiked ? 'Liked' : 'Like'}
                      aria-label={isLiked ? 'Liked' : 'Like'}
                    >
                      <Heart className={`w-5 h-5 transition-transform group-hover:scale-110 ${isLiked ? 'fill-current text-hbo-cyan' : 'text-gray-200 group-hover:text-white'}`} />
                    </button>

                    <button
                      type="button"
                      onClick={handleShare}
                      className="tv-focus-target group relative w-11 h-11 sm:w-12 sm:h-12 rounded-full border border-white/20 bg-white/[0.08] hover:bg-white/[0.15] text-white/90 hover:text-white hover:border-hbo-cyan backdrop-blur-md transition-all duration-200 active:scale-95 flex items-center justify-center flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-hbo-cyan shadow-sm"
                      title="Share link"
                      aria-label="Share"
                    >
                      <Share2 className="w-5 h-5 text-hbo-cyan group-hover:scale-110 transition-transform" />
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Main Lower Content Area (Synopsis, Episodes, Cast, Recommendations) */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 pt-6 sm:pt-8 space-y-8 sm:space-y-10">
        {/* Synopsis & Tagline */}
        <div className="max-w-3xl space-y-3 pt-2">
          {'tagline' in details && details.tagline && (
            <p className="text-base sm:text-lg font-semibold italic text-hbo-cyan/90">
              &ldquo;{details.tagline}&rdquo;
            </p>
          )}
          <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400">Storyline</h3>
          <p className="text-sm sm:text-base text-gray-200 leading-relaxed">
            {details.overview || 'No synopsis provided for this title.'}
          </p>
        </div>

        {/* Series Seasons & Episode Selector Grid (TV Series only) */}
        {mediaType === 'tv' && details && 'seasons' in details && (
          <div className="-mx-4 sm:-mx-8 lg:-mx-12 px-4 sm:px-8 lg:px-12">
            <EpisodeGrid
              tvDetails={details as TMDBTVDetails}
              currentSeason={lastWatched?.season || 1}
              currentEpisode={lastWatched?.episode || 1}
              hasWatchedHistory={Boolean(lastWatched)}
              onSelectEpisode={async (s, e) => {
                const epHistory = await dbService.getHistoryItem(tmdbId, 'tv', s, e);
                const epTime = (epHistory && epHistory.timestamp > 15) ? epHistory.timestamp : 0;
                setLastWatched({ season: s, episode: e });
                navigate(`/watch/tv/${tmdbId}?s=${s}&e=${e}${epTime > 0 ? `&t=${epTime}` : ''}`);
              }}
            />
          </div>
        )}

        {/* Top Cast Section */}
        {details.credits?.cast && details.credits.cast.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg sm:text-xl font-bold font-display text-white flex items-center gap-2">
                <span className="w-1.5 h-5 bg-gradient-to-b from-hbo-purple to-hbo-cyan rounded-full inline-block"></span>
                Cast & Crew
              </h3>
              <span className="text-xs text-gray-400">Select actor to see filmography</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5 sm:gap-4.5 p-1">
              {details.credits.cast.slice(0, 12).map((actor) => (
                <Link
                  key={actor.id}
                  to={`/search?personId=${actor.id}&personName=${encodeURIComponent(actor.name)}`}
                  className="flex items-center gap-3 p-3 rounded-xl bg-hbo-card/80 border border-hbo-border/60 hover:border-hbo-cyan/50 hover:bg-hbo-hover transition hover:scale-105 group tv-focus-target"
                >
                  <img
                    src={tmdbImages.profile(actor.profile_path, 'w185')}
                    alt={actor.name}
                    loading="lazy"
                    decoding="async"
                    onError={tmdbImages.handleImgError}
                    className="w-12 h-12 rounded-full object-cover border border-hbo-border group-hover:border-hbo-cyan flex-shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-bold text-white truncate group-hover:text-hbo-cyan transition">{actor.name}</p>
                    <p className="text-[11px] text-gray-400 truncate">{actor.character}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Recommended / Similar Titles Rail */}
        {similar.length > 0 && (
          <div className="-mx-4 sm:-mx-8 lg:-mx-12 pt-2">
            <MediaRow
              title="More Like This"
              subtitle="Titles you may also enjoy based on this selection"
              items={similar}
              type={mediaType}
            />
          </div>
        )}
      </div>

      {/* Share copied toast */}
      {shareToast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-hbo-card/95 backdrop-blur-md border border-hbo-cyan/50 text-white rounded-full text-xs font-bold shadow-2xl shadow-hbo-purple/50 animate-bounce">
          Deep link copied to clipboard!
        </div>
      )}
    </div>
  );
};
