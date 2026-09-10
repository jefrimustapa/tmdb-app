import Dexie, { type Table } from 'dexie';
import type { WatchHistoryItem, LikedItem, WatchlistItem, UserSettings, RatingCacheItem } from '../types/db';

export class TMDBStreamerDB extends Dexie {
  history!: Table<WatchHistoryItem, number>;
  likes!: Table<LikedItem, number>;
  watchlist!: Table<WatchlistItem, number>;
  settings!: Table<UserSettings, string>;
  ratingCache!: Table<RatingCacheItem, string>;

  constructor() {
    super('TMDBStreamerDB');
    this.version(1).stores({
      history: '++id, tmdbId, [tmdbId+mediaType], updatedAt',
      likes: '++id, tmdbId, [tmdbId+mediaType], addedAt',
      watchlist: '++id, tmdbId, [tmdbId+mediaType], addedAt',
      settings: 'id'
    });
    this.version(2).stores({
      history: '++id, tmdbId, [tmdbId+mediaType], updatedAt',
      likes: '++id, tmdbId, [tmdbId+mediaType], addedAt',
      watchlist: '++id, tmdbId, [tmdbId+mediaType], addedAt',
      settings: 'id',
      ratingCache: 'id, cachedAt'
    });
  }
}

export const db = new TMDBStreamerDB();

let cachedSettings: UserSettings | null = null;

export function getDefaultPerformanceMode(): boolean {
  if (typeof window === 'undefined') return false;
  const isBridgeTV = typeof (window as any).AndroidBridge?.isTVDevice === 'function'
    ? (window as any).AndroidBridge.isTVDevice()
    : false;
  const ua = (typeof navigator !== 'undefined' ? navigator.userAgent : '').toLowerCase();
  const isTVUserAgent =
    ua.includes('smart-tv') ||
    ua.includes('smarttv') ||
    ua.includes('googletv') ||
    ua.includes('android tv') ||
    ua.includes('appletv') ||
    ua.includes('hbbtv') ||
    ua.includes('firetv') ||
    ua.includes('mibox') ||
    ua.includes('mitv') ||
    ua.includes('crkey') ||
    ua.includes('aft');
  return isBridgeTV || isTVUserAgent;
}

export function getDefaultTickerInterval(): number {
  return getDefaultPerformanceMode() ? 5 : 2;
}

// Defaults for Settings
export const DEFAULT_SETTINGS: UserSettings = {
  id: 'current_settings',
  preferredProvider: 'vidlink',
  topProviders: ['vidlink', 'moviesapi', 'cinesrc'],
  topAnimeProviders: ['megaplay-anime', 'cinesrc', 'moviesapi'],
  topAsianProviders: ['vidlink', '111movies', 'lari21-asian'],
  topKoreanProviders: ['kisskh-kdrama', 'cinesrc', 'moviesapi'],
  deviceMode: 'auto',
  autoplayNext: true,
  upNextPopup: true,
  upNextTriggerPercent: 90,
  upNextTimeout: 10,
  watchProgressTickerInterval: getDefaultTickerInterval(),
  adBlockShield: true,
  filterAdult: true,
  filterUnreleased: true,
  maturityLevel: 'all',
  streamResolver: 'embed',
  enabledResolvers: ['embed'],
  directStreamMode: false,
  directStreamApiUrl: 'https://tmdb-api-yfbu.onrender.com',
  torboxApiKey: 'fd12d8fe-2429-43eb-bcb3-1a3d2dfeb5f9',
  streamHeaderTimeout: 5,
  includeNightlyUpdates: false,
  autoUpdateCheck: true,
  virtualCursorEnabled: true,
  virtualCursorClicks: 2,
  virtualCursorTimeout: 10,
  virtualCursorSpeed: 'normal',
  virtualCursorStyle: 'hbo_max',
  performanceMode: getDefaultPerformanceMode(),
  updatedAt: Date.now()
};

