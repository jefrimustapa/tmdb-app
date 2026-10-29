/**
 * Anime ID Mapping Service
 * Resolves TMDB anime media to MyAnimeList (MAL) IDs using:
 * 1. AniList GraphQL API with recursive relation graphs for multi-season & absolute episode offsets
 * 2. Kitsu API (High reliability & 100% uptime with explicit MAL cross-references)
 * 3. Jikan REST API (fallback)
 */

export interface ResolvedAnimeMapping {
  malId: number;
  episode: number;
  season?: number;
  title?: string;
}

export interface AnimeMappingOptions {
  title: string;
  season?: number;
  episode?: number;
  year?: string | number;
  tmdbId?: number;
  originalTitle?: string;
}

interface CachedAnimeEntry {
  mapping: ResolvedAnimeMapping | null;
  timestamp: number;
}

const MEMORY_CACHE = new Map<string, CachedAnimeEntry>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const SESSION_CACHE_KEY_PREFIX = "tmdb_anime_mal_v2_";

function getNormalizedKey(options: AnimeMappingOptions): string {
  const cleanTitle = (options.title || "").trim().toLowerCase().replace(/[^\w\s]/g, "");
  const s = options.season || 1;
  const e = options.episode || 1;
  return `${options.tmdbId ? `tmdb_${options.tmdbId}_` : ""}${cleanTitle}_s${s}_e${e}`;
}

function getCachedMapping(cacheKey: string): ResolvedAnimeMapping | null | undefined {
  const mem = MEMORY_CACHE.get(cacheKey);
  if (mem && Date.now() - mem.timestamp < CACHE_TTL_MS) {
    return mem.mapping;
  }
  if (typeof window !== "undefined" && window.sessionStorage) {
    try {
      const raw = sessionStorage.getItem(`${SESSION_CACHE_KEY_PREFIX}${cacheKey}`);
      if (raw) {
        const parsed = JSON.parse(raw) as CachedAnimeEntry;
        if (Date.now() - parsed.timestamp < CACHE_TTL_MS) {
          MEMORY_CACHE.set(cacheKey, parsed);
          return parsed.mapping;
        }
      }
    } catch {}
  }
  return undefined;
}

function setCachedMapping(cacheKey: string, mapping: ResolvedAnimeMapping | null) {
  const entry: CachedAnimeEntry = { mapping, timestamp: Date.now() };
  MEMORY_CACHE.set(cacheKey, entry);
  if (typeof window !== "undefined" && window.sessionStorage) {
    try {
      sessionStorage.setItem(`${SESSION_CACHE_KEY_PREFIX}${cacheKey}`, JSON.stringify(entry));
    } catch {}
  }
}

/**
 * 1. Primary Multi-Season & Offset Resolver: AniList GraphQL
 * Traverses SEQUEL relations to discover seasons, MAL IDs, and episode counts.
 */
interface AniListNode {
  id: number;
  idMal?: number;
  title?: { english?: string; romaji?: string };
  format?: string;
  episodes?: number;
  seasonYear?: number;
  relations?: {
    edges?: Array<{
      relationType: string;
      node?: AniListNode;
    }>;
  };
}

export interface FranchiseEntry {
  malId: number;
  episodes: number;
  title: string;
  seasonNumber: number;
  year?: number;
  /** TV side story (e.g. Fumoffu): not part of the sequel chain, but TMDB lists it as a season. */
  sideStory?: boolean;
}

/**
 * Collects the sequel chain from the AniList root node, plus TV side stories of every chain node.
 * Side stories are not sequels, so a chain-only walk misses seasons TMDB counts (issue #288).
 */
export function collectFranchiseEntries(root: AniListNode, fallbackTitle: string): FranchiseEntry[] {
  const entries: FranchiseEntry[] = [];
  const visited = new Set<number>();
  const titleOf = (node: AniListNode) => node.title?.english || node.title?.romaji || fallbackTitle;

  function addNode(node: AniListNode | undefined, seasonNum: number) {
    if (!node) return;
    const malId = node.idMal || node.id;
    if (!malId || visited.has(malId)) return;
    visited.add(malId);
    entries.push({
      malId,
      episodes: node.episodes || 12,
      title: titleOf(node),
      seasonNumber: seasonNum,
      year: node.seasonYear
    });

    for (const edge of node.relations?.edges ?? []) {
      const side = edge.node;
      if (edge.relationType !== 'SIDE_STORY' || !side || side.format !== 'TV' || !side.seasonYear) continue;
      const sideId = side.idMal || side.id;
      if (!sideId || visited.has(sideId)) continue;
      visited.add(sideId);
      entries.push({
        malId: sideId,
        episodes: side.episodes || 12,
        title: titleOf(side),
        seasonNumber: 0,
        year: side.seasonYear,
        sideStory: true
      });
    }

    const nextSequel = node.relations?.edges?.find((e) => e.relationType === 'SEQUEL' && e.node)?.node;
    if (nextSequel) {
      addNode(nextSequel, seasonNum + 1);
    }
  }

  addNode(root, 1);
  return entries;
}

