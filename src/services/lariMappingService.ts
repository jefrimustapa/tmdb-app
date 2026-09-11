/**
 * LayarIcon21 & Asian Stream Mapping Service
 * Resolves TMDB media to active LayarIcon21 / Asian fast direct HLS streams (.m3u8).
 */

import { dbService } from './db';

interface CachedAsianEntry {
  embedUrl: string | null;
  directHlsUrl?: string | null;
  serverMirrors: { server: string; url: string }[];
  timestamp: number;
}

const MEMORY_CACHE = new Map<string, CachedAsianEntry>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours for hits
const NEGATIVE_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours for misses (prevents repeat lagging queries)
const SESSION_CACHE_KEY_PREFIX = 'tmdb_asian_v3_';
const PERSISTENT_CACHE_PREFIX = 'lari21_v1_';

function getNormalizedKey(title: string, year?: string | number): string {
  const cleanTitle = title.trim().toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, '_');
  return year ? `${cleanTitle}_${year}` : cleanTitle;
}

/**
 * Checks whether a media item is of Korean origin
 */
export function isKoreanMedia(media?: {
  genre_ids?: number[];
  genres?: { id: number; name?: string }[];
  original_language?: string;
  origin_country?: string[];
} | null): boolean {
  if (!media) return false;
  const lang = media.original_language?.toLowerCase() || '';
  const countries = media.origin_country || [];
  return lang === 'ko' || countries.includes('KR');
}

/**
 * Checks whether a media item is of ASEAN origin (Indonesian, Malaysian, Thai, Vietnamese, Filipino, Singaporean, Cambodian, Lao, Burmese, Bruneian, Timorese)
 */
export function isAseanMedia(media?: {
  genre_ids?: number[];
  genres?: { id: number; name?: string }[];
  original_language?: string;
  origin_country?: string[];
} | null): boolean {
  if (!media) return false;
  const lang = media.original_language?.toLowerCase() || '';
  const countries = media.origin_country || [];

  // Exclude Korean media from ASEAN
  if (lang === 'ko' || countries.includes('KR')) return false;

  // ASEAN 10 + Timor-Leste:
  // ID: Indonesia, MY: Malaysia, TH: Thailand, VN: Vietnam, PH: Philippines
  // SG: Singapore, KH: Cambodia, LA: Laos, MM: Myanmar, BN: Brunei, TL: Timor-Leste
  const aseanCountries = ['ID', 'MY', 'TH', 'VN', 'PH', 'SG', 'KH', 'LA', 'MM', 'BN', 'TL'];
  // id: Indonesian, ms: Malay, th: Thai, vi: Vietnamese, tl: Tagalog,
  // jv: Javanese, km: Khmer, lo: Lao, my: Burmese, tet: Tetum
  const aseanLangs = ['id', 'ms', 'th', 'vi', 'tl', 'jv', 'km', 'lo', 'my', 'tet'];

  return aseanLangs.includes(lang) || countries.some(c => aseanCountries.includes(c));
}

