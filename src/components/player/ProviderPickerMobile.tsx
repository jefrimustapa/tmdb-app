import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Server, ChevronDown, Check, ShieldCheck, X } from 'lucide-react';
import { STREAM_PROVIDERS, getProviderById, getOrderedProviders } from '../../services/streamProviders';
import type { StreamProvider } from '../../types/stream';

interface ProviderPickerMobileProps {
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

export const ProviderPickerMobile: React.FC<ProviderPickerMobileProps> = ({
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

  const displayProviders = React.useMemo(() => {
    return isKorean
      ? getOrderedProviders(undefined, false, false, true)
      : isAnime
      ? getOrderedProviders(undefined, true, false, false)
      : isAsian
      ? getOrderedProviders(undefined, false, true, false)
      : STREAM_PROVIDERS;
  }, [isAnime, isAsian, isKorean]);

  const selectedProvider = getProviderById(currentProviderId);
  const shortServerName = selectedProvider.name.replace(/\s*\([^)]*\)/g, '').trim();

  const handleSelect = (provider: StreamProvider) => {
    onSelect(provider);
    setIsOpen(false);
  };

  return (
    <div className="relative inline-block text-left">
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all active:scale-95 bg-black/60 hover:bg-black/80 border-white/15 text-gray-200 shadow-sm"
        title="Switch Streaming Server"
      >
        <Server className="w-3.5 h-3.5 text-hbo-cyan flex-shrink-0" />
        <div className="text-left">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-white tracking-wide truncate max-w-[120px]">
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

      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex flex-col justify-end bg-black/80 backdrop-blur-md animate-fade-in touch-none">
            <div
              className="absolute inset-0"
              onClick={() => setIsOpen(false)}
              aria-label="Close modal background"
            />

            <div className="relative z-10 w-full h-[88vh] max-h-[90vh] flex flex-col rounded-t-3xl bg-hbo-card border-t border-white/20 shadow-2xl overflow-hidden animate-slide-up pb-[max(1rem,env(safe-area-inset-bottom,1.25rem))]">
              {/* Drag Handle & Header */}
              <div className="flex flex-col items-center pt-2 pb-2 px-4 border-b border-white/10 flex-shrink-0 bg-hbo-card">
                <div className="w-12 h-1.5 rounded-full bg-white/25 mb-3" />
                <div className="w-full flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-green-400 flex-shrink-0" />
                    <span className="text-xs font-black uppercase tracking-wider text-white">
                      Select Stream Server
                    </span>
                  </div>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white transition active:scale-90"
                    aria-label="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Scrollable Server List */}
              <div
                className="flex-1 overflow-y-auto px-4 py-3 space-y-2 touch-pan-y overscroll-contain"
                style={{ WebkitOverflowScrolling: 'touch' }}
              >
                {displayProviders.map((provider) => {
                  const isSelected = provider.id === currentProviderId;
                  const cleanName = provider.name.replace(/\s*\([^)]*\)/g, '').trim();
                  return (
                    <button
                      key={provider.id}
                      onClick={() => handleSelect(provider)}
                      className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl text-left transition-all active:scale-[0.98] ${
                        isSelected
                          ? 'bg-gradient-to-r from-hbo-purple/50 to-hbo-cyan/20 border-2 border-hbo-cyan text-white shadow-lg shadow-hbo-cyan/20'
                          : 'bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300'
                      }`}
                    >
                      <div className="min-w-0 flex-1 flex items-center gap-2">
                        <p className={`text-sm font-bold truncate ${isSelected ? 'text-hbo-cyan' : 'text-white'}`}>
                          {cleanName}
                        </p>
                        <span className="text-white/40 text-xs select-none">•</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold whitespace-nowrap flex-shrink-0 ${
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
                      {isSelected && <Check className="w-5 h-5 text-hbo-cyan flex-shrink-0 ml-2" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
