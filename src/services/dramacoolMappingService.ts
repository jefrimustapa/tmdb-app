/**
 * Dramacool (dramacool.net.my) Korean & Asian Drama Mapping Service
 * Resolves TMDB media to active embed URL (vidmoly, vidbasic, etc.) for playback.
 */

interface CachedDramacoolEntry {
  embedUrl: string | null;
  timestamp: number;
}

const MEMORY_CACHE = new Map<string, CachedDramacoolEntry>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const SESSION_CACHE_KEY_PREFIX = 'tmdb_dramacool_v2_';

function getNormalizedKey(title: string, year?: string | number, season = 1, episode = 1): string {
  const cleanTitle = title.trim().toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, '_');
  return `${cleanTitle}_${year || 'all'}_s${season}_e${episode}`;
}

async function executeFetch(url: string, referer = 'https://dramacool.net.my/'): Promise<string> {
  // 1. If running inside Android WebView with native AndroidBridge, use it to bypass CORS
  if (typeof window !== 'undefined' && (window as any).AndroidBridge?.fetchHttp) {
    try {
      const origin = 'https://dramacool.net.my';
      const nativeResult = (window as any).AndroidBridge.fetchHttp(url, referer, origin);
      if (nativeResult && typeof nativeResult === 'string' && nativeResult.trim().length > 0) {
        return nativeResult;
      }
    } catch (e) {
      console.warn('[DramacoolResolver] AndroidBridge.fetchHttp failed, falling back to fetch:', e);
    }
  }

  // 2. Standard fetch (no hardcoded timeout)
  const res = await fetch(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      Referer: referer
    }
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return await res.text();
}

