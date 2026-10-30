/**
 * Anime ID Mapping Service
 * Resolves TMDB anime media to MyAnimeList (MAL) IDs using:
 * 1. AniList GraphQL API, walking the sequel chain for multi-season & absolute episode offsets
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
const SESSION_CACHE_KEY_PREFIX = "tmdb_anime_mal_v3_";

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
 * Walks the SEQUEL chain one request per hop to discover seasons, MAL IDs and episode counts.
 * (A single nested query only reached ~3 seasons, so long franchises such as MHA were cut off.)
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

export interface SeasonPart {
  malId: number;
  episodes: number;
}

/** One TMDB season: usually one MAL entry, several when the show is split into cours/parts. */
export interface Season {
  malId: number;
  title: string;
  episodes: number;
  parts: SeasonPart[];
}

/** Formats counted as a season; movies and specials are walked through but not counted. */
const SEASON_FORMATS = ["TV", "TV_SHORT", "ONA"];
const MAX_WALK_HOPS = 12;
/** "... Part 2", "... Cour 2": a continuation that TMDB folds into the previous season. */
const SPLIT_COUR = /\b(?:part|cour)\s*([2-9])\s*$/i;

export type AniListFetchById = (id: number) => Promise<AniListNode | null>;

/**
 * Walks the sequel chain from the AniList root, one fetch per hop, and collects the counted
 * entries plus TV side stories (not sequels, but listed as seasons by TMDB, issue #288).
 * `complete` is false when the walk stopped early (failed request or hop cap).
 */
export async function walkFranchise(
  root: AniListNode,
  fetchById: AniListFetchById,
  fallbackTitle: string
): Promise<{ entries: FranchiseEntry[]; complete: boolean }> {
  const entries: FranchiseEntry[] = [];
  const visited = new Set<number>();
  const titleOf = (node: AniListNode) => node.title?.english || node.title?.romaji || fallbackTitle;
  let complete = true;
  let chainNumber = 0;
  let node: AniListNode | null = root;

  for (let hop = 0; node; hop++) {
    visited.add(node.id);
    const malId = node.idMal || node.id;
    if (malId && (hop === 0 || SEASON_FORMATS.includes(node.format ?? ""))) {
      chainNumber++;
      entries.push({
        malId,
        episodes: node.episodes || 12,
        title: titleOf(node),
        seasonNumber: chainNumber,
        year: node.seasonYear
      });
    }

    for (const edge of node.relations?.edges ?? []) {
      const side = edge.node;
      if (edge.relationType !== "SIDE_STORY" || !side || side.format !== "TV" || !side.seasonYear) continue;
      if (visited.has(side.id)) continue;
      visited.add(side.id);
      entries.push({
        malId: side.idMal || side.id,
        episodes: side.episodes || 12,
        title: titleOf(side),
        seasonNumber: 0,
        year: side.seasonYear,
        sideStory: true
      });
    }

    const sequels = (node.relations?.edges ?? []).filter(
      (e) => e.relationType === "SEQUEL" && e.node && !visited.has(e.node.id)
    );
    const pick = (formats: string[]) => sequels.find((e) => formats.includes(e.node?.format ?? ""));
    // Movies and, as a last resort, OVAs/specials are walked through without being counted
    // (Slime: S1 -> OVA -> S2), but any TV/ONA sequel is preferred.
    const next = pick(["TV", "TV_SHORT"]) ?? pick(["ONA"]) ?? pick(["MOVIE"]) ?? pick(["OVA", "SPECIAL"]);
    if (!next?.node) break;
    if (hop + 1 >= MAX_WALK_HOPS) {
      complete = false;
      break;
    }
    node = await fetchById(next.node.id);
    if (!node) {
      complete = false;
    }
  }
  return { entries, complete };
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

/** Folds split cours ("Part 2", "Cour 2") into the previous season, like TMDB does. */
export function groupSeasons(ordered: FranchiseEntry[]): Season[] {
  const seasons: Season[] = [];
  for (const entry of ordered) {
    const part: SeasonPart = { malId: entry.malId, episodes: entry.episodes };
    const prev = seasons[seasons.length - 1];
    if (prev && !entry.sideStory && SPLIT_COUR.test(entry.title)) {
      prev.parts.push(part);
      prev.episodes += entry.episodes;
      continue;
    }
    seasons.push({ malId: entry.malId, title: entry.title, episodes: entry.episodes, parts: [part] });
  }
  return seasons;
}

/** Maps a TMDB episode number inside a season onto the MAL entry (part) that holds it. */
export function routeEpisode(season: Season, episode: number): { malId: number; episode: number } {
  let remaining = Math.max(1, episode);
  for (let i = 0; i < season.parts.length; i++) {
    const part = season.parts[i];
    if (remaining <= part.episodes || i === season.parts.length - 1) {
      return { malId: part.malId, episode: remaining };
    }
    remaining -= part.episodes;
  }
  return { malId: season.malId, episode: remaining };
}

const ANILIST_FIELDS = `
  id
  idMal
  title { english romaji }
  format
  episodes
  seasonYear
  relations {
    edges {
      relationType
      node { id idMal title { english romaji } format episodes seasonYear }
    }
  }
`;
const ROOT_QUERY = `
  query ($search: String) {
    Media(search: $search, type: ANIME, format_in: [TV, TV_SHORT, ONA, MOVIE]) { ${ANILIST_FIELDS} }
  }
`;
const NODE_QUERY = `
  query ($id: Int) {
    Media(id: $id, type: ANIME) { ${ANILIST_FIELDS} }
  }
`;

async function anilistRequest(query: string, variables: Record<string, unknown>, attempt = 0): Promise<AniListNode | null> {
  try {
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(6000)
    });
    if (res.status === 429 && attempt === 0) {
      // Rate limited (~90 requests/minute): wait once, briefly, then retry
      const waitSeconds = Math.min(Number(res.headers.get("Retry-After")) || 5, 10);
      await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
      return anilistRequest(query, variables, 1);
    }
    if (!res.ok) return null;
    const json = await res.json();
    return (json?.data?.Media as AniListNode | undefined) ?? null;
  } catch (err) {
    console.warn("[AnimeMapping] AniList request error:", err);
    return null;
  }
}

