import type { TMDBMovieDetails, TMDBTVDetails } from '../types/tmdb';

/**
 * Worldwide Content Rating & Adult Filter Registry
 * Identifies explicit sexual, erotic, and adult rating certifications worldwide.
 */

// Explicit sexual, restricted adult, erotic, and pornographic certifications across TMDB countries
export const EXPLICIT_SEXUAL_RATINGS = [
  '18SX',    // Malaysia (LPF) - Explicit sexual content, nudity, eroticism
  '18PL',    // Malaysia (LPF) - Various elements including sex/nudity/violence
  '18SG',    // Malaysia (LPF) - Graphic horror / terror
  '18PA',    // Malaysia (LPF) - Sensitive themes
  '18+',     // Taiwan (18+ restricted), Russia (18+), Vietnam, Ukraine, Czech, etc.
  '18',      // UK (BBFC 18), Brazil (18), Singapore (18), Netherlands, Spain, France, etc.
  'M18',     // Singapore (IMDA M18)
  '19',      // South Korea (KMRB) - 19+ / No Minors (erotic/explicit adult)
  'R18+',    // Japan (Eirin), Australia (ACB), New Zealand
  'R-18',    // Japan / Philippines
  'R 18+',   // Australia
  'NC-17',   // United States (MPAA) - Explicit sexual content
  'NC17',    // United States
  'R18',     // United Kingdom (BBFC) - Hardcore pornography / licensed sex shops
  'X 18+',   // Australia (ACB) - Sexually explicit films
  'X18+',    // Australia / South Africa
  'X18',     // South Africa (FPB) - Restricted adult premises only
  'XX',      // South Africa (FPB) - Prohibited
  'XXX',     // International explicit
  'P',       // Portugal (Pornography rating)
  'R21',     // Singapore (IMDA) - Restricted 21 for explicit sexual content
  'CAT III', // Hong Kong (OFTA) - Category III adult/erotic cinema
  'III',     // Hong Kong (OFTA) - Category III
  '21+',     // Indonesia (LSF) - Adult 21+
  '21',      // Adult 21
  'D',       // Mexico (RTC) / Indonesia TV - Adult cinema legally prohibited under 18
  'C',       // Mexico (RTC) - Adult 18+ only
  'A',       // India CBFC (Adults only 18+)
  'SAM 18',  // Argentina (SAM 18)
  'K18',     // Finland (K18), Greece (K18)
  'N-18',    // Lithuania (N-18)
  'M/18',    // Portugal (M/18)
  'X'        // Spain (ICAA), France, Bulgaria, Philippines, Portugal - Adult/pornographic
] as const;

// TMDB Keyword IDs for adult / erotica / softcore / hentai / explicit nudity / adultery / infidelity / porn
export const ADULT_KEYWORD_IDS = [
  256466, // erotic
  325693, // erotica
  155477, // softcore
  198385, // hentai
  382870, // gay softcore
  155691, // erotic vignettes
  302868, // erotic comedy
  298666, // erotic romance
  380575, // female full frontal nudity
  367629, // male frontal nudity
  281741, // nudity
  359980, // female nudity
  380475, // male nudity
  359981, // female frontal nudity
  381106, // sexual
  349634, // explicit
  347060, // explicite sex
  267122, // sex
  155301, // rough sex
  356759, // porn
  155139, // porn parody
  7344,   // porn star
  596,    // adultery
  180393, // suspicion of adultery
  357928, // adultério
  1326,   // infidelity
  363320, // marital infidelity
  34094   // extramarital affair
];

export const ADULT_KEYWORDS_CSV = ADULT_KEYWORD_IDS.join(',');

// Set of normalized uppercase rating strings
const EXPLICIT_RATINGS_SET = new Set(
  EXPLICIT_SEXUAL_RATINGS.map((r) => r.toUpperCase().replace(/\s+/g, ''))
);

/**
 * Check if a certification string matches a recognized explicit sexual/adult rating.
 */