// Database helper functions
export const dbService = {
  // Watch History
  async saveWatchProgress(item: Omit<WatchHistoryItem, 'id' | 'updatedAt'>) {
    try {
      if (item.mediaType === 'tv' && typeof item.season === 'number' && typeof item.episode === 'number') {
        // Find existing record for this specific episode
        const matches = await db.history
          .where('[tmdbId+mediaType]')
          .equals([item.tmdbId, item.mediaType])
          .and((h) => h.season === item.season && h.episode === item.episode)
          .toArray();

        if (matches.length > 0) {
          const primary = matches[0];
          await db.history.update(primary.id!, {
            ...item,
            updatedAt: Date.now()
          });

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
      } else {
        // Movie (single record per movie)
        const matches = await db.history
          .where('[tmdbId+mediaType]')
          .equals([item.tmdbId, item.mediaType])
          .toArray();

        if (matches.length > 0) {
          const primary = matches[0];
          await db.history.update(primary.id!, {
            ...item,
            updatedAt: Date.now()
          });

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
      }
      this.schedulePersistentSync();
    } catch (err) {
      console.error('Failed to save watch progress:', err);
    }
  },

  async getHistory(limit = 20): Promise<WatchHistoryItem[]> {
    try {
      const all = await db.history.orderBy('updatedAt').reverse().toArray();
      const seen = new Set<string>();
      const deduplicated: WatchHistoryItem[] = [];
      for (const item of all) {
        const key = `${item.mediaType}-${item.tmdbId}`;
        if (!seen.has(key)) {
          seen.add(key);
          deduplicated.push(item);
          if (deduplicated.length >= limit) break;
        }
      }
      return deduplicated;
    } catch {
      return [];
    }
  },

  async getHistoryItem(
    tmdbId: number,
    mediaType: 'movie' | 'tv',
    season?: number,
    episode?: number
  ): Promise<WatchHistoryItem | undefined> {
    try {
      if (mediaType === 'tv' && typeof season === 'number' && typeof episode === 'number') {
        const match = await db.history
          .where('[tmdbId+mediaType]')
          .equals([tmdbId, mediaType])
          .and((h) => h.season === season && h.episode === episode)
          .first();
        return match;
      }
      if (mediaType === 'tv') {
        const matches = await db.history
          .where('[tmdbId+mediaType]')
          .equals([tmdbId, mediaType])
          .reverse()
          .sortBy('updatedAt');
        return matches.length > 0 ? matches[0] : undefined;
      }
      return await db.history.where({ tmdbId, mediaType }).first();
    } catch {
      return undefined;
    }
  },

  async getTVShowHistory(tmdbId: number): Promise<WatchHistoryItem[]> {
    try {
      return await db.history
        .where('[tmdbId+mediaType]')
        .equals([tmdbId, 'tv'])
        .toArray();
    } catch {
      return [];
    }
  },

  async deleteHistoryItem(id: number) {
    await db.history.delete(id);
    this.schedulePersistentSync();
  },

  async removeFromHistory(tmdbId: number, mediaType: 'movie' | 'tv') {
    try {
      const items = await db.history
        .where('[tmdbId+mediaType]')
        .equals([tmdbId, mediaType])
        .toArray();
      for (const item of items) {
        if (item.id) {
          await db.history.delete(item.id);
        }
      }
      this.schedulePersistentSync();
    } catch (err) {
      console.error('Failed to remove from history:', err);
    }
  },

  async clearHistory() {
    await db.history.clear();
    this.schedulePersistentSync();
  },

  // Likes
  async toggleLike(item: Omit<LikedItem, 'id' | 'addedAt'>): Promise<boolean> {
    const existing = await db.likes.where({ tmdbId: item.tmdbId, mediaType: item.mediaType }).first();
    let liked = false;
    if (existing && existing.id) {
      await db.likes.delete(existing.id);
      liked = false; // unliked
    } else {
      await db.likes.add({ 
        ...item, 
        addedAt: Date.now() 
      });
      liked = true; // liked
    }
    this.schedulePersistentSync();
    return liked;
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
    let watchlisted = false;
    if (existing && existing.id) {
      await db.watchlist.delete(existing.id);
      watchlisted = false; // removed
    } else {
      await db.watchlist.add({ 
        ...item, 
        addedAt: Date.now() 
      });
      watchlisted = true; // added
    }
    this.schedulePersistentSync();
    return watchlisted;
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
    if (cachedSettings && cachedSettings.topProviders && cachedSettings.topProviders.length >= 3 && cachedSettings.topAnimeProviders && cachedSettings.topAnimeProviders.length >= 3) {
      return cachedSettings;
    }
    let settings = await db.settings.get('current_settings');
    if (!settings) {
      await db.settings.put(DEFAULT_SETTINGS);
      cachedSettings = DEFAULT_SETTINGS;
      return DEFAULT_SETTINGS;
    }
    if (!settings.topProviders || settings.topProviders.length < 3) {
      settings.topProviders = [
        settings.preferredProvider || 'vidlink',
        'moviesapi',
        'cinesrc'
      ];
      await db.settings.put(settings);
    }
    if (!settings.topAnimeProviders || settings.topAnimeProviders.length < 3) {
      settings.topAnimeProviders = [
        'megaplay-anime',
        'cinesrc',
        'moviesapi'
      ];
      await db.settings.put(settings);
    }
    if (!settings.topAsianProviders || settings.topAsianProviders.length < 3 || settings.topAsianProviders[0] === 'lk21-asian' || settings.topAsianProviders[0] === 'cinesrc' || (settings.topAsianProviders[0] === 'lari21-asian' && settings.topAsianProviders[1] === 'cinesrc')) {
      settings.topAsianProviders = [
        'vidlink',
        '111movies',
        'lari21-asian'
      ];
      await db.settings.put(settings);
    }
    if (!settings.topKoreanProviders || settings.topKoreanProviders.length < 3) {
      settings.topKoreanProviders = [
        'kisskh-kdrama',
        'cinesrc',
        'moviesapi'
      ];
      await db.settings.put(settings);
    }
    if (!settings.streamResolver) {
      settings.streamResolver = settings.directStreamMode ? 'private_extractor' : 'embed';
      await db.settings.put(settings);
    }
    if (!settings.torboxApiKey) {
      settings.torboxApiKey = 'fd12d8fe-2429-43eb-bcb3-1a3d2dfeb5f9';
      await db.settings.put(settings);
    }
    if (!settings.enabledResolvers || settings.enabledResolvers.length === 0) {
      settings.enabledResolvers = ['embed'];
      await db.settings.put(settings);
    }
    if (settings.performanceMode === undefined) {
      settings.performanceMode = getDefaultPerformanceMode();
      await db.settings.put(settings);
    }
    if (settings.watchProgressTickerInterval === undefined || settings.watchProgressTickerInterval < 1 || settings.watchProgressTickerInterval > 10) {
      settings.watchProgressTickerInterval = getDefaultTickerInterval();
      await db.settings.put(settings);
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
    this.schedulePersistentSync();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tmdb_settings_changed', { detail: updated }));
    }
    return updated;
  },

  // Content Rating Persistent Cache
  async getRatingCacheItem(id: string): Promise<string | boolean | null | undefined> {
    try {
      const entry = await db.ratingCache.get(id);
      return entry !== undefined ? entry.value : undefined;
    } catch {
      return undefined;
    }
  },

  async setRatingCacheItem(id: string, value: string | boolean | null): Promise<void> {
    try {
      await db.ratingCache.put({
        id,
        value,
        cachedAt: Date.now()
      });
    } catch (err) {
      console.warn('Failed to cache rating in IndexedDB:', err);
    }
  },

  async clearRatingCache(): Promise<void> {
    try {
      await db.ratingCache.clear();
    } catch (err) {
      console.warn('Failed to clear rating cache from IndexedDB:', err);
    }
  },

  // ==========================================
  // Persistent Storage & Backup / Restore
  // ==========================================

  /**
   * Bundles all user data (history, watchlist, likes, settings) into a single JSON object.
   */
  async exportAllData(): Promise<string> {
    const history = await db.history.toArray();
    const watchlist = await db.watchlist.toArray();
    const likes = await db.likes.toArray();
    const settings = await this.getSettings();

    const payload = {
      version: 1,
      exportedAt: Date.now(),
      appName: 'TMDB Streamer',
      data: {
        history,
        watchlist,
        likes,
        settings
      }
    };
    return JSON.stringify(payload, null, 2);
  },

  /**
   * Imports and restores all user data from a backup JSON string.
   */
  async importAllData(jsonString: string): Promise<{ success: boolean; count: { history: number; watchlist: number; likes: number; settings: boolean } }> {
    try {
      const parsed = JSON.parse(jsonString);
      const data = parsed.data || parsed;
      let historyCount = 0;
      let watchlistCount = 0;
      let likesCount = 0;
      let settingsRestored = false;

      // 1. Restore Settings
      if (data.settings && typeof data.settings === 'object') {
        const current = await this.getSettings();
        const merged: UserSettings = {
          ...current,
          ...data.settings,
          id: 'current_settings',
          updatedAt: Date.now()
        };
        await db.settings.put(merged);
        cachedSettings = merged;
        settingsRestored = true;
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('tmdb_settings_changed', { detail: merged }));
        }
      }

      // 2. Restore History
      if (Array.isArray(data.history)) {
        for (const item of data.history) {
          if (item && item.tmdbId && item.mediaType) {
            // Check if exists
            let existing: WatchHistoryItem | undefined;
            if (item.mediaType === 'tv' && typeof item.season === 'number' && typeof item.episode === 'number') {
              existing = await db.history
                .where('[tmdbId+mediaType]')
                .equals([item.tmdbId, item.mediaType])
                .filter(h => h.season === item.season && h.episode === item.episode)
                .first();
            } else {
              existing = await db.history
                .where('[tmdbId+mediaType]')
                .equals([item.tmdbId, item.mediaType])
                .first();
            }

            if (existing && existing.id) {
              await db.history.update(existing.id, {
                ...item,
                id: existing.id,
                updatedAt: Math.max(existing.updatedAt || 0, item.updatedAt || 0)
              });
            } else {
              const { id, ...cleanItem } = item;
              await db.history.add(cleanItem);
            }
            historyCount++;
          }
        }
      }

      // 3. Restore Watchlist
      if (Array.isArray(data.watchlist)) {
        for (const item of data.watchlist) {
          if (item && item.tmdbId && item.mediaType) {
            const existing = await db.watchlist.where({ tmdbId: item.tmdbId, mediaType: item.mediaType }).first();
            if (!existing) {
              const { id, ...cleanItem } = item;
              await db.watchlist.add(cleanItem);
              watchlistCount++;
            }
          }
        }
      }

      // 4. Restore Likes
      if (Array.isArray(data.likes)) {
        for (const item of data.likes) {
          if (item && item.tmdbId && item.mediaType) {
            const existing = await db.likes.where({ tmdbId: item.tmdbId, mediaType: item.mediaType }).first();
            if (!existing) {
              const { id, ...cleanItem } = item;
              await db.likes.add(cleanItem);
              likesCount++;
            }
          }
        }
      }

      console.log(`[PersistentStorage] Data import completed: ${historyCount} history, ${watchlistCount} watchlist, ${likesCount} likes, settings=${settingsRestored}`);
      return {
        success: true,
        count: {
          history: historyCount,
          watchlist: watchlistCount,
          likes: likesCount,
          settings: settingsRestored
        }
      };
    } catch (err) {
      console.error('[PersistentStorage] Failed to import data:', err);
      return {
        success: false,
        count: { history: 0, watchlist: 0, likes: 0, settings: false }
      };
    }
  },

  /**
   * Syncs current database state to the persistent Android storage backup file.
   * Debounced to avoid excessive disk writes during video progress ticks.
   */
  schedulePersistentSync() {
    if (typeof window === 'undefined') return;
    const bridge = (window as any).AndroidBridge;
    if (!bridge || typeof bridge.savePersistentBackup !== 'function') return;

    if (_syncTimeout) {
      clearTimeout(_syncTimeout);
    }
    _syncTimeout = setTimeout(async () => {
      try {
        const json = await dbService.exportAllData();
        const ok = bridge.savePersistentBackup(json);
        if (ok) {
          console.log('[PersistentStorage] Auto-sync to persistent storage successful');
        }
      } catch (err) {
        console.warn('[PersistentStorage] Auto-sync error:', err);
      }
    }, 2000);
  },

  /**
   * Checks if Android persistent backup exists and restores it if IndexedDB is empty or upon request.
   */
  async checkAndAutoRestore(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    const bridge = (window as any).AndroidBridge;
    if (!bridge || typeof bridge.hasPersistentBackup !== 'function' || typeof bridge.readPersistentBackup !== 'function') {
      return false;
    }

    try {
      const hasBackup = bridge.hasPersistentBackup();
      // If no persistent backup exists yet, initialize it with current local data
      if (!hasBackup) {
        const historyCount = await db.history.count();
        const watchlistCount = await db.watchlist.count();
        const likesCount = await db.likes.count();
        if (historyCount > 0 || watchlistCount > 0 || likesCount > 0) {
          console.log('[PersistentStorage] Creating initial backup from existing data...');
          await this.backupToPersistentStorage();
        }
        return false;
      }

      // Check if IndexedDB is brand new or empty (e.g. after fresh install)
      const historyCount = await db.history.count();
      const watchlistCount = await db.watchlist.count();
      const likesCount = await db.likes.count();

      // If already has significant local data, don't overwrite blindly on boot, but do restore if fresh install
      if (historyCount === 0 && watchlistCount === 0 && likesCount === 0) {
        console.log('[PersistentStorage] Fresh install detected! Automatically restoring from persistent backup...');
        const backupJson = bridge.readPersistentBackup();
        if (backupJson) {
          const res = await this.importAllData(backupJson);
          return res.success;
        }
      }
    } catch (err) {
      console.warn('[PersistentStorage] Auto-restore check failed:', err);
    }
    return false;
  },

  /**
   * Manually trigger persistent backup to Android storage.
   */
  async backupToPersistentStorage(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    const bridge = (window as any).AndroidBridge;
    if (!bridge || typeof bridge.savePersistentBackup !== 'function') return false;
    try {
      const json = await this.exportAllData();
      return bridge.savePersistentBackup(json);
    } catch (err) {
      console.error('[PersistentStorage] Manual backup failed:', err);
      return false;
    }
  },

  /**
   * Manually restore from Android persistent storage backup.
   */
  async restoreFromPersistentStorage(): Promise<{ success: boolean; count?: any }> {
    if (typeof window === 'undefined') return { success: false };
    const bridge = (window as any).AndroidBridge;
    if (!bridge || typeof bridge.readPersistentBackup !== 'function') return { success: false };
    try {
      const json = bridge.readPersistentBackup();
      if (!json) return { success: false };
      return await this.importAllData(json);
    } catch (err) {
      console.error('[PersistentStorage] Manual restore failed:', err);
      return { success: false };
    }
  },

  getPersistentBackupMeta(): { available: boolean; timestamp: number; location: string } {
    if (typeof window === 'undefined') return { available: false, timestamp: 0, location: '' };
    const bridge = (window as any).AndroidBridge;
    if (!bridge || typeof bridge.hasPersistentBackup !== 'function') {
      return { available: false, timestamp: 0, location: '' };
    }
    try {
      const available = bridge.hasPersistentBackup();
      const timestamp = typeof bridge.getPersistentBackupTimestamp === 'function' ? bridge.getPersistentBackupTimestamp() : 0;
      const location = typeof bridge.getPersistentBackupLocation === 'function' ? bridge.getPersistentBackupLocation() : '';
      return { available, timestamp, location };
    } catch {
      return { available: false, timestamp: 0, location: '' };
    }
  }
};

let _syncTimeout: any = null;

