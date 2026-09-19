/**
 * PencuriMovie (pencurimoviesubmalay26.site) Stream Mapping Service
 * Resolves TMDB movies and TV series to active embed streams (netu, abyss, etc.).
 */

import { dbService } from './db';

export interface PencuriServer {
  server: string;
  url: string;
}

export interface PencuriStreamResult {
  embedUrl: string | null;
  directHlsUrl?: string | null;
  serverMirrors: PencuriServer[];
}

interface CachedPencuriEntry {
  embedUrl: string | null;
  directHlsUrl?: string | null;
  serverMirrors: PencuriServer[];
  timestamp: number;
}

const MEMORY_CACHE = new Map<string, CachedPencuriEntry>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours for hits
const NEGATIVE_CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours for misses
const SESSION_CACHE_KEY_PREFIX = 'tmdb_pencuri_v2_';
const PERSISTENT_CACHE_PREFIX = 'pencuri_v2_';
// Cache for resolved TV show page URL — skips search for subsequent episodes of the same show
const TV_SHOW_URL_CACHE = new Map<string, string>();

const BASE_URL = 'https://pencurimoviesubmalay26.site';

function getShowKey(title: string, year?: string | number): string {
  const clean = title.trim().toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, '_');
  return `show_${clean}_${year || 'all'}`;
}

function getNormalizedKey(title: string, year?: string | number, season = 1, episode = 1, isTv = false): string {
  const cleanTitle = title.trim().toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, '_');
  return isTv
    ? `${cleanTitle}_${year || 'all'}_s${season}_e${episode}`
    : `${cleanTitle}_${year || 'all'}`;
}


