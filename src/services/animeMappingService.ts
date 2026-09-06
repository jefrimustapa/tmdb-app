/**
 * Anime ID Mapping Service
 * Resolves TMDB anime media to MyAnimeList (MAL) IDs using:
 * 1. Kitsu API (High reliability & 100% uptime with explicit MAL cross-references)
 * 2. AniList GraphQL API
 * 3. Jikan REST API (fallback)
 */

interface CachedAnimeEntry {
  malId: number | null;
  timestamp: number;
}

const MEMORY_CACHE = new Map<string, CachedAnimeEntry>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const SESSION_CACHE_KEY_PREFIX = "tmdb_anime_mal_";

function getNormalizedKey(title: string, year?: string | number): string {
  const cleanTitle = title.trim().toLowerCase().replace(/[^\w\s]/g, "");
  return year ? `${cleanTitle}_${year}` : cleanTitle;
}

function getCachedMalId(cacheKey: string): number | null | undefined {
  const mem = MEMORY_CACHE.get(cacheKey);
  if (mem && Date.now() - mem.timestamp < CACHE_TTL_MS) {
    return mem.malId;
  }
  if (typeof window !== "undefined" && window.sessionStorage) {
    try {
      const raw = sessionStorage.getItem(`${SESSION_CACHE_KEY_PREFIX}${cacheKey}`);
      if (raw) {
        const parsed = JSON.parse(raw) as CachedAnimeEntry;
        if (Date.now() - parsed.timestamp < CACHE_TTL_MS) {
          MEMORY_CACHE.set(cacheKey, parsed);
          return parsed.malId;
        }
      }
    } catch {}
  }
  return undefined;
}

function setCachedMalId(cacheKey: string, malId: number | null) {
  const entry: CachedAnimeEntry = { malId, timestamp: Date.now() };
  MEMORY_CACHE.set(cacheKey, entry);
  if (typeof window !== "undefined" && window.sessionStorage) {
    try {
      sessionStorage.setItem(`${SESSION_CACHE_KEY_PREFIX}${cacheKey}`, JSON.stringify(entry));
    } catch {}
  }
}

/**
 * 1. Primary Resolver: Kitsu API (Instant, no rate-limit blocks, includes MAL mapping)
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
 * 2. Secondary Resolver: AniList GraphQL API
 */
async function queryAniList(title: string): Promise<number | null> {
  try {
    const query = "query ($search: String) { Media(search: $search, type: ANIME) { id idMal title { romaji english } } }";
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({ query, variables: { search: title } }),
      signal: AbortSignal.timeout(5000)
    });
    if (res.ok) {
      const json = await res.json();
      const media = json?.data?.Media;
      if (media && (media.idMal || media.id)) {
        return media.idMal || media.id;
      }
    }
  } catch (err) {
    console.warn("[AnimeMapping] AniList lookup failed:", err);
  }
  return null;
}

/**
 * 3. Fallback: Jikan API
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

export async function resolveAnimeMalId(title: string, year?: string | number): Promise<number | null> {
  if (!title || !title.trim()) return null;
  const cacheKey = getNormalizedKey(title, year);
  const cached = getCachedMalId(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  // 1. Kitsu (fastest & most stable)
  let malId = await queryKitsu(title);

  // 2. AniList
  if (!malId) {
    malId = await queryAniList(title);
  }

  // 3. Jikan
  if (!malId) {
    malId = await queryJikan(title);
  }

  if (malId) {
    setCachedMalId(cacheKey, malId);
  }
  return malId;
}
