/**
 * LayarIcon21 & Asian Stream Mapping Service
 * Resolves TMDB media to active LayarIcon21 / Asian fast direct HLS streams (.m3u8).
 */

interface CachedAsianEntry {
  embedUrl: string | null;
  directHlsUrl?: string | null;
  serverMirrors: { server: string; url: string }[];
  timestamp: number;
}

const MEMORY_CACHE = new Map<string, CachedAsianEntry>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const SESSION_CACHE_KEY_PREFIX = 'tmdb_asian_v3_';

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

async function executeFetch(url: string, referer: string = 'https://layaricon21.com/'): Promise<string> {
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

  // 2. Fallback to standard fetch
  const res = await fetch(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml,application/json,*/*'
    }
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return await res.text();
}

/**
 * Resolves direct HLS stream from LayarIcon21 using TurboVIP / TurboVidHLS
 */
async function resolveLayarIconStream(
  title: string,
  year?: string | number,
  originalTitle?: string
): Promise<{ embedUrl: string | null; directHlsUrl: string | null; serverMirrors: { server: string; url: string }[] }> {
  try {
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

    // 3. Try servers in order: whichever works first, use it
    for (const mirror of mirrors) {
      if (!mirror.url) continue;

      // If it's a TurboVID link, attempt to resolve direct HLS first
      if (mirror.url.includes('turbovid')) {
        try {
          const turboHtml = await executeFetch(mirror.url, 'https://layaricon21.com/');
          if (turboHtml) {
            const m3u8Match = turboHtml.match(/https?:\/\/[^\s"'<>]+\.m3u8/);
            if (m3u8Match) {
              const initialM3u8 = m3u8Match[0];
              const playlistText = await executeFetch(initialM3u8, mirror.url);
              if (playlistText) {
                const masterLine = playlistText
                  .split('\n')
                  .map(l => l.trim())
                  .find(l => l.startsWith('http') && l.includes('.m3u8'));
                directHlsUrl = masterLine || initialM3u8;
              } else {
                directHlsUrl = initialM3u8;
              }
            }
          }
        } catch (e) {
          console.warn('[LayarIcon21] Direct HLS extraction from turbovid failed:', e);
        }
      }

      // Found a valid embed URL that works
      embedUrl = mirror.url;
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
  originalTitle?: string
): Promise<{ embedUrl: string | null; directHlsUrl?: string | null; serverMirrors: { server: string; url: string }[] }> {
  if (!title || !title.trim()) {
    return { embedUrl: null, directHlsUrl: null, serverMirrors: [] };
  }

  const cacheKey = getNormalizedKey(originalTitle || title, year);

  // Check memory cache
  const cached = MEMORY_CACHE.get(cacheKey);
  if (cached && (cached.embedUrl || cached.directHlsUrl) && Date.now() - cached.timestamp < CACHE_TTL_MS) {
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

  // 1. First priority: LayarIcon21 (clean, fast, unblocked direct HLS)
  const layarIconRes = await resolveLayarIconStream(title, year, originalTitle);
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
    return entry;
  }

  return { embedUrl: null, directHlsUrl: null, serverMirrors: [] };
}

export const resolveLk21Stream = resolveLari21Stream;
