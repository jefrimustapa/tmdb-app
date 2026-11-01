/**
 * Base Resolver and Shared Matching Utilities
 * Module: server/tg-streamer/resolvers/base.js
 */

export const DEFAULT_PIPELINE_BUFFERS = {
  sd: 2,       // 2 x 512KB = 1.0 MB (<=480p / 360p)
  '720p': 4,   // 4 x 512KB = 2.0 MB
  '1080p': 6,  // 6 x 512KB = 3.0 MB
  '4k': 8,     // 8 x 512KB = 4.0 MB
};

/**
 * Parallel MTProto block fetches for a quality tier: saved setting, then default, then 4.
 * Only sizes the Telegram download pipeline; unrelated to ffmpeg process limits.
 */
export function getTierConcurrency(tier, pipelineBuffers) {
  return (pipelineBuffers && pipelineBuffers[tier]) || DEFAULT_PIPELINE_BUFFERS[tier] || 4;
}

export function detectVideoQualityTier(filename = '', queryKey = '', targetDoc = null, customSize = null) {
  // 1. Genuine Telegram Video Dimensions (Highest authority: real pixel metadata of the stream)
  // Strictly check DocumentAttributeVideo only - NEVER use DocumentAttributeImageSize or generic (w && h) poster thumbnails!
  if (targetDoc && Array.isArray(targetDoc.attributes)) {
    const videoAttr = targetDoc.attributes.find(a => a.className === 'DocumentAttributeVideo');
    if (videoAttr) {
      const w = Number(videoAttr.w) || 0;
      const h = Number(videoAttr.h) || 0;
      if (w >= 3200 || h >= 1800) return '4k';
      if (w >= 1600 || h >= 900) return '1080p';
      if (w >= 960 || h >= 530) return '720p';

      // For sub-HD video dimensions (< 960x530 e.g. 480p/360p):
      // Check if file size is substantial (>= 600 MB for TV or >= 1.2 GB general)
      const docBytes = Number(customSize || targetDoc.size || 0);
      const isLargeFile = docBytes >= 600 * 1024 * 1024;
      if (!isLargeFile && (w > 0 || h > 0)) {
        return 'sd';
      }
      // If large file, videoAttr sub-HD dimension is an unreliable preview placeholder - proceed to fallbacks
    }
  }

  // 2. Fallback on file size heuristics (large multi-gigabyte files) when metadata is absent
  const docBytes = Number(customSize || (targetDoc && targetDoc.size) || 0);
  const fn = String(filename || '').toLowerCase().replace(/[_\.\-\+\[\]\(\)]/g, ' ');
  const qk = String(queryKey || '').toLowerCase().replace(/[_\.\-\+\[\]\(\)]/g, ' ');

  // 3. Fallback (Last resort): Check the video filename
  if (/\b(4k|2160p|uhd)\b/i.test(fn)) return '4k';
  if (/\b(1080p|1080|fhd)\b/i.test(fn)) return '1080p';
  if (/\b(720p|720|hd)\b/i.test(fn)) return '720p';
  if (/\b(480p|360p|540p|sd)\b/i.test(fn)) return 'sd';

  // 4. File size fallback when filename has no quality tags
  if (docBytes >= 2 * 1024 * 1024 * 1024) return '1080p';
  if (docBytes >= 600 * 1024 * 1024) return '720p';

  // 5. Fallback: Secondary check on queryKey only if neither attributes, filename, nor size has quality tags
  if (/\b(4k|2160p|uhd)\b/i.test(qk)) return '4k';
  if (/\b(1080p|1080|fhd)\b/i.test(qk)) return '1080p';
  if (/\b(720p|720|hd)\b/i.test(qk)) return '720p';
  if (/\b(480p|360p|540p|sd)\b/i.test(qk)) return 'sd';

  // 6. Default to standard 720p HD pipeline
  return '720p';
}

