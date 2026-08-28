import Dexie, { type Table } from 'dexie';
import type { WatchHistoryItem, LikedItem, WatchlistItem, UserSettings } from '../types/db';

export class TMDBStreamerDB extends Dexie {
  history!: Table<WatchHistoryItem, number>;
  likes!: Table<LikedItem, number>;
  watchlist!: Table<WatchlistItem, number>;
  settings!: Table<UserSettings, string>;

  constructor() {
    super('TMDBStreamerDB');
    this.version(1).stores({
      history: '++id, tmdbId, [tmdbId+mediaType], updatedAt',
      likes: '++id, tmdbId, [tmdbId+mediaType], addedAt',
      watchlist: '++id, tmdbId, [tmdbId+mediaType], addedAt',
      settings: 'id'
    });
  }
}

export const db = new TMDBStreamerDB();

let cachedSettings: UserSettings | null = null;

// Defaults for Settings
export const DEFAULT_SETTINGS: UserSettings = {
  id: 'current_settings',
  preferredProvider: 'vidlink',
  deviceMode: 'auto',
  autoplayNext: true,
  adBlockShield: true,
  filterAdult: true,
  filterUnreleased: true,
  maturityLevel: 'all',
  directStreamMode: false,
  streamHeaderTimeout: 5,
  includeNightlyUpdates: false,
  updatedAt: Date.now()
};

// Database helper functions
export const dbService = {
  // Watch History
  async saveWatchProgress(item: Omit<WatchHistoryItem, 'id' | 'updatedAt'>) {
    try {
      // Find all existing records for this media to prevent and clean duplicates
      const matches = await db.history
        .where('[tmdbId+mediaType]')
        .equals([item.tmdbId, item.mediaType])
        .toArray();

      if (matches.length > 0) {
        // Keep the first one and update it
        const primary = matches[0];
        await db.history.update(primary.id!, {
          ...item,
          updatedAt: Date.now()
        });

        // Clean up any extraneous duplicate rows if they exist
        if (matches.length > 1) {
          for (let i = 1; i < matches.length; i++) {
            if (matches[i].id) {
              await db.history.delete(matches[i].id!);
            }
          }
        }
      } else {
        await db.history.add({
          ...item,
          updatedAt: Date.now()
        });
      }
    } catch (e) {
      console.error('Failed to save watch progress:', e);
    }
  },

  async getHistory(limit = 20): Promise<WatchHistoryItem[]> {
    const rawHistory = await db.history.orderBy('updatedAt').reverse().toArray();
    // Unique by tmdbId + mediaType
    const seen = new Set<string>();
    const unique: WatchHistoryItem[] = [];
    for (const item of rawHistory) {
      const key = `${item.tmdbId}-${item.mediaType}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(item);
      }
    }
    return unique.slice(0, limit);
  },

  async getHistoryItem(tmdbId: number, mediaType: 'movie' | 'tv'): Promise<WatchHistoryItem | undefined> {
    return await db.history.where({ tmdbId, mediaType }).first();
  },

  async removeFromHistory(tmdbId: number, mediaType: 'movie' | 'tv') {
    const existing = await db.history.where({ tmdbId, mediaType }).first();
    if (existing && existing.id) {
      await db.history.delete(existing.id);
    }
  },

  async clearHistory() {
    await db.history.clear();
  },

  // Likes
  async toggleLike(item: Omit<LikedItem, 'id' | 'addedAt'>): Promise<boolean> {
    const existing = await db.likes.where({ tmdbId: item.tmdbId, mediaType: item.mediaType }).first();
    if (existing && existing.id) {
      await db.likes.delete(existing.id);
      return false; // unliked
    } else {
      await db.likes.add({ ...item, addedAt: Date.now() });
      return true; // liked
    }
  },

  async isLiked(tmdbId: number, mediaType: 'movie' | 'tv'): Promise<boolean> {
    const count = await db.likes.where({ tmdbId, mediaType }).count();
    return count > 0;
  },

  async getLikes(): Promise<LikedItem[]> {
    return await db.likes.orderBy('addedAt').reverse().toArray();
  },

  // Watchlist
  async toggleWatchlist(item: Omit<WatchlistItem, 'id' | 'addedAt'>): Promise<boolean> {
    const existing = await db.watchlist.where({ tmdbId: item.tmdbId, mediaType: item.mediaType }).first();
    if (existing && existing.id) {
      await db.watchlist.delete(existing.id);
      return false; // removed
    } else {
      await db.watchlist.add({ ...item, addedAt: Date.now() });
      return true; // added
    }
  },

  async isWatchlisted(tmdbId: number, mediaType: 'movie' | 'tv'): Promise<boolean> {
    const count = await db.watchlist.where({ tmdbId, mediaType }).count();
    return count > 0;
  },

  async getWatchlist(): Promise<WatchlistItem[]> {
    return await db.watchlist.orderBy('addedAt').reverse().toArray();
  },

  // Settings
  async getSettings(): Promise<UserSettings> {
    if (cachedSettings) {
      return cachedSettings;
    }
    const settings = await db.settings.get('current_settings');
    if (!settings) {
      await db.settings.put(DEFAULT_SETTINGS);
      cachedSettings = DEFAULT_SETTINGS;
      return DEFAULT_SETTINGS;
    }
    cachedSettings = settings;
    return settings;
  },

  async updateSettings(partial: Partial<UserSettings>): Promise<UserSettings> {
    const current = await this.getSettings();
    const updated: UserSettings = {
      ...current,
      ...partial,
      updatedAt: Date.now()
    };
    cachedSettings = updated;
    await db.settings.put(updated);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tmdb_settings_changed', { detail: updated }));
    }
    return updated;
  }
};