function cleanSearchQuery(title: string): string {
  return title
    .replace(/[:\-–—].*$/, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Searches dramacool.net.my for drama detail page slug
 */
async function findDramaSlug(title: string, year?: string | number, originalTitle?: string): Promise<string | null> {
  const queries = [
    title.trim(),
    cleanSearchQuery(title),
    originalTitle ? cleanSearchQuery(originalTitle) : null
  ].filter((q): q is string => Boolean(q && q.length > 1));

  const uniqueQueries = [...new Set(queries)];

  for (const query of uniqueQueries) {
    try {
      const searchUrl = `https://dramacool.net.my/?s=${encodeURIComponent(query)}`;
      const html = await executeFetch(searchUrl);
      if (!html) continue;

      // Dramacool search results contain links like:
      // <a href="https://dramacool.net.my/night-has-come-2023/" class="img">
      // or <h3 class="title" ...>Title</h3>
      const matches = Array.from(html.matchAll(/href="https:\/\/dramacool\.net\.my\/([a-zA-Z0-9\-]+)\/"/gi));
      const candidates: string[] = [];

      for (const m of matches) {
        const slug = m[1].toLowerCase();
        if ([
          'category', 'privacy-policy', 'contact-us', 'about-us', 'tag', 
          'kshow-list', 'asian-movie-list', 'asian-drama-list', 'wp-admin', 'search'
        ].includes(slug)) {
          continue;
        }
        if (!candidates.includes(slug)) {
          candidates.push(slug);
        }
      }

      if (candidates.length > 0) {
        const cleanQ = query.toLowerCase().replace(/[^\w]/g, '');
        // Prioritize match containing year or closest slug
        const found = candidates.find(slug => {
          if (year && slug.includes(String(year))) {
            const cleanSlug = slug.replace(/[^\w]/g, '');
            return cleanSlug.includes(cleanQ) || cleanQ.includes(cleanSlug);
          }
          return false;
        }) || candidates.find(slug => {
          const cleanSlug = slug.replace(/[^\w]/g, '');
          return cleanSlug.includes(cleanQ) || cleanQ.includes(cleanSlug);
        }) || candidates[0];

        if (found) {
          return found;
        }
      }
    } catch (err) {
      console.warn(`[DramacoolResolver] Search query "${query}" failed:`, err);
    }
  }

  return null;
}

/**
 * Resolves active video embed URL for a given drama and episode
 */
export async function resolveDramacoolStream(
  title: string,
  year?: string | number,
  season = 1,
  episode = 1,
  originalTitle?: string
): Promise<{ embedUrl: string | null }> {
  const cacheKey = getNormalizedKey(title, year, season, episode);

  // 1. Check in-memory cache
  const memoryHit = MEMORY_CACHE.get(cacheKey);
  if (memoryHit && memoryHit.embedUrl && (Date.now() - memoryHit.timestamp < CACHE_TTL_MS)) {
    return { embedUrl: memoryHit.embedUrl };
  }

  // 2. Check sessionStorage
  if (typeof window !== 'undefined') {
    try {
      const stored = window.sessionStorage.getItem(SESSION_CACHE_KEY_PREFIX + cacheKey);
      if (stored) {
        const parsed: CachedDramacoolEntry = JSON.parse(stored);
        if (parsed && parsed.embedUrl && (Date.now() - parsed.timestamp < CACHE_TTL_MS)) {
          MEMORY_CACHE.set(cacheKey, parsed);
          return { embedUrl: parsed.embedUrl };
        }
      }
    } catch (_) {}
  }

  try {
    const slug = await findDramaSlug(title, year, originalTitle);
    if (!slug) {
      console.warn(`[DramacoolResolver] No drama found for "${title}"`);
      return { embedUrl: null };
    }

    const targetEpNum = Number(episode) || 1;

    // First try fetching the drama main page to extract the EXACT episode link
    // e.g. https://dramacool.net.my/night-has-come-2023-ep-1/ or -episode-1/
    let epUrl = '';
    const dramaUrl = `https://dramacool.net.my/${slug}/`;
    try {
      const dramaHtml = await executeFetch(dramaUrl);
      if (dramaHtml) {
        // Look for links matching this episode number (supports -ep-1, -episode-1, etc.)
        const epRegex = new RegExp(`href="(https://dramacool\\.net\\.my/[^"]*-(?:ep|episode)-0*${targetEpNum}/?)"`, 'i');
        const m = dramaHtml.match(epRegex);
        if (m && m[1]) {
          epUrl = m[1];
        }
      }
    } catch (e) {
      console.warn('[DramacoolResolver] Could not load drama main page, falling back to direct URL patterns:', e);
    }

    // Fallback URL predictions if drama page did not supply the link
    if (!epUrl) {
      epUrl = `https://dramacool.net.my/${slug}-ep-${targetEpNum}/`;
    }

    let epHtml = '';
    try {
      epHtml = await executeFetch(epUrl);
    } catch {
      // Try alternate -episode- pattern
      const altUrl = `https://dramacool.net.my/${slug}-episode-${targetEpNum}/`;
      epHtml = await executeFetch(altUrl).catch(() => '');
    }

    if (!epHtml) {
      return { embedUrl: null };
    }

    // Extract server embed link from data-video attribute on the episode page:
    // e.g. <li class="kvid selected" data-video="https://kisskh.space/night-has-come-2023-ep-1/">
    const videoMatch = epHtml.match(/data-video="([^"]+)"/i);
    let rawServerUrl = videoMatch ? videoMatch[1].trim() : null;

    if (!rawServerUrl) {
      // Fallback: check for iframe src
      const iframeMatch = epHtml.match(/<iframe[^>]+src="([^"]+)"/i);
      if (iframeMatch) {
        rawServerUrl = iframeMatch[1].trim();
      }
    }

    if (!rawServerUrl) {
      return { embedUrl: null };
    }

    if (rawServerUrl.startsWith('//')) {
      rawServerUrl = `https:${rawServerUrl}`;
    }

    let finalEmbedUrl = rawServerUrl;

    // If the server URL is an intermediate page like kisskh.space or similar player relay,
    // fetch it to extract the underlying iframe (e.g. vidmoly.biz, vidbasic.top, etc.)
    if (rawServerUrl.includes('kisskh.space') || rawServerUrl.includes('asianembed') || rawServerUrl.includes('vidbasic.top/embed')) {
      try {
        const relayHtml = await executeFetch(rawServerUrl, epUrl);
        const innerIframe = relayHtml.match(/<iframe[^>]+(?:id="embedvideo"[^>]*src|src)="([^"]+)"/i);
        if (innerIframe && innerIframe[1]) {
          let innerSrc = innerIframe[1].trim();
          if (innerSrc.startsWith('//')) innerSrc = `https:${innerSrc}`;
          finalEmbedUrl = innerSrc;
        }
      } catch (e) {
        console.warn('[DramacoolResolver] Could not resolve inner relay iframe, using relay URL directly:', e);
      }
    }

    const entry: CachedDramacoolEntry = {
      embedUrl: finalEmbedUrl,
      timestamp: Date.now()
    };
    MEMORY_CACHE.set(cacheKey, entry);
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.setItem(SESSION_CACHE_KEY_PREFIX + cacheKey, JSON.stringify(entry));
      } catch (_) {}
    }

    return { embedUrl: finalEmbedUrl };
  } catch (err) {
    console.warn('[DramacoolResolver] Resolution error:', err);
    return { embedUrl: null };
  }
}
