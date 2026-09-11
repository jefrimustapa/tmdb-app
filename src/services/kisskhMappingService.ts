/**
 * KissKH Korean & Asian Drama Mapping Service
 * Resolves TMDB media to active KissKH drama embed URL for isolated playback.
 */

interface CachedKisskhEntry {
  embedUrl: string | null;
  dramaId?: number | null;
  episodeId?: number | null;
  timestamp: number;
}

const MEMORY_CACHE = new Map<string, CachedKisskhEntry>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const SESSION_CACHE_KEY_PREFIX = 'tmdb_kisskh_v2_';

function getNormalizedKey(title: string, year?: string | number, season = 1, episode = 1): string {
  const cleanTitle = title.trim().toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, '_');
  return `${cleanTitle}_${year || 'all'}_s${season}_e${episode}`;
}

async function executeFetch(url: string, referer = 'https://kisskh.do/', timeoutMs = 3500): Promise<string> {
  const fetchPromise = (async () => {
    // 1. If running inside Android WebView with native AndroidBridge, use it to bypass CORS
    if (typeof window !== 'undefined' && (window as any).AndroidBridge?.fetchHttp) {
      try {
        const nativeResult = (window as any).AndroidBridge.fetchHttp(url, referer, 'https://kisskh.do');
        if (nativeResult && typeof nativeResult === 'string' && nativeResult.trim().length > 0) {
          return nativeResult;
        }
      } catch (e) {
        console.warn('[KisskhResolver] AndroidBridge.fetchHttp failed, falling back to fetch:', e);
      }
    }

    // 2. Fallback to standard fetch with AbortController timeout
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const fetchTimer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const res = await fetch(url, {
        signal: controller ? controller.signal : undefined,
        headers: {
          Accept: 'application/json, text/plain, */*',
          Referer: referer
        }
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      return await res.text();
    } finally {
      if (fetchTimer) clearTimeout(fetchTimer);
    }
  })();

  const timeoutPromise = new Promise<string>((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms for ${url}`)), timeoutMs + 200)
  );

  return Promise.race([fetchPromise, timeoutPromise]);
}

/**
 * Normalizes title for search string matching
 */
function cleanSearchQuery(title: string): string {
  return title
    .replace(/[:\-–—].*$/, '') // remove subtitles/colons
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Searches KissKH and resolves active drama ID and episode ID
 */
export async function resolveKisskhStream(
  title: string,
  year?: string | number,
  season = 1,
  episode = 1,
  originalTitle?: string
): Promise<{ embedUrl: string | null; dramaId?: number | null; episodeId?: number | null }> {
  if (!title || !title.trim()) {
    return { embedUrl: null };
  }

  const cacheKey = getNormalizedKey(title, year, season, episode);

  // 1. Memory cache check
  const memCached = MEMORY_CACHE.get(cacheKey);
  if (memCached && Date.now() - memCached.timestamp < CACHE_TTL_MS) {
    return {
      embedUrl: memCached.embedUrl,
      dramaId: memCached.dramaId,
      episodeId: memCached.episodeId
    };
  }

  // 2. SessionStorage cache check
  if (typeof window !== 'undefined') {
    try {
      const stored = window.sessionStorage.getItem(SESSION_CACHE_KEY_PREFIX + cacheKey);
      if (stored) {
        const parsed = JSON.parse(stored) as CachedKisskhEntry;
        if (parsed && Date.now() - parsed.timestamp < CACHE_TTL_MS) {
          MEMORY_CACHE.set(cacheKey, parsed);
          return {
            embedUrl: parsed.embedUrl,
            dramaId: parsed.dramaId,
            episodeId: parsed.episodeId
          };
        }
      }
    } catch (_) {}
  }

  try {
    const queries = [
      title.trim(),
      cleanSearchQuery(title),
      originalTitle ? cleanSearchQuery(originalTitle) : null
    ].filter((q): q is string => Boolean(q && q.length > 1));

    const uniqueQueries = [...new Set(queries)];

    let matchedDrama: { id: number; title: string } | null = null;

    // Search KissKH API
    for (const query of uniqueQueries) {
      try {
        const searchApiUrl = `https://kisskh.do/api/DramaList/Search?q=${encodeURIComponent(query)}&type=0`;
        const resText = await executeFetch(searchApiUrl);
        if (!resText) continue;

        const results = JSON.parse(resText);
        if (Array.isArray(results) && results.length > 0) {
          // If season > 1, check if KissKH has a separated title like "Title Season X"
          if (season > 1) {
            const seasonRegex = new RegExp(`season\\s*${season}`, 'i');
            const seasonMatch = results.find(d => seasonRegex.test(d.title));
            if (seasonMatch) {
              matchedDrama = seasonMatch;
              break;
            }
          }

          // Look for year match or clean match
          const cleanQ = query.toLowerCase().replace(/[^\w]/g, '');
          const perfectMatch = results.find(d => {
            const cleanT = d.title.toLowerCase().replace(/[^\w]/g, '');
            if (year && d.title.includes(String(year))) return true;
            return cleanT.includes(cleanQ) || cleanQ.includes(cleanT);
          });

          matchedDrama = perfectMatch || results[0];
          if (matchedDrama) break;
        }
      } catch (err) {
        console.warn(`[KisskhResolver] Search failed for query "${query}":`, err);
      }
    }

    if (!matchedDrama) {
      console.warn(`[KisskhResolver] No drama found for "${title}"`);
      return { embedUrl: null };
    }

    console.log(`[KisskhResolver] Matched Drama: "${matchedDrama.title}" (ID: ${matchedDrama.id})`);

    // Fetch Drama details to resolve episode ID
    const detailApiUrl = `https://kisskh.do/api/DramaList/Drama/${matchedDrama.id}?isq=false`;
    const detailText = await executeFetch(detailApiUrl);
    if (!detailText) {
      return { embedUrl: null };
    }

    const detail = JSON.parse(detailText);
    const episodes = detail.episodes;
    if (!Array.isArray(episodes) || episodes.length === 0) {
      return { embedUrl: null };
    }

    // Match episode number
    const targetEpNum = Number(episode) || 1;
    const epMatch = episodes.find(e => Number(e.number) === targetEpNum) || episodes[episodes.length - 1];

    if (!epMatch || !epMatch.id) {
      console.warn(`[KisskhResolver] Episode ${targetEpNum} not found in drama ${matchedDrama.id}`);
      return { embedUrl: null };
    }

    // Generate safe slug for URL
    const slug = matchedDrama.title
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');

    const embedUrl = `https://kisskh.do/Drama/${slug}/Episode-${epMatch.number || targetEpNum}?id=${matchedDrama.id}&ep=${epMatch.id}`;

    const entry: CachedKisskhEntry = {
      embedUrl,
      dramaId: matchedDrama.id,
      episodeId: epMatch.id,
      timestamp: Date.now()
    };

    MEMORY_CACHE.set(cacheKey, entry);
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.setItem(SESSION_CACHE_KEY_PREFIX + cacheKey, JSON.stringify(entry));
      } catch (_) {}
    }

    return {
      embedUrl,
      dramaId: matchedDrama.id,
      episodeId: epMatch.id
    };
  } catch (err) {
    console.warn('[KisskhResolver] Error during resolution:', err);
    return { embedUrl: null };
  }
}
