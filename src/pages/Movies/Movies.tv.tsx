import React, { useState, useEffect, useRef, useCallback } from 'react';
import { tmdbApi } from '../../services/tmdb';
import type { TMDBMediaItem, TMDBGenre } from '../../types/tmdb';
import { MediaCard } from '../../components/common/MediaCard';
import { PLATFORMS } from '../../components/common/PlatformHubs';
import { MovieFilterBar, MOVIE_SORT_OPTIONS } from '../../components/common/MovieFilterBar';
import { useSearchParams } from 'react-router-dom';
import { useDevice } from '../../hooks/useDevice';

export const Movies: React.FC = () => {
  const { isTV } = useDevice();
  const [searchParams, setSearchParams] = useSearchParams();
  const genreParam = searchParams.get('genre') || '';
  const providerParam = searchParams.get('provider') || '';
  const yearParam = searchParams.get('year') || '';
  const ratingParam = searchParams.get('rating') || '';
  const sortParam = searchParams.get('sort') || 'popularity.desc';

  const [movies, setMovies] = useState<TMDBMediaItem[]>([]);
  const [genres, setGenres] = useState<TMDBGenre[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<string[]>(
    genreParam ? genreParam.split(',').filter(Boolean) : []
  );
  const [selectedProvider, setSelectedProvider] = useState<string>(providerParam);
  const [selectedYear, setSelectedYear] = useState<string>(yearParam);
  const [selectedRating, setSelectedRating] = useState<string>(ratingParam);
  const [sortBy, setSortBy] = useState<string>(sortParam);

  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const observerTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    tmdbApi.getMovieGenres().then((res) => setGenres(res.genres || []));
  }, []);

  useEffect(() => {
    const currentGenresStr = selectedGenres.join(',');
    if (genreParam !== currentGenresStr) {
      setSelectedGenres(genreParam ? genreParam.split(',').filter(Boolean) : []);
    }
    if (providerParam !== selectedProvider) setSelectedProvider(providerParam);
    if (yearParam !== selectedYear) setSelectedYear(yearParam);
    if (ratingParam !== selectedRating) setSelectedRating(ratingParam);
    if (sortParam !== sortBy) setSortBy(sortParam);
  }, [genreParam, providerParam, yearParam, ratingParam, sortParam]);

  const updateUrlParams = (
    genresList: string[],
    provider: string,
    year: string,
    rating: string,
    sort: string
  ) => {
    const params: Record<string, string> = {};
    if (genresList.length > 0) params.genre = genresList.join(',');
    if (provider) params.provider = provider;
    if (year) params.year = year;
    if (rating) params.rating = rating;
    if (sort && sort !== 'popularity.desc') params.sort = sort;
    setSearchParams(params);
  };

  const buildDiscoverParams = useCallback((pNum: number) => {
    const platformObj = PLATFORMS.find((p) => p.id === selectedProvider);
    const combinedGenres = [selectedGenres.join(','), platformObj?.genres].filter(Boolean).join(',');

    const params: Record<string, any> = {
      with_genres: combinedGenres || undefined,
      with_watch_providers: platformObj?.providerId,
      watch_region: platformObj?.region || 'US',
      with_networks: platformObj?.networks,
      sort_by: sortBy,
      page: pNum
    };

    if (selectedYear) {
      if (selectedYear === '2010s') {
        params['primary_release_date.gte'] = '2010-01-01';
        params['primary_release_date.lte'] = '2019-12-31';
      } else if (selectedYear === '2000s') {
        params['primary_release_date.gte'] = '2000-01-01';
        params['primary_release_date.lte'] = '2009-12-31';
      } else if (selectedYear === '1990s') {
        params['primary_release_date.gte'] = '1990-01-01';
        params['primary_release_date.lte'] = '1999-12-31';
      } else if (selectedYear === '1980s') {
        params['primary_release_date.gte'] = '1980-01-01';
        params['primary_release_date.lte'] = '1989-12-31';
      } else if (selectedYear === 'classics') {
        params['primary_release_date.lte'] = '1979-12-31';
      } else {
        params['primary_release_year'] = selectedYear;
      }
    }

    if (selectedRating) {
      params['vote_average.gte'] = selectedRating;
      params['vote_count.gte'] = 100;
    }

    return params;
  }, [selectedGenres, selectedProvider, selectedYear, selectedRating, sortBy]);

  // Initial fetch or filter changes
  useEffect(() => {
    const fetchInitialMovies = async () => {
      setIsLoading(true);
      setPage(1);
      try {
        const params = buildDiscoverParams(1);
        const res = await tmdbApi.discoverMovies(params);
        setMovies(res.results || []);
        setHasMore((res.page || 1) < (res.total_pages || 1));
      } catch (err) {
        console.error('Failed to discover movies:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchInitialMovies();
  }, [buildDiscoverParams]);

  // Load more function for infinite scroll
  const loadMoreMovies = useCallback(async () => {
    if (isLoadingMore || !hasMore || isLoading) return;
    setIsLoadingMore(true);
    const nextPage = page + 1;
    try {
      const params = buildDiscoverParams(nextPage);
      const res = await tmdbApi.discoverMovies(params);

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
  }, [page, hasMore, isLoadingMore, isLoading, buildDiscoverParams]);

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

  const handleResetFilters = () => {
    setSelectedGenres([]);
    setSelectedProvider('');
    setSelectedYear('');
    setSelectedRating('');
    setSortBy('popularity.desc');
    setSearchParams({});
  };

  const activePlatform = PLATFORMS.find((p) => p.id === selectedProvider);

  return (
    <div className={`min-h-screen ${isTV ? 'pt-6 sm:pt-8 pb-16 px-6 lg:px-8' : 'pt-20 sm:pt-24 pb-20 px-4 sm:px-6'} w-full max-w-full`}>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-3">
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
      </div>

      {/* Sticky Freezing MovieFilterBar */}
      <MovieFilterBar
        genres={genres}
        selectedGenres={selectedGenres}
        onSelectGenres={(g) => {
          setSelectedGenres(g);
          updateUrlParams(g, selectedProvider, selectedYear, selectedRating, sortBy);
        }}
        selectedProvider={selectedProvider}
        onSelectProvider={(p) => {
          setSelectedProvider(p);
          updateUrlParams(selectedGenres, p, selectedYear, selectedRating, sortBy);
        }}
        selectedYear={selectedYear}
        onSelectYear={(y) => {
          setSelectedYear(y);
          updateUrlParams(selectedGenres, selectedProvider, y, selectedRating, sortBy);
        }}
        selectedRating={selectedRating}
        onSelectRating={(r) => {
          setSelectedRating(r);
          updateUrlParams(selectedGenres, selectedProvider, selectedYear, r, sortBy);
        }}
        sortBy={sortBy}
        onSelectSort={(s) => {
          setSortBy(s);
          updateUrlParams(selectedGenres, selectedProvider, selectedYear, selectedRating, s);
        }}
        onResetFilters={handleResetFilters}
        isTV={isTV}
      />

      {/* Grid of Movie Cards */}
      {isLoading ? (
        <div className="py-20 flex justify-center">
          <div className="w-12 h-12 border-4 border-hbo-purple border-t-hbo-cyan rounded-full animate-spin shadow-hbo-glow" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-5 gap-3.5 sm:gap-4 py-2 px-1">
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

