export interface WatchHistoryItem {
  id?: number;
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  stillPath?: string | null;
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

export type VirtualCursorStyle =
  | 'hbo_max'
  | 'netflix'
  | 'apple_tv'
  | 'prime_video'
  | 'disney_plus'
  | 'viu'
  | 'hulu'
  | 'paramount'
  | 'crunchyroll'
  | 'peacock'
  | 'cyan_glow'
  | 'classic_white'
  | 'neon_yellow'
  | 'laser_red'
  | 'emerald_green'
  | 'magenta_pulse'
  | 'amber_gold'
  | 'crosshair_target'
  | 'minimal_dot'
  | 'classic_hand';

export type StreamResolverType = 'embed' | 'private_extractor' | 'torbox';

export interface UserSettings {
  id: string; // 'current_settings'
  preferredProvider: string;
  topProviders?: [string, string, string] | string[];
  deviceMode: 'auto' | 'tv' | 'mobile' | 'tablet' | 'desktop';
  autoplayNext: boolean;
  upNextPopup?: boolean;
  upNextTriggerPercent?: number; // e.g. 75, 80, 85, 90, 95
  upNextTimeout?: number; // e.g. 5, 10, 15, 20
  adBlockShield: boolean;
  filterAdult: boolean;
  filterUnreleased?: boolean;
  maturityLevel: 'all' | 'pg13' | 'family';
  streamResolver: StreamResolverType; // Legacy single selection
  enabledResolvers: StreamResolverType[]; // Multi or single enabled engines (e.g. ['torbox', 'private_extractor', 'embed'])
  directStreamApiUrl?: string; // Custom or default Consumet API URL (e.g. https://tmdb-api-yfbu.onrender.com)
  torboxApiKey?: string; // TorBox API Key (for 4K HDR & 1080p cloud streams)
  directStreamMode?: boolean; // Legacy fallback flag
  streamHeaderTimeout: number; // in seconds, e.g. 3, 5, 8, or 0 for always visible
  includeNightlyUpdates: boolean; // Option to check for and install Nightly pre-releases
  autoUpdateCheck?: boolean; // Automatically check for updates on application startup
  virtualCursorEnabled?: boolean; // TV Mode on-demand virtual cursor
  virtualCursorClicks?: 2 | 3; // Number of repeated OK clicks to activate (2 or 3)
  virtualCursorTimeout?: number; // Inactivity auto-hide in seconds (5, 10, 15, 30, 0 for never)
  virtualCursorSpeed?: 'slow' | 'normal' | 'fast'; // Cursor movement speed
  virtualCursorStyle?: VirtualCursorStyle; // Cursor style/appearance (10 options)
  performanceMode?: boolean; // Lite graphics & fast 60fps rendering (Default: ON for TV, OFF for Mobile)
  updatedAt: number;
}
