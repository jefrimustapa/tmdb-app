import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Server, ChevronDown, Check, ShieldCheck, X, Send } from 'lucide-react';
import { STREAM_PROVIDERS, getProviderById, getOrderedProviders, getProvidersByEngine, CATEGORY_BADGE_CONFIG, ORIGIN_COUNTRY_LABELS } from '../../services/streamProviders';
import type { StreamProvider, StreamEngineType } from '../../types/stream';
import type { StreamResolverType } from '../../types/db';

interface ProviderPickerTVProps {
  currentProviderId: string;
  onSelect: (provider: StreamProvider) => void;
  compact?: boolean;
  isProbing?: boolean;
  serverIndex?: number;
  totalServers?: number;
  isAnime?: boolean;
  isAsean?: boolean;
  isAsian?: boolean; // Backward compatibility alias
  isKorean?: boolean;
  enabledResolvers?: StreamResolverType[];
}

export const ProviderPickerTV: React.FC<ProviderPickerTVProps> = ({
  currentProviderId,
  onSelect,
  compact = false,
  isProbing = false,
  serverIndex = 1,
  totalServers = STREAM_PROVIDERS.length,
  isAnime = false,
  isAsean = false,
  isAsian = false,
  isKorean = false,
  enabledResolvers,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const activeAsean = isAsean || isAsian;
  const selectedProvider = getProviderById(currentProviderId);

  const hasEmbed = !enabledResolvers || enabledResolvers.includes('embed');
  const hasTelegram = enabledResolvers ? enabledResolvers.includes('telegram') : true;

  const defaultEngine = React.useMemo<StreamEngineType>(() => {
    if (selectedProvider.engine === 'telegram' && hasTelegram) return 'telegram';
    if (hasEmbed) return 'embed';
    if (hasTelegram) return 'telegram';
    return 'embed';
  }, [selectedProvider.engine, hasEmbed, hasTelegram]);

  const [engineTab, setEngineTab] = useState<StreamEngineType>(defaultEngine);

  useEffect(() => {
    if (isOpen) {
      setEngineTab(defaultEngine);
    }
  }, [isOpen, defaultEngine]);

  const displayProviders = React.useMemo(() => {
    // If only one engine is enabled, restrict strictly
    const activeEngine = hasEmbed && hasTelegram ? engineTab : hasTelegram ? 'telegram' : 'embed';
    const list = getProvidersByEngine(activeEngine);
    if (activeEngine === 'telegram') return list;
    if (isKorean) return getOrderedProviders(undefined, false, false, true).filter(p => (p.engine || 'embed') === 'embed');
    if (activeAsean) return getOrderedProviders(undefined, false, true, false).filter(p => (p.engine || 'embed') === 'embed');
    if (isAnime) return getOrderedProviders(undefined, true, false, false).filter(p => (p.engine || 'embed') === 'embed');
    return list;
  }, [engineTab, isAnime, activeAsean, isKorean, hasEmbed, hasTelegram]);

  const shortServerName = selectedProvider.name.replace(/\s*\([^)]*\)/g, '').trim();


  // Sync AndroidBridge modal state
  useEffect(() => {
    if (!isOpen) {
      try {
        (window as any).AndroidBridge?.setModalOpen?.(false);
        (window as any).AndroidBridge?.setDropdownOpen?.(false);
      } catch {}
      return;
    }

    try {
      (window as any).AndroidBridge?.setModalOpen?.(true);
      (window as any).AndroidBridge?.setDropdownOpen?.(true);
    } catch {}

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Back' || e.keyCode === 27) {
        e.preventDefault();
        e.stopPropagation();
        setIsOpen(false);
        const trigger = document.getElementById('watch-provider-trigger');
        if (trigger) trigger.focus();
        return;
      }

      if (!modalRef.current) return;
      const focusables = Array.from(
        modalRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), .tv-focus-target')
      ).filter((el) => el.offsetParent !== null);

      if (focusables.length === 0) return;

      const currentIndex = focusables.indexOf(document.activeElement as HTMLElement);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        const nextIndex = currentIndex < focusables.length - 1 ? currentIndex + 1 : 0;
        focusables[nextIndex].focus();
        focusables[nextIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : focusables.length - 1;
        focusables[prevIndex].focus();
        focusables[prevIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    };

    const handleCloseDialogEvent = () => {
      setIsOpen(false);
      const trigger = document.getElementById('watch-provider-trigger');
      if (trigger) trigger.focus();
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('tmdb_close_dialog', handleCloseDialogEvent);

    // Auto-focus selected server or first item on open
    const timer = setTimeout(() => {
      if (!modalRef.current) return;
      const activeBtn = modalRef.current.querySelector<HTMLElement>('[data-provider-selected="true"]');
      if (activeBtn) {
        activeBtn.focus();
        activeBtn.scrollIntoView({ block: 'nearest' });
        return;
      }
      const firstFocusable = modalRef.current.querySelector<HTMLElement>('.tv-focus-target, button');
      if (firstFocusable) {
        firstFocusable.focus();
      }
    }, 100);

    return () => {
      clearTimeout(timer);
      try {
        (window as any).AndroidBridge?.setModalOpen?.(false);
        (window as any).AndroidBridge?.setDropdownOpen?.(false);
      } catch {}
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('tmdb_close_dialog', handleCloseDialogEvent);
    };
  }, [isOpen]);

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
    <div className="relative inline-block text-left">
      {/* Normal Circular Icon Button matching Subtitle button */}
      <button
        type="button"
        id="watch-provider-trigger"
        onClick={() => setIsOpen(!isOpen)}
        data-provider-trigger="true"
        data-watch-header-item="true"
        aria-label="Server & Provider Settings"
        title="Streaming Server Settings"
        tabIndex={0}
        className="p-2.5 rounded-full bg-black/70 hover:bg-black text-white border border-white/20 backdrop-blur-md transition hover:scale-110 flex-shrink-0 tv-focus-target focus:outline-none focus:border-hbo-cyan focus:ring-2 focus:ring-hbo-cyan cursor-pointer"
      >
        <Server className="w-5 h-5 text-white" />
      </button>

      {/* Popup Modal rendered to document.body with identical styling to SubtitlePickerModal */}
      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-label="Select Streaming Server"
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
            onClick={(e) => {
              if (e.target === e.currentTarget) setIsOpen(false);
            }}
          >
            <div className="relative w-full max-w-lg bg-hbo-card/95 border border-white/15 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] text-white">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-white/5">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-hbo-purple/30 border border-hbo-purple/40 text-white">
                    <Server className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold font-display text-white tracking-wide">
                      Select Stream Server
                    </h2>
                    <p className="text-xs text-gray-400">
                      Choose an alternative mirror if current source is buffering
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    const trigger = document.getElementById('watch-provider-trigger');
                    if (trigger) trigger.focus();
                  }}
                  aria-label="Close"
                  data-close-dialog="true"
                  className="p-1.5 rounded-full bg-white/5 hover:bg-white/15 text-gray-300 hover:text-white transition cursor-pointer tv-focus-target focus:outline-none focus:ring-2 focus:ring-hbo-cyan"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Engine Selector Tabs */}
              {hasEmbed && hasTelegram && (
                <div className="grid grid-cols-2 gap-2 px-4 py-2 border-b border-white/10 bg-white/5">
                  <button
                    type="button"
                    onClick={() => setEngineTab('embed')}
                    tabIndex={0}
                    className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition cursor-pointer tv-focus-target focus:outline-none focus:ring-2 focus:ring-hbo-cyan ${
                      engineTab === 'embed'
                        ? 'bg-hbo-purple text-white shadow-md'
                        : 'text-gray-400 hover:text-white bg-white/5'
                    }`}
                  >
                    <Server className="w-4 h-4" />
                    Embed Providers
                  </button>
                  <button
                    type="button"
                    onClick={() => setEngineTab('telegram')}
                    tabIndex={0}
                    className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition cursor-pointer tv-focus-target focus:outline-none focus:ring-2 focus:ring-hbo-cyan ${
                      engineTab === 'telegram'
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'text-gray-400 hover:text-white bg-white/5'
                    }`}
                  >
                    <Send className="w-4 h-4" />
                    Telegram
                  </button>
                </div>
              )}

              {/* Server List */}
              <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2 overscroll-contain">
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
                        type="button"
                        onClick={() => handleSelect(provider)}
                        data-provider-selected={isSelected ? 'true' : undefined}
                        data-provider-item="true"
                        tabIndex={0}
                        className={`w-full flex items-center justify-between p-3 rounded-xl text-left border transition cursor-pointer group tv-focus-target focus:outline-none focus:border-hbo-cyan focus:ring-2 focus:ring-hbo-cyan ${
                          isSelected
                            ? 'bg-hbo-purple/25 border-hbo-cyan/50 text-white shadow-hbo-glow'
                            : 'bg-white/5 hover:bg-white/10 border-white/5 text-gray-300'
                        }`}
                      >
                        <div className="min-w-0 flex-1 flex flex-col gap-1 pr-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className={`text-xs sm:text-sm font-bold truncate ${isSelected ? 'text-hbo-cyan' : 'text-white'}`}>
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
                          {/* Country Badges */}
                          {provider.countries && provider.countries.length > 0 && (
                            <div className="flex items-center gap-1 flex-wrap">
                              {provider.countries.map((c) => (
                                <span
                                  key={c}
                                  className="text-[9px] px-1.5 py-0.2 text-gray-400 bg-white/5 rounded border border-white/10"
                                >
                                  {ORIGIN_COUNTRY_LABELS[c] || c}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        {isSelected && (
                          <div className="flex-shrink-0">
                            <Check className="w-4 h-4 text-hbo-cyan" />
                          </div>
                        )}
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
