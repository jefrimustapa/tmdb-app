import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search as SearchIcon, X, Clock, Trash2, User } from 'lucide-react';
import { tmdbApi, tmdbImages } from '../../services/tmdb';
import type { TMDBMediaItem, TMDBGenre } from '../../types/tmdb';
import { MediaCard } from '../../components/common/MediaCard';
import { SearchFilterBar } from '../../components/common/SearchFilterBar';
import {
  getRecentSearches,
  addRecentSearch,
  removeRecentSearch,
  clearRecentSearches
} from '../../services/searchHistoryService';

export const Search: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryParam = searchParams.get('q') || '';
  const personIdParam = searchParams.get('personId');
  const personNameParam = searchParams.get('personName') || '';

  const [query, setQuery] = useState(queryParam);
  const [personInfo, setPersonInfo] = useState<{ id: number; name: string; profile_path: string | null; department?: string } | null>(null);
  const [results, setResults] = useState<TMDBMediaItem[]>([]);
  const [genres, setGenres] = useState<TMDBGenre[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  // Filter Bar State
  const [selectedType, setSelectedType] = useState<'all' | 'movie' | 'tv'>('all');
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedRating, setSelectedRating] = useState('');
  const [sortBy, setSortBy] = useState('relevance');

  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Load genres and recent searches
  useEffect(() => {
    Promise.allSettled([tmdbApi.getMovieGenres(), tmdbApi.getTVGenres()]).then(([mRes, tvRes]) => {
      const gMap = new Map<number, TMDBGenre>();
      if (mRes.status === 'fulfilled' && mRes.value.genres) {
        mRes.value.genres.forEach((g) => gMap.set(g.id, g));
      }
      if (tvRes.status === 'fulfilled' && tvRes.value.genres) {
        tvRes.value.genres.forEach((g) => {
          if (!gMap.has(g.id)) gMap.set(g.id, g);
        });
      }
      setGenres(Array.from(gMap.values()).sort((a, b) => a.name.localeCompare(b.name)));
    });
    setRecentSearches(getRecentSearches());
  }, []);

  // Handle URL changes
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
      setRecentSearches(getRecentSearches());
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
        const crewItems = (creditsRes.value.crew || []).map((item) => ({
          ...item,
          media_type: item.media_type || (item.title ? 'movie' : 'tv')
        }));
        const combined = [...castItems, ...crewItems];
        const sorted = combined.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
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
    const trimmed = searchTerm.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }

    if (pageNum === 1) {
      setIsLoading(true);
      const updated = addRecentSearch(trimmed);
      setRecentSearches(updated);
    } else {
      setIsLoadingMore(true);
    }

    try {
      const multiRes = await tmdbApi.searchMulti(trimmed, pageNum);
      const rawResults = multiRes.results || [];

      // Check for person (actor/director) on page 1
      if (pageNum === 1 && !personInfo) {
        const personMatch = rawResults.find((item: any) => item.media_type === 'person');
        if (personMatch) {
          const p = personMatch as any;
          setPersonInfo({
            id: p.id,
            name: p.name,
            profile_path: p.profile_path,
            department: p.known_for_department
          });

          // Fetch full filmography
          const creditsRes = await tmdbApi.getPersonCredits(p.id).catch(() => null);
          if (creditsRes) {
            const castItems = (creditsRes.cast || []).map((item) => ({
              ...item,
              media_type: item.media_type || (item.title ? 'movie' : 'tv')
            }));
            const crewItems = (creditsRes.crew || []).map((item) => ({
              ...item,
              media_type: item.media_type || (item.title ? 'movie' : 'tv')
            }));
            const combined = [...castItems, ...crewItems];
            const sorted = combined.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
            const unique = Array.from(new Map(sorted.map((item) => [item.id, item])).values());
            setResults(unique);
            setTotalPages(1);
            setIsLoading(false);
            return;
          }
        }
      }

      // Filter titles (movie/tv)
      let titleResults = rawResults.filter(
        (item) => item.media_type === 'movie' || item.media_type === 'tv'
      );

      // Smart Keyword Discovery on page 1 if multi results are low (< 8)
      if (pageNum === 1 && titleResults.length < 8) {
        try {
          const kwRes = await tmdbApi.searchKeywords(trimmed, 1);
          if (kwRes.results && kwRes.results.length > 0) {
            const topKw = kwRes.results[0];
            const [movieKwRes, tvKwRes] = await Promise.allSettled([
              tmdbApi.discoverMovies({ with_keywords: String(topKw.id), sort_by: 'popularity.desc' }),
              tmdbApi.discoverTV({ with_keywords: String(topKw.id), sort_by: 'popularity.desc' })
            ]);

            const kwItems: TMDBMediaItem[] = [];
            if (movieKwRes.status === 'fulfilled' && movieKwRes.value.results) {
              kwItems.push(...movieKwRes.value.results.map((m) => ({ ...m, media_type: 'movie' as const })));
            }
            if (tvKwRes.status === 'fulfilled' && tvKwRes.value.results) {
              kwItems.push(...tvKwRes.value.results.map((t) => ({ ...t, media_type: 'tv' as const })));
            }

            const existingMap = new Map(titleResults.map((i) => [i.id, i]));
            for (const item of kwItems) {
              if (!existingMap.has(item.id)) {
                existingMap.set(item.id, item);
              }
            }
            titleResults = Array.from(existingMap.values());
          }
        } catch (kwErr) {
          console.warn('Keyword discovery skipped:', kwErr);
        }
      }

      setTotalPages(multiRes.total_pages || 1);
      setResults((prev) => {
        if (!append) return titleResults;
        const existingIds = new Set(prev.map((i) => i.id));
        const newItems = titleResults.filter((i) => !existingIds.has(i.id));
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setPersonInfo(null);
    setSearchParams(val ? { q: val } : {});
  };

  const handleClear = () => {
    setQuery('');
    setPersonInfo(null);
    setResults([]);
    setSearchParams({});
    setRecentSearches(getRecentSearches());
  };

  const handleSelectRecent = (historyQuery: string) => {
    setQuery(historyQuery);
    setPersonInfo(null);
    setSearchParams({ q: historyQuery });
  };

  const handleRemoveRecent = (e: React.MouseEvent, item: string) => {
    e.stopPropagation();
    const updated = removeRecentSearch(item);
    setRecentSearches(updated);
  };

  const handleClearAllRecent = (e: React.MouseEvent) => {
    e.stopPropagation();
    clearRecentSearches();
    setRecentSearches([]);
  };

  const handleResetFilters = () => {
    setSelectedType('all');
    setSelectedGenres([]);
    setSelectedYear('');
    setSelectedRating('');
    setSortBy('relevance');
  };

  // Filtered & Sorted Search Results
  const filteredAndSortedResults = useMemo(() => {
    let list = [...results];

    // 1. Type Filter
    if (selectedType !== 'all') {
      list = list.filter((item) => item.media_type === selectedType);
    }

    // 2. Genre Filter (match if item has any selected genre)
    if (selectedGenres.length > 0) {
      list = list.filter((item) => {
        const itemGenres = item.genre_ids ? item.genre_ids.map(String) : [];
        return selectedGenres.some((gId) => itemGenres.includes(gId));
      });
    }

    // 3. Year / Era Filter
    if (selectedYear) {
      list = list.filter((item) => {
        const dateStr = item.release_date || item.first_air_date || '';
        if (!dateStr) return false;
        const year = parseInt(dateStr.slice(0, 4), 10);
        if (isNaN(year)) return false;

        switch (selectedYear) {
          case '2010s': return year >= 2010 && year <= 2019;
          case '2000s': return year >= 2000 && year <= 2009;
          case '1990s': return year >= 1990 && year <= 1999;
          case '1980s': return year >= 1980 && year <= 1989;
          case 'classics': return year < 1980;
          default: {
            const exactYear = parseInt(selectedYear, 10);
            return !isNaN(exactYear) ? year === exactYear : true;
          }
        }
      });
    }

    // 4. Rating Filter
    if (selectedRating) {
      const minVote = parseFloat(selectedRating);
      if (!isNaN(minVote)) {
        list = list.filter((item) => (item.vote_average || 0) >= minVote);
      }
    }

    // 5. Sort By
    list.sort((a, b) => {
      switch (sortBy) {
        case 'vote_average.desc':
          return (b.vote_average || 0) - (a.vote_average || 0);
        case 'release_date.desc': {
          const dateA = a.release_date || a.first_air_date || '';
          const dateB = b.release_date || b.first_air_date || '';
          return dateB.localeCompare(dateA);
        }
        case 'release_date.asc': {
          const dateA = a.release_date || a.first_air_date || '';
          const dateB = b.release_date || b.first_air_date || '';
          return dateA.localeCompare(dateB);
        }
        case 'vote_count.desc':
          return (b.vote_count || 0) - (a.vote_count || 0);
        case 'relevance':
        default:
          return (b.popularity || 0) - (a.popularity || 0);
      }
    });

    return list;
  }, [results, selectedType, selectedGenres, selectedYear, selectedRating, sortBy]);

  return (
    <div className="min-h-screen pt-24 pb-16 px-4 sm:px-8 max-w-7xl mx-auto">
      {/* Search Header Input */}
      <div className="relative max-w-3xl mx-auto mb-4">
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

        {/* 1-Row Recent Searches History Strip (Only shown when query is empty) */}
        {!query && recentSearches.length > 0 && (
          <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar pt-3 pb-1 px-1 flex-nowrap scroll-pl-2 scroll-pr-2">
            <span className="flex items-center gap-1 text-[10px] font-black tracking-wider uppercase text-gray-400 flex-shrink-0 mr-0.5">
              <Clock className="w-3 h-3 text-hbo-cyan" />
              Recent:
            </span>
            {recentSearches.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => handleSelectRecent(item)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-hbo-cyan/15 text-hbo-cyan border border-hbo-cyan/30 hover:bg-hbo-cyan/25 transition flex-shrink-0 cursor-pointer tv-focus-target group"
              >
                <span>{item}</span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => handleRemoveRecent(e, item)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleRemoveRecent(e as any, item);
                    }
                  }}
                  className="p-0.5 rounded-full hover:bg-hbo-cyan/30 text-hbo-cyan/70 hover:text-white transition"
                  title="Remove from history"
                >
                  <X className="w-3 h-3" />
                </span>
              </button>
            ))}
            <button
              type="button"
              onClick={handleClearAllRecent}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/30 transition flex-shrink-0 cursor-pointer tv-focus-target"
              title="Clear all recent searches"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear</span>
            </button>
          </div>
        )}

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
      </div>

      {/* Search Filter Bar: Rendered ONLY when results exist */}
      {results.length > 0 && (
        <SearchFilterBar
          genres={genres}
          selectedType={selectedType}
          onSelectType={setSelectedType}
          selectedGenres={selectedGenres}
          onSelectGenres={setSelectedGenres}
          selectedYear={selectedYear}
          onSelectYear={setSelectedYear}
          selectedRating={selectedRating}
          onSelectRating={setSelectedRating}
          sortBy={sortBy}
          onSelectSort={setSortBy}
          onResetFilters={handleResetFilters}
          isTV={false}
        />
      )}

      {/* Results Grid */}
      {isLoading ? (
        <div className="py-20 flex justify-center">
          <div className="w-10 h-10 border-4 border-hbo-purple border-t-hbo-cyan rounded-full animate-spin shadow-hbo-glow" />
        </div>
      ) : results.length > 0 ? (
        <div className="space-y-6">
          {filteredAndSortedResults.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6 lg:gap-7 py-4 px-1">
              {filteredAndSortedResults.map((item) => (
                <div key={`${item.media_type || 'item'}-${item.id}`} className="flex justify-center">
                  <MediaCard item={item} />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16">
              <p className="text-base sm:text-lg text-gray-400">
                No matching titles found for the selected filter combination.
              </p>
              <button
                type="button"
                onClick={handleResetFilters}
                className="mt-4 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold text-rose-400 bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 transition cursor-pointer"
              >
                Reset All Filters
              </button>
            </div>
          )}

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
          <p className="text-xs text-gray-500 mt-2">Try searching for another title, actor, director, or keyword.</p>
        </div>
      ) : null}
    </div>
  );
};
