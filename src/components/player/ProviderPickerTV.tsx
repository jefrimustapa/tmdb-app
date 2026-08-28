import React, { useState, useRef, useEffect } from 'react';
import { Server, ChevronDown, Check, ShieldCheck } from 'lucide-react';
import { STREAM_PROVIDERS, getProviderById } from '../../services/streamProviders';
import type { StreamProvider } from '../../types/stream';

interface ProviderPickerTVProps {
  currentProviderId: string;
  onSelect: (provider: StreamProvider) => void;
  compact?: boolean;
  isProbing?: boolean;
  serverIndex?: number;
  totalServers?: number;
}

export const ProviderPickerTV: React.FC<ProviderPickerTVProps> = ({
  currentProviderId,
  onSelect,
  compact = false,
  isProbing = false,
  serverIndex = 1,
  totalServers = STREAM_PROVIDERS.length,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedProvider = getProviderById(currentProviderId);
  const shortServerName = selectedProvider.name.replace(/\s*\([^)]*\)/g, '').trim();

  useEffect(() => {
    try {
      (window as any).AndroidBridge?.setDropdownOpen?.(isOpen);
    } catch {}

    if (isOpen && dropdownRef.current) {
      setTimeout(() => {
        const activeBtn =
          dropdownRef.current?.querySelector<HTMLElement>('[data-provider-selected="true"]') ||
          dropdownRef.current?.querySelector<HTMLElement>('[data-provider-item="true"]') ||
          dropdownRef.current?.querySelector<HTMLElement>('.tv-focus-target');
        if (activeBtn) {
          activeBtn.focus();
          activeBtn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }, 60);
    }

    return () => {
      try {
        (window as any).AndroidBridge?.setDropdownOpen?.(false);
      } catch {}
    };
  }, [isOpen]);

  useEffect(() => {
    const handleCloseDropdown = () => setIsOpen(false);
    window.addEventListener('tmdb_close_dropdowns', handleCloseDropdown);
    return () => window.removeEventListener('tmdb_close_dropdowns', handleCloseDropdown);
  }, []);

  const handleSelect = (provider: StreamProvider) => {
    onSelect(provider);
    setIsOpen(false);
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
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            const backBtn = document.getElementById('watch-back-btn');
            if (backBtn) backBtn.focus();
          } else if (e.key === 'ArrowDown') {
            if (!isOpen) {
              e.preventDefault();
              setIsOpen(true);
            }
          }
        }}
        className={`flex items-center gap-2 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl border backdrop-blur-md transition-all tv-focus-target focus:outline-none focus:border-hbo-cyan focus:ring-2 focus:ring-hbo-cyan ${
          isOpen
            ? 'bg-hbo-purple/40 border-hbo-cyan text-white shadow-hbo-glow'
            : 'bg-black/60 hover:bg-black/80 border-white/20 text-gray-200 hover:text-white'
        }`}
        title="Switch Streaming Server"
      >
        <Server className="w-4 h-4 text-hbo-cyan flex-shrink-0" />
        <div className="text-left">
          <div className="flex items-center gap-1.5">
            <span className="text-xs sm:text-sm font-bold text-white tracking-wide truncate max-w-[110px] sm:max-w-[160px]">
              {compact ? shortServerName : selectedProvider.name}
            </span>
            <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-hbo-purple text-hbo-cyan border border-hbo-cyan/30 uppercase tracking-wider flex-shrink-0">
              {serverIndex}/{totalServers}
            </span>
          </div>
          {isProbing && (
            <p className="text-[10px] text-yellow-400 font-medium animate-pulse leading-none mt-0.5">
              Probing server...
            </p>
          )}
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-hbo-cyan' : ''}`}
        />
      </button>

      {isOpen && (
        <div
          data-provider-dropdown-open="true"
          className="absolute right-0 mt-2 w-84 sm:w-96 min-w-[340px] sm:min-w-[380px] max-h-[65vh] overflow-y-auto rounded-2xl bg-hbo-card/98 border border-white/20 shadow-2xl backdrop-blur-2xl p-2.5 z-50 focus:outline-none scrollbar-thin scrollbar-thumb-white/20 animate-fade-in"
        >
          <div className="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center justify-between sticky top-0 bg-hbo-card/95 backdrop-blur-md z-10 border-b border-white/10 mb-1">
            <span>Select Stream Server</span>
            <ShieldCheck className="w-3.5 h-3.5 text-green-400" />
          </div>

          <div className="space-y-2 pt-1 px-1 pb-1">
            {STREAM_PROVIDERS.map((provider, idx) => {
              const isSelected = provider.id === currentProviderId;
              return (
                <button
                  key={provider.id}
                  onClick={() => handleSelect(provider)}
                  data-provider-selected={isSelected ? 'true' : undefined}
                  data-provider-item="true"
                  onFocus={(e) => {
                    e.currentTarget.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowLeft' || e.key === 'Escape') {
                      e.preventDefault();
                      setIsOpen(false);
                      const trigger = document.getElementById('watch-provider-trigger');
                      if (trigger) trigger.focus();
                    }
                  }}
                  className={`w-full flex items-center justify-between gap-3.5 px-4 py-3 sm:px-4.5 sm:py-3.5 rounded-xl text-left transition-all tv-focus-target focus:outline-none focus:border-hbo-cyan focus:ring-2 focus:ring-hbo-cyan ${
                    isSelected
                      ? 'bg-gradient-to-r from-hbo-purple/40 to-hbo-cyan/20 border border-hbo-cyan text-white shadow-hbo-glow'
                      : 'text-gray-300 hover:text-white hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <div className="min-w-0 flex-1 pr-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`text-xs sm:text-sm font-bold ${isSelected ? 'text-hbo-cyan' : 'text-white'}`}>
                        {provider.name}
                      </p>
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-white/10 text-gray-300 font-bold whitespace-nowrap flex-shrink-0">
                        {provider.badge}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1 leading-snug whitespace-normal break-words">
                      {provider.tagline}
                    </p>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-hbo-cyan flex-shrink-0 ml-2" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
