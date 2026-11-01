import { dbService } from './db';
import { DEFAULT_TGSTRM_URL, DEFAULT_TGSTRM_HOST, normalizeTgStrmUrl, isLegacyTgStrmUrl } from './tgStreamerDefaults';
import {
  SpeedTestTier,
  SpeedTestVerdict,
  SpeedTestBottleneck,
  toMbps,
  computeVerdict,
  computeBottleneck,
} from '../utils/speedTest';

export interface TgStreamerResolveResult {
  streamUrl: string;
  filename?: string;
  size?: number;
  cached?: boolean;
  videoCodec?: string;
  /** Real audio codec / channel count of the chosen track (server probe), used to pick the audio transcode. */
  audioCodec?: string;
  audioChannels?: number;
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

// ---- Network Speed Analytics (issue #281) ----

export interface SpeedTestTarget {
  tier: SpeedTestTier;
  testId: string;
  docId: string;
  filename: string;
  sizeBytes: number;
  dcId: number | null;
  bytes: number;
  minMbps: number;
  concurrency: number;
}

export interface SpeedTestTargetsResponse {
  success: boolean;
  mb: number;
  budgetMbPerMin: number;
  minMbps: Record<string, number>;
  targets: SpeedTestTarget[];
  missing: SpeedTestTier[];
}

/** Server-side numbers of the same transfer (null when the result could not be fetched). */
export interface SpeedTestServerMetrics {
  endReason: string;
  concurrency: number;
  firstBlockMs: number | null;
  firstBlockSentMs: number | null;
  bytesSent: number;
  sustainedBytes: number;
  sustainedMs: number;
  sustainedMbps: number | null;
  starvedMs: number;
  writeWaitMs: number;
  /** Rate at which blocks arrived from Telegram (after the first block); null when too few blocks. */
  telegramMbps: number | null;
}

export interface SpeedTestBaseline {
  mbps: number;
  bytes: number;
  ms: number;
}

export interface SpeedTestQualityResult {
  tier: SpeedTestTier;
  filename: string;
  dcId: number | null;
  minMbps: number;
  /** Sustained rate measured by the client, after the first block. */
  mbps: number;
  firstByteMs: number;
  bytes: number;
  verdict: SpeedTestVerdict;
  bottleneck: SpeedTestBottleneck | null;
  /** Telegram -> router rate: measured on the server; null when unknown. */
  telegramMbps: number | null;
  /** True when the device network was the limit, so the real Telegram -> router rate is at least this. */
  telegramIsLowerBound: boolean;
  server: SpeedTestServerMetrics | null;
}

export type SpeedTestErrorCode = 'rate-limited' | 'http' | 'network';

export class SpeedTestError extends Error {
  code: SpeedTestErrorCode;
  retryAfterSec?: number;
  constructor(code: SpeedTestErrorCode, message: string, retryAfterSec?: number) {
    super(message);
    this.name = 'SpeedTestError';
    this.code = code;
    this.retryAfterSec = retryAfterSec;
  }
}

const SPEEDTEST_FIRST_BLOCK_BYTES = 512 * 1024; // the first Telegram block is excluded from the sustained rate
const SPEEDTEST_BASELINE_WARMUP_BYTES = 1024 * 1024; // TCP ramp-up is excluded from the baseline

interface DownloadMeasurement {
  bytes: number;
  firstByteMs: number;
  totalMs: number;
  mbps: number;
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
    const rawUrl = (settings?.tgStreamerUrl || settings?.msmGetterUrl || settings?.msm32GetterUrl)?.trim();
    return normalizeTgStrmUrl(rawUrl);
  }

  /**
   * Test connectivity to the TGStrm microservice (/health)
   */
  async testConnection(customUrl?: string): Promise<TgStreamerHealthResult> {
    let target = customUrl?.trim();
    if (!target) {
      target = await this.getBaseUrl();
    } else {
      target = normalizeTgStrmUrl(target);
    }
    const baseUrl = target.replace(/\/+$/, '');
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);