export function isExplicitAdultCertification(cert?: string | null, countryCode?: string): boolean {
  if (!cert) return false;
  const raw = cert.trim();
  const normalized = raw.toUpperCase().replace(/\s+/g, '');

  if (EXPLICIT_RATINGS_SET.has(normalized)) {
    // For single-letter 'D', verify country context if provided (Mexico or Indonesia)
    if (normalized === 'D' && countryCode && !['MX', 'ID'].includes(countryCode.toUpperCase())) {
      return false;
    }
    // For single-letter 'C', verify country context (Mexico or Argentina)
    if (normalized === 'C' && countryCode && !['MX', 'AR'].includes(countryCode.toUpperCase())) {
      return false;
    }
    // For single-letter 'A', verify country context (India or Chile)
    if (normalized === 'A' && countryCode && !['IN', 'CL'].includes(countryCode.toUpperCase())) {
      return false;
    }
    // For single-letter 'P', verify country context (Portugal)
    if (normalized === 'P' && countryCode && countryCode.toUpperCase() !== 'PT') {
      return false;
    }
    if (normalized === 'X' && countryCode) {
      const xCountries = ['ES', 'FR', 'PH', 'BG', 'HU', 'US', 'AU', 'PT'];
      if (!xCountries.includes(countryCode.toUpperCase())) return false;
    }
    if (normalized === 'III' && countryCode && countryCode.toUpperCase() !== 'HK') {
      return false;
    }
    return true;
  }

  // Regex checks for formatted variations (e.g. "Cat. III", "18+", "R-18+", "18 SX", "M18", "+18")
  if (/^18\s*[-_]?\s*SX$/i.test(raw)) return true;
  if (/^18\s*[-_]?\s*PL$/i.test(raw)) return true;
  if (/^18\s*[-_]?\s*SG$/i.test(raw)) return true;
  if (/^18\s*[-_]?\s*PA$/i.test(raw)) return true;
  if (/^18\s*\+?$/i.test(raw)) return true;
  if (/^\+?18$/i.test(raw)) return true;
  if (/^M\s*[-_]?\s*18\+?$/i.test(raw)) return true;
  if (/^R\s*[-_]?\s*18\s*\+?$/i.test(raw)) return true;
  if (/^X\s*[-_]?\s*18\s*\+?$/i.test(raw)) return true;
  if (/^K\s*[-_]?\s*18\s*\+?$/i.test(raw)) return true;
  if (/^N\s*[-_]?\s*18\s*\+?$/i.test(raw)) return true;
  if (/^M\s*\/\s*18$/i.test(raw)) return true;
  if (/^SAM\s*[-_]?\s*18$/i.test(raw)) return true;
  if (/^19\s*\+?$/i.test(raw)) return true;
  if (/^21\s*\+?$/i.test(raw)) return true;
  if (/^R\s*[-_]?\s*21$/i.test(raw)) return true;
  if (/^NC\s*[-_]?\s*17$/i.test(raw)) return true;
  if (/^CAT(EGORY)?\s*[-_.]?\s*III$/i.test(raw)) return true;
  if (/^XXX+$/i.test(raw)) return true;

  return false;
}

// Regex patterns for explicit sexual, nudity, pornographic, and erotic content in descriptors, notes, or overviews
const EXPLICIT_TEXT_REGEX = /\b(porn|porno|pornography|pornographic|erotic|erotica|softcore|hentai|full[- ]frontal nudity|explicit sex|hardcore sex|sexual violence|sensual massage|sex scene|adultery|infidelity|extramarital sex|erotic thriller)\b/i;

/**
 * Check if a text description, note, or overview contains explicit sexual / adult keywords (Strategy 5).
 */
export function containsExplicitAdultText(text?: string | null): boolean {
  if (!text) return false;
  return EXPLICIT_TEXT_REGEX.test(text);
}

/**
 * Scan movie release dates across all countries for explicit sexual/adult descriptors or notes (Strategy 4).
 * Returns the matched descriptor or reason if found, or null otherwise.
 */
