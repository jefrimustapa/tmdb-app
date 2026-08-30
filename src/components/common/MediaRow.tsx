import React, { useRef, memo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { TMDBMediaItem } from '../../types/tmdb';
import { MediaCard } from './MediaCard';

interface MediaRowProps {
  title: string;
  subtitle?: string;
  items: TMDBMediaItem[];
  type?: 'movie' | 'tv';
  variant?: 'poster' | 'landscape';
}

const MediaRowComponent: React.FC<MediaRowProps> = ({ title, subtitle, items, type, variant = 'poster' }) => {
  const rowRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (rowRef.current) {
      const scrollAmount = rowRef.current.clientWidth * 0.75;
      rowRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  if (!items || items.length === 0) return null;

  return (
    <section className="relative mb-7 sm:mb-9 px-4 sm:px-8 group" data-content-rail="true">
      <div className="flex items-end justify-between mb-2.5">
        <div>
          <h2 className="text-lg sm:text-2xl font-bold font-display text-white tracking-tight flex items-center gap-2">
            <span className="w-1.5 h-5 bg-gradient-to-b from-hbo-purple to-hbo-cyan rounded-full inline-block"></span>
            {title}
          </h2>
          {subtitle && <p className="text-xs sm:text-sm text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>

      {/* Row Container with Navigation Buttons */}
      <div className="relative">
        {/* Left Scroll Button */}
        <button
          onClick={() => scroll('left')}
          className="absolute -left-3 top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full bg-hbo-card/90 border border-hbo-border text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 hover:bg-hbo-purple hover:scale-110 shadow-lg hidden sm:flex"
          aria-label="Scroll left"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>

        {/* Horizontal Carousel */}
        <div
          ref={rowRef}
          className="flex items-center gap-3.5 overflow-x-auto no-scrollbar py-1.5 pl-2 pr-6 scroll-smooth transform-gpu"
        >
          {items.map((item) => (
            <MediaCard key={item.id} item={item} type={type} variant={variant} />
          ))}
        </div>

        {/* Right Scroll Button */}
        <button
          onClick={() => scroll('right')}
          className="absolute -right-3 top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full bg-hbo-card/90 border border-hbo-border text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 hover:bg-hbo-purple hover:scale-110 shadow-lg hidden sm:flex"
          aria-label="Scroll right"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>
    </section>
  );
};

export const MediaRow = memo(MediaRowComponent);
