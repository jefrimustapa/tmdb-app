import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Server, ChevronDown, Check, ShieldCheck, X } from 'lucide-react';
import { STREAM_PROVIDERS, getProviderById } from '../../services/streamProviders';
import { useDevice } from '../../hooks/useDevice';
import type { StreamProvider } from '../../types/stream';

interface ProviderPickerProps {
  currentProviderId: string;
  onSelect: (provider: StreamProvider) => void;
  compact?: boolean;
  isProbing?: boolean;
  serverIndex?: number;
  totalServers?: number;
}

export const ProviderPicker: React.FC<ProviderPickerProps> = ({
  currentProviderId,
  onSelect,
  compact = false,
  isProbing = false,
  serverIndex = 1,
  totalServers = STREAM_PROVIDERS.length
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { isPhone, isTV, activeLayout } = useDevice();
  const isMobile = isPhone || activeLayout === 'mobile' || (!isTV && typeof window !== 'undefined' && window.innerWidth < 768);

  const selectedProvider = getProviderById(currentProviderId);
  // Simplified base provider name (e.g. "VidLink", "Embed.su", "VidSrc CC")
  const shortServerName = selectedProvider.name.replace(/\s*\([^)]*\)/g, '').trim();

  // When dropdown opens, automatically focus the selected or first provider and sync with bridge
  useEffect(() => {
    try {
      (window as any).AndroidBridge?.setDropdownOpen?.(isOpen);
    } catch {}

    if (isOpen && dropdownRef.current) {
      setTimeout(() => {
        const activeBtn = dropdownRef.current?.querySelector<HTMLElement>('[data-provider-selected="true"]') ||
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

  // Close dropdown on custom close event
  useEffect(() => {
    const handleCloseDropdown = () => {
      setIsOpen(false);
    };

    window.addEventListener('tmdb_close_dropdowns', handleCloseDropdown);

    return () => {
      window.removeEventListener('tmdb_close_dropdowns', handleCloseDropdown);
    };
  }, []);

  const handleSelect = (provider: StreamProvider) => {
    onSelect(provider);
    setIsOpen(false);
    // Return focus to trigger button
    setTimeout(() => {
      const triggerBtn = document.getElementById('watch-provider-trigger') || dropdownRef.current?.querySelector<HTMLElement>('[data-provider-trigger="true"]');
      if (triggerBtn) {
        triggerBtn.focus();
      }
    }, 50);
  };

  const handleDropdownKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' || e.keyCode === 27 || e.keyCode === 4 || e.key === 'BrowserBack') {
      if (isOpen) {
        e.preventDefault();
        e.stopPropagation();
        setIsOpen(false);
        const triggerBtn = document.getElementById('watch-provider-trigger') || dropdownRef.current?.querySelector<HTMLElement>('[data-provider-trigger="true"]');
        if (triggerBtn) {
          triggerBtn.focus();
        }
      }
    }
  };

  return (
    <div
      className={`relative flex items-center gap-2 ${compact ? 'justify-end' : 'flex-col sm:flex-row sm:items-center justify-between gap-3'}`}
      ref={dropdownRef}
      data-provider-dropdown-open={isOpen ? 'true' : undefined}
      onKeyDown={handleDropdownKeyDown}
    >
      {/* Auto-Probing HUD Pill in Header Bar */}
      {compact && isProbing && (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-hbo-purple/40 border border-hbo-cyan/40 backdrop-blur-md text-[10px] font-bold text-hbo-cyan animate-pulse">
          <span className="w-1.5 h-1.5 rounded-full bg-hbo-cyan animate-ping" />
          <span>Probing {serverIndex}/{totalServers}</span>
        </div>
      )}

      {/* Left Label Info (Hidden in compact header overlay) */}
      {!compact && (
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-hbo-purple/20 border border-hbo-purple-light/40 text-hbo-cyan">
            <Server className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
              Streaming Server
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-hbo-purple/40 text-hbo-cyan border border-hbo-cyan/30 font-bold">
                {STREAM_PROVIDERS.length} Available
              </span>
            </h4>
            <p className="text-[11px] text-gray-400">
              If a video fails or buffers, switch to an alternative server.
            </p>
          </div>
        </div>
      )}

      {/* Dropdown Container */}
      <div className={`relative ${compact ? 'w-auto' : 'w-full sm:w-72'}`}>
        {/* Dropdown Trigger Button */}
        <button
          type="button"
          id="watch-provider-trigger"
          tabIndex={0}
          onClick={() => setIsOpen(!isOpen)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft' && !isOpen) {
              e.preventDefault();
              const backBtn = document.getElementById('watch-back-btn') || document.querySelector<HTMLElement>('[data-watch-back="true"]');
              if (backBtn) {
                backBtn.focus();
              }
            } else if (e.key === 'ArrowDown' && !isOpen) {
              e.preventDefault();
              setIsOpen(true);
            }
          }}
          data-provider-trigger="true"
          data-watch-header-item="true"
          className={`flex items-center justify-between gap-2 bg-black/70 hover:bg-black/90 backdrop-blur-md border border-white/20 rounded-full text-left text-xs font-semibold text-white transition-all shadow-md focus:outline-none focus:border-hbo-cyan focus:ring-2 focus:ring-hbo-cyan tv-focus-target ${
            compact ? 'px-3 py-1.5' : 'w-full px-4 py-2.5 rounded-xl'
          }`}
          title="Switch Streaming Server"
        >
          <div className="flex items-center gap-1.5 truncate">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isProbing ? 'bg-amber-400 animate-ping' : 'bg-green-400 animate-pulse'}`} />
            <span className="truncate font-bold text-white text-xs">{shortServerName}</span>
          </div>
          <ChevronDown className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180 text-hbo-cyan' : ''}`} />
        </button>

        {/* Mobile Bottom Sheet Drawer / Desktop & TV Dropdown */}
        {isOpen && (
          <>
            {isMobile ? (
              // Mobile Slide-up Bottom Sheet Modal with minimal top dead gap
              createPortal(
                <div
                  className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/85 backdrop-blur-sm animate-fade-in"
                  onClick={() => setIsOpen(false)}
                >
                  <div
                    className="w-full max-w-lg bg-hbo-card/98 border-t border-hbo-border/90 rounded-t-3xl px-4 pt-3 pb-6 shadow-2xl flex flex-col h-[88vh] max-h-[90vh] animate-slide-up"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Top Drag Pill */}
                    <div className="w-10 h-1 bg-white/25 rounded-full mx-auto mb-2.5 flex-shrink-0" />

                    {/* Header */}
                    <div className="flex items-center justify-between pb-2.5 border-b border-hbo-border/40 flex-shrink-0">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-green-400" />
                        <h3 className="text-sm font-black text-white uppercase tracking-wider">Select Stream Server</h3>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-hbo-purple/40 text-hbo-cyan font-bold">
                          {STREAM_PROVIDERS.length} Mirrors
                        </span>
                      </div>
                      <button
                        onClick={() => setIsOpen(false)}
                        className="p-1.5 rounded-full bg-white/10 text-gray-300 hover:text-white"
                        aria-label="Close server picker"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Scrollable Provider List */}
                    <div
                      className="flex-1 overflow-y-auto overscroll-contain space-y-2 pt-2.5 pb-8 pr-0.5"
                      style={{
                        WebkitOverflowScrolling: 'touch',
                        touchAction: 'pan-y'
                      }}
                    >
                      {STREAM_PROVIDERS.map((provider) => {
                        const isSelected = provider.id === currentProviderId;
                        return (
                          <button
                            key={provider.id}
                            onClick={() => handleSelect(provider)}
                            data-provider-selected={isSelected ? 'true' : undefined}
                            data-provider-item="true"
                            className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl text-left transition-all active:scale-[0.98] ${
                              isSelected
                                ? 'bg-gradient-to-r from-hbo-purple/40 to-hbo-cyan/20 border border-hbo-cyan text-white shadow-hbo-glow'
                                : 'bg-white/5 text-gray-300 hover:text-white hover:bg-white/10 border border-transparent'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className={`text-sm font-bold ${isSelected ? 'text-hbo-cyan' : 'text-white'}`}>
                                  {provider.name}
                                </p>
                                <span className="text-[10px] px-2 py-0.5 rounded-md bg-white/10 text-gray-300 font-bold whitespace-nowrap flex-shrink-0">
                                  {provider.badge}
                                </span>
                              </div>
                              <p className="text-xs text-gray-400 mt-0.5 leading-snug">
                                {provider.tagline}
                              </p>
                            </div>

                            {isSelected && (
                              <Check className="w-4 h-4 text-hbo-cyan flex-shrink-0 ml-2" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>,
                document.body
              )
            ) : (
              // Desktop & TV Inline Dropdown Menu
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 top-full mt-2 w-80 sm:w-96 min-w-[280px] max-w-[calc(100vw-1.5rem)] z-50 bg-hbo-card/98 backdrop-blur-2xl border border-hbo-border/90 rounded-2xl p-2 sm:p-3 shadow-2xl animate-fade-in divide-y divide-hbo-border/40 max-h-[70vh] sm:max-h-96 overflow-y-auto overscroll-contain"
              >
                <div className="px-2 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center justify-between sticky top-0 bg-hbo-card/95 backdrop-blur-md z-10">
                  <span>Select Stream Server</span>
                  <ShieldCheck className="w-3.5 h-3.5 text-green-400" />
                </div>

                <div className="space-y-1.5 pt-2 px-0.5 pb-1">
                  {STREAM_PROVIDERS.map((provider, idx) => {
                    const isSelected = provider.id === currentProviderId;
                    return (
                      <button
                        key={provider.id}
                        onClick={() => handleSelect(provider)}
                        data-provider-selected={isSelected ? 'true' : undefined}
                        data-provider-item="true"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            const nextBtn = dropdownRef.current?.querySelectorAll<HTMLElement>('[data-provider-item="true"]')[idx + 1];
                            if (nextBtn) {
                              nextBtn.focus();
                              nextBtn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                            }
                          } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            if (idx === 0) {
                              const trigger = document.getElementById('watch-provider-trigger');
                              if (trigger) {
                                trigger.focus();
                              }
                            } else {
                              const prevBtn = dropdownRef.current?.querySelectorAll<HTMLElement>('[data-provider-item="true"]')[idx - 1];
                              if (prevBtn) {
                                prevBtn.focus();
                                prevBtn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                              }
                            }
                          } else if (e.key === 'ArrowLeft') {
                            e.preventDefault();
                            setIsOpen(false);
                            const trigger = document.getElementById('watch-provider-trigger');
                            if (trigger) {
                              trigger.focus();
                            }
                          }
                        }}
                        className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 sm:px-4 sm:py-3 rounded-xl text-left transition-all tv-focus-target touch-manipulation focus:outline-none focus:border-hbo-cyan focus:ring-2 focus:ring-hbo-cyan active:scale-[0.98] ${
                          isSelected
                            ? 'bg-gradient-to-r from-hbo-purple/40 to-hbo-cyan/20 border border-hbo-cyan text-white shadow-hbo-glow'
                            : 'text-gray-300 hover:text-white hover:bg-white/5 border border-transparent'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className={`text-xs sm:text-sm font-bold ${isSelected ? 'text-hbo-cyan' : 'text-white'}`}>
                              {provider.name}
                            </p>
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-white/10 text-gray-300 font-bold whitespace-nowrap flex-shrink-0">
                              {provider.badge}
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">
                            {provider.tagline}
                          </p>
                        </div>

                        {isSelected && (
                          <Check className="w-4 h-4 text-hbo-cyan flex-shrink-0 ml-1" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
