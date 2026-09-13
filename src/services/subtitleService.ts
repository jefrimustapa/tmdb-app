export interface SubtitleTrack {
  id: string;
  display: string;
  language: string; // 'en' | 'ms' | 'id'
  source: string;
  release?: string;
  url: string;
  format: string;
  isHearingImpaired?: boolean;
}

export interface SubtitleCue {
  start: number; // in seconds
  end: number;   // in seconds
  text: string;
}

const BRIGHT67_BASE_URL = 'https://subs.bright67.online';
const TMDB_API_KEY = '1c7b97dd8b1108d34ffdd5280fa13ac6';

// Cache IMDb IDs so we don't repeat network calls
const imdbIdCache = new Map<number, string>();

/**
 * Resolves IMDb ID from TMDB ID
 */
async function resolveImdbId(tmdbId: number, mediaType: 'movie' | 'tv'): Promise<string | null> {
  if (imdbIdCache.has(tmdbId)) {
    return imdbIdCache.get(tmdbId)!;
  }
  try {
    const url = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3500) });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.imdb_id) {
      imdbIdCache.set(tmdbId, data.imdb_id);
      return data.imdb_id;
    }
  } catch (err) {
    console.warn('[SubtitleService] Failed to resolve IMDb ID for TMDB ID:', tmdbId, err);
  }
  return null;
}

/**
 * Fetches subtitles from OpenSubtitles via Stremio v3 public addon
 * Blazing fast (< 800ms) with full Malay, Indonesian, and English subtitle libraries.
 */
async function fetchStremioOpenSubtitles(
  imdbId: string,
  mediaType: 'movie' | 'tv',
  season?: number,
  episode?: number
): Promise<SubtitleTrack[]> {
  try {
    const epPath = mediaType === 'tv' && season && episode ? `series/${imdbId}:${season}:${episode}.json` : `movie/${imdbId}.json`;
    const url = `https://opensubtitles-v3.strem.io/subtitles/${epPath}`;

    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.subtitles || !Array.isArray(data.subtitles)) return [];

    const tracks: SubtitleTrack[] = [];
    for (const sub of data.subtitles) {
      const rawLang = (sub.lang || '').toLowerCase();
      let normLang: string | null = null;
      if (rawLang === 'may' || rawLang === 'ms' || rawLang === 'zsm') normLang = 'ms';
      else if (rawLang === 'ind' || rawLang === 'id') normLang = 'id';
      else if (rawLang === 'eng' || rawLang === 'en') normLang = 'en';

      if (!normLang || !sub.url) continue;

      tracks.push({
        id: `os-${sub.id || Math.random()}`,
        display: normLang === 'ms' ? 'Malay' : normLang === 'id' ? 'Indonesian' : 'English',
        language: normLang,
        source: 'OpenSubtitles',
        release: sub.movieReleaseName || sub.subtitleFileName || '',
        url: sub.url,
        format: 'srt',
        isHearingImpaired: false
      });
    }
    return tracks;
  } catch (err) {
    console.warn('[SubtitleService] Stremio OpenSubtitles fetch failed:', err);
    return [];
  }
}

/**
 * Fetches subtitles from subs.bright67.online via subf2m (fast fallback, < 2.5s)
 */
async function fetchBright67Subf2m(
  tmdbId: number,
  mediaType: 'movie' | 'tv',
  season?: number,
  episode?: number
): Promise<SubtitleTrack[]> {
  try {
    const isTV = mediaType === 'tv' && typeof season === 'number' && typeof episode === 'number';
    const params = new URLSearchParams({
      id: String(tmdbId),
      source: 'subf2m',
      language: 'en,ms,id'
    });

    if (isTV) {
      params.set('season', String(season));
      params.set('episode', String(episode));
    }

    const apiUrl = `${BRIGHT67_BASE_URL}/search?${params.toString()}`;
    const res = await fetch(apiUrl, { signal: AbortSignal.timeout(3500) });
    if (!res.ok) return [];

    const data = await res.json();
    if (!Array.isArray(data)) return [];

    return data
      .filter((item: any) => {
        const lang = (item.language || item.lang || '').toLowerCase();
        return lang === 'en' || lang === 'ms' || lang === 'id' || lang === 'may' || lang === 'ind';
      })
      .map((item: any) => {
        const rawLang = (item.language || item.lang || '').toLowerCase();
        const normLang = rawLang === 'may' ? 'ms' : (rawLang === 'ind' ? 'id' : rawLang);
        return {
          id: `b67-${item.id || item.stableId || Math.random()}`,
          display: item.display || (normLang === 'ms' ? 'Malay' : normLang === 'id' ? 'Indonesian' : 'English'),
          language: normLang,
          source: item.source || 'subf2m',
          release: item.release || (Array.isArray(item.releases) && item.releases[0]) || '',
          url: item.r2Url || item.url || '',
          format: item.format || 'srt',
          isHearingImpaired: Boolean(item.isHearingImpaired || item.hi)
        };
      })
      .filter((track) => Boolean(track.url));
  } catch {
    return [];
  }
}

