/**
 * Search Query Builder Module for Telegram Stream Resolvers
 * Module: server/tg-streamer/resolvers/queries.js
 *
 * Provides decoupled, unified search query generation for both MSM and Pencuri resolvers.
 */

import { cleanSearchTitle } from './base.js';

/**
 * Generate TV series prioritized search queries (Adaptive 12 Queries without 'episode'/'episod')
 * Preserves the exact signature and behavior for backward compatibility and unit tests.
 */
export function generateSeriesSearchQueries(cleanT, sNum, eNum, totalSeasons, year) {
  const s2 = String(sNum).padStart(2, '0');
  const e2 = String(eNum).padStart(2, '0');
  const e1 = String(eNum);

  const queries = [];
  const addQuery = (q) => {
    const trimmed = (q || '').trim();
    if (trimmed && !queries.includes(trimmed)) {
      queries.push(trimmed);
    }
  };

  if (sNum > 1) {
    // Multi-Season (sNum > 1): Season tags are crucial to prevent picking wrong season
    // 1. Scene standard
    addQuery(`${cleanT} S${s2}E${e2}`);
    // 2. Scene standard with year
    if (year) addQuery(`${cleanT} ${year} S${s2}E${e2}`);
    // 3. Single digit season + EP
    addQuery(`${cleanT} S${sNum} EP${e2}`);
    // 4. Double digit season + EP
    addQuery(`${cleanT} S${s2} EP${e2}`);
    // 5. Year + EP (uploader might use year to distinguish season)
    if (year) addQuery(`${cleanT} ${year} EP${e2}`);
    // 6. Year + E
    if (year) addQuery(`${cleanT} ${year} E${e2}`);
    // 7. Scene standard single digit episode
    addQuery(`${cleanT} S${s2}E${e1}`);
    // 8. Base EP double digit
    addQuery(`${cleanT} EP${e2}`);
    // 9. Base E double digit
    addQuery(`${cleanT} E${e2}`);
    // 10. Base EP single digit
    addQuery(`${cleanT} EP${e1}`);
    // 11. Year alone
    if (year) addQuery(`${cleanT} ${year}`);
    // 12. Title alone
    addQuery(cleanT);
  } else {
    // Season 1 (sNum === 1): Asian / local dramas rarely tag S01; they use EPxx / Exx
    // 1. Base EP double digit
    addQuery(`${cleanT} EP${e2}`);
    // 2. Base E double digit
    addQuery(`${cleanT} E${e2}`);
    // 3. S01 standard
    addQuery(`${cleanT} S01E${e2}`);
    // 4. Year + EP
    if (year) addQuery(`${cleanT} ${year} EP${e2}`);
    // 5. Year + E
    if (year) addQuery(`${cleanT} ${year} E${e2}`);
    // 6. Year + S01 standard
    if (year) addQuery(`${cleanT} ${year} S01E${e2}`);
    // 7. Base EP single digit
    addQuery(`${cleanT} EP${e1}`);
    // 8. Base E single digit
    addQuery(`${cleanT} E${e1}`);
    // 9. S1 standard single digit
    addQuery(`${cleanT} S1E${e1}`);
    // 10. Year alone
    if (year) addQuery(`${cleanT} ${year}`);
    // 11. Season 1 alone
    addQuery(`${cleanT} S01`);
    // 12. Title alone
    addQuery(cleanT);
  }

  return queries;
}

/**
 * Generate Movie prioritized search queries
 */
export function generateMovieSearchQueries(cleanT, year) {
  const queries = [];
  const addQuery = (q) => {
    const trimmed = (q || '').trim();
    if (trimmed && !queries.includes(trimmed)) {
      queries.push(trimmed);
    }
  };

  if (year) {
    addQuery(`${cleanT} ${year}`);
  }
  addQuery(cleanT);
  return queries;
}

/**
 * Build a prioritized, de-duplicated list of search queries for any media (Movie or TV).
 * Used uniformly across all resolvers (MSM, Pencuri, etc.).
 *
 * @param {Object} params Media resolution parameters
 * @param {string} params.title Media title
 * @param {string|number} [params.year] Release year
 * @param {string|number} [params.season] Season number (for TV)
 * @param {string|number} [params.episode] Episode number (for TV)
 * @param {string|number} [params.totalSeasons] Total seasons count
 * @param {string} [params.altTitle] Alternative title (optional)
 * @param {string} [params.englishTitle] English title (optional)
 * @returns {string[]} Array of unique, prioritized search query strings
 */
export function buildSearchQueries(params = {}) {
  const {
    title = '',
    year,
    season,
    episode,
    totalSeasons: totalSeasonsQuery,
    altTitle: altTitleQuery,
    englishTitle,
  } = params;

  const rawTitle = String(title || '').trim();
  const cleanT = cleanSearchTitle(rawTitle);

  let effectiveAltTitle = String(altTitleQuery || englishTitle || '').trim();
  if (effectiveAltTitle) {
    effectiveAltTitle = cleanSearchTitle(effectiveAltTitle);
  } else {
    // Check common regional title variants (e.g. Project <-> Projek)
    if (/\bproject\b/i.test(cleanT)) {
      effectiveAltTitle = cleanT.replace(/\bproject\b/gi, 'Projek');
    } else if (/\bprojek\b/i.test(cleanT)) {
      effectiveAltTitle = cleanT.replace(/\bprojek\b/gi, 'Project');
    }
  }

  const sNum = season ? parseInt(season, 10) : NaN;
  const eNum = episode ? parseInt(episode, 10) : NaN;
  const totalSeasons = totalSeasonsQuery ? parseInt(totalSeasonsQuery, 10) : NaN;
  const isTv = !isNaN(sNum) && !isNaN(eNum);

  const searchQueries = [];

  if (isTv) {
    searchQueries.push(...generateSeriesSearchQueries(cleanT, sNum, eNum, totalSeasons, year));
    if (cleanT !== rawTitle) {
      searchQueries.push(...generateSeriesSearchQueries(rawTitle, sNum, eNum, totalSeasons, year));
    }
    if (effectiveAltTitle && effectiveAltTitle.toLowerCase() !== cleanT.toLowerCase()) {
      searchQueries.push(...generateSeriesSearchQueries(effectiveAltTitle, sNum, eNum, totalSeasons, year));
    }
  } else {
    searchQueries.push(...generateMovieSearchQueries(cleanT, year));
    if (cleanT !== rawTitle) {
      searchQueries.push(...generateMovieSearchQueries(rawTitle, year));
    }
    if (effectiveAltTitle && effectiveAltTitle.toLowerCase() !== cleanT.toLowerCase()) {
      searchQueries.push(...generateMovieSearchQueries(effectiveAltTitle, year));
    }
  }

  // De-duplicate while preserving insertion priority
  const unique = [];
  for (const q of searchQueries) {
    const trimmed = (q || '').trim();
    if (trimmed && !unique.includes(trimmed)) {
      unique.push(trimmed);
    }
  }

  return unique;
}
