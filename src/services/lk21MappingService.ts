/**
 * LK21 Asian / Indo Stream Mapping Service
 * Resolves TMDB media to active LK21 videonode.de embed stream URLs on the fly.
 */

interface CachedLk21Entry {
  embedUrl: string | null;
  serverMirrors: { server: string; url: string }[];
  timestamp: number;
}

const MEMORY_CACHE = new Map<string, CachedLk21Entry>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const SESSION_CACHE_KEY_PREFIX = 'tmdb_lk21_';

function getNormalizedKey(title: string, year?: string | number): string {
  const cleanTitle = title.trim().toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, '_');
  return year ? `${cleanTitle}_${year}` : cleanTitle;
}

/**
 * Checks whether a media item is of Asian, Indonesian, or Malaysian origin
 */
export function isAsianMedia(media?: {
  genre_ids?: number[];
  genres?: { id: number; name?: string }[];
  original_language?: string;
  origin_country?: string[];
} | null): boolean {
  if (!media) return false;
  const lang = media.original_language?.toLowerCase() || '';
  const countries = media.origin_country || [];

  // Southeast Asian & East Asian languages:
  // id: Indonesian, ms: Malay, ko: Korean, zh: Chinese, th: Thai, vi: Vietnamese, tl: Tagalog, jv: Javanese
  const asianLangs = ['id', 'ms', 'ko', 'zh', 'th', 'vi', 'tl', 'jv'];
  const asianCountries = ['ID', 'MY', 'KR', 'CN', 'TH', 'VN', 'PH', 'HK', 'TW', 'SG'];

  return asianLangs.includes(lang) || countries.some(c => asianCountries.includes(c));
}

