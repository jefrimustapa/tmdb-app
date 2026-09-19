import { dbService } from './db';

export interface Msm32ResolveResult {
  streamUrl: string;
  filename?: string;
  size?: number;
  cached?: boolean;
}

export interface Msm32HealthResult {
  ok: boolean;
  status?: string;
  uptime?: number;
  isConnected?: boolean;
  cachedStreams?: number;
  error?: string;
}

export interface Msm32CacheEntry {
  result: Msm32ResolveResult | null;
  timestamp: number;
}

class Msm32MappingService {
  private clientCache = new Map<string, Msm32CacheEntry>();
  private readonly CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours for successful resolves
  private readonly FAILED_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes for failed attempts
  private readonly STORAGE_KEY = 'msm32_client_cache';

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (raw) {
        const entries: [string, Msm32CacheEntry][] = JSON.parse(raw);
        if (Array.isArray(entries)) {
          for (const [k, v] of entries) {
            if (v && typeof v.timestamp === 'number') {
              this.clientCache.set(k, v);
            }
          }
        }
      }
    } catch (e) {
      console.warn('[MSM32] Failed to load local cache from storage:', e);
    }
  }

  private saveToStorage() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const entries = Array.from(this.clientCache.entries()).slice(-200);
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(entries));
    } catch {}
  }

  private async getBaseUrl(): Promise<string> {
    const settings = await dbService.getSettings();
    let url = settings?.msm32GetterUrl?.trim();
    
    // Automatically sanitize and enforce https for onrender.com
    if (url && url.includes('onrender.com') && url.startsWith('http://')) {
      url = url.replace('http://', 'https://');
    }

    // In native Capacitor or HTTPS web context, insecure http:// URLs get blocked by Chromium Mixed Content.
    // If the configured URL is an unrouteable local IP or empty, default securely to Render Cloud.
    const isHttpsContext = typeof window !== 'undefined' && window.location?.protocol === 'https:';
    if (!url || url === 'http://localhost:3033' || (isHttpsContext && (url.startsWith('http://192.168.') || url.startsWith('http://10.') || url.startsWith('http://localhost')))) {
      url = 'https://msm-getter.onrender.com';
    }

    return url.replace(/\/+$/, '');
  }

  /**
   * Test connectivity to the MSM Getter microservice (/health)
   */
  async testConnection(customUrl?: string): Promise<Msm32HealthResult> {
    let target = customUrl?.trim();
    if (!target || target === 'http://localhost:3033') {
      target = await this.getBaseUrl();
    }
    const baseUrl = target.replace(/\/+$/, '');
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(`${baseUrl}/health`, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
      });
      clearTimeout(timer);

      if (!res.ok) {
        return { ok: false, error: `HTTP ${res.status}: ${res.statusText}` };
      }

      const data = await res.json();
      return {
        ok: true,
        status: data.status,
        uptime: data.uptime,
        isConnected: data.isConnected,
        cachedStreams: data.cachedStreams,
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return { ok: false, error: 'Connection timed out (server may be waking up)' };
      }
      return { ok: false, error: err.message || 'Server unreachable' };
    }
  }

  public clearCache(): number {
    const count = this.clientCache.size;
    this.clientCache.clear();
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.removeItem(this.STORAGE_KEY);
      }
    } catch {}
    return count;
  }

  public getCacheStats(): { total: number; success: number; failed: number } {
    let success = 0;
    let failed = 0;
    const now = Date.now();
    for (const [, entry] of this.clientCache.entries()) {
      if (entry.result) {
        if (now - entry.timestamp < this.CACHE_TTL_MS) success++;
      } else {
        if (now - entry.timestamp < this.FAILED_CACHE_TTL_MS) failed++;
      }
    }
    return { total: success + failed, success, failed };
  }

  /**
   * Resolve a title to a direct HTTP streaming URL via MSM Getter
   */
  async resolveStream(
    title: string,
    year?: number | string,
    season?: number,
    episode?: number,
    signal?: AbortSignal
  ): Promise<Msm32ResolveResult | null> {
    if (signal?.aborted) {
      console.log(`[MSM32] Resolution aborted prior to request for "${title}"`);
      return null;
    }

    const baseUrl = await this.getBaseUrl();
    if (signal?.aborted) return null;

    // 1. Check local client cache first (0ms, 0 network requests) - strictly host-isolated
    const clientKey = `${baseUrl}_${(title || '').toLowerCase().trim()}_${year || ''}_${season || ''}_${episode || ''}_720`;
    const localHit = this.clientCache.get(clientKey);
    if (localHit) {
      if (localHit.result && Date.now() - localHit.timestamp < this.CACHE_TTL_MS) {
        console.log(`[MSM32] Client local cache HIT for "${title}" -> Instant stream`);
        return localHit.result;
      }
      if (!localHit.result && Date.now() - localHit.timestamp < this.FAILED_CACHE_TTL_MS) {
        console.log(`[MSM32] Client local cache negative fast HIT for "${title}" -> Cached null`);
        return null;
      }
    }

    const controller = new AbortController();
    // Allow up to 35 seconds to accommodate cold starts on free containers
    const timer = setTimeout(() => controller.abort(), 35000);

    const onExternalAbort = () => {
      clearTimeout(timer);
      controller.abort();
    };

    if (signal) {
      signal.addEventListener('abort', onExternalAbort, { once: true });
    }

    try {
      const params = new URLSearchParams({ title });
      if (year) params.append('year', String(year));
      if (typeof season === 'number' && !isNaN(season)) params.append('season', String(season));
      if (typeof episode === 'number' && !isNaN(episode)) params.append('episode', String(episode));
      params.append('maxQuality', '720'); // cap server-side resolution to 720p max

      const res = await fetch(`${baseUrl}/api/resolve?${params.toString()}`, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
      });
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onExternalAbort);

      if (signal?.aborted) return null;

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.warn('[MSM32] Resolve returned error status:', res.status, errorData);
        // Cache negative response for 10 minutes so repeated navigation doesn't hammer slow server
        this.clientCache.set(clientKey, { result: null, timestamp: Date.now() });
        this.saveToStorage();
        return null;
      }

      const data = await res.json();
      if (signal?.aborted) return null;

      if (data.success && data.streamUrl) {
        let finalStreamUrl = data.streamUrl;
        const settings = await dbService.getSettings();
        const chunkSize = settings?.msm32ChunkSize || 524288;
        try {
          const u = new URL(finalStreamUrl);
          u.searchParams.set('chunkSize', String(chunkSize));
          finalStreamUrl = u.toString();
        } catch {}

        const resolved: Msm32ResolveResult = {
          streamUrl: finalStreamUrl,
          filename: data.filename,
          size: data.size,
          cached: data.cached,
        };
        // Store in client-side memory cache and storage for instant future loads
        this.clientCache.set(clientKey, { result: resolved, timestamp: Date.now() });
        this.saveToStorage();
        return resolved;
      }

      // No stream resolved
      this.clientCache.set(clientKey, { result: null, timestamp: Date.now() });
      this.saveToStorage();
      return null;
    } catch (err: any) {
      if (signal?.aborted || err?.name === 'AbortError') {
        console.log(`[MSM32] Stream resolution cancelled for "${title}"`);
        return null;
      }
      console.error('[MSM32] Resolution request failed:', err);
      return null;
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onExternalAbort);
    }
  }
}

export const msm32Service = new Msm32MappingService();