async function executeFetch(url: string, referer: string = 'https://layaricon21.com/', timeoutMs: number = 3500): Promise<string> {
  const fetchPromise = (async () => {
    // 1. If running inside Android WebView with native AndroidBridge, use it to bypass CORS & restrictions
    if (typeof window !== 'undefined' && (window as any).AndroidBridge?.fetchHttp) {
      try {
        const origin = url.includes('turbovid') || url.includes('turboviplay') || url.includes('turbosplayer')
          ? 'https://turbovidhls.com'
          : 'https://layaricon21.com';
        const nativeResult = (window as any).AndroidBridge.fetchHttp(url, referer, origin);
        if (nativeResult && typeof nativeResult === 'string' && nativeResult.trim().length > 0) {
          return nativeResult;
        }
      } catch (e) {
        console.warn('[AsianResolver] AndroidBridge.fetchHttp failed, falling back to fetch:', e);
      }
    }

    // 2. Fallback to standard fetch with AbortController
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const fetchTimer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const res = await fetch(url, {
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/xml,application/json,*/*'
        },
        signal: controller?.signal
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      return await res.text();
    } finally {
      if (fetchTimer) clearTimeout(fetchTimer);
    }
  })();

  const timeoutPromise = new Promise<string>((_, reject) => {
    setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms for ${url}`)), timeoutMs);
  });

  return await Promise.race([fetchPromise, timeoutPromise]);
}

/**
 * Resolves direct HLS stream from LayarIcon21 using TurboVIP / TurboVidHLS
 */
async function resolveLayarIconStream(
  title: string,
  year?: string | number,
  originalTitle?: string,
  onProgress?: (msg: string) => void
): Promise<{ embedUrl: string | null; directHlsUrl: string | null; serverMirrors: { server: string; url: string }[] }> {
  try {
    onProgress?.('Searching LayarIcon21 catalog...');
    const candidates = [
      originalTitle?.trim(),
      title.trim(),
      title.replace(/[:\-–—].*$/, '').trim()
    ].filter((q): q is string => Boolean(q && q.length > 0));

    const uniqueQueries: string[] = [];
    for (const q of candidates) {
      if (!uniqueQueries.some(u => u.toLowerCase() === q.toLowerCase())) {
        uniqueQueries.push(q);
      }
    }

    // Direct slug candidate: most titles on LayarIcon21 strictly follow {clean-title}-{year}
    const slugCandidate = (originalTitle || title)
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-');
    const directSlugGuess = year ? `${slugCandidate}-${year}` : slugCandidate;

    const mirrors: { server: string; url: string }[] = [];
    let directHlsUrl: string | null = null;
    let embedUrl: string | null = null;
    let foundSlug: string | null = null;

    // 1. FAST PATH: Probe /api/pemutar with the direct slug guess first (saves 1.5 - 3 seconds of search HTML fetching)
    try {
      onProgress?.('Testing fast-path slug on LayarIcon21...');
      const fastApiUrl = `https://layaricon21.com/api/pemutar?slug=${encodeURIComponent(directSlugGuess)}`;
      const fastRes = await executeFetch(fastApiUrl, `https://layaricon21.com/nonton/${directSlugGuess}`);
      if (fastRes) {
        const data = JSON.parse(fastRes);
        if (data && Array.isArray(data.server) && data.server.length > 0) {
          for (const s of data.server) {
            if (s && s.url && s.blocked !== true) {
              mirrors.push({ server: s.server || 'SERVER', url: s.url });
            }
          }
          if (mirrors.length > 0) {
            foundSlug = directSlugGuess;
          }
        }
      }
    } catch (_) {}

    // 2. Fallback to Search only if Fast Path did not return active servers
    if (mirrors.length === 0) {
      onProgress?.('Searching LayarIcon21 mirrors...');
      // Execute unique search queries in parallel instead of slow sequential waterfall
      const searchPromises = uniqueQueries.map(async (query) => {
        try {
          const searchUrl = `https://layaricon21.com/search?q=${encodeURIComponent(query)}`;
          const searchHtml = await executeFetch(searchUrl, 'https://layaricon21.com/');
          if (searchHtml) {
            const matches = [...searchHtml.matchAll(/\/film\/([a-zA-Z0-9\-]+)/g)];
            if (matches && matches.length > 0) {
              if (year) {
                const yearMatch = matches.find(m => m[1].includes(String(year)));
                if (yearMatch) return yearMatch[1];
              }
              return matches[0][1];
            }
          }
        } catch (e) {
          console.warn(`[LayarIcon21] Search for "${query}" failed:`, e);
        }
        return null;
      });

      const searchResults = await Promise.all(searchPromises);
      foundSlug = searchResults.find((s): s is string => Boolean(s)) || directSlugGuess;

      // Query /api/pemutar with discovered slug
      try {
        const pemutarApiUrl = `https://layaricon21.com/api/pemutar?slug=${encodeURIComponent(foundSlug)}`;
        const pemutarJsonStr = await executeFetch(pemutarApiUrl, `https://layaricon21.com/nonton/${foundSlug}`);
        if (pemutarJsonStr) {
          const data = JSON.parse(pemutarJsonStr);
          if (data && Array.isArray(data.server)) {
            for (const s of data.server) {
              if (s && s.url && s.blocked !== true) {
                mirrors.push({ server: s.server || 'SERVER', url: s.url });
              }
            }
          }
        }
      } catch (apiErr) {
        console.warn('[LayarIcon21] /api/pemutar fetch failed, trying HTML parse:', apiErr);
      }
    }

    // 2. Secondary Fallback: Fetch watch page HTML and parse embed links if API didn't yield servers
    const watchUrl = `https://layaricon21.com/nonton/${foundSlug}`;
    let watchHtml = '';
    if (mirrors.length === 0) {
      try {
        watchHtml = await executeFetch(watchUrl, 'https://layaricon21.com/');
        if (watchHtml) {
          const turbovidMatch = watchHtml.match(/https?:\/\/(?:em)?turbovid(?:hls)?\.(?:com|org)\/t\/([a-zA-Z0-9]+)/);
          if (turbovidMatch) {
            const vidId = turbovidMatch[1];
            mirrors.push({ server: 'TURBOVIP', url: `https://turbovidhls.com/t/${vidId}` });
          }

          const abyssMatch = watchHtml.match(/https:\/\/(?:play\.)?abyssplayer\.com\/[a-zA-Z0-9]+/);
          if (abyssMatch) {
            mirrors.push({ server: 'ABYSSPLAYER', url: abyssMatch[0] });
          }

          const playcdnMatch = watchHtml.match(/https:\/\/playcdn\.de\/[^\s"'<>]+/);
          if (playcdnMatch) {
            mirrors.push({ server: 'PLAYCDN', url: playcdnMatch[0].replace(/&amp;/g, '&') });
          }
        }
      } catch (htmlErr) {
        console.warn('[LayarIcon21] Watch HTML fetch failed:', htmlErr);
      }
    }

    // 3. Try servers in order: whichever works first, use it immediately
    for (const mirror of mirrors) {
      if (!mirror.url) continue;

      onProgress?.(`Connecting to stream mirror (${mirror.server})...`);
      // Found a valid embed URL that works
      embedUrl = mirror.url;

      // Optional: background extract direct HLS with a strict 1500ms timeout, but do NOT block iframe embed playback
      if (mirror.url.includes('turbovid')) {
        try {
          const turboHtml = await executeFetch(mirror.url, 'https://layaricon21.com/', 1500);
          if (turboHtml) {
            const m3u8Match = turboHtml.match(/https?:\/\/[^\s"'<>]+\.m3u8/);
            if (m3u8Match) {
              const initialM3u8 = m3u8Match[0];
              directHlsUrl = initialM3u8;
            }
          }
        } catch (e) {
          // Non-fatal, embedUrl will be used directly
        }
      }

      break;
    }

    return {
      embedUrl,
      directHlsUrl,
      serverMirrors: mirrors
    };
  } catch (err) {
    console.warn('[LayarIcon21 Resolver] Error:', err);
    return { embedUrl: null, directHlsUrl: null, serverMirrors: [] };
  }
}

/**
 * Searches and extracts active Asian/Indo stream URLs
 */
export async function resolveLari21Stream(
  title: string,
  year?: string | number,
  originalTitle?: string,
  onProgress?: (msg: string) => void
): Promise<{ embedUrl: string | null; directHlsUrl?: string | null; serverMirrors: { server: string; url: string }[] }> {
  if (!title || !title.trim()) {
    return { embedUrl: null, directHlsUrl: null, serverMirrors: [] };
  }

  onProgress?.('Checking stream cache...');
  const cacheKey = getNormalizedKey(originalTitle || title, year);

  // Check memory cache
  const cached = MEMORY_CACHE.get(cacheKey);
  if (cached && (cached.embedUrl || cached.directHlsUrl) && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    onProgress?.('Found in memory cache');
    return { embedUrl: cached.embedUrl, directHlsUrl: cached.directHlsUrl, serverMirrors: cached.serverMirrors };
  }

  // Check sessionStorage
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      const stored = sessionStorage.getItem(`${SESSION_CACHE_KEY_PREFIX}${cacheKey}`);
      if (stored) {
        const parsed: CachedAsianEntry = JSON.parse(stored);
        if (parsed && (parsed.embedUrl || parsed.directHlsUrl) && Date.now() - parsed.timestamp < CACHE_TTL_MS) {
          MEMORY_CACHE.set(cacheKey, parsed);
          return { embedUrl: parsed.embedUrl, directHlsUrl: parsed.directHlsUrl, serverMirrors: parsed.serverMirrors };
        }
      }
    } catch {}
  }

  // Check Dexie persistent cache (RatingCache table)
  try {
    const dbKey = `${PERSISTENT_CACHE_PREFIX}${cacheKey}`;
    const persisted = await dbService.getRatingCacheItem(dbKey);
    if (persisted && typeof persisted === 'string') {
      const parsed: CachedAsianEntry = JSON.parse(persisted);
      const isMiss = !parsed.embedUrl && !parsed.directHlsUrl;
      const ttl = isMiss ? NEGATIVE_CACHE_TTL_MS : CACHE_TTL_MS;
      if (Date.now() - parsed.timestamp < ttl) {
        onProgress?.(isMiss ? 'Previously checked (No streams)' : 'Loaded from persistent storage');
        MEMORY_CACHE.set(cacheKey, parsed);
        return { embedUrl: parsed.embedUrl, directHlsUrl: parsed.directHlsUrl, serverMirrors: parsed.serverMirrors || [] };
      }
    }
  } catch {}

  // 1. First priority: LayarIcon21 (clean, fast, unblocked direct HLS)
  const layarIconRes = await resolveLayarIconStream(title, year, originalTitle, onProgress);
  if (layarIconRes && (layarIconRes.directHlsUrl || layarIconRes.embedUrl)) {
    const entry: CachedAsianEntry = {
      embedUrl: layarIconRes.embedUrl,
      directHlsUrl: layarIconRes.directHlsUrl,
      serverMirrors: layarIconRes.serverMirrors,
      timestamp: Date.now()
    };
    MEMORY_CACHE.set(cacheKey, entry);
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        sessionStorage.setItem(`${SESSION_CACHE_KEY_PREFIX}${cacheKey}`, JSON.stringify(entry));
      } catch {}
    }
    // Save to Dexie persistent storage
    try {
      await dbService.setRatingCacheItem(`${PERSISTENT_CACHE_PREFIX}${cacheKey}`, JSON.stringify(entry));
    } catch {}
    return entry;
  }

  // Cache negative miss so we don't query slow unreachable servers repeatedly
  const missEntry: CachedAsianEntry = {
    embedUrl: null,
    directHlsUrl: null,
    serverMirrors: [],
    timestamp: Date.now()
  };
  MEMORY_CACHE.set(cacheKey, missEntry);
  try {
    await dbService.setRatingCacheItem(`${PERSISTENT_CACHE_PREFIX}${cacheKey}`, JSON.stringify(missEntry));
  } catch {}

  return { embedUrl: null, directHlsUrl: null, serverMirrors: [] };
}

export const resolveLk21Stream = resolveLari21Stream;