export function getExplicitAdultMovieRating(details: TMDBMovieDetails | null): string | null {
  if (!details || !('release_dates' in details) || !details.release_dates?.results) {
    return null;
  }

  for (const country of details.release_dates.results) {
    if (!Array.isArray(country.release_dates)) continue;

    for (const rdItem of country.release_dates) {
      const rd = rdItem as any;
      // Strategy 4: Check descriptors & notes
      if (rd.note && containsExplicitAdultText(rd.note)) {
        return 'Explicit Note';
      }
      if (Array.isArray(rd.descriptors)) {
        for (const desc of rd.descriptors) {
          if (typeof desc === 'string' && containsExplicitAdultText(desc)) {
            return 'Explicit Descriptor';
          }
        }
      }
    }
  }

  return null;
}

/**
 * Scan TV content ratings across all countries for explicit sexual/adult descriptors (Strategy 4).
 * Returns the matched descriptor or reason if found, or null otherwise.
 */
export function getExplicitAdultTVRating(details: TMDBTVDetails | null): string | null {
  if (!details || !('content_ratings' in details) || !details.content_ratings?.results) {
    return null;
  }

  for (const entryItem of details.content_ratings.results) {
    const entry = entryItem as any;
    // Strategy 4: Check descriptors on TV content ratings if present
    if (entry.descriptors && Array.isArray(entry.descriptors)) {
      for (const desc of entry.descriptors) {
        if (typeof desc === 'string' && containsExplicitAdultText(desc)) {
          return 'Explicit Descriptor';
        }
      }
    }
  }

  return null;
}

/**
 * Check if the movie or TV details contain an explicit sexual / adult certification.
 */
export function getExplicitAdultRating(details: TMDBMovieDetails | TMDBTVDetails | null): string | null {
  if (!details) return null;
  if ('release_dates' in details) {
    return getExplicitAdultMovieRating(details as TMDBMovieDetails);
  }
  if ('content_ratings' in details) {
    return getExplicitAdultTVRating(details as TMDBTVDetails);
  }
  return null;
}

/**
 * In-memory cache for media ID -> explicit adult boolean
 */
const explicitRatingCache = new Map<string, boolean>();

/**
 * Genre IDs in TMDB
 */
export const ROMANCE_GENRE_ID = 10749;
export const DRAMA_GENRE_ID = 18;

// Unrated / uncertified strings
const UNRATED_RATINGS = new Set(['NR', 'UNRATED', 'NOT RATED', 'NOT-RATED', 'NONE', '0']);

/**
 * Check if a certification string represents an explicit / restricted 18+ rating
 * (e.g., 18SX, 18PL, 18SG, 18+, 18, R18+, R-18, R18, X18+, X 18+, M18, NC-17, CAT III, 21+, etc.)
 */
function isExplicit18PlusRating(cert?: string | null, countryCode?: string): boolean {
  if (!cert) return false;
  return isExplicitAdultCertification(cert, countryCode) || /^(R\s*[-_]?\s*18\+?|X\s*[-_]?\s*18\+?|18\s*[-_]?\s*SX|18\s*[-_]?\s*PL|18\s*\+?|\+?18|M\s*[-_]?\s*18\+?|NC\s*[-_]?\s*17|CAT(EGORY)?\s*[-_.]?\s*III|21\s*\+?)$/i.test(cert.trim());
}

/**
 * Check if a movie has explicit adult/sexual content by checking release descriptors & notes (Strategy 4),
 * or genre-specific combinations:
 * - "explicit 18+" + Romance
 * - "explicit 18+" + Drama
 * - "none" (uncertified) + Drama
 * - "none" (uncertified) + Romance
 * - "19 / 19+" + Romance
 * Uses in-memory cache to ensure fast subsequent lookups.
 */