/** Entries in TMDB season order: the sequel chain with each side story inserted by air year. */
export function orderSeasonsForTmdb(entries: FranchiseEntry[]): FranchiseEntry[] {
  const ordered = entries.filter((e) => !e.sideStory);
  for (const side of entries.filter((e) => e.sideStory)) {
    const at = ordered.findIndex((e) => e.year !== undefined && side.year !== undefined && e.year > side.year);
    if (at === -1) ordered.push(side);
    else ordered.splice(at, 0, side);
  }
  return ordered;
}

async function queryAniListFranchise(title: string): Promise<FranchiseEntry[] | null> {
  try {
    const query = `
      query ($search: String) {
        Media(search: $search, type: ANIME, format_in: [TV, TV_SHORT, ONA, MOVIE]) {
          id
          idMal
          title { english romaji }
          format
          episodes
          seasonYear
          relations {
            edges {
              relationType
              node {
                id
                idMal
                title { english romaji }
                format
                episodes
                seasonYear
                relations {
                  edges {
                    relationType
                    node {
                      id
                      idMal
                      title { english romaji }
                      format
                      episodes
                      seasonYear
                      relations {
                        edges {
                          relationType
                          node {
                            id
                            idMal
                            title { english romaji }
                            format
                            episodes
                            seasonYear
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({ query, variables: { search: title } }),
      signal: AbortSignal.timeout(6000)
    });

    if (!res.ok) return null;
    const json = await res.json();
    const root = json?.data?.Media as AniListNode | undefined;
    if (!root || (!root.idMal && !root.id)) return null;

    const entries = collectFranchiseEntries(root, title);
    return entries.length > 0 ? entries : null;
  } catch (err) {
    console.warn("[AnimeMapping] AniList franchise query error:", err);
    return null;
  }
}

/**
 * 2. Kitsu API with MAL cross-references
 */
async function queryKitsu(title: string): Promise<number | null> {
  try {
    const searchUrl = `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(title)}&page[limit]=1`;
    const res = await fetch(searchUrl, {
      headers: { Accept: "application/vnd.api+json" },
      signal: AbortSignal.timeout(5000)
    });
    if (res.ok) {
      const json = await res.json();
      const animeItem = json?.data?.[0];
      if (animeItem?.id) {
        const mapUrl = `https://kitsu.io/api/edge/anime/${animeItem.id}/mappings`;
        const mapRes = await fetch(mapUrl, {
          headers: { Accept: "application/vnd.api+json" },
          signal: AbortSignal.timeout(5000)
        });
        if (mapRes.ok) {
          const mapJson = await mapRes.json();
          const malMapping = mapJson?.data?.find(
            (m: any) => m.attributes?.externalSite === "myanimelist/anime"
          );
          if (malMapping?.attributes?.externalId) {
            const parsed = parseInt(malMapping.attributes.externalId, 10);
            if (!isNaN(parsed) && parsed > 0) return parsed;
          }
        }
      }
    }
  } catch (err) {
    console.warn("[AnimeMapping] Kitsu lookup failed:", err);
  }
  return null;
}

/**
 * 3. Jikan API (fallback)
 */
async function queryJikan(title: string): Promise<number | null> {
  try {
    const url = `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(title)}&limit=1`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: { Accept: "application/json" }
    });
    if (res.ok) {
      const json = await res.json();
      if (json?.data && json.data.length > 0 && json.data[0]?.mal_id) {
        return json.data[0].mal_id;
      }
    }
  } catch (err) {
    console.warn("[AnimeMapping] Jikan lookup failed:", err);
  }
  return null;
}

/**
 * Main mapping resolver supporting multi-season titles and continuous episode offsets
 */
