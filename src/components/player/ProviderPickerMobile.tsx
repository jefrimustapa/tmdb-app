import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Server, ChevronDown, Check, ShieldCheck, X, Send } from 'lucide-react';
import { STREAM_PROVIDERS, getProviderById, getOrderedProviders, getProvidersByEngine, CATEGORY_BADGE_CONFIG, ORIGIN_COUNTRY_LABELS } from '../../services/streamProviders';
import type { StreamProvider, StreamEngineType } from '../../types/stream';
import type { StreamResolverType } from '../../types/db';

interface ProviderPickerMobileProps {
  currentProviderId: string;
  onSelect: (provider: StreamProvider) => void;
  enabledResolvers?: StreamResolverType[];
  compact?: boolean;
  isProbing?: boolean;
  serverIndex?: number;
  totalServers?: number;
  isAnime?: boolean;
  isAsean?: boolean;
  isAsian?: boolean; // Backward compatibility alias
  isKorean?: boolean;
}

export const ProviderPickerMobile: React.FC<ProviderPickerMobileProps> = ({
  currentProviderId,
  onSelect,
  enabledResolvers,
  compact = false,
  isProbing = false,
  serverIndex = 1,
  totalServers = STREAM_PROVIDERS.length,
  isAnime = false,
  isAsean = false,
  isAsian = false,
  isKorean = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const activeAsean = isAsean || isAsian;
  const selectedProvider = getProviderById(currentProviderId);

  const hasEmbed = !enabledResolvers || enabledResolvers.includes('embed');
  const hasTelegram = Boolean(enabledResolvers && enabledResolvers.includes('telegram'));

  const [engineTab, setEngineTab] = useState<StreamEngineType>(
    !hasEmbed && hasTelegram
      ? 'telegram'
      : (selectedProvider.engine === 'telegram' ? 'telegram' : 'embed')
  );

  useEffect(() => {
    if (isOpen) {
      if (!hasEmbed && hasTelegram) {
        setEngineTab('telegram');
      } else if (hasEmbed && !hasTelegram) {
        setEngineTab('embed');
      } else {
        setEngineTab(selectedProvider.engine || 'embed');
      }
    }
  }, [isOpen, hasEmbed, hasTelegram, selectedProvider.engine]);

  const displayProviders = React.useMemo(() => {
    const list = getProvidersByEngine(engineTab);
    if (engineTab === 'telegram') return list;
    return isKorean
      ? getOrderedProviders(undefined, false, false, true).filter(p => (p.engine || 'embed') === 'embed')
      : isAnime
      ? getOrderedProviders(undefined, true, false, false).filter(p => (p.engine || 'embed') === 'embed')
      : activeAsean
      ? getOrderedProviders(undefined, false, true, false).filter(p => (p.engine || 'embed') === 'embed')
      : list;
  }, [engineTab, isAnime, activeAsean, isKorean]);

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

                {/* Engine Selector Tabs (Shown only when both engines are enabled) */}
                {hasEmbed && hasTelegram && (
                  <div className="w-full grid grid-cols-2 gap-2 mt-3 p-1 rounded-xl bg-white/5 border border-white/10">
                    <button
                      type="button"
                      onClick={() => setEngineTab('embed')}
                      className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition ${
                        engineTab === 'embed'
                          ? 'bg-hbo-purple text-white shadow-md'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      <Server className="w-3.5 h-3.5" />
                      Embed Providers
                    </button>
                    <button
                      type="button"
                      onClick={() => setEngineTab('telegram')}
                      className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition ${
                        engineTab === 'telegram'
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      <Send className="w-3.5 h-3.5" />
                      Telegram Providers
                    </button>
                  </div>
                )}
              </div>

              {/* Scrollable Server List */}
              <div
                className="flex-1 overflow-y-auto px-4 py-3 space-y-2 touch-pan-y overscroll-contain"
                style={{ WebkitOverflowScrolling: 'touch' }}
              >
                {displayProviders.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-xs">
                    No providers available for this engine.
                  </div>
                ) : (
                  displayProviders.map((provider) => {
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
                        <div className="min-w-0 flex-1 flex flex-col gap-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className={`text-sm font-bold truncate ${isSelected ? 'text-hbo-cyan' : 'text-white'}`}>
                              {cleanName}
                            </p>
                            <div className="flex items-center gap-1 flex-wrap">
                              {provider.categories.map((cat) => {
                                const conf = CATEGORY_BADGE_CONFIG[cat];
                                if (!conf) return null;
                                return (
                                  <span
                                    key={cat}
                                    className={`text-[9px] px-1.5 py-0.5 rounded font-bold whitespace-nowrap border ${conf.className}`}
                                  >
                                    {conf.label}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                          {/* Countries */}
                          {provider.countries && provider.countries.length > 0 && (
                            <div className="flex items-center gap-1 flex-wrap">
                              {provider.countries.map((c) => (
                                <span
                                  key={c}
                                  className="text-[9px] px-1 py-0.2 text-gray-400 bg-white/5 rounded border border-white/10"
                                >
                                  {ORIGIN_COUNTRY_LABELS[c] || c}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        {isSelected && <Check className="w-5 h-5 text-hbo-cyan flex-shrink-0 ml-2" />}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