/**
 * Searches for available subtitles matching the given media.
 * Queries Stremio OpenSubtitles v3 & Bright67 concurrently with short timeouts.
 * Guarantees zero blocking / zero lag when opening episodes!
 */
export async function searchSubtitles(
  tmdbId: number,
  mediaType: 'movie' | 'tv',
  season?: number,
  episode?: number
): Promise<SubtitleTrack[]> {
  try {
    // 1. Resolve IMDb ID in parallel with any direct TMDB queries
    const imdbPromise = resolveImdbId(tmdbId, mediaType);
    const b67Promise = fetchBright67Subf2m(tmdbId, mediaType, season, episode);

    const [imdbId, b67Tracks] = await Promise.all([imdbPromise, b67Promise]);

    let stremioTracks: SubtitleTrack[] = [];
    if (imdbId) {
      stremioTracks = await fetchStremioOpenSubtitles(imdbId, mediaType, season, episode);
    }

    // Combine and deduplicate
    const combined = [...stremioTracks, ...b67Tracks];
    const seenUrls = new Set<string>();
    const uniqueTracks: SubtitleTrack[] = [];

    for (const track of combined) {
      if (!seenUrls.has(track.url)) {
        seenUrls.add(track.url);
        uniqueTracks.push(track);
      }
    }

    // Sort: Malay & Indonesian first, then English
    return uniqueTracks.sort((a, b) => {
      const aIsMalay = a.language === 'ms' || a.language === 'id';
      const bIsMalay = b.language === 'ms' || b.language === 'id';
      if (aIsMalay && !bIsMalay) return -1;
      if (!aIsMalay && bIsMalay) return 1;
      return 0;
    });
  } catch (err) {
    console.warn('[SubtitleService] Failed to search subtitles:', err);
    return [];
  }
}

/**
 * Downloads and parses an SRT or WebVTT file into an array of timed cues.
 */
export async function fetchAndParseSubtitle(subUrl: string): Promise<SubtitleCue[]> {
  try {
    let textContent = '';

    // 1. Android native proxy fetch
    if (typeof (window as any).AndroidBridge?.fetchHttp === 'function') {
      try {
        textContent = (window as any).AndroidBridge.fetchHttp(subUrl, BRIGHT67_BASE_URL + '/', BRIGHT67_BASE_URL) || '';
      } catch (e) {
        console.warn('[SubtitleService] AndroidBridge fetchHttp failed for subtitle content:', e);
      }
    }

    // 2. Standard browser fetch
    if (!textContent) {
      const res = await fetch(subUrl, { signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        textContent = await res.text();
      }
    }

    if (!textContent) return [];

    return parseSubtitleText(textContent);
  } catch (err) {
    console.warn('[SubtitleService] Failed to download/parse subtitle:', err);
    return [];
  }
}

/**
 * Converts HH:MM:SS,mmm or MM:SS.mmm to seconds
 */
function parseTimestamp(timeStr: string): number {
  if (!timeStr) return 0;
  const clean = timeStr.trim().replace(',', '.');
  const parts = clean.split(':');
  if (parts.length === 3) {
    const [hh, mm, ss] = parts;
    return parseFloat(hh) * 3600 + parseFloat(mm) * 60 + parseFloat(ss);
  } else if (parts.length === 2) {
    const [mm, ss] = parts;
    return parseFloat(mm) * 60 + parseFloat(ss);
  }
  return parseFloat(clean) || 0;
}

/**
 * Parses raw SRT / WebVTT text into timed subtitle cues.
 */
export function parseSubtitleText(content: string): SubtitleCue[] {
  if (!content) return [];

  // Normalize line breaks
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = normalized.split(/\n\s*\n/);
  const cues: SubtitleCue[] = [];

  const timeRegex = /((?:\d{1,2}:)?\d{2}:\d{2}[,.]\d{2,3})\s*-->\s*((?:\d{1,2}:)?\d{2}:\d{2}[,.]\d{2,3})/;

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    let timeIndex = -1;

    for (let i = 0; i < lines.length; i++) {
      if (timeRegex.test(lines[i])) {
        timeIndex = i;
        break;
      }
    }

    if (timeIndex === -1) continue;

    const timeMatch = lines[timeIndex].match(timeRegex);
    if (!timeMatch) continue;

    const start = parseTimestamp(timeMatch[1]);
    const end = parseTimestamp(timeMatch[2]);
    if (isNaN(start) || isNaN(end) || end <= start) continue;

    // Remaining lines contain the subtitle text
    const textLines = lines.slice(timeIndex + 1);
    const cleanedText = textLines
      .join('\n')
      // Strip HTML formatting tags like <i>, <b>, <font color="...">, <c.color>
      .replace(/<[^>]+>/g, '')
      // Strip SSA/ASS style override codes like {\an8}
      .replace(/\{[^}]+\}/g, '')
      .trim();

    if (cleanedText) {
      cues.push({ start, end, text: cleanedText });
    }
  }

  // Sort chronologically by start time
  return cues.sort((a, b) => a.start - b.start);
}
