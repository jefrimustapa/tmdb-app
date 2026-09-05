import React, { useState, useRef, useEffect } from 'react';
import {
  SlidersHorizontal,
  Filter,
  Calendar,
  Star,
  Check,
  ChevronDown,
  RotateCcw,
  X,
  ArrowUpDown
} from 'lucide-react';
import type { TMDBGenre } from '../../types/tmdb';
import { PLATFORMS } from './PlatformHubs';
import type { SortOption } from './SortDropdown';

export const TV_SORT_OPTIONS: SortOption[] = [
  { value: 'popularity.desc', label: 'Most Popular' },
  { value: 'vote_average.desc&vote_count.gte=150', label: 'Highest Rated' },
  { value: 'first_air_date.desc', label: 'First Air Date (Newest)' },
  { value: 'first_air_date.asc&vote_count.gte=50', label: 'First Air Date (Oldest)' },
  { value: 'vote_count.desc', label: 'Most Voted' }
];

export const TV_YEAR_OPTIONS = [
  { label: 'All Years', value: '' },
  { label: '2026', value: '2026' },
  { label: '2025', value: '2025' },
  { label: '2024', value: '2024' },
  { label: '2023', value: '2023' },
  { label: '2022', value: '2022' },
  { label: '2021', value: '2021' },
  { label: '2020', value: '2020' },
  { label: '2010s (2010-2019)', value: '2010s' },
  { label: '2000s (2000-2009)', value: '2000s' },
  { label: '1990s (1990-1999)', value: '1990s' },
  { label: '1980s (1980-1989)', value: '1980s' },
  { label: 'Classics (<1980)', value: 'classics' }
];

export const TV_RATING_OPTIONS = [
  { label: 'All Ratings', value: '' },
  { label: '⭐ 8.0+ Masterpieces', value: '8' },
  { label: '⭐ 7.0+ Great', value: '7' },
  { label: '⭐ 6.0+ Good', value: '6' }
];

interface SeriesFilterBarProps {
  genres: TMDBGenre[];
  selectedGenres: string[];
  onSelectGenres: (genres: string[]) => void;
  selectedProvider: string;
  onSelectProvider: (provider: string) => void;
  selectedYear: string;
  onSelectYear: (year: string) => void;
  selectedRating: string;
  onSelectRating: (rating: string) => void;
  sortBy: string;
  onSelectSort: (sort: string) => void;
  onResetFilters: () => void;
  isTV?: boolean;
}