export async function resolveAnimeMapping(options: AnimeMappingOptions): Promise<ResolvedAnimeMapping | null> {
  const { title, season = 1, episode = 1, originalTitle } = options;
  if (!title || !title.trim()) return null;

  const cacheKey = getNormalizedKey(options);
  const cached = getCachedMapping(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  // 1. Query AniList franchise graph
  const franchise = await queryAniListFranchise(title) || (originalTitle ? await queryAniListFranchise(originalTitle) : null);

  if (franchise && franchise.length > 0) {
    // Absolute episode numbering follows the sequel chain only; side stories have their own episodes.
    const chain = franchise.filter((e) => !e.sideStory);

    // Scenario A: User explicitly selected Season > 1 (e.g., Season 2 Episode 1), numbered like TMDB
    if (season > 1) {
      const seasonEntry = orderSeasonsForTmdb(franchise)[season - 1];
      if (seasonEntry) {
        const result: ResolvedAnimeMapping = {
          malId: seasonEntry.malId,
          episode: episode,
          season: season,
          title: seasonEntry.title
        };
        setCachedMapping(cacheKey, result);
        return result;
      }
      // The franchise has no such season: a text search would only find the base title again (issue #288)
      setCachedMapping(cacheKey, null);
      return null;
    }

    // Scenario B: User is on Season 1, but episode exceeds Season 1 count (Continuous / Absolute Numbering)
    // E.g., Rent-a-Girlfriend S1 has 60 eps on TMDB, but Season 1 on MAL only has 12 eps. Ep 13 belongs to Season 2 Ep 1.
    if (season === 1 && episode > chain[0].episodes && chain.length > 1) {
      let remainingEpisode = episode;
      for (const entry of chain) {
        if (remainingEpisode <= entry.episodes) {
          const result: ResolvedAnimeMapping = {
            malId: entry.malId,
            episode: remainingEpisode,
            season: entry.seasonNumber,
            title: entry.title
          };
          setCachedMapping(cacheKey, result);
          return result;
        }
        remainingEpisode -= entry.episodes;
      }
      // If beyond all known sequel episode counts, map to latest sequel with remaining offset
      const last = chain[chain.length - 1];
      const result: ResolvedAnimeMapping = {
        malId: last.malId,
        episode: Math.max(1, remainingEpisode),
        season: last.seasonNumber,
        title: last.title
      };
      setCachedMapping(cacheKey, result);
      return result;
    }

    // Scenario C: Standard Season 1 episode
    const root = franchise[0];
    const result: ResolvedAnimeMapping = {
      malId: root.malId,
      episode: episode,
      season: 1,
      title: root.title
    };
    setCachedMapping(cacheKey, result);
    return result;
  }

  // 2. Direct Season Query Fallback (Kitsu / Jikan) if season > 1
  if (season > 1) {
    const seasonQuery = `${title} Season ${season}`;
    let malId = await queryKitsu(seasonQuery);
    if (!malId) malId = await queryJikan(seasonQuery);
    if (malId) {
      const result: ResolvedAnimeMapping = {
        malId,
        episode: episode,
        season
      };
      setCachedMapping(cacheKey, result);
      return result;
    }
  }

  // A later season that no source could resolve must not play season 1 instead (issue #288)
  if (season > 1) {
    setCachedMapping(cacheKey, null);
    return null;
  }

  // 3. Fallback to base title via Kitsu or Jikan
  let malId = await queryKitsu(title);
  if (!malId && originalTitle) malId = await queryKitsu(originalTitle);
  if (!malId) malId = await queryJikan(title);
  if (!malId && originalTitle) malId = await queryJikan(originalTitle);

  if (malId) {
    const result: ResolvedAnimeMapping = {
      malId,
      episode: episode,
      season: season || 1
    };
    setCachedMapping(cacheKey, result);
    return result;
  }

  setCachedMapping(cacheKey, null);
  return null;
}

/**
 * Backwards-compatible wrapper returning only the MAL ID
 */
export async function resolveAnimeMalId(title: string, year?: string | number): Promise<number | null> {
  const res = await resolveAnimeMapping({ title, year });
  return res ? res.malId : null;
}

/**
 * Checks if a media item (from TMDB details or list item) is Japanese Anime.
 */
export function isAnimeMedia(media?: {
  genre_ids?: number[];
  genres?: { id: number; name?: string }[];
  original_language?: string;
  origin_country?: string[];
} | null): boolean {
  if (!media) return false;
  const genreIds = media.genre_ids || (media.genres ? media.genres.map((g) => g.id) : []);
  const lang = media.original_language?.toLowerCase();
  const countries = media.origin_country || [];

  // TMDB Animation genre is 16; Anime keyword is 210024
  const hasAnimation = genreIds.includes(16);
  const hasAnimeTag = genreIds.includes(210024);
  const isJapanese = lang === 'ja' || countries.includes('JP');

  return (hasAnimation && isJapanese) || hasAnimeTag;
}
