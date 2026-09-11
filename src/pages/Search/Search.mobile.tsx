import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search as SearchIcon, X, Clock, Trash2 } from 'lucide-react';
import { tmdbApi, ANIME_GENRE_ID, UNIFIED_GENRES, COUNTRY_TO_LANGUAGES } from '../../services/tmdb';
import type { TMDBMediaItem, TMDBGenre } from '../../types/tmdb';
import { MediaCard } from '../../components/common/MediaCard';
import { SearchFilterBar, type SearchTargetType, type SearchMediaType } from '../../components/common/SearchFilterBar';
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
  const [results, setResults] = useState<TMDBMediaItem[]>([]);
  const [genres, setGenres] = useState<TMDBGenre[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  // Filter Bar State
  const [selectedMediaType, setSelectedMediaType] = useState<SearchMediaType>('all');
  const [selectedCountry, setSelectedCountry] = useState<string>('');
  const [selectedType, setSelectedType] = useState<SearchTargetType>('title');
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

  const performSearch = async (searchTerm: string, pageNum = 1, append = false, targetType: SearchTargetType = selectedType) => {
    const trimmed = searchTerm.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }

    if (pageNum === 1) {
      setIsLoading(true);
    } else {
      setIsLoadingMore(true);
    }

    try {
      if (targetType === 'cast') {
        const personRes = await tmdbApi.searchPerson(trimmed, pageNum);
        const people = personRes.results || [];
        if (people.length === 0) {
          if (!append) setResults([]);
          setTotalPages(1);
          return;
        }

        const topPeople = people.slice(0, 2);
        const creditsResults = await Promise.all(
          topPeople.map((p) => tmdbApi.getPersonCredits(p.id).catch(() => null))
        );

        const allCredits: TMDBMediaItem[] = [];
        for (const c of creditsResults) {
          if (c) {
            if (c.cast) {
              allCredits.push(...c.cast.map((item) => ({ ...item, media_type: item.media_type || (item.title ? 'movie' : 'tv') })));
            }
            if (c.crew) {
              allCredits.push(...c.crew.map((item) => ({ ...item, media_type: item.media_type || (item.title ? 'movie' : 'tv') })));
            }
          }
        }
        const sorted = allCredits.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
        const unique = Array.from(new Map(sorted.map((item) => [item.id, item])).values());
        setTotalPages(1);
        setResults((prev) => {
          if (!append) return unique;
          const existingIds = new Set(prev.map((i) => i.id));
          const newItems = unique.filter((i) => !existingIds.has(i.id));
          return [...prev, ...newItems];
        });
      } else if (targetType === 'keyword') {
        const kwRes = await tmdbApi.searchKeywords(trimmed, 1);
        const keywords = kwRes.results || [];
        if (keywords.length === 0) {
          if (!append) setResults([]);
          setTotalPages(1);
          return;
        }

        const keywordIds = keywords.slice(0, 3).map((k) => k.id).join('|');
        const [movieKwRes, tvKwRes] = await Promise.allSettled([
          tmdbApi.discoverMovies({ with_keywords: keywordIds, page: pageNum, sort_by: 'popularity.desc' }),
          tmdbApi.discoverTV({ with_keywords: keywordIds, page: pageNum, sort_by: 'popularity.desc' })
        ]);

        const kwItems: TMDBMediaItem[] = [];
        if (movieKwRes.status === 'fulfilled' && movieKwRes.value.results) {
          kwItems.push(...movieKwRes.value.results.map((m) => ({ ...m, media_type: 'movie' as const })));
        }
        if (tvKwRes.status === 'fulfilled' && tvKwRes.value.results) {
          kwItems.push(...tvKwRes.value.results.map((t) => ({ ...t, media_type: 'tv' as const })));
        }

        const sorted = kwItems.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
        const unique = Array.from(new Map(sorted.map((item) => [item.id, item])).values());
        const maxPages = Math.max(
          movieKwRes.status === 'fulfilled' ? movieKwRes.value.total_pages || 1 : 1,
          tvKwRes.status === 'fulfilled' ? tvKwRes.value.total_pages || 1 : 1
        );
        setTotalPages(maxPages);
        setResults((prev) => {
          if (!append) return unique;
          const existingIds = new Set(prev.map((i) => i.id));
          const newItems = unique.filter((i) => !existingIds.has(i.id));
          return [...prev, ...newItems];
        });
      } else {
        // targetType === 'title'
        const multiRes = await tmdbApi.searchMulti(trimmed, pageNum);
        const rawResults = multiRes.results || [];
        const titleResults: TMDBMediaItem[] = [];

        for (const item of rawResults) {
          if (item.media_type === 'movie' || item.media_type === 'tv') {
            titleResults.push({
              ...item,
              media_type: item.media_type || (item.title ? 'movie' : 'tv')
            });
          }
        }

        setTotalPages(multiRes.total_pages || 1);
        setResults((prev) => {
          if (!append) return titleResults;
          const existingIds = new Set(prev.map((i) => i.id));
          const newItems = titleResults.filter((i) => !existingIds.has(i.id));
          return [...prev, ...newItems];
        });
      }
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  // Handle URL changes
  useEffect(() => {
    if (personIdParam) {
      const pId = parseInt(personIdParam, 10);
      if (!isNaN(pId)) {
        const name = personNameParam || 'Cast';
        setQuery(name);
        setSelectedType('cast');
        setPage(1);
        performSearch(name, 1, false, 'cast');
        return;
      }
    }

    if (queryParam) {
      setQuery(queryParam);
      setPage(1);
      performSearch(queryParam, 1, false, selectedType);
    } else {
      setResults([]);
      setPage(1);
      setTotalPages(1);
      setRecentSearches(getRecentSearches());
    }
  }, [queryParam, personIdParam, personNameParam]);

  // Infinite scroll trigger on window scroll near bottom
  useEffect(() => {
    const handleScroll = () => {
      if (selectedType === 'cast' || isLoading || isLoadingMore) return;
      if (page >= totalPages) return;

      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const scrollHeight = document.documentElement.scrollHeight;
      const clientHeight = window.innerHeight || document.documentElement.clientHeight;

      if (scrollTop + clientHeight >= scrollHeight - 600) {
        const nextPage = page + 1;
        setPage(nextPage);
        performSearch(query, nextPage, true, selectedType);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [page, totalPages, query, isLoading, isLoadingMore, selectedType]);

  const historyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (historyTimerRef.current) {
        clearTimeout(historyTimerRef.current);
      }
    };
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setSearchParams(val ? { q: val } : {});

    if (historyTimerRef.current) {
      clearTimeout(historyTimerRef.current);
    }

    const trimmed = val.trim();
    if (trimmed) {
      historyTimerRef.current = setTimeout(() => {
        const updated = addRecentSearch(trimmed);
        setRecentSearches(updated);
      }, 800);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (historyTimerRef.current) {
        clearTimeout(historyTimerRef.current);
      }
      const trimmed = query.trim();
      if (trimmed) {
        const updated = addRecentSearch(trimmed);
        setRecentSearches(updated);
      }
    }
  };

  const handleClear = () => {
    if (historyTimerRef.current) {
      clearTimeout(historyTimerRef.current);
    }
    setQuery('');
    setResults([]);
    setSearchParams({});
    setRecentSearches(getRecentSearches());
  };

  const handleSelectRecent = (historyQuery: string) => {
    if (historyTimerRef.current) {
      clearTimeout(historyTimerRef.current);
    }
    const trimmed = historyQuery.trim();
    setQuery(trimmed);
    setSearchParams({ q: trimmed });
    const updated = addRecentSearch(trimmed);
    setRecentSearches(updated);
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

  const handleSelectType = (newType: SearchTargetType) => {
    setSelectedType(newType);
    setPage(1);
    if (query.trim()) {
      performSearch(query.trim(), 1, false, newType);
    }
  };

  const handleResetFilters = () => {
    const hadCustomType = selectedType !== 'title';
    setSelectedMediaType('all');
    setSelectedCountry('');
    setSelectedType('title');
    setSelectedGenres([]);
    setSelectedYear('');
    setSelectedRating('');
    setSortBy('relevance');
    if (hadCustomType && query.trim()) {
      performSearch(query.trim(), 1, false, 'title');
    }
  };

  // Filtered & Sorted Search Results
  const filteredAndSortedResults = useMemo(() => {
    let list = [...results];

    // 1. Title Type Filter ('all' | 'movie' | 'tv')
    if (selectedMediaType !== 'all') {
      list = list.filter((item) => {
        const isMovie = item.media_type === 'movie' || Boolean(item.title && !item.name);
        const isTV = item.media_type === 'tv' || Boolean(item.name && !item.title);
        return selectedMediaType === 'movie' ? isMovie : isTV;
      });
    }

    // 2. Country Filter
    if (selectedCountry) {
      list = list.filter((item) => {
        const originCountries: string[] = (item as any).origin_country || [];
        if (originCountries.includes(selectedCountry)) return true;
        const langs = COUNTRY_TO_LANGUAGES[selectedCountry];
        if (langs && item.original_language && langs.includes(item.original_language)) {
          if (originCountries.length > 0) {
            return originCountries.includes(selectedCountry);
          }
          return true;
        }
        return false;
      });
    }

    // 3. Unified Genre Filter (match if item has any selected unified genre)
    if (selectedGenres.length > 0) {
      list = list.filter((item) => {
        const isMovie = item.media_type === 'movie' || Boolean(item.title && !item.name);
        return selectedGenres.some((gId) => {
          const u = UNIFIED_GENRES.find((ug) => String(ug.id) === gId);
          if (u) {
            if (u.id === ANIME_GENRE_ID) {
              return (
                (item.genre_ids?.includes(16) && (item.original_language === 'ja' || (item as any).origin_country?.includes('JP'))) ||
                item.genre_ids?.includes(ANIME_GENRE_ID)
              );
            }
            if (isMovie) {
              return u.movieGenreId ? item.genre_ids?.includes(u.movieGenreId) : false;
            } else {
              if (u.id === 27) {
                // TV Horror mapping: mystery (9648) or horror (27)
                return item.genre_ids?.includes(9648) || item.genre_ids?.includes(27);
              }
              if (u.id === 10749) {
                // TV Romance mapping: check 10749, or drama/comedy/soap + romance keywords in title/overview
                if (item.genre_ids?.includes(10749)) return true;
                const text = `${item.name || ''} ${item.overview || ''}`.toLowerCase();
                const hasRomanceText = /\b(romance|romantic|love|romcom|relationship|dating|crush|couple)\b/i.test(text);
                const hasEligibleGenre = item.genre_ids?.some((g: number) => [18, 35, 10766, 10764, 16, 10765].includes(g));
                return Boolean(hasRomanceText && hasEligibleGenre);
              }
              return u.tvGenreId ? item.genre_ids?.includes(u.tvGenreId) : false;
            }
          }
          const numId = Number(gId);
          return item.genre_ids?.includes(numId);
        });
      });
    }

    // 4. Year / Era Filter
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

    // 5. Rating Filter
    if (selectedRating) {
      const minVote = parseFloat(selectedRating);
      if (!isNaN(minVote)) {
        list = list.filter((item) => (item.vote_average || 0) >= minVote);
      }
    }

    // 6. Sort By
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
          if (!dateA) return 1;
          if (!dateB) return -1;
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
  }, [results, selectedMediaType, selectedCountry, selectedGenres, selectedYear, selectedRating, sortBy]);

  return (
    <div className="min-h-screen pt-24 pb-16 px-4 sm:px-8 max-w-7xl mx-auto">
      {/* Search Header Input */}
      <div className="relative max-w-3xl mx-auto mb-4">
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
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

      </div>

      {/* Search Filter Bar: Rendered ONLY when results exist */}
      {results.length > 0 && (
        <SearchFilterBar
          genres={genres}
          selectedType={selectedType}
          onSelectType={handleSelectType}
          selectedMediaType={selectedMediaType}
          onSelectMediaType={setSelectedMediaType}
          selectedCountry={selectedCountry}
          onSelectCountry={setSelectedCountry}
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
