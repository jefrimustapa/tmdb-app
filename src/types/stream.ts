export interface StreamProvider {
  id: string;
  name: string;
  tagline: string;
  badge: string;
  category?: 'general' | 'anime';
  getMovieUrl: (tmdbId: number) => string;
  getTVUrl: (tmdbId: number, season: number, episode: number) => string;
  getAnimeUrl?: (malId: number, season?: number, episode?: number, type?: 'sub' | 'dub') => string;
}

export interface ActiveStream {
  mediaType: 'movie' | 'tv';
  tmdbId: number;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  season?: number;
  episode?: number;
  episodeTitle?: string;
}
