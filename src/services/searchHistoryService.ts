const RECENT_SEARCHES_KEY = 'tmdb_recent_searches';
const MAX_RECENT_SEARCHES = 10;

export function getRecentSearches(): string[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addRecentSearch(query: string): string[] {
  if (!query || !query.trim() || typeof window === 'undefined' || !window.localStorage) {
    return getRecentSearches();
  }

  const cleanQuery = query.trim();
  const current = getRecentSearches();

  // Deduplicate case-insensitively while preserving latest case
  const filtered = current.filter((item) => item.toLowerCase() !== cleanQuery.toLowerCase());
  const updated = [cleanQuery, ...filtered].slice(0, MAX_RECENT_SEARCHES);

  try {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  } catch {}

  return updated;
}

export function removeRecentSearch(query: string): string[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  const current = getRecentSearches();
  const updated = current.filter((item) => item.toLowerCase() !== query.toLowerCase());

  try {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  } catch {}

  return updated;
}

export function clearRecentSearches(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    localStorage.removeItem(RECENT_SEARCHES_KEY);
  } catch {}
}
