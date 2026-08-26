import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { X, Play, Heart, Bookmark, Star, Calendar, Clock, Film, ShieldAlert } from 'lucide-react';
import type { TMDBMediaItem, TMDBMovieDetails, TMDBTVDetails } from '../../types/tmdb';
import { tmdbApi, tmdbImages, extractContentRating } from '../../services/tmdb';
import { dbService } from '../../services/db';

interface DetailsModalProps {
  item: TMDBMediaItem | null;
  onClose: () => void;
}

export const DetailsModal: React.FC<DetailsModalProps> = ({ item, onClose }) => {
  const [details, setDetails] = useState<TMDBMovieDetails | TMDBTVDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [isWatchlist, setIsWatchlist] = useState(false);

  const mediaType: 'movie' | 'tv' = item?.media_type === 'tv' ? 'tv' : 'movie';

  useEffect(() => {
    if (!item) return;

    const fetchDetails = async () => {
      setIsLoading(true);
      try {
        if (mediaType === 'movie') {
          const res = await tmdbApi.getMovieDetails(item.id);
          setDetails(res);
        } else {
          const res = await tmdbApi.getTVDetails(item.id);
          setDetails(res);
        }

        const [liked, watchlisted] = await Promise.all([
          dbService.isLiked(item.id, mediaType),
          dbService.isWatchlisted(item.id, mediaType)
        ]);
        setIsLiked(liked);
        setIsWatchlist(watchlisted);
      } catch (err) {
        console.error('Failed to load item details:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDetails();
  }, [item, mediaType]);

  useEffect(() => {
    if (!item) return;

    // Focus the stream button immediately when modal opens on TV
    const timer = setTimeout(() => {
      const streamBtn = document.querySelector<HTMLElement>('[data-modal-stream-btn="true"]');
      if (streamBtn) {
        streamBtn.focus();
      }
    }, 150);

    const handleModalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.keyCode === 27) {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleModalKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleModalKeyDown);
    };
  }, [item, onClose]);

  if (!item) return null;

  const title = item.title || item.name || 'Untitled';
  const backdropUrl = tmdbImages.backdrop(item.backdrop_path, 'w1280');
  const releaseYear = (item.release_date || item.first_air_date || '').split('-')[0];
  const contentRating = extractContentRating(details);

  const handleToggleLike = async () => {
    const status = await dbService.toggleLike({
      tmdbId: item.id,
      mediaType,
      title,
      posterPath: item.poster_path,
      backdropPath: item.backdrop_path,
      voteAverage: item.vote_average,
      releaseDate: item.release_date || item.first_air_date
    });
    setIsLiked(status);
  };

  const handleToggleWatchlist = async () => {
    const status = await dbService.toggleWatchlist({
      tmdbId: item.id,
      mediaType,
      title,
      posterPath: item.poster_path,
      backdropPath: item.backdrop_path,
      voteAverage: item.vote_average,
      releaseDate: item.release_date || item.first_air_date
    });
    setIsWatchlist(status);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl bg-hbo-card border border-hbo-border shadow-2xl no-scrollbar">
        {/* Close Button */}
        <button
          data-modal-close="true"
          onClick={onClose}
          className="absolute top-4 right-4 z-30 p-2 rounded-full bg-black/70 hover:bg-black text-white backdrop-blur-md border border-white/20 transition hover:scale-110 tv-focus-target"
          title="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Hero Backdrop in Modal */}
        <div className="relative aspect-video sm:aspect-[21/9] w-full overflow-hidden bg-gray-950">
          <img
            src={backdropUrl}
            alt={title}
            onError={(e) => tmdbImages.handleImgError(e, true)}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-hbo-card via-hbo-card/40 to-transparent" />

          {/* Modal Header Actions */}
          <div className="absolute bottom-6 left-6 right-6 flex items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2.5 py-0.5 rounded bg-hbo-purple/70 text-hbo-cyan border border-hbo-cyan/30 text-xs font-bold uppercase inline-block">
                  {mediaType === 'movie' ? 'Movie' : 'TV Series'}
                </span>
                {contentRating && (
                  <span className="px-2 py-0.5 rounded bg-white/20 text-white border border-white/30 text-xs font-black uppercase tracking-wider">
                    {contentRating}
                  </span>
                )}
              </div>
              <h2 className="text-2xl sm:text-4xl font-black font-display text-white tracking-tight leading-tight">
                {title}
              </h2>
            </div>

            <Link
              to={`/watch/${mediaType}/${item.id}`}
              onClick={onClose}
              data-modal-stream-btn="true"
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-hbo-purple to-hbo-cyan text-white font-bold text-sm shadow-hbo-glow hover:scale-105 transition tv-focus-target"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Stream</span>
            </Link>
          </div>
        </div>

        {/* Modal Content Details */}
        <div className="p-6 sm:p-8 space-y-6">
          {/* Metadata Row */}
          <div className="flex items-center gap-4 text-xs sm:text-sm text-gray-300 flex-wrap">
            <div className="flex items-center gap-1 font-bold text-yellow-400">
              <Star className="w-4 h-4 fill-current" />
              <span>{item.vote_average.toFixed(1)}</span>
            </div>
            <span>•</span>
            <span>{releaseYear}</span>
            {contentRating && (
              <>
                <span>•</span>
                <span className="px-2 py-0.5 rounded bg-white/10 border border-white/20 text-white font-bold text-xs">
                  {contentRating}
                </span>
              </>
            )}
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
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={handleToggleLike}
                className={`p-2.5 rounded-full border transition hover:scale-105 ${
                  isLiked ? 'bg-red-500/30 border-red-500 text-red-400' : 'bg-white/10 border-white/20 text-white'
                }`}
              >
                <Heart className="w-4 h-4" />
              </button>
              <button
                onClick={handleToggleWatchlist}
                className={`p-2.5 rounded-full border transition hover:scale-105 ${
                  isWatchlist ? 'bg-hbo-purple-light/30 border-hbo-purple-light text-hbo-cyan' : 'bg-white/10 border-white/20 text-white'
                }`}
              >
                <Bookmark className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Genres */}
          {details?.genres && (
            <div className="flex items-center gap-2 flex-wrap">
              {details.genres.map((g) => (
                <span
                  key={g.id}
                  className="px-3 py-1 rounded-full bg-hbo-hover border border-hbo-border text-xs font-semibold text-gray-300"
                >
                  {g.name}
                </span>
              ))}
            </div>
          )}

          {/* Synopsis */}
          <div>
            <h4 className="text-sm font-bold text-gray-200 uppercase tracking-wider mb-2">Synopsis</h4>
            <p className="text-sm sm:text-base text-gray-300 leading-relaxed">
              {details?.overview || item.overview || 'No synopsis available.'}
            </p>
          </div>

          {/* Cast */}
          {details?.credits?.cast && details.credits.cast.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-bold text-gray-200 uppercase tracking-wider">Top Cast</h4>
                <span className="text-[11px] text-gray-400">Click to filter filmography</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {details.credits.cast.slice(0, 8).map((actor) => (
                  <Link
                    key={actor.id}
                    to={`/search?personId=${actor.id}&personName=${encodeURIComponent(actor.name)}`}
                    onClick={onClose}
                    className="flex items-center gap-2.5 bg-hbo-dark/60 hover:bg-hbo-dark p-2 rounded-xl border border-hbo-border/40 hover:border-hbo-cyan/40 transition hover:scale-[1.02] group"
                    title={`View ${actor.name}'s filmography`}
                  >
                    <img
                      src={tmdbImages.profile(actor.profile_path, 'w185')}
                      alt={actor.name}
                      className="w-10 h-10 rounded-full object-cover bg-gray-800 flex-shrink-0 group-hover:ring-2 ring-hbo-cyan transition"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate group-hover:text-hbo-cyan transition">{actor.name}</p>
                      <p className="text-[11px] text-gray-400 truncate">{actor.character}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
