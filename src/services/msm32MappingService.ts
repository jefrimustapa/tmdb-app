import { dbService } from './db';

export interface Msm32ResolveResult {
  streamUrl: string;
  filename?: string;
  size?: number;
  cached?: boolean;
  videoCodec?: string;
}

export interface Msm32HealthResult {
  ok: boolean;
  status?: string;
  uptime?: number;
  isConnected?: boolean;
  cachedStreams?: number;
  error?: string;
}

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

class Msm32MappingService {
  constructor() {
    this.purgeLegacyClientStorage();
  }

  private purgeLegacyClientStorage() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.removeItem('msm32_client_cache');
        localStorage.removeItem('msm32_client_cache_v2');
      }
    } catch {}
  }

  private async getBaseUrl(): Promise<string> {
    const settings = await dbService.getSettings();
    let url = settings?.msm32GetterUrl?.trim();
    
    if (!url) {
      url = 'https://www.julietmike.net:3033';
    }

    return url.replace(/\/+$/, '');
  }

  /**
   * Test connectivity to the MSM Getter microservice (/health)
   */
  async testConnection(customUrl?: string): Promise<Msm32HealthResult> {
    let target = customUrl?.trim();
    if (!target) {
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
    this.purgeLegacyClientStorage();
    return 0;
  }

  /**
   * Resolve a title to a direct HTTP streaming URL via MSM Getter
   */
  async resolveStream(
    title: string,
    year?: number | string,
    season?: number,
    episode?: number,
    signal?: AbortSignal,
    force?: boolean,
    totalSeasons?: number
  ): Promise<Msm32ResolveResult | null> {
    if (signal?.aborted) {
      console.log(`[MSM32] Resolution aborted prior to request for "${title}"`);
      return null;
    }

    const baseUrl = await this.getBaseUrl();
    if (signal?.aborted) return null;

    const settings = await dbService.getSettings();
    const timeoutSeconds = settings?.msm32Timeout || 90;

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
      const maxQuality = settings?.msm32MaxQuality || '1080';

      const params = new URLSearchParams({ title });
      if (year) params.append('year', String(year));
      if (typeof season === 'number' && !isNaN(season)) params.append('season', String(season));
      if (typeof episode === 'number' && !isNaN(episode)) params.append('episode', String(episode));
      if (typeof totalSeasons === 'number' && !isNaN(totalSeasons)) params.append('totalSeasons', String(totalSeasons));
      params.append('maxQuality', maxQuality);
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
        console.warn('[MSM32] Resolve returned error status:', res.status, errorData);
        return null;
      }

      const data = await res.json();
      if (signal?.aborted) return null;

      if (data.success && data.streamUrl) {
        let finalStreamUrl = data.streamUrl;
        const chunkSize = settings?.msm32ChunkSize || 524288;
        try {
          const u = new URL(finalStreamUrl);
          u.searchParams.set('chunkSize', String(chunkSize));
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

        const resolved: Msm32ResolveResult = {
          streamUrl: finalStreamUrl,
          filename: data.filename,
          size: data.size,
          cached: data.cached,
        };
        return resolved;
      }

      // No stream resolved
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
      console.error('[MSM32] Failed to fetch cached streams:', err);
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
      console.error('[MSM32] Failed to evict cached stream:', err);
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
      console.error('[MSM32] Failed to clear cached streams:', err);
      return false;
    }
  }

  async closeActiveStream(docId?: string): Promise<void> {
    try {
      const baseUrl = await this.getBaseUrl();
      const url = `${baseUrl.replace(/\/+$/, '')}/api/stream/close${docId ? `?docId=${docId}` : ''}`;
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        navigator.sendBeacon(url);
      } else {
        fetch(url, { method: 'POST', keepalive: true }).catch(() => {});
      }
    } catch {}
  }
}

export const msm32Service = new Msm32MappingService();

/**
 * Returns a human-friendly label for the MSM server badge
 */
export function getMsmServerLabel(url?: string): string {
  if (!url) return 'Default';
  if (url.includes('julietmike.net')) {
    return 'julietmike.net';
  }
  if (url.includes('localhost') || url.includes('127.0.0.1')) {
    return 'Local PC';
  }
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return url;
  }
}
