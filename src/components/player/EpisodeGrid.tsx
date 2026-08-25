import React, { useState, useEffect } from 'react';
import { Play, Calendar, Star } from 'lucide-react';
import type { TMDBTVDetails, TMDBSeasonDetails } from '../../types/tmdb';
import { tmdbApi, tmdbImages } from '../../services/tmdb';

interface EpisodeGridProps {
  tvDetails: TMDBTVDetails;
  currentSeason: number;
  currentEpisode: number;
  onSelectEpisode: (season: number, episode: number, title?: string) => void;
}

export const EpisodeGrid: React.FC<EpisodeGridProps> = ({
  tvDetails,
  currentSeason,
  currentEpisode,
  onSelectEpisode
}) => {
  const [selectedSeason, setSelectedSeason] = useState(currentSeason || 1);
  const [seasonData, setSeasonData] = useState<TMDBSeasonDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Filter out season 0 (Specials) if needed or keep regular seasons
  const regularSeasons = tvDetails.seasons.filter((s) => s.season_number > 0);

  useEffect(() => {
    setSelectedSeason(currentSeason);
  }, [currentSeason]);

  useEffect(() => {
    const fetchSeason = async () => {
      setIsLoading(true);
      try {
        const data = await tmdbApi.getSeasonDetails(tvDetails.id, selectedSeason);
        setSeasonData(data);
      } catch (err) {
        console.error('Failed to load season details:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchSeason();
  }, [tvDetails.id, selectedSeason]);

  return (
    <div className="mt-8 bg-hbo-card/80 border border-hbo-border/70 rounded-2xl p-4 sm:p-6">
      {/* Season Selector Tabs */}
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <h3 className="text-lg sm:text-xl font-bold font-display text-white flex items-center gap-2">
          <span className="w-1.5 h-4 bg-hbo-purple-light rounded-full"></span>
          Episodes & Seasons
        </h3>

        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
          {regularSeasons.map((season) => (
            <button
              key={season.id}
              onClick={() => setSelectedSeason(season.season_number)}
              className={`px-4 py-1.5 rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap transition-all border tv-focus-target ${
                season.season_number === selectedSeason
                  ? 'bg-hbo-purple text-white border-hbo-purple-light shadow-hbo-glow'
                  : 'bg-hbo-hover text-gray-300 border-hbo-border hover:text-white'
              }`}
            >
              Season {season.season_number}
            </button>
          ))}
        </div>
      </div>

      {/* Episodes List */}
      {isLoading ? (
        <div className="py-12 flex justify-center">
          <div className="w-8 h-8 border-3 border-hbo-purple border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {seasonData?.episodes.map((ep) => {
            const isPlaying = selectedSeason === currentSeason && ep.episode_number === currentEpisode;
            const stillUrl = tmdbImages.still(ep.still_path, 'w300');

            return (
              <button
                key={ep.id}
                onClick={() => onSelectEpisode(selectedSeason, ep.episode_number, ep.name)}
                className={`flex text-left gap-3.5 p-3 rounded-xl border transition-all duration-200 tv-focus-target group ${
                  isPlaying
                    ? 'bg-gradient-to-r from-hbo-purple/30 to-hbo-cyan/10 border-hbo-cyan shadow-hbo-cyan-glow'
                    : 'bg-hbo-dark/60 border-hbo-border/40 hover:bg-hbo-hover hover:border-hbo-purple/60'
                }`}
              >
                {/* Episode Thumbnail */}
                <div className="relative w-28 sm:w-36 aspect-video flex-shrink-0 rounded-lg overflow-hidden bg-gray-900">
                  <img src={stillUrl} alt={ep.name} className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                  <div className={`absolute inset-0 flex items-center justify-center bg-black/40 ${isPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition`}>
                    <Play className="w-6 h-6 fill-current text-white" />
                  </div>
                  <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-[10px] font-bold text-gray-300">
                    Ep {ep.episode_number}
                  </div>
                </div>

                {/* Episode Meta */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className={`text-sm font-bold truncate ${isPlaying ? 'text-hbo-cyan' : 'text-white group-hover:text-hbo-purple-light'}`}>
                      {ep.episode_number}. {ep.name}
                    </h4>
                  </div>
                  {ep.vote_average > 0 && (
                    <div className="flex items-center gap-1 text-xs text-yellow-400 font-semibold my-1">
                      <Star className="w-3 h-3 fill-current" />
                      <span>{ep.vote_average.toFixed(1)}</span>
                    </div>
                  )}
                  <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed mt-1">
                    {ep.overview || 'No description available for this episode.'}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
