import { dbService } from './db';

export interface TgStreamerResolveResult {
  streamUrl: string;
  filename?: string;
  size?: number;
  cached?: boolean;
  videoCodec?: string;
}

export type MsmResolveResult = TgStreamerResolveResult;
export type Msm32ResolveResult = TgStreamerResolveResult;

export interface TgStreamerHealthResult {
  ok: boolean;
  status?: string;
  uptime?: number;
  isConnected?: boolean;
  cachedStreams?: number;
  error?: string;
}

export type MsmHealthResult = TgStreamerHealthResult;
export type Msm32HealthResult = TgStreamerHealthResult;

export interface CachedStreamRecord {
  queryKey: string;
  docId: string;
  filename: string;
  size: number;
  sizeFormatted: string;
  mimeType?: string;
  dcId?: number;
  createdAt?: number;
}

export interface CachedStreamsResponse {
  success: boolean;
  total: number;
  totalSizeBytes: number;
  items: CachedStreamRecord[];
}

export interface ResolverInfo {
  id: string;
  name: string;
  defaultBot: string;
}

export interface ResolversResponse {
  success: boolean;
  activeResolver: string;
  targetBotUsernames: Record<string, string>;
  resolvers: ResolverInfo[];
}

class TgStreamerService {
  constructor() {
    this.purgeLegacyClientStorage();
  }