export async function checkMovieIsExplicitAdult(
  movieId: number,
  fetchReleaseDates: (id: number) => Promise<any>,
  genreIds?: number[]
): Promise<boolean> {
  const isRomance = Array.isArray(genreIds) && genreIds.includes(ROMANCE_GENRE_ID);
  const isDrama = Array.isArray(genreIds) && genreIds.includes(DRAMA_GENRE_ID);
  const cacheKey = `m_${movieId}_r${isRomance ? 1 : 0}_d${isDrama ? 1 : 0}`;
  if (explicitRatingCache.has(cacheKey)) {
    return explicitRatingCache.get(cacheKey)!;
  }

  try {
    const data = await fetchReleaseDates(movieId);
    const cert = extractMovieCertification(data);
    resolvedRatingCache.set(`movie_${movieId}`, cert);

    // Strategy 4: Explicit descriptors or notes in release dates
    const hasExplicitDescriptor = Boolean(getExplicitAdultMovieRating({ release_dates: data } as any));

    const isUncertified = !cert || UNRATED_RATINGS.has(cert.toUpperCase().trim());

    // Check if any country has 19+ rating
    const has19 = data?.results && Array.isArray(data.results) && data.results.some((c: any) =>
      Array.isArray(c.release_dates) && c.release_dates.some((rd: any) =>
        rd.certification && /^19\+?$/i.test(rd.certification.trim())
      )
    );

    // Check if any country has an explicit 18+ rating
    const hasExplicit18 = data?.results && Array.isArray(data.results) && data.results.some((c: any) =>
      Array.isArray(c.release_dates) && c.release_dates.some((rd: any) =>
        rd.certification && isExplicit18PlusRating(rd.certification, c.iso_3166_1)
      )
    );

    // Genre-specific filtering rules:
    // 1. rating: "explicit 18+" + genre: romance
    // 2. rating: "explicit 18+" + genre: drama
    // 3. rating: none + genre: drama
    // 4. rating: none + genre: romance
    // 5. rating: 19+ + genre: romance
    const romanceMatch = isRomance && (hasExplicit18 || isUncertified || has19);
    const dramaMatch = isDrama && (hasExplicit18 || isUncertified);

    const result = hasExplicitDescriptor || romanceMatch || dramaMatch;
    explicitRatingCache.set(cacheKey, result);
    return result;
  } catch {
    return false;
  }
}

/**
 * Check if a TV series has explicit adult/sexual content by checking content descriptors (Strategy 4),
 * or genre-specific combinations:
 * - "explicit 18+" + Romance
 * - "explicit 18+" + Drama
 * - "none" (uncertified) + Drama
 * - "none" (uncertified) + Romance
 * - "19 / 19+" + Romance
 * Uses in-memory cache to ensure fast subsequent lookups.
 */
export async function checkTVIsExplicitAdult(
  tvId: number,
  fetchContentRatings: (id: number) => Promise<any>,
  genreIds?: number[]
): Promise<boolean> {
  const isRomance = Array.isArray(genreIds) && genreIds.includes(ROMANCE_GENRE_ID);
  const isDrama = Array.isArray(genreIds) && genreIds.includes(DRAMA_GENRE_ID);
  const cacheKey = `t_${tvId}_r${isRomance ? 1 : 0}_d${isDrama ? 1 : 0}`;
  if (explicitRatingCache.has(cacheKey)) {
    return explicitRatingCache.get(cacheKey)!;
  }

  try {
    const data = await fetchContentRatings(tvId);
    const cert = extractTVCertification(data);
    resolvedRatingCache.set(`tv_${tvId}`, cert);

    // Strategy 4: Explicit descriptors on TV content ratings
    const hasExplicitDescriptor = Boolean(getExplicitAdultTVRating({ content_ratings: data } as any));

    const isUncertified = !cert || UNRATED_RATINGS.has(cert.toUpperCase().trim());

    // Check if any country has 19+ rating
    const has19 = data?.results && Array.isArray(data.results) && data.results.some((c: any) =>
      c.rating && /^19\+?$/i.test(c.rating.trim())
    );

    // Check if any country has an explicit 18+ rating
    const hasExplicit18 = data?.results && Array.isArray(data.results) && data.results.some((c: any) =>
      c.rating && isExplicit18PlusRating(c.rating, c.iso_3166_1)
    );

    // Genre-specific filtering rules:
    // 1. rating: "explicit 18+" + genre: romance
    // 2. rating: "explicit 18+" + genre: drama
    // 3. rating: none + genre: drama
    // 4. rating: none + genre: romance
    // 5. rating: 19+ + genre: romance
    const romanceMatch = isRomance && (hasExplicit18 || isUncertified || has19);
    const dramaMatch = isDrama && (hasExplicit18 || isUncertified);

    const result = hasExplicitDescriptor || romanceMatch || dramaMatch;
    explicitRatingCache.set(cacheKey, result);
    return result;
  } catch {
    return false;
  }
}

