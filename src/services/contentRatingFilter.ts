import type { TMDBMovieDetails, TMDBTVDetails } from '../types/tmdb';

/**
 * Worldwide Content Rating & Adult Filter Registry
 * Identifies explicit sexual, erotic, and adult rating certifications worldwide.
 */

// Explicit sexual and restricted adult certifications across TMDB countries
export const EXPLICIT_SEXUAL_RATINGS = [
  '18SX',    // Malaysia (LPF) - Explicit sexual content, nudity, eroticism
  '19',      // South Korea (KMRB) - 19+ / No Minors (erotic/explicit adult)
  'R18+',    // Japan (Eirin), Australia (ACB), New Zealand
  'R-18',    // Japan / Philippines
  'R 18+',   // Australia
  'NC-17',   // United States (MPAA) - Explicit sexual content
  'R18',     // United Kingdom (BBFC) - Hardcore pornography / licensed sex shops
  'X 18+',   // Australia (ACB) - Sexually explicit films
  'X18+',    // Australia / South Africa
  'X18',     // South Africa (FPB) - Restricted adult premises only
  'XX',      // South Africa (FPB) - Prohibited
  'XXX',     // International explicit
  'R21',     // Singapore (IMDA) - Restricted 21 for explicit sexual content
  'CAT III', // Hong Kong (OFTA) - Category III adult/erotic cinema
  'III',     // Hong Kong (OFTA) - Category III
  '21+',     // Indonesia (LSF) - Adult 21+
  'D',       // Mexico (RTC) - Adult cinema legally prohibited under 18
  'X'        // Spain (ICAA), France, Bulgaria, Philippines - Adult/pornographic
] as const;

// TMDB Keyword IDs for adult / erotica / softcore / hentai / explicit nudity
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
  367629  // male frontal nudity
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
    // For single-letter 'D' or 'X', verify country context if provided
    if (normalized === 'D' && countryCode && countryCode.toUpperCase() !== 'MX') {
      return false;
    }
    if (normalized === 'X' && countryCode) {
      const xCountries = ['ES', 'FR', 'PH', 'BG', 'HU', 'US', 'AU'];
      if (!xCountries.includes(countryCode.toUpperCase())) return false;
    }
    if (normalized === 'III' && countryCode && countryCode.toUpperCase() !== 'HK') {
      return false;
    }
    return true;
  }

  // Regex checks for formatted variations (e.g. "Cat. III", "R-18+", "18 SX", "18-SX")
  if (/^18\s*[-_]?\s*SX$/i.test(raw)) return true;
  if (/^R\s*[-_]?\s*18\s*\+?$/i.test(raw)) return true;
  if (/^X\s*[-_]?\s*18\s*\+?$/i.test(raw)) return true;
  if (/^NC\s*[-_]?\s*17$/i.test(raw)) return true;
  if (/^R\s*[-_]?\s*21$/i.test(raw)) return true;
  if (/^CAT(EGORY)?\s*[-_.]?\s*III$/i.test(raw)) return true;
  if (/^21\s*\+$/i.test(raw)) return true;
  if (/^XXX+$/i.test(raw)) return true;

  return false;
}

/**
 * Scan movie release dates across all countries for an explicit sexual/adult certification.
 * Returns the matched certification if found, or null otherwise.
 */
export function getExplicitAdultMovieRating(details: TMDBMovieDetails | null): string | null {
  if (!details || !('release_dates' in details) || !details.release_dates?.results) {
    return null;
  }

  for (const country of details.release_dates.results) {
    const code = country.iso_3166_1;
    if (!Array.isArray(country.release_dates)) continue;

    for (const rd of country.release_dates) {
      if (rd.certification && isExplicitAdultCertification(rd.certification, code)) {
        return rd.certification.trim();
      }
    }
  }

  return null;
}

/**
 * Scan TV content ratings across all countries for an explicit sexual/adult certification.
 * Returns the matched certification if found, or null otherwise.
 */
export function getExplicitAdultTVRating(details: TMDBTVDetails | null): string | null {
  if (!details || !('content_ratings' in details) || !details.content_ratings?.results) {
    return null;
  }

  for (const entry of details.content_ratings.results) {
    const code = entry.iso_3166_1;
    if (entry.rating && isExplicitAdultCertification(entry.rating, code)) {
      return entry.rating.trim();
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
 * Check if a movie has explicit adult/sexual certification by fetching release_dates.
 * Uses in-memory cache to ensure fast subsequent lookups.
 */
// Unrated / uncertified strings
const UNRATED_RATINGS = new Set(['NR', 'UNRATED', 'NOT RATED', 'NOT-RATED', 'NONE', '0']);

/**
 * Check if a movie has explicit adult/sexual certification by fetching release_dates.
 * Uses in-memory cache to ensure fast subsequent lookups.
 * If no certification is found or unrated, it is treated as explicit adult content.
 */
export async function checkMovieIsExplicitAdult(
  movieId: number,
  fetchReleaseDates: (id: number) => Promise<any>
): Promise<boolean> {
  const cacheKey = `m_${movieId}`;
  if (explicitRatingCache.has(cacheKey)) {
    return explicitRatingCache.get(cacheKey)!;
  }

  try {
    const data = await fetchReleaseDates(movieId);
    const cert = extractMovieCertification(data);
    resolvedRatingCache.set(`movie_${movieId}`, cert);

    const hasExplicit = Boolean(getExplicitAdultMovieRating({ release_dates: data } as any));
    // If it has explicit rating, OR no certification at all, OR marked unrated -> treat as explicit/adult
    const isUncertifiedOrUnrated = !cert || UNRATED_RATINGS.has(cert.toUpperCase().trim());
    const result = hasExplicit || isUncertifiedOrUnrated;

    explicitRatingCache.set(cacheKey, result);
    return result;
  } catch {
    // If fetching fails or unrated/no data, treat as explicit/adult when filter is active
    return true;
  }
}

/**
 * Check if a TV series has explicit adult/sexual certification by fetching content_ratings.
 * Uses in-memory cache to ensure fast subsequent lookups.
 * If no certification is found or unrated, it is treated as explicit adult content.
 */
export async function checkTVIsExplicitAdult(
  tvId: number,
  fetchContentRatings: (id: number) => Promise<any>
): Promise<boolean> {
  const cacheKey = `t_${tvId}`;
  if (explicitRatingCache.has(cacheKey)) {
    return explicitRatingCache.get(cacheKey)!;
  }

  try {
    const data = await fetchContentRatings(tvId);
    const cert = extractTVCertification(data);
    resolvedRatingCache.set(`tv_${tvId}`, cert);

    const hasExplicit = Boolean(getExplicitAdultTVRating({ content_ratings: data } as any));
    // If it has explicit rating, OR no certification at all, OR marked unrated -> treat as explicit/adult
    const isUncertifiedOrUnrated = !cert || UNRATED_RATINGS.has(cert.toUpperCase().trim());
    const result = hasExplicit || isUncertifiedOrUnrated;

    explicitRatingCache.set(cacheKey, result);
    return result;
  } catch {
    // If fetching fails or unrated/no data, treat as explicit/adult when filter is active
    return true;
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
  const mockDetails = { release_dates: releaseDatesData };
  const explicit = getExplicitAdultMovieRating(mockDetails as any);
  if (explicit) return explicit;

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
  const mockDetails = { content_ratings: contentRatingsData };
  const explicit = getExplicitAdultTVRating(mockDetails as any);
  if (explicit) return explicit;

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
