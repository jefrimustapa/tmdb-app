import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search as SearchIcon, X, Film, Tv, Sparkles, User, Clapperboard } from 'lucide-react';
import { tmdbApi, tmdbImages } from '../../services/tmdb';
import type { TMDBMediaItem, TMDBGenre } from '../../types/tmdb';
import { MediaCard } from '../../components/common/MediaCard';

export const Search: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryParam = searchParams.get('q') || '';
  const personIdParam = searchParams.get('personId');
  const personNameParam = searchParams.get('personName') || '';

  const [query, setQuery] = useState(queryParam);
  const [personInfo, setPersonInfo] = useState<{ id: number; name: string; profile_path: string | null; department?: string } | null>(null);
  const [results, setResults] = useState<TMDBMediaItem[]>([]);
  const [activeFilter, setActiveFilter] = useState<'all' | 'movie' | 'tv'>('all');
  const [popularGenres, setPopularGenres] = useState<TMDBGenre[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    tmdbApi.getMovieGenres().then((res) => setPopularGenres((res.genres || []).slice(0, 10)));
  }, []);

  useEffect(() => {
    if (personIdParam) {
      const pId = parseInt(personIdParam, 10);
      if (!isNaN(pId)) {
        loadPersonFilmography(pId, personNameParam);
        return;
      }
    }

    if (queryParam) {
      setPersonInfo(null);
      setQuery(queryParam);
      setPage(1);
      performSearch(queryParam, 1, false);
    } else {
      setPersonInfo(null);
      setResults([]);
      setPage(1);
      setTotalPages(1);
    }
  }, [queryParam, personIdParam, personNameParam]);

  const loadPersonFilmography = async (personId: number, fallbackName: string) => {
    setIsLoading(true);
    try {
      const [creditsRes, detailsRes] = await Promise.allSettled([
        tmdbApi.getPersonCredits(personId),
        tmdbApi.getPersonDetails(personId)
      ]);

      if (detailsRes.status === 'fulfilled') {
        setPersonInfo({
          id: detailsRes.value.id,
          name: detailsRes.value.name,
          profile_path: detailsRes.value.profile_path,
          department: detailsRes.value.known_for_department
        });
        setQuery(detailsRes.value.name);
      } else {
        setPersonInfo({
          id: personId,
          name: fallbackName || 'Actor',
          profile_path: null
        });
        setQuery(fallbackName);
      }

      if (creditsRes.status === 'fulfilled') {
        const castItems = (creditsRes.value.cast || []).map((item) => ({
          ...item,
          media_type: item.media_type || (item.title ? 'movie' : 'tv')
        }));
        // Sort by popularity / vote count descending
        const sorted = castItems.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
        // Remove duplicates by ID
        const unique = Array.from(new Map(sorted.map((item) => [item.id, item])).values());
        setResults(unique);
        setTotalPages(1);
      }
    } catch (err) {
      console.error('Failed to load person filmography:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const performSearch = async (searchTerm: string, pageNum = 1, append = false) => {
    if (!searchTerm.trim()) {
      setResults([]);
      return;
    }
    if (pageNum === 1) {
      setIsLoading(true);
    } else {
      setIsLoadingMore(true);
    }
    try {
      const res = await tmdbApi.searchMulti(searchTerm, pageNum);
      const filtered = (res.results || []).filter(
        (item) => item.media_type === 'movie' || item.media_type === 'tv'
      );
      setTotalPages(res.total_pages || 1);
      setResults((prev) => {
        if (!append) return filtered;
        const existingIds = new Set(prev.map((i) => i.id));
        const newItems = filtered.filter((i) => !existingIds.has(i.id));
        return [...prev, ...newItems];
      });
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  // Infinite scroll trigger on window scroll near bottom
  useEffect(() => {
    const handleScroll = () => {
      if (personInfo || isLoading || isLoadingMore) return;
      if (page >= totalPages) return;

      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const scrollHeight = document.documentElement.scrollHeight;
      const clientHeight = window.innerHeight || document.documentElement.clientHeight;

      if (scrollTop + clientHeight >= scrollHeight - 600) {
        const nextPage = page + 1;
        setPage(nextPage);
        performSearch(query, nextPage, true);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [page, totalPages, query, isLoading, isLoadingMore, personInfo]);

  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setPersonInfo(null);

    if (debounceTimer) clearTimeout(debounceTimer);
    const t = setTimeout(() => {
      setSearchParams(val ? { q: val } : {});
    }, 250);
    setDebounceTimer(t);
  };

  const handleClear = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    setQuery('');
    setPersonInfo(null);
    setResults([]);
    setSearchParams({});
  };

  const filteredResults = results.filter((item) => {
    if (activeFilter === 'all') return true;
    return item.media_type === activeFilter;
  });

  return (
    <div className="min-h-screen pt-24 pb-16 px-4 sm:px-8 max-w-7xl mx-auto">
      {/* Search Header Input */}
      <div className="relative max-w-3xl mx-auto mb-8">
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={handleInputChange}
            placeholder="Search by movie, TV show, anime, or director..."
            autoFocus
            className="w-full pl-14 pr-12 py-4 bg-hbo-card/90 border-2 border-hbo-border rounded-2xl text-base sm:text-lg text-white placeholder-gray-400 focus:outline-none focus:border-hbo-purple-light focus:shadow-hbo-glow transition-all tv-focus-target"
          />
          <SearchIcon className="w-6 h-6 text-hbo-cyan absolute left-4 top-1/2 -translate-y-1/2" />
          {query && (
            <button
              onClick={handleClear}
              className="p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white absolute right-3 top-1/2 -translate-y-1/2 transition"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Cast / Person Filter Banner */}
        {personInfo && (
          <div className="mt-4 p-4 rounded-2xl bg-gradient-to-r from-hbo-card via-hbo-purple/20 to-hbo-card border border-hbo-purple-light/40 flex items-center justify-between gap-4 shadow-xl">
            <div className="flex items-center gap-3">
              {personInfo.profile_path ? (
                <img
                  src={tmdbImages.profile(personInfo.profile_path, 'w185')}
                  alt={personInfo.name}
                  className="w-14 h-14 rounded-full object-cover border-2 border-hbo-cyan shadow-hbo-glow"
                />
              ) : (
                <div className="w-14 h-14 rounded-full bg-hbo-purple/40 border-2 border-hbo-cyan flex items-center justify-center text-white">
                  <User className="w-6 h-6" />
                </div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-hbo-cyan/20 text-hbo-cyan border border-hbo-cyan/30 uppercase tracking-wider">
                    Cast Filmography
                  </span>
                  {personInfo.department && (
                    <span className="text-xs text-gray-400">{personInfo.department}</span>
                  )}
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-white mt-0.5">{personInfo.name}</h3>
                <p className="text-xs text-gray-400">
                  Featuring in {results.length} movie{results.length !== 1 ? 's' : ''} & series
                </p>
              </div>
            </div>

            <button
              onClick={handleClear}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white text-xs font-semibold border border-white/20 transition tv-focus-target flex-shrink-0"
              title="Clear Cast Filter"
            >
              <X className="w-3.5 h-3.5" />
              <span>Clear Filter</span>
            </button>
          </div>
        )}

        {/* Filter Pills */}
        {results.length > 0 && (
          <div className="flex items-center gap-2 mt-4 justify-center">
            <button
              onClick={() => setActiveFilter('all')}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition border tv-focus-target ${
                activeFilter === 'all'
                  ? 'bg-hbo-purple text-white border-hbo-purple-light shadow-hbo-glow'
                  : 'bg-hbo-card text-gray-300 border-hbo-border'
              }`}
            >
              All ({results.length})
            </button>
            <button
              onClick={() => setActiveFilter('movie')}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition border tv-focus-target ${
                activeFilter === 'movie'
                  ? 'bg-hbo-purple text-white border-hbo-purple-light shadow-hbo-glow'
                  : 'bg-hbo-card text-gray-300 border-hbo-border'
              }`}
            >
              Movies ({results.filter((r) => r.media_type === 'movie').length})
            </button>
            <button
              onClick={() => setActiveFilter('tv')}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition border tv-focus-target ${
                activeFilter === 'tv'
                  ? 'bg-hbo-purple text-white border-hbo-purple-light shadow-hbo-glow'
                  : 'bg-hbo-card text-gray-300 border-hbo-border'
              }`}
            >
              Series ({results.filter((r) => r.media_type === 'tv').length})
            </button>
          </div>
        )}
      </div>

      {/* Suggested Genre Tags if no search yet */}
      {!query && (
        <div className="max-w-3xl mx-auto my-12 text-center">
          <div className="flex items-center justify-center gap-2 text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">
            <Sparkles className="w-4 h-4 text-hbo-cyan" />
            <span>Popular Categories</span>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {popularGenres.map((genre) => (
              <button
                key={genre.id}
                onClick={() => {
                  setQuery(genre.name);
                  setSearchParams({ q: genre.name });
                }}
                className="px-4 py-2 rounded-xl bg-hbo-card hover:bg-hbo-hover border border-hbo-border text-xs sm:text-sm font-semibold text-gray-300 hover:text-white transition tv-focus-target"
              >
                {genre.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Results Grid */}
      {isLoading ? (
        <div className="py-20 flex justify-center">
          <div className="w-10 h-10 border-4 border-hbo-purple border-t-hbo-cyan rounded-full animate-spin shadow-hbo-glow" />
        </div>
      ) : results.length > 0 ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6 lg:gap-7 py-4 px-1">
            {filteredResults.map((item) => (
              <div key={item.id} className="flex justify-center">
                <MediaCard item={item} />
              </div>
            ))}
          </div>

          {isLoadingMore && (
            <div className="py-8 flex justify-center items-center gap-3">
              <div className="w-6 h-6 border-3 border-hbo-purple border-t-hbo-cyan rounded-full animate-spin shadow-hbo-glow" />
              <span className="text-xs font-semibold text-gray-400">Loading more titles...</span>
            </div>
          )}
        </div>
      ) : query ? (
        <div className="text-center py-20">
          <p className="text-base sm:text-lg text-gray-400">
            No matching titles found for &quot;<span className="text-white font-bold">{query}</span>&quot;.
          </p>
          <p className="text-xs text-gray-500 mt-2">Try searching for another keyword or franchise.</p>
        </div>
      ) : null}
    </div>
  );
};

