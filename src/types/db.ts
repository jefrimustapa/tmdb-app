export interface WatchHistoryItem {
  id?: number;
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  voteAverage?: number;
  season?: number;
  episode?: number;
  episodeTitle?: string;
  timestamp: number; // in seconds
  duration: number; // in seconds
  progressPercent: number; // 0-100
  updatedAt: number; // Date.now()
}

export interface LikedItem {
  id?: number;
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  voteAverage: number;
  releaseDate?: string;
  addedAt: number;
}

export interface WatchlistItem {
  id?: number;
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  voteAverage: number;
  releaseDate?: string;
  addedAt: number;
}

export interface UserSettings {
  id: string; // 'current_settings'
  preferredProvider: string;
  topProviders?: [string, string, string] | string[];
  deviceMode: 'auto' | 'tv' | 'mobile' | 'tablet' | 'desktop';
  autoplayNext: boolean;
  adBlockShield: boolean;
  filterAdult: boolean;
  filterUnreleased?: boolean;
  maturityLevel: 'all' | 'pg13' | 'family';
  directStreamMode: boolean; // Option A: Direct Stream Extractor
  streamHeaderTimeout: number; // in seconds, e.g. 3, 5, 8, or 0 for always visible
  includeNightlyUpdates: boolean; // Option to check for and install Nightly pre-releases
  updatedAt: number;
}