async function executeFetch(url: string, referer: string = 'https://tv12.lk21official.cc/'): Promise<string> {
  // 1. If running inside Android WebView with native AndroidBridge, use it to completely bypass CORS & restrictions
  if (typeof window !== 'undefined' && (window as any).AndroidBridge?.fetchHttp) {
    try {
      const nativeResult = (window as any).AndroidBridge.fetchHttp(url, referer, 'https://tv12.lk21official.cc');
      if (nativeResult && typeof nativeResult === 'string' && nativeResult.trim().length > 0) {
        return nativeResult;
      }
    } catch (e) {
      console.warn('[LK21] AndroidBridge.fetchHttp failed, falling back to fetch:', e);
    }
  }

  // 2. Fallback to standard fetch
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json, text/html, text/plain, */*'
    }
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return await res.text();
}

/**
 * Searches LK21 API and extracts active videonode.de server embed URLs
 */
export async function resolveLk21Stream(
  title: string,
  year?: string | number,
  originalTitle?: string
): Promise<{ embedUrl: string | null; serverMirrors: { server: string; url: string }[] }> {
  if (!title || !title.trim()) {
    return { embedUrl: null, serverMirrors: [] };
  }

  const cacheKey = getNormalizedKey(title, year);

  // 1. Check Memory Cache
  const mem = MEMORY_CACHE.get(cacheKey);
  if (mem && Date.now() - mem.timestamp < CACHE_TTL_MS) {
    return { embedUrl: mem.embedUrl, serverMirrors: mem.serverMirrors || [] };
  }

  // 2. Check Session Storage Cache
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      const raw = sessionStorage.getItem(`${SESSION_CACHE_KEY_PREFIX}${cacheKey}`);
      if (raw) {
        const parsed = JSON.parse(raw) as CachedLk21Entry;
        if (Date.now() - parsed.timestamp < CACHE_TTL_MS) {
          MEMORY_CACHE.set(cacheKey, parsed);
          return { embedUrl: parsed.embedUrl, serverMirrors: parsed.serverMirrors || [] };
        }
      }
    } catch {}
  }

  try {
    // Build candidate search queries: originalTitle (often Indonesian/Asian), clean title, slugified title
    const candidates = [
      originalTitle?.trim(),
      title.trim(),
      title.replace(/[:\-–—].*$/, '').trim()
    ].filter((q): q is string => Boolean(q && q.length > 0));

    // Deduplicate candidates case-insensitively
    const uniqueQueries: string[] = [];
    for (const q of candidates) {
      if (!uniqueQueries.some(u => u.toLowerCase() === q.toLowerCase())) {
        uniqueQueries.push(q);
      }
    }

    let items: any[] = [];
    for (const query of uniqueQueries) {
      try {
        const apiUrl = `https://gudangvape.com/search.php?s=${encodeURIComponent(query)}&page=1`;
        const resText = await executeFetch(apiUrl, 'https://tv12.lk21official.cc/');
        const data = JSON.parse(resText);
        if (data.data && Array.isArray(data.data) && data.data.length > 0) {
          items = data.data;
          break;
        }
      } catch (e) {
        console.warn(`[LK21] Query "${query}" failed:`, e);
      }
    }

    if (!items || items.length === 0) {
      const emptyEntry: CachedLk21Entry = { embedUrl: null, serverMirrors: [], timestamp: Date.now() };
      MEMORY_CACHE.set(cacheKey, emptyEntry);
      return { embedUrl: null, serverMirrors: [] };
    }

    // Best match selection: prioritize exact release year if provided
    let bestItem = items[0];
    if (year) {
      const matchingYear = items.find((it: any) => String(it.year) === String(year));
      if (matchingYear) {
        bestItem = matchingYear;
      }
    }

    const slug = bestItem.slug;
    if (!slug) {
      return { embedUrl: null, serverMirrors: [] };
    }

    // Fetch the movie detail page to retrieve dynamic player embed URLs
    const moviePageUrl = `https://tv12.lk21official.cc/${slug}`;
    const html = await executeFetch(moviePageUrl, 'https://tv12.lk21official.cc/');

    // Regex to match data-server="..." and data-url="https://videonode.de/iframe3/..."
    const mirrors: { server: string; url: string }[] = [];
    const mirrorMatches = html.matchAll(/data-server="([^"]+)"[^>]*data-url="([^"]+)"/g);
    for (const match of mirrorMatches) {
      mirrors.push({ server: match[1], url: match[2] });
    }

    if (mirrors.length === 0) {
      // Fallback regex matching data-url first
      const altMatches = html.matchAll(/data-url="([^"]+)"[^>]*data-server="([^"]+)"/g);
      for (const match of altMatches) {
        mirrors.push({ server: match[2], url: match[1] });
      }
    }

    // Fallback: look for direct videonode iframes in HTML
    if (mirrors.length === 0) {
      const directIframeMatch = html.match(/https:\/\/videonode\.de\/iframe3\/[a-z0-9\-]+\/[a-zA-Z0-9_\-]+/);
      if (directIframeMatch) {
        mirrors.push({ server: 'p2p', url: directIframeMatch[0] });
      }
    }

    // Prioritize P2P or TurboVIP as primary stream URL
    const preferredOrder = ['p2p', 'turbovip', 'cast', 'hydrax'];
    let primaryEmbedUrl: string | null = null;
    for (const s of preferredOrder) {
      const found = mirrors.find(m => m.server.toLowerCase() === s);
      if (found) {
        primaryEmbedUrl = found.url;
        break;
      }
    }
    if (!primaryEmbedUrl && mirrors.length > 0) {
      primaryEmbedUrl = mirrors[0].url;
    }

    const entry: CachedLk21Entry = {
      embedUrl: primaryEmbedUrl,
      serverMirrors: mirrors,
      timestamp: Date.now()
    };

    MEMORY_CACHE.set(cacheKey, entry);
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        sessionStorage.setItem(`${SESSION_CACHE_KEY_PREFIX}${cacheKey}`, JSON.stringify(entry));
      } catch {}
    }

    return { embedUrl: primaryEmbedUrl, serverMirrors: mirrors };
  } catch (err) {
    console.warn('[LK21 Resolver] Error resolving stream:', err);
    return { embedUrl: null, serverMirrors: [] };
  }
}
