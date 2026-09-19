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

class Msm32MappingService {
  private clientCache = new Map<string, { result: Msm32ResolveResult; timestamp: number }>();
  private readonly CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

  private async getBaseUrl(): Promise<string> {
    const settings = await dbService.getSettings();
    let url = settings?.msm32GetterUrl?.trim();
    if (!url || url === 'http://localhost:3033') {
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

    // 1. Check local client cache first (0ms, 0 network requests)
    const clientKey = `${(title || '').toLowerCase().trim()}_${year || ''}_${season || ''}_${episode || ''}_720`;
    const localHit = this.clientCache.get(clientKey);
    if (localHit && Date.now() - localHit.timestamp < this.CACHE_TTL_MS) {
      console.log(`[MSM32] Client local cache HIT for "${title}" -> Instant stream`);
      return localHit.result;
    }

    const baseUrl = await this.getBaseUrl();
    if (signal?.aborted) return null;

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
        // Store in client-side memory cache for instant future loads
        this.clientCache.set(clientKey, { result: resolved, timestamp: Date.now() });
        return resolved;
      }

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