      // Probe /tg/health, fallback /health with cache busting
      let res = await fetch(`${baseUrl}/tg/health?_t=${Date.now()}`, {
        cache: 'no-store',
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
      });
      if (!res.ok && res.status === 404) {
        res = await fetch(`${baseUrl}/health?_t=${Date.now()}`, {
          cache: 'no-store',
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

      const params = new URLSearchParams({ title });
      if (altTitle && altTitle.trim()) params.append('altTitle', altTitle.trim());
      if (year) params.append('year', String(year));
      if (typeof season === 'number' && !isNaN(season)) params.append('season', String(season));
      if (typeof episode === 'number' && !isNaN(episode)) params.append('episode', String(episode));
      if (typeof totalSeasons === 'number' && !isNaN(totalSeasons)) params.append('totalSeasons', String(totalSeasons));
      if (typeof maxPages === 'number' && !isNaN(maxPages) && maxPages >= 1) params.append('maxPages', String(maxPages));
      params.append('maxQuality', maxQuality);
      if (resolver) params.append('resolver', resolver);
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
          audioCodec: data.audioCodec,
          audioChannels: data.audioChannels,
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

      const params = new URLSearchParams({ title });
      if (year) params.append('year', String(year));
      if (typeof season === 'number' && !isNaN(season)) params.append('season', String(season));
      if (typeof episode === 'number' && !isNaN(episode)) params.append('episode', String(episode));
      if (typeof totalSeasons === 'number' && !isNaN(totalSeasons)) params.append('totalSeasons', String(totalSeasons));
      params.append('maxQuality', maxQuality);
      if (resolver) params.append('resolver', resolver);
      params.append('prefetch', 'true');

      console.log(`[TG-STREAMER Prefetch] Dispatching /api/prefetch for "${title}" S${season}E${episode} ${resolver ? ` (resolver: ${resolver})` : ""}...`);
      
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
   * Reads a response body to the end and measures it: time to first byte, and the rate after the first
   * `skipBytes` (ramp-up / first block). Throws SpeedTestError on HTTP 429 and other failures.
   */
  private async measureDownload(
    url: string,
    skipBytes: number,
    signal?: AbortSignal,
    onProgress?: (mbps: number, bytes: number) => void,
  ): Promise<DownloadMeasurement> {
    const startedAt = performance.now();
    let res: Response;
    try {
      res = await fetch(url, { signal, cache: 'no-store' });
    } catch (err: any) {
      if (err?.name === 'AbortError') throw err;
      throw new SpeedTestError('network', err?.message || 'Network error');
    }
    if (res.status === 429) {
      const retry = parseInt(res.headers.get('Retry-After') || '60', 10);
      throw new SpeedTestError('rate-limited', 'Speed test limit reached for this connection', isNaN(retry) ? 60 : retry);
    }
    if (!res.ok) {
      throw new SpeedTestError('http', `HTTP ${res.status}`);
    }

    let bytes = 0;
    let firstByteMs = 0;
    let markBytes = -1;
    let markAt = 0;
    let lastReportAt = 0;
    if (res.body) {
      const reader = res.body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const now = performance.now();
          if (!firstByteMs) firstByteMs = now - startedAt;
          bytes += value.length;
          if (markBytes < 0 && bytes >= skipBytes) {
            markBytes = bytes;
            markAt = now;
          } else if (markBytes >= 0 && onProgress && now - lastReportAt > 200) {
            lastReportAt = now;
            onProgress(toMbps(bytes - markBytes, now - markAt), bytes);
          }
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') throw err;
        throw new SpeedTestError('network', err?.message || 'Connection lost during the test');
      }
    } else {
      // No streaming body support: time the whole download (no ramp-up exclusion possible)
      bytes = (await res.arrayBuffer()).byteLength;
      firstByteMs = performance.now() - startedAt;
    }
    const endedAt = performance.now();
    const mbps = markBytes >= 0 && endedAt > markAt
      ? toMbps(bytes - markBytes, endedAt - markAt)
      : toMbps(bytes, endedAt - startedAt);
    return { bytes, firstByteMs, totalMs: endedAt - startedAt, mbps };
  }

  /** One sample file per requested quality, with the test size and limits decided by the server. */
  async getSpeedTestTargets(tiers: SpeedTestTier[], signal?: AbortSignal): Promise<SpeedTestTargetsResponse> {
    const baseUrl = await this.getBaseUrl();
    const res = await fetch(`${baseUrl}/api/speedtest/targets?tiers=${encodeURIComponent(tiers.join(','))}`, {
      headers: { Accept: 'application/json' },
      signal,
      cache: 'no-store',
    });
    if (!res.ok) throw new SpeedTestError('http', `HTTP ${res.status}`);
    return await res.json();
  }

  /** Router -> device throughput without Telegram (the size is the server's speedTestMb setting). */
  async runNetworkBaseline(signal?: AbortSignal, onProgress?: (mbps: number) => void): Promise<SpeedTestBaseline> {
    const baseUrl = await this.getBaseUrl();
    const m = await this.measureDownload(`${baseUrl}/api/speedtest/download`, SPEEDTEST_BASELINE_WARMUP_BYTES, signal, (mbps) => onProgress?.(mbps));
    return { mbps: m.mbps, bytes: m.bytes, ms: m.totalMs };
  }

  async getSpeedTestServerMetrics(testId: string, signal?: AbortSignal): Promise<SpeedTestServerMetrics | null> {
    try {
      const baseUrl = await this.getBaseUrl();
      const res = await fetch(`${baseUrl}/api/speedtest/result?id=${encodeURIComponent(testId)}`, { signal, cache: 'no-store' });
      if (!res.ok) return null;
      const json = await res.json();
      return json?.metrics || null;
    } catch (err: any) {
      if (err?.name === 'AbortError') throw err;
      return null;
    }
  }

  /**
   * One quality through the real stream path (Telegram -> router -> device): the server reads the target file
   * at its chosen offset, the client times it and then asks the server for its own numbers.
   */
  async runQualityTest(
    target: SpeedTestTarget,
    baselineMbps: number | null,
    signal?: AbortSignal,
    onProgress?: (mbps: number) => void,
  ): Promise<SpeedTestQualityResult> {
    const baseUrl = await this.getBaseUrl();
    const m = await this.measureDownload(
      `${baseUrl}/stream/${encodeURIComponent(target.docId)}?speedtest=${encodeURIComponent(target.testId)}`,
      SPEEDTEST_FIRST_BLOCK_BYTES,
      signal,
      (mbps) => onProgress?.(mbps),
    );
    const server = await this.getSpeedTestServerMetrics(target.testId, signal);
    const bottleneck = computeBottleneck(m.mbps, baselineMbps);
    return {
      tier: target.tier,
      filename: target.filename,
      dcId: target.dcId,
      minMbps: target.minMbps,
      mbps: m.mbps,
      firstByteMs: m.firstByteMs,
      bytes: m.bytes,
      verdict: computeVerdict(m.mbps, target.minMbps),
      bottleneck,
      // Without server numbers, a server-limited stream rate is itself the Telegram -> router rate
      telegramMbps: server?.telegramMbps ?? (bottleneck === 'server' ? m.mbps : null),
      telegramIsLowerBound: bottleneck === 'network',
      server,
    };
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
  const normalized = normalizeTgStrmUrl(url);
  try {
    const parsed = new URL(normalized);
    const host = parsed.hostname;
    const port = parsed.port ? `:${parsed.port}` : '';
    if (host === 'localhost' || host === '127.0.0.1') {
      return `Local Router (${host}${port})`;
    }
    if (host === DEFAULT_TGSTRM_HOST) {
      return `Primary (${DEFAULT_TGSTRM_HOST})`;
    }
    return `${host}${port}`;
  } catch {
    return normalized;
  }
}

export const getMsmServerLabel = getTgStreamerServerLabel;
