import React, { useState, useRef, useEffect } from 'react';
import { Server, ChevronDown, Check, ShieldCheck } from 'lucide-react';
import { STREAM_PROVIDERS, getProviderById, getOrderedProviders } from '../../services/streamProviders';
import type { StreamProvider } from '../../types/stream';

interface ProviderPickerTVProps {
  currentProviderId: string;
  onSelect: (provider: StreamProvider) => void;
  compact?: boolean;
  isProbing?: boolean;
  serverIndex?: number;
  totalServers?: number;
  isAnime?: boolean;
  isAsian?: boolean;
  isKorean?: boolean;
}

export const ProviderPickerTV: React.FC<ProviderPickerTVProps> = ({
  currentProviderId,
  onSelect,
  compact = false,
  isProbing = false,
  serverIndex = 1,
  totalServers = STREAM_PROVIDERS.length,
  isAnime = false,
  isAsian = false,
  isKorean = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const displayProviders = React.useMemo(() => {
    if (isKorean) return getOrderedProviders(undefined, false, false, true);
    if (isAsian) return getOrderedProviders(undefined, false, true, false);
    if (isAnime) return getOrderedProviders(undefined, true, false, false);
    return STREAM_PROVIDERS;
  }, [isAnime, isAsian, isKorean]);

  const selectedProvider = getProviderById(currentProviderId);
  const shortServerName = selectedProvider.name.replace(/\s*\([^)]*\)/g, '').trim();

  const selectedIndex = Math.max(0, displayProviders.findIndex(p => p.id === currentProviderId));
  const [highlightedIndex, setHighlightedIndex] = useState(selectedIndex);
  const highlightedIndexRef = useRef(selectedIndex);
  highlightedIndexRef.current = highlightedIndex;

  // 1. Sync AndroidBridge open state strictly on isOpen
  useEffect(() => {
    try {
      (window as any).AndroidBridge?.setDropdownOpen?.(isOpen);
    } catch {}

    return () => {
      try {
        (window as any).AndroidBridge?.setDropdownOpen?.(false);
      } catch {}
    };
  }, [isOpen]);

  // 2. When dropdown opens, initialize index and focus active button
  useEffect(() => {
    if (isOpen) {
      setHighlightedIndex(selectedIndex);
      const focusActiveBtn = () => {
        const activeBtn =
          document.getElementById(`provider-item-${selectedIndex}`) ||
          dropdownRef.current?.querySelector<HTMLElement>('[data-provider-selected="true"]') ||
          dropdownRef.current?.querySelector<HTMLElement>('[data-provider-item="true"]');
        if (activeBtn) {
          activeBtn.focus();
          activeBtn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      };
      setTimeout(focusActiveBtn, 30);
    }
  }, [isOpen, selectedIndex]);

  // 3. Listen to native navigation events while dropdown is open
  useEffect(() => {
    if (!isOpen) return;

    const handleDropdownNav = (e: any) => {
      const direction = e.detail?.direction;
      const current = highlightedIndexRef.current;
      if (direction === 'down') {
        const next = (current + 1) % STREAM_PROVIDERS.length;
        setHighlightedIndex(next);
        const el = document.getElementById(`provider-item-${next}`);
        if (el) {
          el.focus();
          el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      } else if (direction === 'up') {
        const next = (current - 1 + STREAM_PROVIDERS.length) % STREAM_PROVIDERS.length;
        setHighlightedIndex(next);
        const el = document.getElementById(`provider-item-${next}`);
        if (el) {
          el.focus();
          el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }
    };

    const handleDropdownSelect = () => {
      const target = STREAM_PROVIDERS[highlightedIndexRef.current];
      if (target) {
        handleSelect(target);
      }
    };

    window.addEventListener('tmdb_dropdown_nav', handleDropdownNav);
    window.addEventListener('tmdb_dropdown_select', handleDropdownSelect);

    return () => {
      window.removeEventListener('tmdb_dropdown_nav', handleDropdownNav);
      window.removeEventListener('tmdb_dropdown_select', handleDropdownSelect);
    };
  }, [isOpen]);

  useEffect(() => {
    const handleCloseDropdown = () => {
      setIsOpen(false);
    };
    window.addEventListener('tmdb_close_dropdowns', handleCloseDropdown);
    return () => window.removeEventListener('tmdb_close_dropdowns', handleCloseDropdown);
  }, []);

  const handleSelect = (provider: StreamProvider) => {
    onSelect(provider);
    setIsOpen(false);
    window.dispatchEvent(new CustomEvent('tmdb_reset_header_timer'));
    setTimeout(() => {
      const triggerBtn = document.getElementById('watch-provider-trigger');
      if (triggerBtn) triggerBtn.focus();
    }, 40);
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        id="watch-provider-trigger"
        onClick={() => setIsOpen(!isOpen)}
        data-provider-trigger="true"
        data-watch-header-item="true"
        tabIndex={0}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all tv-focus-target ${
          isOpen
            ? 'bg-hbo-purple/40 border-hbo-cyan text-white shadow-hbo-glow'
            : 'bg-black/60 hover:bg-black/80 border-white/15 text-gray-200 hover:text-white shadow-sm'
        }`}
        title="Switch Streaming Server"
      >
        <Server className="w-3.5 h-3.5 text-hbo-cyan flex-shrink-0" />
        <div className="text-left">
          <div className="flex items-center gap-1.5">
            <span className="text-xs sm:text-sm font-semibold text-white tracking-wide truncate max-w-[120px] sm:max-w-[160px]">
              {shortServerName}
            </span>
          </div>
          {isProbing && (
            <p className="text-[10px] text-yellow-400 font-medium animate-pulse leading-none mt-0.5">
              Probing server...
            </p>
          )}
        </div>
        <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
      </button>

      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute right-0 mt-2 w-72 sm:w-80 rounded-2xl bg-hbo-card/95 border border-white/20 shadow-2xl overflow-hidden z-50 animate-fade-in"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10 bg-hbo-card">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-green-400 flex-shrink-0" />
              <span className="text-xs font-black uppercase tracking-wider text-white">
                Select Stream Server
              </span>
            </div>
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto p-2 space-y-1">
            {displayProviders.map((provider, idx) => {
              const isSelected = provider.id === currentProviderId;
              const isHighlighted = idx === highlightedIndex;
              const cleanName = provider.name.replace(/\s*\([^)]*\)/g, '').trim();

              return (
                <button
                  key={provider.id}
                  id={`provider-item-${idx}`}
                  onClick={() => handleSelect(provider)}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  onFocus={() => {
                    setHighlightedIndex(idx);
                    document.getElementById(`provider-item-${idx}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                  }}
                  data-provider-selected={isSelected ? 'true' : undefined}
                  data-provider-highlighted={isHighlighted ? 'true' : undefined}
                  data-provider-item="true"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      const next = (idx + 1) % displayProviders.length;
                      setHighlightedIndex(next);
                      const nextBtn = document.getElementById(`provider-item-${next}`);
                      if (nextBtn) {
                        nextBtn.focus();
                        nextBtn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                      }
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      const prev = (idx - 1 + displayProviders.length) % displayProviders.length;
                      setHighlightedIndex(prev);
                      const prevBtn = document.getElementById(`provider-item-${prev}`);
                      if (prevBtn) {
                        prevBtn.focus();
                        prevBtn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                      }
                    } else if (e.key === 'ArrowLeft' || e.key === 'Escape') {
                      e.preventDefault();
                      setIsOpen(false);
                      const trigger = document.getElementById('watch-provider-trigger');
                      if (trigger) trigger.focus();
                    } else if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSelect(provider);
                    }
                  }}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2 sm:py-2.5 rounded-xl text-left transition-all tv-focus-target focus:outline-none ${
                    isHighlighted
                      ? 'bg-hbo-purple/40 border border-hbo-cyan/60 text-white font-bold'
                      : (isSelected
                        ? 'bg-hbo-purple/20 border border-hbo-cyan/40 text-white font-semibold'
                        : 'text-gray-300 hover:text-white hover:bg-hbo-hover border border-transparent')
                  }`}
                >
                  <div className="min-w-0 flex-1 flex items-center gap-2 pr-1">
                    <p className={`text-xs sm:text-sm font-bold truncate ${isHighlighted || isSelected ? 'text-hbo-cyan' : 'text-white'}`}>
                      {cleanName}
                    </p>
                    <span className="text-white/40 text-xs select-none">•</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold whitespace-nowrap flex-shrink-0 ${
                      provider.badge === 'Anime'
                        ? 'bg-gradient-to-r from-pink-500/30 to-purple-500/30 text-pink-300 border border-pink-500/40'
                        : provider.badge === 'K-Drama'
                        ? 'bg-gradient-to-r from-rose-500/30 to-pink-500/30 text-rose-300 border border-rose-500/40'
                        : provider.badge === 'Asean'
                        ? 'bg-gradient-to-r from-amber-500/30 to-red-500/30 text-amber-300 border border-amber-500/40'
                        : 'bg-white/10 text-gray-300'
                    }`}>
                      {provider.badge}
                    </span>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-hbo-cyan flex-shrink-0 ml-1.5" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
