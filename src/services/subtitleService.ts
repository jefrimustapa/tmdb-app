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
 * Decodes common HTML entities found in subtitle tracks
 */
function decodeHtmlEntities(text: string): string {
  if (!text.includes('&')) return text;
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;|&#x27;/gi, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"')
    .replace(/&#8216;|&#8217;|&lsquo;|&rsquo;/g, "'")
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&#(\d+);/g, (_, dec) => {
      try {
        return String.fromCharCode(parseInt(dec, 10));
      } catch {
        return '';
      }
    });
}

/**
 * Parses raw SRT / WebVTT text into timed subtitle cues.
 * Built with resilient line-by-line scanning to gracefully handle:
 * - UTF-8 Byte Order Marks (BOM)
 * - Single-newline cue separators (malformed SRTs)
 * - WebVTT headers (WEBVTT, NOTE, STYLE, REGION)
 * - Non-standard timestamp formats (H:MM:SS, MM:SS, commas/dots)
 * - Trailing WebVTT cue positioning flags (align:middle position:50%)
 * - Unescaped HTML entities and SSA/ASS tag overrides
 */
export function parseSubtitleText(content: string): SubtitleCue[] {
  if (!content) return [];

  // 1. Strip UTF-8 BOM if present
  let cleanContent = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;

  // 2. Normalize CRLF and CR to standard LF
  cleanContent = cleanContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const lines = cleanContent.split('\n');
  const cues: SubtitleCue[] = [];

  // Matches flexible timestamps like "00:01:23,450 --> 00:01:25,700" or "01:23.450 --> 01:25.700"
  // and ignores trailing WebVTT positioning tokens (e.g. "align:start size:50%")
  const timestampRegex = /^\s*((?:\d{1,2}:)?\d{1,2}:\d{2}[,.]\d{1,3})\s*-->\s*((?:\d{1,2}:)?\d{1,2}:\d{2}[,.]\d{1,3})/;

  let currentStart = -1;
  let currentEnd = -1;
  let currentTextLines: string[] = [];

  const flushCue = () => {
    if (currentStart >= 0 && currentEnd > currentStart && currentTextLines.length > 0) {
      const rawText = currentTextLines.join('\n');

      // Sanitize: strip HTML tags (<i>, <b>, <font>, <v ...>), SSA tags ({\an8}), and decode entities
      const sanitized = decodeHtmlEntities(
        rawText
          .replace(/<[^>]+>/g, '')
          .replace(/\{[^}]+\}/g, '')
      ).trim();

      if (sanitized) {
        cues.push({
          start: currentStart,
          end: currentEnd,
          text: sanitized
        });
      }
    }
    currentStart = -1;
    currentEnd = -1;
    currentTextLines = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check if this line is a timestamp indicator
    const match = trimmed.match(timestampRegex);
    if (match) {
      // If we already had an active cue collecting text, save it before starting this new one
      flushCue();

      const startSec = parseTimestamp(match[1]);
      const endSec = parseTimestamp(match[2]);

      if (!isNaN(startSec) && !isNaN(endSec)) {
        currentStart = startSec;
        // Auto-correct zero or negative duration to minimum 2 seconds
        currentEnd = endSec > startSec ? endSec : startSec + 2.0;
      }
      continue;
    }

    // Skip WebVTT header lines or block metadata
    if (
      trimmed === 'WEBVTT' ||
      trimmed.startsWith('NOTE') ||
      trimmed.startsWith('STYLE') ||
      trimmed.startsWith('REGION')
    ) {
      continue;
    }

    // Skip standalone numerical cue index lines (e.g. "1", "24", "1500")
    if (/^\d+$/.test(trimmed) && currentStart < 0) {
      continue;
    }

    // Blank line indicates cue termination
    if (!trimmed) {
      if (currentStart >= 0) {
        flushCue();
      }
      continue;
    }

    // Otherwise, if we are inside a valid cue window, collect the text line
    if (currentStart >= 0) {
      currentTextLines.push(line);
    }
  }

  // Flush final trailing cue
  flushCue();

  // Sort cues chronologically by start timestamp
  return cues.sort((a, b) => a.start - b.start);
}