export const SeriesFilterBar: React.FC<SeriesFilterBarProps> = ({
  genres,
  selectedGenres,
  onSelectGenres,
  selectedProvider,
  onSelectProvider,
  selectedYear,
  onSelectYear,
  selectedRating,
  onSelectRating,
  sortBy,
  onSelectSort,
  onResetFilters,
  isTV = false
}) => {
  const [openDropdown, setOpenDropdown] = useState<'platform' | 'genre' | 'year' | 'rating' | 'sort' | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const chipsScrollRef = useRef<HTMLDivElement>(null);

  // Button refs for anchoring the popover
  const sortBtnRef = useRef<HTMLButtonElement>(null);
  const platformBtnRef = useRef<HTMLButtonElement>(null);
  const genreBtnRef = useRef<HTMLButtonElement>(null);
  const yearBtnRef = useRef<HTMLButtonElement>(null);
  const ratingBtnRef = useRef<HTMLButtonElement>(null);

  const [popoverLeft, setPopoverLeft] = useState<number | null>(null);
  const [popoverRight, setPopoverRight] = useState<number | null>(null);
  const [isFrozen, setIsFrozen] = useState(false);

  const activePlatform = PLATFORMS.find((p) => p.id === selectedProvider);
  const selectedYearObj = TV_YEAR_OPTIONS.find((y) => y.value === selectedYear);
  const selectedRatingObj = TV_RATING_OPTIONS.find((r) => r.value === selectedRating);
  const selectedSortObj = TV_SORT_OPTIONS.find((s) => s.value === sortBy) || TV_SORT_OPTIONS[0];

  const hasActiveFilters = Boolean(
    selectedProvider ||
    selectedGenres.length > 0 ||
    selectedYear ||
    selectedRating
  );

  const toggleDropdown = (
    type: 'platform' | 'genre' | 'year' | 'rating' | 'sort',
    btnRef: React.RefObject<HTMLButtonElement | null>
  ) => {
    if (openDropdown === type) {
      setOpenDropdown(null);
      return;
    }

    if (btnRef.current && containerRef.current) {
      const btnRect = btnRef.current.getBoundingClientRect();
      const containerRect = containerRef.current.getBoundingClientRect();

      // Desired popover width estimate (typically 260px - 320px)
      const popoverWidth = type === 'genre' ? 320 : 256;
      const margin = 16;

      // Center the popover under the button if possible, or align to its left
      const btnCenter = btnRect.left + btnRect.width / 2;
      let targetLeft = btnCenter - popoverWidth / 2 - containerRect.left;

      // Clamp targetLeft so it doesn't go off the left or right edges of container
      const maxLeft = containerRect.width - popoverWidth - margin;
      if (targetLeft > maxLeft) {
        targetLeft = maxLeft;
      }
      if (targetLeft < margin) {
        targetLeft = margin;
      }

      setPopoverLeft(Math.round(targetLeft));
      setPopoverRight(null);
    } else {
      setPopoverLeft(16);
      setPopoverRight(null);
    }

    setOpenDropdown(type);
  };

  // Recalculate popover position if user scrolls chips or window resizes
  useEffect(() => {
    const handleClose = () => {
      if (openDropdown) setOpenDropdown(null);
    };
    const scrollEl = chipsScrollRef.current;
    if (scrollEl) {
      scrollEl.addEventListener('scroll', handleClose, { passive: true });
    }
    window.addEventListener('resize', handleClose);
    return () => {
      if (scrollEl) scrollEl.removeEventListener('scroll', handleClose);
      window.removeEventListener('resize', handleClose);
    };
  }, [openDropdown]);

  // Freeze listener identical to Settings & Movies page
  useEffect(() => {
    const handleScroll = () => {
      if (!sentinelRef.current) return;
      const rect = sentinelRef.current.getBoundingClientRect();
      // Freeze threshold below top navbar (around 68px)
      setIsFrozen(rect.top <= (isTV ? 20 : 68));
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isTV]);

  // Close dropdown on outside click or escape
  useEffect(() => {
    if (!openDropdown) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openDropdown]);

  const toggleGenre = (genreId: string) => {
    if (selectedGenres.includes(genreId)) {
      onSelectGenres(selectedGenres.filter((id) => id !== genreId));
    } else {
      onSelectGenres([...selectedGenres, genreId]);
    }
  };

  return (
    <div ref={sentinelRef} className="relative mb-5">
      {/* Spacer to prevent layout shift when bar becomes fixed */}
      {isFrozen && <div className="h-[60px]" />}

      <div
        ref={containerRef}
        className={`transition-all duration-150 z-30 ${
          isFrozen
            ? isTV
              ? 'fixed top-0 left-20 lg:left-64 right-0 px-6 py-2.5 bg-[#050508]/98 backdrop-blur-2xl border-b border-hbo-border/90 shadow-2xl'
              : 'fixed top-[calc(max(0.75rem,env(safe-area-inset-top,20px))+3rem)] left-0 right-0 px-4 sm:px-6 py-2.5 bg-[#050508]/98 backdrop-blur-2xl border-b border-hbo-border/90 shadow-2xl'
            : 'relative py-2.5 bg-[#050508] border-b border-hbo-border/60 shadow-lg'
        }`}
        data-tv-filter-section="true"
      >
        <div className="max-w-7xl mx-auto flex flex-col gap-2">
          {/* Main Filter Chips Bar: Unified Horizontally Scrollable Row */}
          <div
            ref={chipsScrollRef}
            className="flex items-center gap-2 sm:gap-2.5 overflow-x-auto no-scrollbar py-1 px-4 sm:px-6 -mx-4 sm:-mx-6 w-[calc(100%+2rem)] sm:w-[calc(100%+3rem)] scroll-pl-4 scroll-pr-4"
          >
            {/* 1. Sort Chip */}
            <button
              ref={sortBtnRef}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleDropdown('sort', sortBtnRef);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs sm:text-sm font-bold border transition-all shadow-sm flex-shrink-0 tv-focus-target cursor-pointer ${
                openDropdown === 'sort'
                  ? 'bg-hbo-cyan text-black border-white shadow-[0_0_15px_rgba(0,210,255,0.4)] ring-2 ring-hbo-cyan/50'
                  : 'bg-hbo-card text-gray-200 border-hbo-border hover:border-hbo-cyan hover:text-white'
              }`}
            >
              <ArrowUpDown className={`w-3.5 h-3.5 ${openDropdown === 'sort' ? 'text-black' : 'text-hbo-cyan'}`} />
              <span className="text-gray-400 font-normal">Sort:</span>
              <span>{selectedSortObj.label}</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${openDropdown === 'sort' ? 'rotate-180' : ''}`} />
            </button>

            {/* 2. Platform Filter Chip */}
            <button
              ref={platformBtnRef}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleDropdown('platform', platformBtnRef);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs sm:text-sm font-bold border transition-all shadow-sm flex-shrink-0 tv-focus-target cursor-pointer ${
                selectedProvider || openDropdown === 'platform'
                  ? 'bg-hbo-cyan text-black border-white shadow-[0_0_15px_rgba(0,210,255,0.4)] ring-2 ring-hbo-cyan/50'
                  : 'bg-hbo-card text-gray-300 border-hbo-border hover:text-white hover:border-hbo-purple-light hover:bg-hbo-hover'
              }`}
            >
              <SlidersHorizontal className={`w-3.5 h-3.5 ${selectedProvider || openDropdown === 'platform' ? 'text-black' : 'text-hbo-cyan'}`} />
              <span>{activePlatform ? activePlatform.name : 'Platform'}</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${openDropdown === 'platform' ? 'rotate-180' : ''}`} />
            </button>

            {/* 3. Genres Multi-Select Filter Chip */}
            <button
              ref={genreBtnRef}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleDropdown('genre', genreBtnRef);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs sm:text-sm font-bold border transition-all shadow-sm flex-shrink-0 tv-focus-target cursor-pointer ${
                selectedGenres.length > 0 || openDropdown === 'genre'
                  ? 'bg-hbo-purple text-white border-white shadow-[0_0_15px_rgba(144,85,255,0.5)] ring-2 ring-hbo-purple/60'
                  : 'bg-hbo-card text-gray-300 border-hbo-border hover:text-white hover:border-hbo-purple-light hover:bg-hbo-hover'
              }`}
            >
              <Filter className={`w-3.5 h-3.5 ${selectedGenres.length > 0 || openDropdown === 'genre' ? 'text-white' : 'text-hbo-purple-light'}`} />
              <span>{selectedGenres.length === 0 ? 'Genres' : `Genres (${selectedGenres.length})`}</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${openDropdown === 'genre' ? 'rotate-180' : ''}`} />
            </button>

            {/* 4. Year / Era Filter Chip */}
            <button
              ref={yearBtnRef}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleDropdown('year', yearBtnRef);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs sm:text-sm font-bold border transition-all shadow-sm flex-shrink-0 tv-focus-target cursor-pointer ${
                selectedYear || openDropdown === 'year'
                  ? 'bg-yellow-500 text-black border-white shadow-[0_0_15px_rgba(234,179,8,0.4)] ring-2 ring-yellow-500/50'
                  : 'bg-hbo-card text-gray-300 border-hbo-border hover:text-white hover:border-hbo-purple-light hover:bg-hbo-hover'
              }`}
            >
              <Calendar className={`w-3.5 h-3.5 ${selectedYear || openDropdown === 'year' ? 'text-black' : 'text-yellow-400'}`} />
              <span>{selectedYearObj?.value ? selectedYearObj.label.split(' ')[0] : 'Year'}</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${openDropdown === 'year' ? 'rotate-180' : ''}`} />
            </button>

            {/* 5. Rating Filter Chip */}
            <button
              ref={ratingBtnRef}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleDropdown('rating', ratingBtnRef);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs sm:text-sm font-bold border transition-all shadow-sm flex-shrink-0 tv-focus-target cursor-pointer ${
                selectedRating || openDropdown === 'rating'
                  ? 'bg-emerald-500 text-black border-white shadow-[0_0_15px_rgba(16,185,129,0.4)] ring-2 ring-emerald-500/50'
                  : 'bg-hbo-card text-gray-300 border-hbo-border hover:text-white hover:border-hbo-purple-light hover:bg-hbo-hover'
              }`}
            >
              <Star className={`w-3.5 h-3.5 ${selectedRating || openDropdown === 'rating' ? 'text-black fill-current' : 'text-emerald-400'}`} />
              <span>{selectedRating ? `⭐ ${selectedRating}+` : 'Rating'}</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${openDropdown === 'rating' ? 'rotate-180' : ''}`} />
            </button>

            {/* Clear All Filters Button */}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={onResetFilters}
                className="flex items-center gap-1.5 px-3 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-bold text-rose-400 bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 hover:text-rose-300 transition-all flex-shrink-0 tv-focus-target cursor-pointer"
                title="Reset all filters"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            )}
          </div>

          {/* Active Dropdown Popover (Rendered at container level to prevent overflow clipping) */}
          {openDropdown && (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                left: popoverLeft !== null ? `${popoverLeft}px` : undefined,
                right: popoverRight !== null ? `${popoverRight}px` : undefined
              }}
              className="absolute top-full mt-2 max-w-[calc(100vw-1.5rem)] bg-[#0e0e17] border border-hbo-border/90 rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.9)] z-50 p-2.5 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-2xl"
            >
              {/* Sort Popover Menu */}
              {openDropdown === 'sort' && (
                <div className="w-60 sm:w-64 max-h-80 overflow-y-auto no-scrollbar space-y-1">
                  <div className="px-3 py-1 text-[10px] font-black tracking-wider uppercase text-gray-400 border-b border-hbo-border/40 mb-1">
                    Sort Order
                  </div>
                  {TV_SORT_OPTIONS.map((opt) => {
                    const isSelected = sortBy === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          onSelectSort(opt.value);
                          setOpenDropdown(null);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-left transition ${
                          isSelected ? 'bg-hbo-cyan text-black font-extrabold' : 'text-gray-300 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        <span>{opt.label}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Platform Popover Menu */}
              {openDropdown === 'platform' && (
                <div className="w-56 max-h-80 overflow-y-auto no-scrollbar space-y-1">
                  <div className="px-3 py-1 text-[10px] font-black tracking-wider uppercase text-gray-400 border-b border-hbo-border/40 mb-1">
                    Streaming Platform
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectProvider('');
                      setOpenDropdown(null);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-left transition ${
                      !selectedProvider ? 'bg-hbo-cyan text-black font-extrabold' : 'text-gray-300 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <span>All Platforms</span>
                    {!selectedProvider && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </button>
                  {PLATFORMS.map((platform) => {
                    const isSelected = selectedProvider === platform.id;
                    return (
                      <button
                        key={platform.id}
                        type="button"
                        onClick={() => {
                          onSelectProvider(isSelected ? '' : platform.id);
                          setOpenDropdown(null);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-left transition ${
                          isSelected ? 'bg-hbo-cyan text-black font-extrabold' : 'text-gray-300 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        <span>{platform.name}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Genres Popover Menu */}
              {openDropdown === 'genre' && (
                <div className="w-72 sm:w-80 max-h-80 overflow-y-auto no-scrollbar">
                  <div className="flex items-center justify-between px-2 py-1 border-b border-hbo-border/40 mb-2">
                    <span className="text-[10px] font-black tracking-wider uppercase text-gray-400">
                      Genres {selectedGenres.length > 0 && `(${selectedGenres.length} selected)`}
                    </span>
                    {selectedGenres.length > 0 && (
                      <button
                        type="button"
                        onClick={() => onSelectGenres([])}
                        className="text-[10px] font-bold text-hbo-cyan hover:underline cursor-pointer"
                      >
                        Clear All
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {genres.map((g) => {
                      const isSelected = selectedGenres.includes(String(g.id));
                      return (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => toggleGenre(String(g.id))}
                          className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold text-left transition border ${
                            isSelected
                              ? 'bg-hbo-purple/30 text-hbo-cyan border-hbo-cyan/50 font-bold'
                              : 'bg-white/5 border-transparent text-gray-300 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          <span className="truncate mr-1">{g.name}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-hbo-cyan flex-shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Year Popover Menu */}
              {openDropdown === 'year' && (
                <div className="w-56 max-h-72 overflow-y-auto no-scrollbar space-y-1">
                  <div className="px-3 py-1 text-[10px] font-black tracking-wider uppercase text-gray-400 border-b border-hbo-border/40 mb-1">
                    First Air Year / Era
                  </div>
                  {TV_YEAR_OPTIONS.map((y) => {
                    const isSelected = selectedYear === y.value;
                    return (
                      <button
                        key={y.value}
                        type="button"
                        onClick={() => {
                          onSelectYear(isSelected ? '' : y.value);
                          setOpenDropdown(null);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-xs font-bold text-left transition ${
                          isSelected ? 'bg-yellow-500 text-black font-extrabold' : 'text-gray-300 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        <span>{y.label}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Rating Popover Menu */}
              {openDropdown === 'rating' && (
                <div className="w-56 space-y-1">
                  <div className="px-3 py-1 text-[10px] font-black tracking-wider uppercase text-gray-400 border-b border-hbo-border/40 mb-1">
                    Minimum Rating
                  </div>
                  {TV_RATING_OPTIONS.map((r) => {
                    const isSelected = selectedRating === r.value;
                    return (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() => {
                          onSelectRating(isSelected ? '' : r.value);
                          setOpenDropdown(null);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-left transition ${
                          isSelected ? 'bg-emerald-500 text-black font-extrabold' : 'text-gray-300 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        <span>{r.label}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Removable Active Filter Badges: Single-line Horizontally Scrollable Row */}
          {hasActiveFilters && (
            <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar pt-1 pb-0.5 px-4 sm:px-6 -mx-4 sm:-mx-6 w-[calc(100%+2rem)] sm:w-[calc(100%+3rem)] flex-nowrap scroll-pl-4 scroll-pr-4">
              <span className="text-[10px] font-black tracking-wider uppercase text-gray-400 flex-shrink-0 mr-0.5">Active:</span>

              {/* Platform Badge */}
              {activePlatform && (
                <button
                  type="button"
                  onClick={() => onSelectProvider('')}
                  className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-hbo-cyan/20 text-hbo-cyan border border-hbo-cyan/40 hover:bg-hbo-cyan/30 transition flex-shrink-0 cursor-pointer"
                >
                  <span>{activePlatform.name}</span>
                  <X className="w-3 h-3" />
                </button>
              )}

              {/* Genre Badges */}
              {selectedGenres.map((gId) => {
                const genreObj = genres.find((g) => String(g.id) === gId);
                if (!genreObj) return null;
                return (
                  <button
                    key={gId}
                    type="button"
                    onClick={() => toggleGenre(gId)}
                    className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-hbo-purple/30 text-hbo-purple-light border border-hbo-purple/40 hover:bg-hbo-purple/40 transition flex-shrink-0 cursor-pointer"
                  >
                    <span>{genreObj.name}</span>
                    <X className="w-3 h-3" />
                  </button>
                );
              })}

              {/* Year Badge */}
              {selectedYear && (
                <button
                  type="button"
                  onClick={() => onSelectYear('')}
                  className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-yellow-500/20 text-yellow-400 border border-yellow-500/40 hover:bg-yellow-500/30 transition flex-shrink-0 cursor-pointer"
                >
                  <span>{selectedYearObj?.label || selectedYear}</span>
                  <X className="w-3 h-3" />
                </button>
              )}

              {/* Rating Badge */}
              {selectedRating && (
                <button
                  type="button"
                  onClick={() => onSelectRating('')}
                  className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30 transition flex-shrink-0 cursor-pointer"
                >
                  <span>{selectedRatingObj?.label || `⭐ ${selectedRating}+`}</span>
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