export function normalizeTitle(str) {
  return (str || '')
    .toLowerCase()
    .replace(/['’‘`]/g, '')
    .replace(/[^\w\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Helper: Extract sequel number / identifier from a title string (e.g. "Polis Evo 2" -> 2, "Polis Evo III" -> 3)
export function extractSequelInfo(str) {
  if (!str) return null;
  // Clean out common false positive patterns:
  // 1. Bot search results headers: "8 results for..."
  // 2. Audio channel descriptions: "AAC 2.0", "DD 5.1", "2.0", "5.1"
  // 3. Pagination tags: "(1/1)", "(2/2)"
  // 4. File sizes: "1.8 GB", "850 MB"
  const cleaned = str
    .replace(/\b\d+\s*results\b/gi, ' ')
    .replace(/\b(aac|ac3|eac3|dts|ddp|flac|audio)?\s*[257]\.[01]\b/gi, ' ')
    .replace(/\b\d+\/\d+\b/g, ' ')
    .replace(/[\d,]+(?:\.\d+)?\s*(mb|gb|kb)\b/gi, ' ')
    .replace(/\b(19\d\d|20[0-3]\d)\b/g, ' '); // Strip 4-digit years so "2025" isn't confused

  const s = ` ${cleaned.toLowerCase()} `;
  // Roman numerals: ii -> 2, iii -> 3, iv -> 4, v -> 5, vi -> 6
  const romanMatch = s.match(/\b(?:part|chapter|musim|season)?\s*(ii|iii|iv|v|vi)\b/i);
  if (romanMatch) {
    const map = { ii: 2, iii: 3, iv: 4, v: 5, vi: 6 };
    return map[romanMatch[1].toLowerCase()] || null;
  }
  // Explicit Arabic numbers: e.g. " 2 ", " 3 ", " 4 ", "part 2", "part 3"
  const numMatch = s.match(/\b(?:part|chapter|musim|season)\s*([2-9])\b/i) ||
                   s.match(/\b([2-9])\b/);
  if (numMatch) {
    return parseInt(numMatch[1], 10);
  }
  return null;
}

// Helper: Extract 4-digit release year from a string, protecting numbers that are part of title tokens
export function extractYear(str, titleTokens = []) {
  if (!str) return null;
  const titleTokenSet = new Set((titleTokens || []).map(t => String(t).toLowerCase()));

  // 1. Prefer year in parentheses or brackets: "(2026)", "[2026]"
  const parenMatch = str.match(/[\(\[]\s*((?:19|20)\d\d)\s*[\)\]]/);
  if (parenMatch) {
    const yr = parseInt(parenMatch[1], 10);
    if (!titleTokenSet.has(String(yr))) return yr;
  }

  // 2. Year formatted as isolated dot/space/dash delimited release year: ".2026.", " 2026 ", "- 2026 -"
  const allYears = Array.from(str.matchAll(/\b((?:19[7-9]\d|20[0-3]\d))\b/g))
    .map(m => parseInt(m[1], 10))
    .filter(yr => !titleTokenSet.has(String(yr)));
  if (allYears.length > 0) {
    return allYears[allYears.length - 1];
  }

  // 3. Fallback: any 4-digit year not matching title tokens
  const fallbackMatch = str.match(/\b((?:19\d\d|20[0-3]\d))\b/);
  if (fallbackMatch) {
    const yr = parseInt(fallbackMatch[1], 10);
    if (!titleTokenSet.has(String(yr))) return yr;
  }

  return null;
}

// Helper: Convert number to Roman numeral (for seasons, e.g. 2 -> II, 3 -> III)
export function toRoman(num) {
  const map = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI', 7: 'VII', 8: 'VIII', 9: 'IX', 10: 'X' };
  return map[num] || String(num);
}

// Search query generation decoupled in queries.js
export { buildSearchQueries, generateSeriesSearchQueries, generateMovieSearchQueries } from './queries.js';

// Helper: Extract significant search tokens from title (retaining digits, roman numerals, and words >= 2 chars)
export function extractTitleTokens(str) {
  const norm = normalizeTitle(str);
  return norm.split(' ').filter(t => {
    if (!t) return false;
    if (/^\d+$/.test(t)) return true; // keep digits: 2, 3, 4
    if (/^(ii|iii|iv|v|vi)$/i.test(t)) return true; // keep roman numerals
    return t.length >= 2;
  });
}

// Junk blacklist: trailers, teasers, samples, promos, soundtracks, behind-the-scenes, reviews, recaps, reactions
export const JUNK_MEDIA_REGEX = /\b(trailer|teaser|sample|clip|promo|ost|soundtrack|behind\s*the\s*scenes|bts|interview|preview|pendek|short|review|reviews|recap|recaps|reaction|reactions|ulasan|sinopsis|synopsis|alur\s*cerita|bedah\s*film|bedah\s*filem|ringkasan)\b/i;

// Split archives and non-streamable files: .zip, .rar, .7z, .tar, .001, .002, .part1, etc.
const UNPLAYABLE_ARCHIVE_REGEX = /\.(zip|rar|7z|tar|gz|00[1-9]|part\d+)(\s|\.|$)/i;

// Stopwords for title coverage calculations
const STOPWORDS = new Set(['the', 'a', 'an', 'dan', 'di', 'ke', 'yang', 'si', 'pada', 'dari', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by']);

export function isJunkMedia(text, contextTitle = '', altContextTitle = '') {
  if (!text) return false;
  if (UNPLAYABLE_ARCHIVE_REGEX.test(text)) return true;

  const match = text.match(JUNK_MEDIA_REGEX);
  if (!match) return false;

  // Context-aware protection: if the matched term is part of the legitimate movie/show title, do not disqualify
  const combinedContext = `${contextTitle || ''} ${altContextTitle || ''}`.trim();
  if (combinedContext) {
    const tokens = extractTitleTokens(combinedContext).map(t => t.toLowerCase());
    const matchedTerm = match[0].toLowerCase().trim().replace(/\s+/g, ' ');
    if (tokens.some(t => matchedTerm === t || matchedTerm.includes(t) || t.includes(matchedTerm))) {
      return false;
    }
  }

  return true;
}

export function parseSizeFromText(text) {
  if (!text) return null;
  // Match file size with optional thousands commas, e.g. 1,018.52 MB or 741.31 MB
  const m = text.match(/([\d,]+(?:\.\d+)?)\s*(mb|gb)\b/i);
  if (!m) return null;
  const val = parseFloat(m[1].replace(/,/g, ''));
  if (isNaN(val)) return null;
  return m[2].toLowerCase() === 'gb' ? val * 1024 : val;
}

// Clean title for bot searches (strips punctuation, colons, semicolons, quotes, dashes, parentheticals, and acronym dots)
export function cleanSearchTitle(str) {
  if (!str) return '';
  return str
    .replace(/\s*\([^)]*\)/g, ' ') // remove (2024), (US), etc.
    .replace(/\s*\[[^\]]*\]/g, ' ')
    .replace(/['’‘`]/g, '') // strip apostrophes without whitespace (e.g. Isn't -> Isnt, Grey's -> Greys)
    .replace(/[:;\-–—"!?&,._]/g, ' ') // cleanly replace remaining punctuation with space (including ;)
    .replace(/\s+/g, ' ')
    .trim();
}

// Whitelist legitimate release metadata tokens that can directly follow a movie or TV title
export function isAllowedTitleSuffix(word) {
  if (!word) return true;
  const w = word.toLowerCase();
  // Pure digits: 4-digit years (1990-2030), resolution heights, channel digits, part numbers, episode/season digits
  if (/^\d+$/.test(w)) return true;
  // Resolution patterns: 1080p, 720p, 4k, 2160p, etc.
  if (/^\d+(p|k)$/.test(w)) return true;
  // Disc/part patterns: cd1, cd2, pt1, part1, etc.
  if (/^(?:cd|pt|part)\d+$/.test(w)) return true;
  // Episode & Season patterns: s01, s1, e01, e1, s01e01, ep01, ep1, ep, etc.
  if (/^(?:s\d{1,2}(?:e\d{1,3})?|e\d{1,3}|ep\d{1,3})$/.test(w)) return true;

  const allowed = new Set([
    // Resolutions & standards
    'p', 'k', 'hd', 'fhd', 'uhd', 'sd', 'hdr', 'hdr10', 'sdr', 'dovi', 'dv',
    // Media sources
    'bluray', 'blu', 'ray', 'webdl', 'webrip', 'web', 'hdrip', 'hdtv', 'dvdrip', 'brrip', 'remux', 'dvd', 'tvrip',
    // Video codecs
    'x264', 'x265', 'h264', 'h265', 'hevc', 'avc', 'av1', '10bit', '8bit',
    // Audio codecs & channels
    'aac', 'ac3', 'eac3', 'dts', 'ddp', 'ddp5', 'mp3', 'flac', 'atmos', 'truehd', 'opus',
    // Containers
    'mkv', 'mp4', 'avi',
    // Languages & subtitles
    'malay', 'malaysub', 'sub', 'subs', 'subtitle', 'subtitles', 'eng', 'engsub', 'indo', 'indosub', 'tam', 'tamil', 'multi', 'dual', 'dub', 'dubbed',
    // Release descriptors
    'movie', 'film', 'part', 'pt', 'vol', 'volume', 'complete', 'repack', 'proper', 'extended', 'unrated', 'directors', 'cut', 'edition', 'version', 'remastered', 'imax', 'internal',
    // Episode & Season keywords
    'ep', 'eps', 'episod', 'episode', 'episodes', 's', 'e', 'season', 'seasons', 'musim', 'end', 'finale', 'batch',
    // Country qualifiers for regional adaptations
    'us', 'uk', 'au', 'my', 'id', 'kr', 'jp', 'cn'
  ]);

  return allowed.has(w);
}

export function escapeRegex(str) {
  return (str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Check title boundaries to prevent short titles matching longer titles with different subtitles or prefixes
export function validateTitleBoundaries(textToInspect, targetTitle) {
  if (!textToInspect || !targetTitle) return { matched: false };
  const normTarget = normalizeTitle(targetTitle);
  if (!normTarget) return { matched: false };

  const targetHasArticle = /^(the|a|an)\b/i.test(normTarget);
  const withoutArticle = normTarget.replace(/^(?:the|a|an)\s+/i, '');

  const titlePattern = targetHasArticle
    ? '(?:(?:the|a|an)\\s+)?' + escapeRegex(withoutArticle).replace(/\\s+/g, '\\s+')
    : escapeRegex(normTarget).replace(/\\s+/g, '\\s+');

  const regex = new RegExp('(?:^|\\s)(?:([a-z0-9]+)\\s+)?(' + titlePattern + ')(?:\\s+([a-z0-9]+))?(?:\\s+([a-z0-9]+))?(?:\\s|$)', 'i');
  const match = textToInspect.match(regex);
  if (!match) return { matched: false };

  const prefixWord = match[1] ? match[1].toLowerCase() : null;
  const suffix1 = match[3] ? match[3].toLowerCase() : null;
  const suffix2 = match[4] ? match[4].toLowerCase() : null;

  if (prefixWord) {
    const ignorePrefixes = new Set([
      'movie', 'film', 'series', 'tv', 'koleksi',
      'msm', 'msm32', 'msm34', 'msmbot',
      (typeof BOT_USERNAME !== 'undefined' ? BOT_USERNAME.toLowerCase() : 'msm34bot')
    ]);
    if (targetHasArticle) {
      ignorePrefixes.add('the');
      ignorePrefixes.add('a');
      ignorePrefixes.add('an');
    }
    const isAllowedPrefix =
      ignorePrefixes.has(prefixWord) ||
      /^\d+$/.test(prefixWord) ||
      /^msm\d*$/i.test(prefixWord);

    if (!isAllowedPrefix) {
      return {
        matched: true,
        ok: false,
        reason: `conflicting title prefix "${prefixWord}" for title "${targetTitle}"`
      };
    }
  }

  if (suffix1) {
    if (suffix1 === 'the' || suffix1 === 'a' || suffix1 === 'an') {
      const allowedAfterArticle = new Set(['movie', 'film', 'series', 'final', 'end', 'complete', 'batch', 'animated']);
      if (!suffix2 || !allowedAfterArticle.has(suffix2)) {
        return {
          matched: true,
          ok: false,
          reason: `conflicting title suffix "${suffix1}${suffix2 ? ' ' + suffix2 : ''}" for title "${targetTitle}"`
        };
      }
    } else if (!isAllowedTitleSuffix(suffix1)) {
      return {
        matched: true,
        ok: false,
        reason: `conflicting title suffix "${suffix1}" for title "${targetTitle}"`
      };
    }
  }

  return { matched: true, ok: true };
}

// Extract primary keywords excluding common stopwords for strict coverage validation
export function extractSignificantTokens(str) {
  const norm = normalizeTitle(str);
  const rawTokens = norm.split(' ').filter(Boolean);
  const hasLeadingArticle = rawTokens.length <= 2 && /^(the|a|an)$/i.test(rawTokens[0]);

  return rawTokens.filter((t, idx) => {
    if (!t) return false;
    if (idx === 0 && hasLeadingArticle) return true; // Keep leading article for short 1-2 word titles like "The Runner"
    if (STOPWORDS.has(t)) return false;
    if (/^\d+$/.test(t)) return true; // keep digits: 2, 3, 4
    if (/^(ii|iii|iv|v|vi)$/i.test(t)) return true; // keep roman numerals
    return t.length >= 2;
  });
}

// Calculate coverage ratio (0.0 to 1.0) of significant tokens found in candidate text using strict word boundaries
export function calculateTitleCoverage(significantTokens, text) {
  if (!significantTokens || significantTokens.length === 0) return 1.0;
  if (!text) return 0.0;
  const norm = normalizeTitle(text);
  const matched = significantTokens.filter(t => {
    const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`, 'i').test(norm);
  });
  return matched.length / significantTokens.length;
}

// Helper: Strip bot search query echo headers from message before evaluation
export function cleanBotEchoHeader(msgText) {
  if (!msgText) return '';
  return msgText
    .replace(/^[\s\S]*?(?:hasil\s*carian|carian\s*:|results?\s*for|search\s*results?)[^\n\r]*[\n\r]+/i, '')
    .trim();
}

// Helper: Extract structured episode information from text
export function extractEpisodeInfo(text) {
  if (!text) return null;
  const s = String(text);

  // 1. Episode range: Ep 01-16, E01-E10, Episod 1 - 20
  const rangeMatch = s.match(/\b(?:s\d{1,2}\s*)?(?:e|ep|episod|episode)\.?\s*0*(\d{1,4})\s*(?:-|–|—|~|to)\s*(?:e|ep|episod|episode)?\.?\s*0*(\d{1,4})(?!\d)(?:\b|ends?|akhir|tamat|final)/i);
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1], 10);
    const end = parseInt(rangeMatch[2], 10);
    return { isRange: true, start, end, episode: start };
  }

  // 2. Standard episode tags: S01E16, E16, Ep 16, Episod 16, Episode 16, Ep. 16, S1 EP 16, EP10ends, EP10Credit
  const stdMatch = s.match(/\b(?:s\d{1,2}\s*)?(?:e|ep|episod|episode)\.?\s*0*(\d{1,4})(?!\d)(?:\b|ends?|akhir|tamat|final|finale|credit|credits|special|sp|raw|v\d+|[a-z]?\b)/i);
  if (stdMatch) {
    const num = parseInt(stdMatch[1], 10);
    // Ignore resolution numbers like 360, 480, 540, 576, 720, 1080
    if (![360, 480, 540, 576, 720, 1080, 2160].includes(num)) {
      return { isRange: false, episode: num };
    }
  }

  // 3. Isolated bracketed or parenthesized number: [ 01 ], [ 16 ], ( 01 ), ( 16 )
  const bracketMatch = s.match(/[\[\(]\s*0*(\d{1,3})\s*[\]\)]/);
  if (bracketMatch) {
    const num = parseInt(bracketMatch[1], 10);
    // Ignore resolution numbers like 360, 480, 540, 576, 720, 1080
    if (![360, 480, 540, 576, 720, 1080, 2160].includes(num)) {
      return { isRange: false, episode: num };
    }
  }

  // 4. Dot, underscore or space delimited episode number in filename: Show.Name.01.720p or Show_01_1080p
  const dotNumMatch = s.match(/[\.\_\s]0*(\d{1,3})[\.\_\s]+(?:720p|1080p|480p|540p|360p|2160p|4k|web|bluray|hdrip|hdtv|x264|x265|hevc|mkv|mp4)/i);
  if (dotNumMatch) {
    const num = parseInt(dotNumMatch[1], 10);
    if (![360, 480, 540, 576, 720, 1080, 2160].includes(num)) {
      return { isRange: false, episode: num };
    }
  }

  return null;
}

// Helper: Extract structured season information from text
export function extractSeasonInfo(text) {
  if (!text) return null;
  const s = String(text);

  // Standard season patterns: S01E01, S01, S1, Season 2, Musim 2, Season 10
  const seasonMatch = s.match(/\b(?:s|season|musim)\s*0*(\d{1,2})(?=[e\s\.\_\-\]]|$|\b)/i);
  if (seasonMatch) {
    return parseInt(seasonMatch[1], 10);
  }

  // Roman numerals: Season II, Musim III, Part IV
  const romanMatch = s.match(/\b(?:s|season|musim|part)\s*(ii|iii|iv|v|vi|vii|viii|ix|x)(?!\w)\b/i);
  if (romanMatch) {
    const map = { ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };
    return map[romanMatch[1].toLowerCase()] || null;
  }

  return null;
}

// Helper: Check if a button text is bare (e.g. only resolution, episode tag, codecs, numbers, or action verbs)
export function isBareButton(text) {
  if (!text) return true;
  const clean = text
    .toLowerCase()
    .replace(/['’‘`]/g, '')
    .replace(/[\[\]\(\)\{\}\-_:\|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const tokens = clean.split(' ').filter(Boolean);
  if (tokens.length === 0) return true;
  const bareKeywords = new Set([
    // Resolutions & standards
    '720p', '1080p', '480p', '540p', '360p', '2160p', '4k', 'hd', 'fhd', 'uhd', 'sd',
    // Media sources & codecs
    'webrip', 'webdl', 'web', 'dl', 'hdrip', 'hdtv', 'bluray', 'dvdrip', 'tvrip',
    'hevc', 'x264', 'x265', 'h264', 'h265', '10bit', '8bit', 'aac', 'ac3', 'dts',
    // Episode & Season identifiers
    'ep', 'eps', 'episodes', 'episode', 'episod', 'e', 's', 'season', 'musim', 'part', 'pt',
    // Action verbs / links
    'download', 'muat', 'turun', 'stream', 'play', 'server', 'fast', 'direct',
    'link', 'watch', 'mb', 'gb', 'mp4', 'mkv', 'avi',
    'klik', 'sini', 'tonton', 'salin', 'pautan', 'click', 'here', 'get', 'file', 'video', 'open', 'view', 'mirror', 'backup', 'vip'
  ]);
  return tokens.every(t => /^\d+$/.test(t) || bareKeywords.has(t));
}

// Score a provider-agnostic candidate item against search context with detailed reason
export function scoreCandidateWithReason(candidate, context = {}) {
  const {
    text = '',
    contextText = '',
    sizeMB = null,
    tier: explicitTier = null,
  } = (typeof candidate === 'string' ? { text: candidate } : (candidate || {}));

  const {
    isTv = false,
    title = '',
    altTitle = '',
    year = null,
    sNum = 1,
    eNum = 1,
    totalSeasons = 1,
    targetQuality = 720,
    significantTokens = extractSignificantTokens(title),
    altSignificantTokens = altTitle ? extractSignificantTokens(altTitle) : [],
    minTvSizeMb = (typeof savedSettings !== "undefined" ? savedSettings.minTvSizeMb : 80) ?? 80,
    minMovieSizeMb = (typeof savedSettings !== "undefined" ? savedSettings.minMovieSizeMb : 180) ?? 180,
  } = context;

  const candText = (text || '').toLowerCase();
  const normCandText = normalizeTitle(candText);
  const ctxText = (contextText || '').toLowerCase();

  // 1. Immediately disqualify junk media (trailers, teasers, samples, promos, ost, reviews)
  if (isJunkMedia(candText, title, altTitle) || (ctxText && isJunkMedia(ctxText, title, altTitle))) {
    return { score: -999, reason: 'junk media (trailer/teaser/sample/promo/ost/review)' };
  }

  // 2. Minimum file size sanity check
  const candidateSizeMB = sizeMB !== null ? sizeMB : (parseSizeFromText(candText) || (ctxText ? parseSizeFromText(ctxText) : null));
  if (candidateSizeMB !== null) {
    const minThreshold = isTv ? minTvSizeMb : minMovieSizeMb;
    if (candidateSizeMB < minThreshold) {
      return { score: -999, reason: `file size (${candidateSizeMB.toFixed(1)} MB) below minimum (${minThreshold} MB)` };
    }
  }

  // 3. Strict Title Token Coverage check (supports both primary title and English/alternative title)
  const isBare = isBareButton(candText);
  const cleanMsgText = ctxText ? cleanBotEchoHeader(ctxText) : '';
  let titleTargetText = normCandText;

  if (isBare && cleanMsgText) {
    titleTargetText = normalizeTitle(cleanMsgText);
  }

  let bestCoverage = 0;
  let primaryPassed = false;
  let altPassed = false;
  let covPrimary = 0;
  let covAlt = 0;

  if (significantTokens.length > 0) {
    covPrimary = calculateTitleCoverage(significantTokens, titleTargetText);
    const meetsPrimary = (significantTokens.length <= 2 ? covPrimary >= 1.0 : covPrimary >= 0.70);
    if (meetsPrimary) {
      primaryPassed = true;
      bestCoverage = Math.max(bestCoverage, covPrimary);
    }
  }

  if (altSignificantTokens && altSignificantTokens.length > 0) {
    covAlt = calculateTitleCoverage(altSignificantTokens, titleTargetText);
    const meetsAlt = (altSignificantTokens.length <= 2 ? covAlt >= 1.0 : covAlt >= 0.70);
    if (meetsAlt) {
      altPassed = true;
      bestCoverage = Math.max(bestCoverage, covAlt);
    }
  }

  if (significantTokens.length > 0 || (altSignificantTokens && altSignificantTokens.length > 0)) {
    if (!primaryPassed && !altPassed) {
      const reasonDetail = altSignificantTokens && altSignificantTokens.length > 0
        ? `title coverage too low (primary: ${Math.round(covPrimary * 100)}%, alt: ${Math.round(covAlt * 100)}%)`
        : `title coverage too low (${Math.round(covPrimary * 100)}%)`;
      return { score: -999, reason: reasonDetail };
    }
  }

  let score = 0;

  if (bestCoverage >= 1.0) {
    score += 200;
  } else if (bestCoverage > 0) {
    score += Math.round(bestCoverage * 100);
  }

  // 4. Title boundary collision check (prevents short titles matching longer titles with different subtitles or prefixes)
  const textToInspect = (isBare && cleanMsgText) ? titleTargetText : (normCandText || titleTargetText);
  let boundaryPassed = false;
  let boundaryReason = '';
  let boundaryMatched = false;

  const checkPrimary = validateTitleBoundaries(textToInspect, title);
  if (checkPrimary.matched) {
    boundaryMatched = true;
    if (checkPrimary.ok) {
      boundaryPassed = true;
    } else {
      boundaryReason = checkPrimary.reason;
    }
  }

  if (altTitle) {
    const checkAlt = validateTitleBoundaries(textToInspect, altTitle);
    if (checkAlt.matched) {
      boundaryMatched = true;
      if (checkAlt.ok) {
        boundaryPassed = true;
      } else if (!boundaryReason) {
        boundaryReason = checkAlt.reason;
      }
    }
  }

  if (boundaryMatched && !boundaryPassed) {
    return { score: -999, reason: boundaryReason || 'title boundary collision' };
  }

  if (isTv) {
    // 1. Episode matching
    let epInfo = extractEpisodeInfo(candText);
    if (!epInfo && (isBare || !extractEpisodeInfo(candText)) && cleanMsgText) {
      epInfo = extractEpisodeInfo(cleanMsgText);
    }

    if (epInfo) {
      if (epInfo.isRange) {
        if (eNum >= epInfo.start && eNum <= epInfo.end) {
          score += 90;
        } else {
          return { score: -999, reason: `episode range [${epInfo.start}-${epInfo.end}] does not include episode ${eNum}` };
        }
      } else if (epInfo.episode === eNum) {
        score += 150;
      } else {
        return { score: -999, reason: `episode mismatch (found ep ${epInfo.episode}, expected ep ${eNum})` };
      }
    } else {
      score -= 150;
    }

    // 2. Strict Season validation
    const seasonFound = extractSeasonInfo(candText) || (cleanMsgText ? extractSeasonInfo(cleanMsgText) : null);
    const explicitTargetYear = parseInt(year, 10);
    const targetYear = !isNaN(explicitTargetYear) ? explicitTargetYear : extractYear(title, significantTokens);
    const candYear = extractYear(candText, significantTokens) || (cleanMsgText ? extractYear(cleanMsgText, significantTokens) : null);

    if (seasonFound !== null) {
      if (seasonFound === sNum) {
        score += 80;
      } else {
        return { score: -999, reason: `season mismatch (found season ${seasonFound}, expected season ${sNum})` };
      }
    } else if (sNum > 1 && totalSeasons > 1) {
      // Multi-season protection: when watching Season 2 or later, reject un-versioned candidates with no matching year
      if (!candYear || Math.abs(targetYear - candYear) > 1) {
        return { score: -999, reason: `un-versioned candidate without matching year for season ${sNum}` };
      }
    }

    // 3. Release year validation (strict year match for TV when explicitTargetYear is specified)
    if (targetYear && candYear) {
      if (candYear === targetYear) {
        score += 90;
      } else if (!isNaN(explicitTargetYear)) {
        return { score: -999, reason: `release year mismatch (found ${candYear}, expected ${targetYear})` };
      }
    }
  } else {
    // Movie validation
    const isTvCandidate = /\b(s\d{1,2}e\d{1,2}|s\d{1,2}\s*ep?\s*\d{1,2}|season\s*\d+|musim\s*\d+|episode\s*\d+|episod\s*\d+|ep\s*\d+|\.end\.)\b/i.test(candText) ||
                          (cleanMsgText && /\b(s\d{1,2}e\d{1,2}|s\d{1,2}\s*ep?\s*\d{1,2}|season\s*\d+|musim\s*\d+|episode\s*\d+|episod\s*\d+|ep\s*\d+|\.end\.)\b/i.test(cleanMsgText));
    if (isTvCandidate) {
      return { score: -999, reason: 'TV series/episode indicator found in movie candidate' };
    }

    const targetSequel = extractSequelInfo(title) || (altTitle ? extractSequelInfo(altTitle) : null);
    const candSequel = extractSequelInfo(candText);
    if (targetSequel) {
      if (candSequel === targetSequel) {
        score += 150;
      } else if (candSequel) {
        score -= 600;
      } else {
        score -= 400;
      }
    } else {
      if (candSequel) {
        score -= 600;
      }
    }

    const explicitTargetYear = parseInt(year, 10);
    const targetYear = !isNaN(explicitTargetYear) ? explicitTargetYear : extractYear(title, significantTokens);
    const candYear = extractYear(candText, significantTokens) || (cleanMsgText ? extractYear(cleanMsgText, significantTokens) : null);
    if (targetYear && candYear) {
      if (candYear === targetYear) {
        score += 120;
      } else if (Math.abs(targetYear - candYear) <= 1) {
        score += 60;
      } else if (!isNaN(explicitTargetYear)) {
        return { score: -999, reason: `release year mismatch (found ${candYear}, expected ${targetYear})` };
      }
    }
  }

  // Quality preference
  const candTier = explicitTier || detectVideoQualityTier(candText, cleanMsgText, null, candidateSizeMB ? candidateSizeMB * 1024 * 1024 : null);
  if (targetQuality <= 480) {
    if (candTier === 'sd') score += 80;
    else if (candTier === '720p') score += 20;
    else if (candTier === '1080p') score -= 40;
    else if (candTier === '4k') score -= 100;
  } else if (targetQuality <= 720) {
    if (candTier === '720p') score += 50;
    else if (candTier === 'sd') score += 30;
    else if (candTier === '1080p') score += 5;
    else if (candTier === '4k') score -= 50;
  } else if (targetQuality >= 2160) {
    if (candTier === '4k') score += 100;
    else if (candTier === '1080p') score += 60;
    else if (candTier === '720p') score += 20;
  } else {
    // 1080p target
    if (candTier === '1080p') score += 80;
    else if (candTier === '720p') score += 30;
    else if (candTier === '4k') score -= 30;
  }
  if (candText.includes('.mp4') || candText.includes('mp4')) score += 15;
  if (candText.includes('malaysub') || candText.includes('msm')) score += 5;

  return {
    score,
    reason: score >= 0 ? `accepted (score: ${score})` : `penalized (score: ${score})`,
    tier: candTier,
  };
}

// Verify a document a provider bot actually delivered is the title/season/episode that was requested (#266).
// Providers can send the wrong file for a short code; only hard disqualifications (score -999) are rejected,
// so weakly named but otherwise matching files are still accepted.
export function validateDeliveredDocument({ filename = '', caption = '', sizeBytes = null } = {}, context = {}) {
  const sizeMB = sizeBytes ? Number(sizeBytes) / (1024 * 1024) : null;
  const res = scoreCandidateWithReason({ text: filename, contextText: caption, sizeMB }, context);
  return { ok: res.score > -999, score: res.score, reason: res.reason };
}

// Score a candidate download button against search context with detailed reason (delegates to scoreCandidateWithReason)
export function scoreCandidateButtonWithReason(btn, msg, context = {}) {
  if (!btn || (btn.className !== 'KeyboardButtonUrlAuth' && btn.className !== 'KeyboardButtonUrl') || !btn.url) {
    return { score: -999, reason: 'missing url or unsupported button class' };
  }
  const btnText = btn.text || '';
  const msgText = msg?.message || '';
  const btnSizeMB = parseSizeFromText(btnText) || parseSizeFromText(msgText);
  return scoreCandidateWithReason({ text: btnText, contextText: msgText, sizeMB: btnSizeMB }, context);
}

// Score a candidate download button against search context
export function scoreCandidateButton(btn, msg, context = {}) {
  return scoreCandidateButtonWithReason(btn, msg, context).score;
}

/**
 * Base Abstract Resolver Class
 */
export class BaseResolver {
  constructor(client, options = {}) {
    this.client = client;
    this.options = options;
  }

  get id() {
    throw new Error('Resolver must define an id');
  }

  get name() {
    throw new Error('Resolver must define a name');
  }

  get defaultBot() {
    throw new Error('Resolver must define a defaultBot');
  }

  async resolve(params, context = {}) {
    throw new Error('Method resolve() must be implemented by subclass');
  }
}

/**
 * Format bytes to human readable size
 */
export function formatFileSize(bytes) {
  const b = Number(bytes || 0);
  if (isNaN(b) || b <= 0) return '0 MB';
  if (b >= 1024 * 1024 * 1024) return (b / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  return (b / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * Format diagnostic search results for dashboard sandbox
 */
export function formatDiagnosticResults(items = [], resolver = 'msm') {
  if (!Array.isArray(items)) return [];
  if (resolver === 'pencuri') {
    return items.map(f => {
      const sizeStr = formatFileSize(f.file_size || f.size || 0);
      const title = f.title || f.name || 'Unknown';
      const code = f.short_code || f.code || '';
      return {
        text: `${title} (${sizeStr})`,
        url: f.play_url || (code ? `https://unofficialsbot.pencarimovie.com/link/${code}` : ''),
        className: 'PencariFileResult',
        shortCode: code,
        size: Number(f.file_size || f.size || 0),
      };
    });
  }

  // MSM resolver button format
  return items.map(btn => ({
    text: btn.text || '',
    url: btn.url || '',
    className: btn.className || 'KeyboardButtonUrl',
    buttonId: btn.buttonId,
  }));
}