  private purgeLegacyClientStorage() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.removeItem('msm_client_cache');
        localStorage.removeItem('msm_client_cache_v2');
        localStorage.removeItem('msm32_client_cache');
        localStorage.removeItem('msm32_client_cache_v2');
        localStorage.removeItem('tg_client_cache');
      }
    } catch {}
  }

  public async getBaseUrl(): Promise<string> {
    const settings = await dbService.getSettings();
    let url = (settings?.tgStreamerUrl || settings?.msmGetterUrl || settings?.msm32GetterUrl)?.trim();
    
    if (!url) {
      url = 'https://www.julietmike.net:3033';
    }

    return url.replace(/\/+$/, '');
  }

  /**
   * Test connectivity to the TGStrm microservice (/health)
   */
  async testConnection(customUrl?: string): Promise<TgStreamerHealthResult> {
    let target = customUrl?.trim();
    if (!target) {
      target = await this.getBaseUrl();
    }
    const baseUrl = target.replace(/\/+$/, '');
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);

      // Probe /tg/health, fallback /msm/health, fallback /health
      let res = await fetch(`${baseUrl}/tg/health`, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
      });
      if (!res.ok && res.status === 404) {
        res = await fetch(`${baseUrl}/msm/health`, {
          signal: controller.signal,
          headers: { 'Accept': 'application/json' },
        });
      }
      if (!res.ok && res.status === 404) {
        res = await fetch(`${baseUrl}/health`, {
          signal: controller.signal,
          headers: { 'Accept': 'application/json' },
        });
      }
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
    this.purgeLegacyClientStorage();
    return 0;
  }

  /**
   * Resolve a title to a direct HTTP streaming URL via TGStrm
   */
  async resolveStream(
    title: string,
    year?: number | string,
    season?: number,
    episode?: number,
    signal?: AbortSignal,
    force?: boolean,
    totalSeasons?: number,
    altTitle?: string,
    maxPages?: number,
    resolver?: string
  ): Promise<TgStreamerResolveResult | null> {
    if (signal?.aborted) {
      console.log(`[TG-STREAMER] Resolution aborted prior to request for "${title}"`);
      return null;
    }

    const baseUrl = await this.getBaseUrl();
    if (signal?.aborted) return null;

    const settings = await dbService.getSettings();
    const timeoutSeconds = settings?.tgTimeout || settings?.msmTimeout || settings?.msm32Timeout || 90;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutSeconds * 1000);

    const onExternalAbort = () => {
      clearTimeout(timer);
      controller.abort();
    };

    if (signal) {
      signal.addEventListener('abort', onExternalAbort, { once: true });
    }

    try {
      const maxQuality = settings?.tgMaxQuality || settings?.msmMaxQuality || settings?.msm32MaxQuality || '1080';
      const activeResolver = resolver || settings?.tgActiveResolver || 'msm';

      const params = new URLSearchParams({ title });
      if (altTitle && altTitle.trim()) params.append('altTitle', altTitle.trim());
      if (year) params.append('year', String(year));
      if (typeof season === 'number' && !isNaN(season)) params.append('season', String(season));
      if (typeof episode === 'number' && !isNaN(episode)) params.append('episode', String(episode));
      if (typeof totalSeasons === 'number' && !isNaN(totalSeasons)) params.append('totalSeasons', String(totalSeasons));
      if (typeof maxPages === 'number' && !isNaN(maxPages) && maxPages >= 1) params.append('maxPages', String(maxPages));
      params.append('maxQuality', maxQuality);
      params.append('resolver', activeResolver);
      if (force) params.append('force', 'true');

      const res = await fetch(`${baseUrl}/api/resolve?${params.toString()}`, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
      });
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onExternalAbort);

      if (signal?.aborted) return null;

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.warn('[TG-STREAMER] Resolve returned error status:', res.status, errorData);
        return null;
      }

      const data = await res.json();
      if (signal?.aborted) return null;

      if (data.success && data.streamUrl) {
        let finalStreamUrl = data.streamUrl;
        try {
          const u = new URL(finalStreamUrl);
          if (typeof window !== 'undefined') {
            const bridge = (window as any).AndroidBridge;
            if (bridge?.getDeviceName) {
              try {
                const devName = bridge.getDeviceName();
                if (devName && typeof devName === 'string' && devName.trim()) {
                  u.searchParams.set('clientName', devName.trim());
                }
              } catch {}
            }
          }
          finalStreamUrl = u.toString();
        } catch {}

        const resolved: TgStreamerResolveResult = {
          streamUrl: finalStreamUrl,
          filename: data.filename,
          size: data.size,
          cached: data.cached,
        };
        return resolved;
      }

      return null;
    } catch (err: any) {
      if (signal?.aborted || err?.name === 'AbortError') {
        console.log(`[TG-STREAMER] Stream resolution cancelled for "${title}"`);
        return null;
      }
      console.error('[TG-STREAMER] Resolution request failed:', err);
      return null;
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onExternalAbort);
    }
  }

  /**
   * Pre-fetches and caches the next episode at the server in the background (/api/prefetch).
   */
  async prefetchEpisode(
    title: string,
    year?: number | string,
    season?: number,
    episode?: number,
    totalSeasons?: number,
    resolver?: string
  ): Promise<boolean> {
    try {
      const baseUrl = await this.getBaseUrl();
      const settings = await dbService.getSettings();
      const maxQuality = settings?.tgMaxQuality || settings?.msmMaxQuality || settings?.msm32MaxQuality || '1080';
      const activeResolver = resolver || settings?.tgActiveResolver || 'msm';

      const params = new URLSearchParams({ title });
      if (year) params.append('year', String(year));
      if (typeof season === 'number' && !isNaN(season)) params.append('season', String(season));
      if (typeof episode === 'number' && !isNaN(episode)) params.append('episode', String(episode));
      if (typeof totalSeasons === 'number' && !isNaN(totalSeasons)) params.append('totalSeasons', String(totalSeasons));
      params.append('maxQuality', maxQuality);
      params.append('resolver', activeResolver);
      params.append('prefetch', 'true');

      console.log(`[TG-STREAMER Prefetch] Dispatching /api/prefetch for "${title}" S${season}E${episode} (resolver: ${activeResolver})...`);
      
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(`${baseUrl}/api/prefetch?${params.toString()}`, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
      });
      clearTimeout(timer);

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        console.log(`[TG-STREAMER Prefetch] Server acknowledged prefetch for "${title}" S${season}E${episode}:`, data);
        return true;
      }
      return false;
    } catch (err: any) {
      console.warn(`[TG-STREAMER Prefetch] Non-critical prefetch error for "${title}" S${season}E${episode}:`, err?.message || err);
      return false;
    }
  }

  /**
   * Fetch all cached video streams from central DB on server
   */
  async getCachedStreams(customUrl?: string, search?: string): Promise<CachedStreamsResponse> {
    const baseUrl = (customUrl?.trim() || (await this.getBaseUrl())).replace(/\/+$/, '');
    try {
      const q = search ? `?search=${encodeURIComponent(search.trim())}` : '';
      const res = await fetch(`${baseUrl}/api/cache${q}`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      return await res.json();
    } catch (err: any) {
      console.error('[TG-STREAMER] Failed to fetch cached streams:', err);
      return { success: false, total: 0, totalSizeBytes: 0, items: [] };
    }
  }

  /**
   * Evict a single cached video record by queryKey or docId
   */
  async evictCachedStream(queryKey?: string, docId?: string, customUrl?: string): Promise<boolean> {
    const baseUrl = (customUrl?.trim() || (await this.getBaseUrl())).replace(/\/+$/, '');
    try {
      const params = new URLSearchParams();
      if (queryKey) params.set('key', queryKey);
      if (docId) params.set('docId', docId);

      const res = await fetch(`${baseUrl}/api/cache?${params.toString()}`, {
        method: 'DELETE',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) return false;
      const data = await res.json();
      return !!data.evicted;
    } catch (err) {
      console.error('[TG-STREAMER] Failed to evict cached stream:', err);
      return false;
    }
  }

  /**
   * Clear all cached streams from the central database
   */
  async clearAllCachedStreams(customUrl?: string): Promise<boolean> {
    const baseUrl = (customUrl?.trim() || (await this.getBaseUrl())).replace(/\/+$/, '');
    try {
      const res = await fetch(`${baseUrl}/api/cache/clear`, {
        method: 'POST',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) return false;
      const data = await res.json();
      return !!data.success;
    } catch (err) {
      console.error('[TG-STREAMER] Failed to clear cached streams:', err);
      return false;
    }
  }

  /**
   * Fetch list of available resolvers from server (/api/resolvers)
   */
  async getResolvers(): Promise<ResolversResponse | null> {
    try {
      const baseUrl = await this.getBaseUrl();
      const res = await fetch(`${baseUrl}/api/resolvers`, {
        headers: { 'Accept': 'application/json' },
      });
      if (res.ok) {
        return await res.json();
      }
      return null;
    } catch (err) {
      console.error('[TG-STREAMER] Failed to fetch resolvers:', err);
      return null;
    }
  }

  /**
   * Signal the server to gracefully close the active stream
   */
  public closeActiveStream(): void {
    if (typeof window !== 'undefined' && (window as any).__CURRENT_ACTIVE_STREAM_DOC_ID__) {
      const docId = (window as any).__CURRENT_ACTIVE_STREAM_DOC_ID__;
      this.getBaseUrl().then(baseUrl => {
        try {
          if (navigator.sendBeacon) {
            navigator.sendBeacon(`${baseUrl}/api/stream/close?docId=${encodeURIComponent(docId)}`);
          } else {
            fetch(`${baseUrl}/api/stream/close?docId=${encodeURIComponent(docId)}`, { method: 'POST', keepalive: true }).catch(() => {});
          }
        } catch {}
      }).catch(() => {});
    }
  }
}

export const tgStreamerService = new TgStreamerService();
export const msmService = tgStreamerService;
export const msm32Service = tgStreamerService;

/**
 * Returns a human-friendly label for the TGStrm server badge
 */
export function getTgStreamerServerLabel(url?: string): string {
  if (!url) return 'Default (julietmike.net)';
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const port = parsed.port ? `:${parsed.port}` : '';
    if (host === 'localhost' || host === '127.0.0.1') {
      return `Local Router (${host}${port})`;
    }
    if (host === 'www.julietmike.net' || host === 'julietmike.net') {
      return `Primary (julietmike.net${port})`;
    }
    return `${host}${port}`;
  } catch {
    return url;
  }
}

export const getMsmServerLabel = getTgStreamerServerLabel;
