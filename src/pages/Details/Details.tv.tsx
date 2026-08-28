import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Play, Heart, Bookmark, Star, ArrowLeft, Plus, Check } from 'lucide-react';
import type { TMDBMovieDetails, TMDBTVDetails, TMDBMediaItem } from '../../types/tmdb';
import { tmdbApi, tmdbImages, extractContentRating } from '../../services/tmdb';
import { dbService } from '../../services/db';
import { MediaRow } from '../../components/common/MediaRow';
import { EpisodeGrid } from '../../components/player/EpisodeGrid';
import { useDevice } from '../../hooks/useDevice';

export const Details: React.FC = () => {
  const { type, id } = useParams<{ type: 'movie' | 'tv'; id: string }>();
  const navigate = useNavigate();
  const { isTV } = useDevice();

  const tmdbId = parseInt(id || '0', 10);
  const mediaType: 'movie' | 'tv' = (type === 'tv' ? 'tv' : 'movie');

  const [details, setDetails] = useState<TMDBMovieDetails | TMDBTVDetails | null>(null);
  const [similar, setSimilar] = useState<TMDBMediaItem[]>([]);
  const [isLiked, setIsLiked] = useState(false);
  const [isWatchlist, setIsWatchlist] = useState(false);
  const [lastWatched, setLastWatched] = useState<{ season: number; episode: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!tmdbId) return;

    const fetchDetails = async () => {
      setIsLoading(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      try {
        let resData: TMDBMovieDetails | TMDBTVDetails;
        if (mediaType === 'movie') {
          resData = await tmdbApi.getMovieDetails(tmdbId);
        } else {
          resData = await tmdbApi.getTVDetails(tmdbId);
        }
        setDetails(resData);

        const recItems = (resData.similar?.results || resData.recommendations?.results || []) as TMDBMediaItem[];
        setSimilar(recItems);

        const [liked, watchlisted, historyItem] = await Promise.allSettled([
          dbService.isLiked(tmdbId, mediaType),
          dbService.isWatchlisted(tmdbId, mediaType),
          mediaType === 'tv' ? dbService.getHistoryItem(tmdbId, 'tv') : Promise.resolve(undefined)
        ]);

        if (liked.status === 'fulfilled') setIsLiked(liked.value);
        if (watchlisted.status === 'fulfilled') setIsWatchlist(watchlisted.value);
        if (historyItem.status === 'fulfilled' && historyItem.value) {
          const item = historyItem.value;
          if (item.season && item.episode) {
            setLastWatched({ season: item.season, episode: item.episode });
          }
        }
      } catch (err) {
        console.error('Failed to load details:', err);
      } finally {
        setIsLoading(false);
        // Automatically focus the primary action button (Watch Now) once details finish loading without scrolling jump
        setTimeout(() => {
          window.scrollTo(0, 0);
          const mainContent = document.querySelector('main');
          const primaryBtn = mainContent?.querySelector<HTMLElement>('[data-details-primary="true"]') ||
                             mainContent?.querySelector<HTMLElement>('.tv-focus-target, a, button') ||
                             document.querySelector<HTMLElement>('.tv-focus-target');
          if (primaryBtn) {
            primaryBtn.focus({ preventScroll: true });
          }
        }, 100);
      }
    };

    window.scrollTo(0, 0);
    fetchDetails();
  }, [tmdbId, mediaType]);

  // Keep last watched season & episode synchronized when returning to Details
  useEffect(() => {
    const updateLastWatched = async () => {
      if (mediaType === 'tv' && tmdbId) {
        const historyItem = await dbService.getHistoryItem(tmdbId, 'tv');
        if (historyItem?.season && historyItem?.episode) {
          setLastWatched({ season: historyItem.season, episode: historyItem.episode });
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

  if (isLoading || !details) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-hbo-dark">
        <div className="w-12 h-12 border-4 border-hbo-purple border-t-hbo-cyan rounded-full animate-spin shadow-hbo-glow mb-4" />
        <h2 className="text-sm font-bold font-display text-white tracking-widest">LOADING TITLE...</h2>
      </div>
    );
  }

  const title = details.title || details.name || 'Untitled';
  const backdropUrl = tmdbImages.backdrop(details.backdrop_path, 'original');
  const posterUrl = tmdbImages.poster(details.poster_path, 'w500');
  const releaseYear = (details.release_date || details.first_air_date || '').split('-')[0];
  const contentRating = extractContentRating(details);

  return (
    <div className="relative min-h-screen bg-hbo-dark text-white pb-28 sm:pb-36 overflow-x-hidden">
      {/* Top Hero Ambient Backdrop */}
      <div className="absolute top-0 left-0 right-0 h-[65vh] sm:h-[80vh] lg:h-[90vh] overflow-hidden pointer-events-none z-0">
        <img
          src={backdropUrl}
          alt={title}
          onError={(e) => tmdbImages.handleImgError(e, true)}
          className="w-full h-full object-cover object-top opacity-45 sm:opacity-55 scale-105 transform"
        />
        {/* Full-bleed gradient blending smoothly into bg-hbo-dark with zero cutoff seam */}
        <div className="absolute inset-0 bg-gradient-to-t from-hbo-dark via-hbo-dark/85 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-hbo-dark via-hbo-dark/85 to-transparent/30" />
        <div className="absolute inset-0 bg-gradient-to-b from-hbo-dark/60 via-transparent to-hbo-dark" />
      </div>

      {/* Main Content Area */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 pt-6 sm:pt-8 space-y-8 sm:space-y-10">
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
        <div className="flex flex-col sm:flex-row items-center sm:items-end gap-6 sm:gap-8 lg:gap-10 pt-2">
          {/* Title Poster Card */}
          <div className="w-36 sm:w-48 md:w-56 lg:w-64 aspect-[2/3] rounded-2xl overflow-hidden border border-white/20 shadow-2xl shadow-black/90 flex-shrink-0 bg-gray-900 group">
            <img
              src={posterUrl}
              alt={title}
              onError={(e) => tmdbImages.handleImgError(e, false)}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
          </div>

          {/* Title & Metadata & Action Buttons */}
          <div className="flex-1 min-w-0 space-y-3.5 sm:space-y-4.5 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
              <span className="px-3 py-0.5 rounded-full bg-hbo-purple/70 text-white border border-hbo-purple-light text-xs font-black uppercase tracking-wider backdrop-blur-md">
                {mediaType === 'movie' ? 'FILM' : 'SERIES'}
              </span>
              {contentRating && (
                <span className="px-2.5 py-0.5 rounded-full bg-white/15 text-white border border-white/25 text-xs font-black uppercase tracking-wider backdrop-blur-md">
                  {contentRating}
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-black font-display tracking-tight text-white leading-tight drop-shadow-2xl">
              {title}
            </h1>

            {/* Quick Meta Row */}
            <div className="flex items-center justify-center sm:justify-start gap-3 text-xs sm:text-sm text-gray-300 font-semibold flex-wrap">
              <div className="flex items-center gap-1.5 font-bold text-yellow-400">
                <Star className="w-4 h-4 fill-current" />
                <span>{details.vote_average.toFixed(1)}</span>
              </div>
              <span>•</span>
              <span>{releaseYear}</span>
              {details && 'runtime' in details && details.runtime > 0 && (
                <>
                  <span>•</span>
                  <span>{details.runtime} mins</span>
                </>
              )}
              {details && 'number_of_seasons' in details && (
                <>
                  <span>•</span>
                  <span>{details.number_of_seasons} Season{details.number_of_seasons > 1 ? 's' : ''}</span>
                </>
              )}
              {details.genres && details.genres.length > 0 && (
                <>
                  <span>•</span>
                  <span className="text-gray-300">{details.genres.map(g => g.name).join(', ')}</span>
                </>
              )}
            </div>

            {/* Primary Action Buttons */}
            <div className="flex items-center justify-center sm:justify-start gap-3 sm:gap-4 pt-2 flex-wrap p-1">
              <Link
                to={
                  mediaType === 'tv'
                    ? `/watch/tv/${tmdbId}?s=${lastWatched?.season || 1}&e=${lastWatched?.episode || 1}`
                    : `/watch/movie/${tmdbId}`
                }
                data-details-primary="true"
                className="flex items-center gap-2.5 px-8 py-3.5 rounded-xl bg-gradient-to-r from-hbo-purple to-hbo-cyan text-white font-bold text-sm sm:text-base shadow-hbo-glow hover:scale-105 transition-all tv-focus-target"
              >
                <Play className="w-5 h-5 fill-current" />
                <span>
                  {mediaType === 'tv' && lastWatched
                    ? `Resume S${lastWatched.season} E${lastWatched.episode}`
                    : 'Watch Now'}
                </span>
              </Link>

              <button
                onClick={handleToggleWatchlist}
                className={`p-3.5 rounded-full backdrop-blur-md border transition-all hover:scale-105 tv-focus-target ${
                  isWatchlist
                    ? 'bg-hbo-purple-light/30 border-hbo-purple-light text-hbo-cyan'
                    : 'bg-white/10 hover:bg-white/20 border-white/20 text-white'
                }`}
                title={isWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
                aria-label={isWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
              >
                <Bookmark className={`w-5 h-5 ${isWatchlist ? 'fill-current' : ''}`} />
              </button>

              <button
                onClick={handleToggleLike}
                className={`p-3.5 rounded-full backdrop-blur-md border transition-all hover:scale-105 tv-focus-target ${
                  isLiked
                    ? 'bg-red-500/30 border-red-500 text-red-400'
                    : 'bg-white/10 hover:bg-white/20 border-white/20 text-white'
                }`}
                title={isLiked ? 'Liked' : 'Like'}
                aria-label={isLiked ? 'Liked' : 'Like'}
              >
                <Heart className={`w-5 h-5 ${isLiked ? 'fill-current' : ''}`} />
              </button>
            </div>
          </div>
        </div>

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
              onSelectEpisode={(s, e) => {
                setLastWatched({ season: s, episode: e });
                navigate(`/watch/tv/${tmdbId}?s=${s}&e=${e}`);
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
    </div>
  );
};