/**
 * In-memory cache for media ID -> extracted certification string (e.g. "PG-13", "18SX", "19", "R")
 */
const resolvedRatingCache = new Map<string, string | null>();

const PRIORITY_CERT_COUNTRIES = ['US', 'GB', 'AU', 'CA', 'SG', 'MY', 'KR', 'JP'];

/**
 * Extract certification string from release_dates results (for movies).
 */
export function extractMovieCertification(releaseDatesData: any): string | null {
  if (!releaseDatesData?.results || !Array.isArray(releaseDatesData.results)) return null;

  // Check priority countries first (US, GB, AU, etc.)
  for (const code of PRIORITY_CERT_COUNTRIES) {
    const country = releaseDatesData.results.find((r: any) => r.iso_3166_1 === code);
    if (country && Array.isArray(country.release_dates)) {
      const m = country.release_dates.find((d: any) => d.certification && d.certification.trim().length > 0);
      if (m) return m.certification.trim();
    }
  }

  // Fallback to any country
  for (const c of releaseDatesData.results) {
    if (Array.isArray(c.release_dates)) {
      const m = c.release_dates.find((d: any) => d.certification && d.certification.trim().length > 0);
      if (m) return m.certification.trim();
    }
  }

  return null;
}

/**
 * Extract certification string from content_ratings results (for TV).
 */
export function extractTVCertification(contentRatingsData: any): string | null {
  if (!contentRatingsData?.results || !Array.isArray(contentRatingsData.results)) return null;

  // Check priority countries first (US, GB, AU, etc.)
  for (const code of PRIORITY_CERT_COUNTRIES) {
    const country = contentRatingsData.results.find((r: any) => r.iso_3166_1 === code);
    if (country && country.rating && country.rating.trim().length > 0) {
      return country.rating.trim();
    }
  }

  // Fallback to any country
  const anyMatch = contentRatingsData.results.find((r: any) => r.rating && r.rating.trim().length > 0);
  if (anyMatch) return anyMatch.rating.trim();

  return null;
}

/**
 * Get or fetch the content rating certification for a movie or TV series.
 * Caches in memory for 0ms subsequent lookups.
 */
export async function getResolvedMediaCertification(
  mediaId: number,
  mediaType: 'movie' | 'tv',
  fetcher: (id: number, type: 'movie' | 'tv') => Promise<any>
): Promise<string | null> {
  const cacheKey = `${mediaType}_${mediaId}`;
  if (resolvedRatingCache.has(cacheKey)) {
    return resolvedRatingCache.get(cacheKey) || null;
  }

  try {
    const rawData = await fetcher(mediaId, mediaType);
    const cert = mediaType === 'movie'
      ? extractMovieCertification(rawData)
      : extractTVCertification(rawData);

    resolvedRatingCache.set(cacheKey, cert);
    return cert;
  } catch {
    resolvedRatingCache.set(cacheKey, null);
    return null;
  }
}

/**
 * Synchronously check if a rating certification is already cached in memory.
 */
export function getCachedMediaCertification(mediaId: number, mediaType: 'movie' | 'tv'): string | null | undefined {
  const cacheKey = `${mediaType}_${mediaId}`;
  return resolvedRatingCache.get(cacheKey);
}

/**
 * Clear all rating caches (e.g. on settings change).
 */
export function clearExplicitRatingCache(): void {
  explicitRatingCache.clear();
  resolvedRatingCache.clear();
}