interface LoadedFranchise {
  entries: FranchiseEntry[];
  complete: boolean;
}

const FRANCHISE_MEMORY = new Map<string, { entries: FranchiseEntry[]; timestamp: number }>();
const FRANCHISE_INFLIGHT = new Map<string, Promise<LoadedFranchise | null>>();
const FRANCHISE_SESSION_PREFIX = "tmdb_anime_franchise_v1_";

function franchiseKey(title: string): string {
  return title.trim().toLowerCase().replace(/[^\w\s]/g, "");
}

function readFranchiseCache(key: string): FranchiseEntry[] | undefined {
  const mem = FRANCHISE_MEMORY.get(key);
  if (mem && Date.now() - mem.timestamp < CACHE_TTL_MS) return mem.entries;
  if (typeof window !== "undefined" && window.sessionStorage) {
    try {
      const raw = sessionStorage.getItem(`${FRANCHISE_SESSION_PREFIX}${key}`);
      if (raw) {
        const parsed = JSON.parse(raw) as { entries: FranchiseEntry[]; timestamp: number };
        if (Date.now() - parsed.timestamp < CACHE_TTL_MS) {
          FRANCHISE_MEMORY.set(key, parsed);
          return parsed.entries;
        }
      }
    } catch {}
  }
  return undefined;
}

function writeFranchiseCache(key: string, entries: FranchiseEntry[]) {
  const value = { entries, timestamp: Date.now() };
  FRANCHISE_MEMORY.set(key, value);
  if (typeof window !== "undefined" && window.sessionStorage) {
    try {
      sessionStorage.setItem(`${FRANCHISE_SESSION_PREFIX}${key}`, JSON.stringify(value));
    } catch {}
  }
}

/** One walk per title: later seasons/episodes of the same show reuse it. Partial walks are not cached. */
function queryAniListFranchise(title: string): Promise<LoadedFranchise | null> {
  const key = franchiseKey(title);
  const cached = readFranchiseCache(key);
  if (cached) return Promise.resolve({ entries: cached, complete: true });

  const running = FRANCHISE_INFLIGHT.get(key);
  if (running) return running;

  const job = (async (): Promise<LoadedFranchise | null> => {
    const root = await anilistRequest(ROOT_QUERY, { search: title });
    if (!root || (!root.idMal && !root.id)) return null;
    const walked = await walkFranchise(root, (id) => anilistRequest(NODE_QUERY, { id }), title);
    if (walked.entries.length === 0) return null;
    if (walked.complete) writeFranchiseCache(key, walked.entries);
    return walked;
  })().finally(() => FRANCHISE_INFLIGHT.delete(key));

  FRANCHISE_INFLIGHT.set(key, job);
  return job;
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

  // 1. Walk the AniList franchise
  const loaded = await queryAniListFranchise(title) || (originalTitle ? await queryAniListFranchise(originalTitle) : null);
  const franchise = loaded?.entries;
  // A partial walk (failed request) must not leave a sticky wrong or null answer behind
  const remember = (value: ResolvedAnimeMapping | null) => {
    if (!loaded || loaded.complete) setCachedMapping(cacheKey, value);
  };

  if (franchise && franchise.length > 0) {
    // Absolute episode numbering follows the sequel chain only; side stories have their own episodes.
    const chain = franchise.filter((e) => !e.sideStory);

    // Scenario A: User explicitly selected Season > 1, numbered like TMDB (split cours folded together)
    if (season > 1) {
      const seasonEntry = groupSeasons(orderSeasonsForTmdb(franchise))[season - 1];
      if (seasonEntry) {
        const routed = routeEpisode(seasonEntry, episode);
        const result: ResolvedAnimeMapping = {
          malId: routed.malId,
          episode: routed.episode,
          season: season,
          title: seasonEntry.title
        };
        remember(result);
        return result;
      }
      // The franchise has no such season: a text search would only find the base title again (issue #288)
      remember(null);
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
          remember(result);
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
      remember(result);
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
    remember(result);
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
