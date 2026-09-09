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
    const hasExplicit = Boolean(getExplicitAdultMovieRating({ release_dates: data } as any));
    explicitRatingCache.set(cacheKey, hasExplicit);
    return hasExplicit;
  } catch {
    return false;
  }
}

/**
 * Check if a TV series has explicit adult/sexual certification by fetching content_ratings.
 * Uses in-memory cache to ensure fast subsequent lookups.
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
    const hasExplicit = Boolean(getExplicitAdultTVRating({ content_ratings: data } as any));
    explicitRatingCache.set(cacheKey, hasExplicit);
    return hasExplicit;
  } catch {
    return false;
  }
}

/**
 * Clear the explicit rating cache (e.g. on settings change).
 */
export function clearExplicitRatingCache(): void {
  explicitRatingCache.clear();
}
