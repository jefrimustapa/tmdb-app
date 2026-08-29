import React, { useState, useEffect, useRef, useCallback } from 'react';
import { tmdbApi } from '../../services/tmdb';
import type { TMDBMediaItem, TMDBGenre } from '../../types/tmdb';
import { MediaCard } from '../../components/common/MediaCard';
import { PLATFORMS } from '../../components/common/PlatformHubs';
import { SortDropdown, SortOption } from '../../components/common/SortDropdown';
import { Filter, SlidersHorizontal } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useDevice } from '../../hooks/useDevice';

const MOVIE_SORT_OPTIONS: SortOption[] = [
  { value: 'popularity.desc', label: 'Most Popular' },
  { value: 'vote_average.desc&vote_count.gte=300', label: 'Highest Rated' },
  { value: 'primary_release_date.desc', label: 'Release Date (Newest)' },
  { value: 'revenue.desc', label: 'Top Box Office' }
];

export const Movies: React.FC = () => {
  const { isTV } = useDevice();
  const [searchParams, setSearchParams] = useSearchParams();
  const genreParam = searchParams.get('genre') || '';
  const providerParam = searchParams.get('provider') || '';

  const [movies, setMovies] = useState<TMDBMediaItem[]>([]);
  const [genres, setGenres] = useState<TMDBGenre[]>([]);
  const [selectedGenre, setSelectedGenre] = useState<string>(genreParam);
  const [selectedProvider, setSelectedProvider] = useState<string>(providerParam);
  const [sortBy, setSortBy] = useState('popularity.desc');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const observerTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    tmdbApi.getMovieGenres().then((res) => setGenres(res.genres || []));
  }, []);

  useEffect(() => {
    if (genreParam !== selectedGenre) setSelectedGenre(genreParam);
    if (providerParam !== selectedProvider) setSelectedProvider(providerParam);
  }, [genreParam, providerParam]);

  // Initial fetch or filter changes
  useEffect(() => {
    const fetchInitialMovies = async () => {
      setIsLoading(true);
      setPage(1);
      try {
        const platformObj = PLATFORMS.find((p) => p.id === selectedProvider);
        const combinedGenres = [selectedGenre, platformObj?.genres].filter(Boolean).join(',');

        const res = await tmdbApi.discoverMovies({
          with_genres: combinedGenres || undefined,
          with_watch_providers: platformObj?.providerId,
          watch_region: platformObj?.region || 'US',
          with_networks: platformObj?.networks,
          sort_by: sortBy,
          page: 1
        });
        setMovies(res.results || []);
        setHasMore((res.page || 1) < (res.total_pages || 1));
      } catch (err) {
        console.error('Failed to discover movies:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchInitialMovies();
  }, [selectedGenre, selectedProvider, sortBy]);

  // Load more function for infinite scroll
  const loadMoreMovies = useCallback(async () => {
    if (isLoadingMore || !hasMore || isLoading) return;
    setIsLoadingMore(true);
    const nextPage = page + 1;
    try {
      const platformObj = PLATFORMS.find((p) => p.id === selectedProvider);
      const combinedGenres = [selectedGenre, platformObj?.genres].filter(Boolean).join(',');

      const res = await tmdbApi.discoverMovies({
        with_genres: combinedGenres || undefined,
        with_watch_providers: platformObj?.providerId,
        watch_region: platformObj?.region || 'US',
        with_networks: platformObj?.networks,
        sort_by: sortBy,
        page: nextPage
      });

      if (res.results && res.results.length > 0) {
        setMovies((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const newItems = res.results.filter((m) => !existingIds.has(m.id));
          return [...prev, ...newItems];
        });
        setPage(nextPage);
        setHasMore((res.page || nextPage) < (res.total_pages || 1));
      } else {
        setHasMore(false);
      }
    } catch (err) {
      console.error('Failed to load more movies:', err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [page, hasMore, isLoadingMore, isLoading, selectedGenre, selectedProvider, sortBy]);

  // Intersection Observer for infinite scroll trigger
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading && !isLoadingMore) {
          loadMoreMovies();
        }
      },
      { threshold: 0.1, rootMargin: '400px' }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [loadMoreMovies, hasMore, isLoading, isLoadingMore]);

  const updateFilters = (newGenre: string, newProvider: string) => {
    setSelectedGenre(newGenre);
    setSelectedProvider(newProvider);

    const params: Record<string, string> = {};
    if (newGenre) params.genre = newGenre;
    if (newProvider) params.provider = newProvider;
    setSearchParams(params);
  };

  const activePlatform = PLATFORMS.find((p) => p.id === selectedProvider);

  return (
    <div className={`min-h-screen ${isTV ? 'pt-6 sm:pt-8 pb-16 px-6 lg:px-8' : 'pt-20 sm:pt-24 pb-20 px-4 sm:px-6'} max-w-7xl mx-auto`}>
      {/* Header & Filter Bar */}
      <div data-tv-filter-section="true" className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl sm:text-4xl font-extrabold font-display text-white tracking-tight flex items-center gap-2">
            <span className="w-2 h-6 bg-hbo-purple-light rounded-full"></span>
            Movies Catalog
            {activePlatform && (
              <span className="text-base sm:text-xl font-bold text-hbo-cyan ml-2">
                ({activePlatform.name})
              </span>
            )}
          </h1>
          <p className="text-xs sm:text-sm text-gray-400 mt-1">
            Over 1.1 million feature films, documentaries, and cinema releases
          </p>
        </div>

        {/* Sorting Dropdown */}
        <div className="flex items-center gap-3">
          <SortDropdown
            value={sortBy}
            onChange={(val) => setSortBy(val)}
            options={MOVIE_SORT_OPTIONS}
          />
        </div>
      </div>

      {/* Streaming Hub Filters */}
      <div data-tv-filter-section="true" className="mb-5">
        <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
          <SlidersHorizontal className="w-3.5 h-3.5 text-hbo-cyan" />
          <span>Filter by Streaming Platform Hub</span>
        </div>
        <div className="flex items-center gap-2.5 overflow-x-auto no-scrollbar py-3 px-3.5 sm:px-4 -mx-2 sm:-mx-3 scroll-pl-4 scroll-pr-4 transform-gpu">
          <button
            onClick={() => updateFilters(selectedGenre, '')}
            className={`px-4 py-2.5 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all border flex items-center gap-1.5 flex-shrink-0 tv-focus-target ${
              !selectedProvider
                ? 'bg-hbo-cyan text-black border-white shadow-[0_0_20px_rgba(0,210,255,0.7)] ring-2 ring-hbo-cyan/50 font-black'
                : 'bg-hbo-card text-gray-400 border-hbo-border hover:text-white hover:bg-hbo-hover'
            }`}
          >
            {!selectedProvider && <span className="w-2 h-2 rounded-full bg-black animate-pulse" />}
            <span>All Platforms</span>
          </button>
          {PLATFORMS.map((platform) => {
            const isSelected = selectedProvider === platform.id;
            return (
              <button
                key={platform.id}
                onClick={() => updateFilters(selectedGenre, isSelected ? '' : platform.id)}
                className={`px-4 py-2.5 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all border flex items-center gap-2 flex-shrink-0 tv-focus-target ${
                  isSelected
                    ? 'bg-hbo-cyan text-black border-white shadow-[0_0_20px_rgba(0,210,255,0.7)] ring-2 ring-hbo-cyan/50 font-black'
                    : 'bg-hbo-card text-gray-400 border-hbo-border hover:text-white hover:bg-hbo-hover'
                }`}
              >
                {isSelected && <span className="w-2 h-2 rounded-full bg-black animate-pulse" />}
                <span>{platform.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Genre Pills */}
      <div data-tv-filter-section="true" className="mb-6">
        <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
          <Filter className="w-3.5 h-3.5 text-hbo-purple-light" />
          <span>Filter by Genre</span>
        </div>
        <div className="flex items-center gap-2.5 overflow-x-auto no-scrollbar py-3 px-3.5 sm:px-4 -mx-2 sm:-mx-3 scroll-pl-4 scroll-pr-4 transform-gpu">
          <button
            onClick={() => updateFilters('', selectedProvider)}
            className={`px-4 py-2 rounded-full text-xs font-extrabold whitespace-nowrap transition-all border flex items-center gap-1.5 flex-shrink-0 tv-focus-target ${
              !selectedGenre
                ? 'bg-hbo-purple-light text-white border-white shadow-[0_0_20px_rgba(144,85,255,0.8)] ring-2 ring-hbo-purple-light/60 font-black'
                : 'bg-hbo-card text-gray-400 border-hbo-border hover:text-white hover:bg-hbo-hover'
            }`}
          >
            {!selectedGenre && <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
            <span>All Genres</span>
          </button>
          {genres.map((g) => {
            const isSelected = selectedGenre === String(g.id);
            return (
              <button
                key={g.id}
                onClick={() => updateFilters(isSelected ? '' : String(g.id), selectedProvider)}
                className={`px-4 py-2 rounded-full text-xs font-extrabold whitespace-nowrap transition-all border flex items-center gap-1.5 flex-shrink-0 tv-focus-target ${
                  isSelected
                    ? 'bg-hbo-purple-light text-white border-white shadow-[0_0_20px_rgba(144,85,255,0.8)] ring-2 ring-hbo-purple-light/60 font-black'
                    : 'bg-hbo-card text-gray-400 border-hbo-border hover:text-white hover:bg-hbo-hover'
                }`}
              >
                {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
                <span>{g.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid of Movie Cards */}
      {isLoading ? (
        <div className="py-20 flex justify-center">
          <div className="w-12 h-12 border-4 border-hbo-purple border-t-hbo-cyan rounded-full animate-spin shadow-hbo-glow" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5 sm:gap-5 lg:gap-6 py-2 px-1">
            {movies.map((movie) => (
              <div key={movie.id} className="flex justify-center">
                <MediaCard item={movie} type="movie" />
              </div>
            ))}
          </div>

          {/* Infinite Scroll Sentinel / Loading Indicator */}
          <div ref={observerTarget} className="py-10 flex justify-center items-center">
            {isLoadingMore && (
              <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-hbo-card/80 border border-hbo-border">
                <div className="w-5 h-5 border-2 border-hbo-cyan border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-semibold text-gray-300">Loading more movies...</span>
              </div>
            )}
            {!hasMore && movies.length > 0 && (
              <p className="text-xs text-gray-500 font-medium tracking-wide">
                You've reached the end of the catalog
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
};