async function executeFetch(url: string, referer = BASE_URL, timeoutMs = 10000): Promise<string> {
  // 1. AndroidBridge bypass for CORS
  if (typeof window !== 'undefined' && (window as any).AndroidBridge?.fetchHttp) {
    try {
      const nativeResult = (window as any).AndroidBridge.fetchHttp(url, referer, BASE_URL);
      if (nativeResult && typeof nativeResult === 'string' && nativeResult.trim().length > 0) {
        return nativeResult;
      }
    } catch (e) {
      console.warn('[PencuriResolver] AndroidBridge.fetchHttp failed, falling back to fetch:', e);
    }
  }

  // 2. Standard Web Fetch
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        Referer: referer
      },
      signal: controller?.signal
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} for ${url}`);
    }
    return await res.text();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function executePost(
  url: string,
  formData: Record<string, string>,
  referer = BASE_URL,
  timeoutMs = 10000
): Promise<string> {
  const bodyParams = new URLSearchParams(formData).toString();

  // 1. AndroidBridge POST bypass for CORS
  if (typeof window !== 'undefined' && (window as any).AndroidBridge?.fetchHttpPost) {
    try {
      const nativeResult = (window as any).AndroidBridge.fetchHttpPost(
        url,
        bodyParams,
        'application/x-www-form-urlencoded; charset=UTF-8',
        referer,
        BASE_URL
      );
      if (nativeResult && typeof nativeResult === 'string' && nativeResult.trim().length > 0) {
        return nativeResult;
      }
    } catch (e) {
      console.warn('[PencuriResolver] AndroidBridge.fetchHttpPost failed, falling back:', e);
    }
  }

  // 2. Standard Web POST
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        Accept: 'application/json, text/javascript, */*; q=0.01',
        Referer: referer
      },
      body: bodyParams,
      signal: controller?.signal
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} for ${url}`);
    }
    return await res.text();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function cleanTitleForSearch(raw: string): string {
  return raw
    .replace(/[:\-–—].*$/, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Convert a title to PencuriMovie URL slug format */
function titleToSlug(title: string): string {
  return title.trim().toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Try fetching a URL — returns html on 200, null on 404/error */
async function tryFetch(url: string, referer = BASE_URL): Promise<string | null> {
  try {
    const html = await executeFetch(url, referer);
    if (html && html.length > 2000) return html;
    return null;
  } catch {
    return null;
  }
}

/**
 * Resolves PencuriMovie page URL for a movie or TV show.
 * Strategy: direct URL construction first (fast), search as fallback.
 */
async function searchPencuri(
  title: string,
  year?: string | number,
  originalTitle?: string,
  isTv = false,
  onProgress?: (msg: string) => void
): Promise<string | null> {
  const pathType = isTv ? 'tvshows' : 'movies';

  // --- Strategy 1: Direct URL from title slug (no search, no latency) ---
  const hasDiffOriginal = Boolean(originalTitle && originalTitle.trim().toLowerCase() !== title.trim().toLowerCase());
  const titlesToTry = (hasDiffOriginal
    ? [originalTitle, cleanTitleForSearch(originalTitle!), title, cleanTitleForSearch(title)]
    : [title, cleanTitleForSearch(title), originalTitle, originalTitle ? cleanTitleForSearch(originalTitle) : null]
  ).filter((t): t is string => Boolean(t && t.trim().length > 1));

  const seenSlugs = new Set<string>();
  for (const t of titlesToTry) {
    const slug = titleToSlug(t);
    if (seenSlugs.has(slug)) continue;
    seenSlugs.add(slug);

    // Try slug alone, and slug + year
    const candidates = [`${BASE_URL}/${pathType}/${slug}/`];
    if (year) candidates.push(`${BASE_URL}/${pathType}/${slug}-${year}/`);

    for (const url of candidates) {
      onProgress?.(`Trying direct URL: ${url}`);
      const html = await tryFetch(url);
      if (html) {
        onProgress?.('Found via direct URL');
        return url;
      }
    }
  }

  // --- Strategy 2: Search fallback (slower, may timeout) ---
  const queries = hasDiffOriginal
    ? [originalTitle!.trim(), cleanTitleForSearch(originalTitle!), title.trim(), cleanTitleForSearch(title)]
    : [title.trim(), cleanTitleForSearch(title), ...(originalTitle ? [originalTitle.trim()] : [])];
  const uniqueQueries = [...new Set(queries)].filter(q => q.length > 1);

  for (const q of uniqueQueries) {
    try {
      onProgress?.(`Searching PencuriMovie for "${q}"...`);
      const searchUrl = `${BASE_URL}/?s=${encodeURIComponent(q)}`;
      const html = await executeFetch(searchUrl);
      if (!html) continue;

      const targetPath = isTv ? '/tvshows/' : '/movies/';
      const regex = new RegExp(`href="(${BASE_URL}${targetPath}[^"]+)"`, 'gi');
      const matches = Array.from(html.matchAll(regex));

      if (matches.length > 0) {
        const titleWords = cleanTitleForSearch(title).toLowerCase().split(/\s+/).filter(w => w.length > 2);
        const origWords = originalTitle
          ? cleanTitleForSearch(originalTitle).toLowerCase().split(/\s+/).filter(w => w.length > 2)
          : [];

        const candidates = matches.map(m => {
          const url = m[1];
          const slug = url.split('/').filter(Boolean).pop()?.toLowerCase() || '';
          let score = 0;
          // Priority to originalTitle tokens for Southeast Asian/Malay media (+3 per matching word)
          origWords.forEach(w => { if (slug.includes(w)) score += 3; });
          // Secondary scoring against title tokens (+2 per matching word)
          titleWords.forEach(w => { if (slug.includes(w)) score += 2; });
          if (year && slug.includes(String(year))) score += 3;
          return { url, score };
        });
        candidates.sort((a, b) => b.score - a.score);
        if (candidates[0]) return candidates[0].url;
      }

      // Fallback to alt type
      const altPath = isTv ? '/movies/' : '/tvshows/';
      const altMatch = new RegExp(`href="(${BASE_URL}${altPath}[^"]+)"`, 'gi').exec(html);
      if (altMatch) return altMatch[1];
    } catch (err) {
      console.warn('[PencuriResolver] Search attempt failed:', err);
    }
  }

  return null;
}



/**
 * Extracts embed URL and mirrors from a detail page (Movie or Episode)
 */
async function extractStreamsFromPage(
  pageUrl: string,
  type: 'mv' | 'ep',
  onProgress?: (msg: string) => void
): Promise<PencuriStreamResult> {
  onProgress?.('Fetching media details on PencuriMovie...');
  const html = await executeFetch(pageUrl);
  if (!html) return { embedUrl: null, serverMirrors: [] };

  // Find player options with data-post and data-nume
  // e.g. <li id="player-option-1" class="zetaflix_player_option" data-type="ep" data-post="90227" data-nume="1">
  const optionRegex = /class=["'][^"']*zetaflix_player_option[^"']*["'][^>]*data-post=["'](\d+)["'][^>]*data-nume=["']([^"']+)["']/gi;
  const optionRegexAlt = /data-post=["'](\d+)["'][^>]*data-nume=["']([^"']+)["'][^>]*class=["'][^"']*zetaflix_player_option[^"']*["']/gi;

  const foundOptions: { postId: string; nume: string }[] = [];

  for (const m of Array.from(html.matchAll(optionRegex))) {
    if (m[2] !== 'fake') {
      foundOptions.push({ postId: m[1], nume: m[2] });
    }
  }

  if (foundOptions.length === 0) {
    for (const m of Array.from(html.matchAll(optionRegexAlt))) {
      if (m[2] !== 'fake') {
        foundOptions.push({ postId: m[1], nume: m[2] });
      }
    }
  }

  // If still not found, check if data-post is somewhere on the page
  if (foundOptions.length === 0) {
    const postMatch = html.match(/data-post=["'](\d+)["']/i);
    if (postMatch) {
      foundOptions.push({ postId: postMatch[1], nume: '1' });
      foundOptions.push({ postId: postMatch[1], nume: '2' });
    }
  }

  if (foundOptions.length === 0) {
    return { embedUrl: null, serverMirrors: [] };
  }

  // Prioritize nume '2' (Abyss server is standard Option 2 on PencuriMovie)
  foundOptions.sort((a, b) => {
    if (a.nume === '2') return -1;
    if (b.nume === '2') return 1;
    return 0;
  });

  const mirrors: PencuriServer[] = [];
  const ajaxUrl = `${BASE_URL}/wp-admin/admin-ajax.php`;

  // Request stream for each nume option
  for (const opt of foundOptions) {
    try {
      onProgress?.(`Resolving server option #${opt.nume}...`);
      const resText = await executePost(
        ajaxUrl,
        {
          action: 'zeta_player_ajax',
          post: opt.postId,
          nume: opt.nume,
          type
        },
        pageUrl
      );

      if (!resText) continue;

      let jsonRes: any = null;
      try {
        jsonRes = JSON.parse(resText);
      } catch {
        continue;
      }

      if (jsonRes && jsonRes.embed_url) {
        const rawEmbed = jsonRes.embed_url;
        // Parse iframe src if embed_url contains an iframe tag
        const srcMatch = rawEmbed.match(/src=["']([^"']+)["']/i);
        const resolvedSrc = srcMatch ? srcMatch[1].replace(/\\/g, '') : rawEmbed;

        if (resolvedSrc && resolvedSrc.startsWith('http')) {
          let serverName = `Server ${opt.nume}`;
          if (resolvedSrc.includes('netu')) serverName = 'Netu (Malay)';
          else if (resolvedSrc.includes('abyss')) serverName = 'Abyss (Malay)';
          else if (resolvedSrc.includes('dood')) serverName = 'DoodStream';
          else if (resolvedSrc.includes('streamwish')) serverName = 'StreamWish';

          mirrors.push({
            server: serverName,
            url: resolvedSrc
          });

          // Fast break if we specifically resolved the Abyss mirror
          if (resolvedSrc.includes('abyss')) {
            onProgress?.('Found Abyss Malay stream');
          }
        }
      }
    } catch (err) {
      console.warn(`[PencuriResolver] Option #${opt.nume} failed:`, err);
    }
  }

  // Strictly prioritize Abyss server
  const abyssMirror = mirrors.find(m => m.url.includes('abyss'));
  if (abyssMirror) {
    return {
      embedUrl: abyssMirror.url,
      serverMirrors: [abyssMirror, ...mirrors.filter(m => !m.url.includes('abyss'))]
    };
  }

  if (mirrors.length > 0) {
    return {
      embedUrl: mirrors[0].url,
      serverMirrors: mirrors
    };
  }

  // Last resort: scrape <iframe class="metaframe rptss" src="..."> directly from the page stub
  // Some PencuriMovie episodes serve the embed URL inline without requiring AJAX
  onProgress?.('Trying direct iframe stub extraction...');
  const metaframeMatch = html.match(/<iframe[^>]+class=[\"'][^\"']*(?:metaframe|rptss)[^\"']*[\"'][^>]+src=[\"']([^\"']+)[\"']/i)
    || html.match(/<iframe[^>]+src=[\"']([^\"']+)[\"'][^>]+class=[\"'][^\"']*(?:metaframe|rptss)[^\"']*[\"']/i);

  if (metaframeMatch && metaframeMatch[1] && metaframeMatch[1].startsWith('http')) {
    const stubSrc = metaframeMatch[1].replace(/\\/g, '');
    let serverName = 'PencuriMovie';
    if (stubSrc.includes('abyss')) serverName = 'Abyss (Malay)';
    else if (stubSrc.includes('netu')) serverName = 'Netu (Malay)';
    else if (stubSrc.includes('dood')) serverName = 'DoodStream';
    else if (stubSrc.includes('streamwish')) serverName = 'StreamWish';
    const stubMirror: PencuriServer = { server: serverName, url: stubSrc };
    onProgress?.(`Found embed via iframe stub: ${serverName}`);
    return { embedUrl: stubSrc, serverMirrors: [stubMirror] };
  }

  return { embedUrl: null, serverMirrors: [] };
}


/**
 * Main stream resolution for PencuriMovie
 */
export async function resolvePencuriStream(
  title: string,
  year?: string | number,
  season = 1,
  episode = 1,
  mediaType: 'movie' | 'tv' = 'movie',
  originalTitle?: string,
  onProgress?: (msg: string) => void
): Promise<PencuriStreamResult> {
  if (!title || !title.trim()) {
    return { embedUrl: null, serverMirrors: [] };
  }

  const isTv = mediaType === 'tv';
  const cacheKey = getNormalizedKey(originalTitle || title, year, season, episode, isTv);

  // 1. Check memory cache
  const cached = MEMORY_CACHE.get(cacheKey);
  if (cached && cached.embedUrl && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    onProgress?.('Loaded from memory cache');
    return { embedUrl: cached.embedUrl, directHlsUrl: cached.directHlsUrl, serverMirrors: cached.serverMirrors };
  }

  // 2. Check sessionStorage
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      const stored = sessionStorage.getItem(`${SESSION_CACHE_KEY_PREFIX}${cacheKey}`);
      if (stored) {
        const parsed: CachedPencuriEntry = JSON.parse(stored);
        if (parsed && parsed.embedUrl && Date.now() - parsed.timestamp < CACHE_TTL_MS) {
          MEMORY_CACHE.set(cacheKey, parsed);
          return { embedUrl: parsed.embedUrl, directHlsUrl: parsed.directHlsUrl, serverMirrors: parsed.serverMirrors };
        }
      }
    } catch {}
  }

  // 3. Check Dexie persistent cache (hits only — misses are ignored so we always retry fresh)
  try {
    const dbKey = `${PERSISTENT_CACHE_PREFIX}${cacheKey}`;
    const persisted = await dbService.getRatingCacheItem(dbKey);
    if (persisted && typeof persisted === 'string') {
      const parsed: CachedPencuriEntry = JSON.parse(persisted);
      if (parsed.embedUrl && Date.now() - parsed.timestamp < CACHE_TTL_MS) {
        onProgress?.('Loaded from persistent storage');
        MEMORY_CACHE.set(cacheKey, parsed);
        return { embedUrl: parsed.embedUrl, directHlsUrl: parsed.directHlsUrl, serverMirrors: parsed.serverMirrors || [] };
      }
      // Stale or miss entry — delete it so fresh fetch proceeds
      await dbService.deleteRatingCacheItem(dbKey);
    }
  } catch {}


  // 4. Resolve media page — for TV shows, check show URL cache first to skip costly search
  let mediaUrl: string | null = null;
  const showCacheKey = isTv ? getShowKey(originalTitle || title, year) : null;

  if (showCacheKey && TV_SHOW_URL_CACHE.has(showCacheKey)) {
    mediaUrl = TV_SHOW_URL_CACHE.get(showCacheKey)!;
    onProgress?.('Using cached TV show page (skipping search)...');
  } else {
    mediaUrl = await searchPencuri(title, year, originalTitle, isTv, onProgress);
    // Save TV show URL to cache for subsequent episodes
    if (mediaUrl && showCacheKey) {
      TV_SHOW_URL_CACHE.set(showCacheKey, mediaUrl);
    }
  }

  if (!mediaUrl) {
    // If media page was not found, clear any stale cache and return empty result
    MEMORY_CACHE.delete(cacheKey);
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        sessionStorage.removeItem(`${SESSION_CACHE_KEY_PREFIX}${cacheKey}`);
      } catch {}
    }
    try {
      await dbService.deleteRatingCacheItem(`${PERSISTENT_CACHE_PREFIX}${cacheKey}`);
    } catch {}
    return { embedUrl: null, serverMirrors: [] };
  }


  // 5. If it's a TV show, resolve episode page first
  let targetStreamPageUrl = mediaUrl;
  let streamType: 'mv' | 'ep' = 'mv';

  if (isTv || mediaUrl.includes('/tvshows/')) {
    streamType = 'ep';
    onProgress?.(`Finding Season ${season} Episode ${episode}...`);

    // Extract show slug from the resolved TV show URL
    // e.g. https://pencurimoviesubmalay26.site/tvshows/kelas-tahanan-cikgu-hiragi/ → kelas-tahanan-cikgu-hiragi
    const showSlug = mediaUrl.replace(/\/$/, '').split('/').pop() || '';

    const sStr = String(season).padStart(2, '0');
    const eStr = String(episode).padStart(2, '0');

    // --- Direct episode URL candidates (fast, no TV page fetch needed) ---
    const directEpCandidates = [
      `${BASE_URL}/episodes/${showSlug}-s${sStr}e${eStr}/`,
      `${BASE_URL}/episodes/${showSlug}-s${season}e${episode}/`,
      `${BASE_URL}/episodes/${showSlug}-s${sStr}e${episode}/`,
    ];

    let foundEpUrl: string | null = null;
    for (const epUrl of directEpCandidates) {
      onProgress?.(`Trying direct episode URL: ${epUrl}`);
      const epHtml = await tryFetch(epUrl, mediaUrl);
      if (epHtml) {
        foundEpUrl = epUrl;
        break;
      }
    }

    if (foundEpUrl) {
      targetStreamPageUrl = foundEpUrl;
    } else {
      // Fallback: fetch TV show page and scrape episode links
      onProgress?.('Direct episode URL not found, scraping TV show page...');
      const tvPageHtml = await tryFetch(mediaUrl);
      if (tvPageHtml) {
        const epLinkRegex = /href=["'](https?:\/\/[^"']*\/episodes\/[^"']+)["']/gi;
        const allEpLinks = Array.from(tvPageHtml.matchAll(epLinkRegex)).map(m => m[1]);

        const targetSeason = Number(season);
        const targetEpisode = Number(episode);

        const matchingLink = allEpLinks.find(link => {
          const lower = link.toLowerCase();
          const seMatch = lower.match(/s0*(\d+)e0*(\d+)(?!\d)/);
          if (seMatch) return Number(seMatch[1]) === targetSeason && Number(seMatch[2]) === targetEpisode;
          const epMatch = lower.match(/(?:-e|-ep|episode[-_]?)0*(\d+)(?!\d)/);
          if (epMatch) return Number(epMatch[1]) === targetEpisode;
          return false;
        });

        if (matchingLink) {
          targetStreamPageUrl = matchingLink;
        } else if (allEpLinks.length > 0) {
          const fallbackLink = allEpLinks.find(link => {
            const m = link.toLowerCase().match(/(?:e|ep|episode)0*(\d+)(?!\d)/);
            return m && Number(m[1]) === targetEpisode;
          });
          targetStreamPageUrl = fallbackLink || allEpLinks[allEpLinks.length - 1];
        }
      }
    }
  }


  // 6. Extract streams from the final target page
  const result = await extractStreamsFromPage(targetStreamPageUrl, streamType, onProgress);

  // 7. Save to cache only when successful; if failed, clear previous cache so next retry does a fresh attempt
  if (result.embedUrl) {
    const entryToCache: CachedPencuriEntry = {
      embedUrl: result.embedUrl,
      directHlsUrl: result.directHlsUrl,
      serverMirrors: result.serverMirrors,
      timestamp: Date.now()
    };

    MEMORY_CACHE.set(cacheKey, entryToCache);
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        sessionStorage.setItem(`${SESSION_CACHE_KEY_PREFIX}${cacheKey}`, JSON.stringify(entryToCache));
      } catch {}
    }
    try {
      await dbService.setRatingCacheItem(`${PERSISTENT_CACHE_PREFIX}${cacheKey}`, JSON.stringify(entryToCache));
    } catch {}
  } else {
    // If resolution failed, clear any cached entry so subsequent tries fetch fresh
    MEMORY_CACHE.delete(cacheKey);
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        sessionStorage.removeItem(`${SESSION_CACHE_KEY_PREFIX}${cacheKey}`);
      } catch {}
    }
    try {
      await dbService.deleteRatingCacheItem(`${PERSISTENT_CACHE_PREFIX}${cacheKey}`);
    } catch {}
  }

  return result;
}

/**
 * Explicitly clear cached Pencuri stream entry for a specific media item or all items
 */
export async function clearPencuriCache(title?: string, year?: string | number, season = 1, episode = 1, isTv = false): Promise<void> {
  if (!title) {
    MEMORY_CACHE.clear();
    TV_SHOW_URL_CACHE.clear();
    if (typeof window !== 'undefined' && window.sessionStorage) {
      Object.keys(sessionStorage).forEach(k => {
        if (k.startsWith(SESSION_CACHE_KEY_PREFIX)) {
          sessionStorage.removeItem(k);
        }
      });
    }
    return;
  }
  const key = getNormalizedKey(title, year, season, episode, isTv);
  MEMORY_CACHE.delete(key);
  if (isTv) {
    TV_SHOW_URL_CACHE.delete(getShowKey(title, year));
  }
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      sessionStorage.removeItem(`${SESSION_CACHE_KEY_PREFIX}${key}`);
    } catch {}
  }
  try {
    await dbService.deleteRatingCacheItem(`${PERSISTENT_CACHE_PREFIX}${key}`);
  } catch {}
}
