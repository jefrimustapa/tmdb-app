import React, { useState, useEffect, useRef } from 'react';
import { dbService } from '../../services/db';
import type { UserSettings } from '../../types/db';
import { STREAM_PROVIDERS } from '../../services/streamProviders';
import { useDevice } from '../../hooks/useDevice';
import { Logo } from '../../components/common/Logo';
import { APP_VERSION, APP_BUILD_NUMBER, APP_VERSION_FULL, APP_BUILD_CHANNEL } from '../../version';
import { updateService, type UpdateInfo } from '../../services/updateService';
import { UpdateModal } from '../../components/common/UpdateModal';
import { Settings as SettingsIcon, Tv2, Smartphone, Tablet, Monitor, ShieldCheck, Server, Database, Check, ShieldAlert, EyeOff, Lock, Zap, X, ArrowUpCircle, RefreshCw, Moon, Sparkles, AlertCircle, CalendarX, ChevronDown } from 'lucide-react';

export const Settings: React.FC = () => {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [savedMessage, setSavedMessage] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const handleCheckForUpdates = async () => {
    setCheckingUpdate(true);
    setUpdateError(null);
    try {
      const info = await updateService.checkForUpdates(settings?.includeNightlyUpdates ?? false);
      setUpdateInfo(info);
      if (info.hasUpdate) {
        setShowUpdateModal(true);
      }
    } catch (e: any) {
      setUpdateError(e.message || 'Failed to check for updates');
    } finally {
      setCheckingUpdate(false);
    }
  };

  const [showEasterEgg, setShowEasterEgg] = useState(false);
  const [openDropdownSlot, setOpenDropdownSlot] = useState<number | null>(null);
  const clickCountRef = useRef(0);
  const clickTimerRef = useRef<NodeJS.Timeout | null>(null);
  const { deviceMode, setDeviceMode, detectedPlatform, activeLayout } = useDevice();

  useEffect(() => {
    try {
      (window as any).AndroidBridge?.setDropdownOpen?.(openDropdownSlot !== null);
    } catch {}

    if (openDropdownSlot !== null) {
      setTimeout(() => {
        const activeEl = document.querySelector<HTMLElement>('[data-priority-dropdown-container="true"] [data-provider-selected="true"]') ||
                         document.querySelector<HTMLElement>('[data-priority-dropdown-container="true"] .tv-focus-target');
        if (activeEl) {
          activeEl.focus();
        }
      }, 50);
    }

    return () => {
      try {
        (window as any).AndroidBridge?.setDropdownOpen?.(false);
      } catch {}
    };
  }, [openDropdownSlot]);

  // Handle remote Back button, Escape, and Left/Right arrow dismissal for priority dropdowns
  useEffect(() => {
    const handleCloseFromEvent = () => {
      const slot = openDropdownSlot;
      setOpenDropdownSlot(null);
      if (slot !== null) {
        setTimeout(() => {
          document.getElementById(`priority-server-btn-${slot}`)?.focus();
        }, 50);
      }
    };

    window.addEventListener('tmdb_close_dropdowns', handleCloseFromEvent);

    if (openDropdownSlot === null) {
      return () => {
        window.removeEventListener('tmdb_close_dropdowns', handleCloseFromEvent);
      };
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      // Remote Back button or Escape key
      if (
        e.key === 'Escape' ||
        e.key === 'BrowserBack' ||
        e.key === 'Back' ||
        e.keyCode === 27 ||
        e.keyCode === 4 ||
        e.keyCode === 10009
      ) {
        e.preventDefault();
        e.stopPropagation();
        const slot = openDropdownSlot;
        setOpenDropdownSlot(null);
        setTimeout(() => {
          document.getElementById(`priority-server-btn-${slot}`)?.focus();
        }, 50);
        return;
      }

      // Arrow Right from inside dropdown closes and moves to next priority slot
      if (e.key === 'ArrowRight' && openDropdownSlot < 2) {
        e.preventDefault();
        e.stopPropagation();
        const nextSlot = openDropdownSlot + 1;
        setOpenDropdownSlot(null);
        setTimeout(() => {
          document.getElementById(`priority-server-btn-${nextSlot}`)?.focus();
        }, 50);
        return;
      }

      // Arrow Left from inside dropdown closes and moves to previous priority slot
      if (e.key === 'ArrowLeft' && openDropdownSlot > 0) {
        e.preventDefault();
        e.stopPropagation();
        const prevSlot = openDropdownSlot - 1;
        setOpenDropdownSlot(null);
        setTimeout(() => {
          document.getElementById(`priority-server-btn-${prevSlot}`)?.focus();
        }, 50);
        return;
      }
    };

    const handleDocumentClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-priority-dropdown-container="true"]')) {
        setOpenDropdownSlot(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    document.addEventListener('mousedown', handleDocumentClick);

    return () => {
      window.removeEventListener('tmdb_close_dropdowns', handleCloseFromEvent);
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      document.removeEventListener('mousedown', handleDocumentClick);
    };
  }, [openDropdownSlot]);

  const handleBuildNumberClick = () => {
    clickCountRef.current += 1;
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
    }

    if (clickCountRef.current >= 3) {
      clickCountRef.current = 0;
      setShowEasterEgg(true);
    } else {
      clickTimerRef.current = setTimeout(() => {
        clickCountRef.current = 0;
      }, 1500);
    }
  };

  useEffect(() => {
    dbService.getSettings().then(setSettings);
  }, []);

  const handleUpdate = async (partial: Partial<UserSettings>) => {
    const updated = await dbService.updateSettings(partial);
    setSettings(updated);
    if (partial.deviceMode) {
      setDeviceMode(partial.deviceMode);
    }
    setSavedMessage(true);
    setTimeout(() => setSavedMessage(false), 2500);
  };

  if (!settings) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-hbo-cyan border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 sm:pt-24 pb-36 px-4 sm:px-8 lg:px-10 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-hbo-border">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-hbo-purple/20 border border-hbo-purple/40 flex items-center justify-center flex-shrink-0 shadow-inner">
            <SettingsIcon className="w-5 h-5 text-hbo-purple-light" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black font-display text-white tracking-tight">System Settings</h1>
            <p className="text-xs sm:text-sm text-gray-400 mt-0.5">Manage device mode, ad shields, and streaming resolvers</p>
          </div>
        </div>

        {savedMessage && (
          <div className="flex items-center gap-2 px-3.5 py-1.5 bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 rounded-full text-xs font-semibold animate-fade-in flex-shrink-0">
            <Check className="w-4 h-4" />
            <span>Saved</span>
          </div>
        )}
      </div>

      <div className="space-y-6 sm:space-y-7">
        {/* Device Profile Mode */}
        <div className="bg-hbo-card border border-hbo-border rounded-2xl p-5 sm:p-7 shadow-lg">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <h3 className="text-base sm:text-lg font-bold font-display text-white flex items-center gap-2.5">
              <Tv2 className="w-5 h-5 text-hbo-cyan flex-shrink-0" />
              <span>Device Experience Mode</span>
            </h3>
            <span className="text-xs px-3 py-1 rounded-full bg-hbo-dark/90 border border-hbo-border text-hbo-cyan font-semibold">
              Active: {activeLayout.toUpperCase()} ({settings.deviceMode === 'auto' ? 'Auto-Detected' : 'Manual Override'})
            </span>
          </div>
          <p className="text-xs text-gray-400 mb-4 leading-relaxed">
            Select your preferred display format or keep Auto-Detect for responsive switching.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-3.5">
            {[
              {
                id: 'auto',
                label: 'Auto Detect',
                icon: Monitor,
                desc: `Live: ${detectedPlatform.toUpperCase()}`
              },
              { id: 'tv', label: 'Android TV', icon: Tv2, desc: 'D-Pad spatial focus' },
              { id: 'tablet', label: 'Tablet / Pad', icon: Tablet, desc: 'Expanded grid touch' },
              { id: 'mobile', label: 'Mobile Phone', icon: Smartphone, desc: 'Bottom navigation' },
              { id: 'desktop', label: 'Desktop / PC', icon: Monitor, desc: 'Wide cinema rail' },
            ].map((mode) => {
              const Icon = mode.icon;
              const isSelected = settings.deviceMode === mode.id;
              return (
                <button
                  key={mode.id}
                  onClick={() => handleUpdate({ deviceMode: mode.id as any })}
                  className={`p-4 rounded-xl border text-left transition-all tv-focus-target flex flex-col justify-between min-h-[96px] ${
                    isSelected
                      ? 'bg-gradient-to-r from-hbo-purple/40 to-hbo-cyan/20 border-hbo-cyan shadow-hbo-glow'
                      : 'bg-hbo-dark/60 border-hbo-border hover:bg-hbo-hover hover:border-white/20'
                  }`}
                >
                  <Icon className={`w-5 h-5 mb-2 flex-shrink-0 ${isSelected ? 'text-hbo-cyan' : 'text-gray-400'}`} />
                  <div>
                    <p className="text-xs sm:text-sm font-bold text-white leading-tight">{mode.label}</p>
                    <p className={`text-[11px] mt-1 leading-snug ${isSelected ? 'text-hbo-cyan font-semibold' : 'text-gray-400'}`}>
                      {mode.desc}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Stream Header Overlay Auto-Hide */}
        <div className="bg-hbo-card border border-hbo-border rounded-2xl p-5 sm:p-7 shadow-lg">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <h3 className="text-base sm:text-lg font-bold font-display text-white flex items-center gap-2.5">
              <EyeOff className="w-5 h-5 text-hbo-cyan flex-shrink-0" />
              <span>Stream Header Auto-Hide Timeout</span>
            </h3>
            <span className="text-xs px-3 py-1 rounded-full bg-hbo-dark/90 border border-hbo-border text-hbo-cyan font-semibold">
              {(settings.streamHeaderTimeout || 5) === 0 ? 'Always Visible' : `${settings.streamHeaderTimeout || 5} Seconds`}
            </span>
          </div>
          <p className="text-xs text-gray-400 mb-4 leading-relaxed">
            Automatically fade out the top overlay header (back button, title, server picker) while streaming. Tap screen to reveal anytime.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { seconds: 3, label: '3 Seconds', desc: 'Quick fade out' },
              { seconds: 5, label: '5 Seconds (Default)', desc: 'Standard cinema mode' },
              { seconds: 8, label: '8 Seconds', desc: 'Relaxed duration' },
              { seconds: 0, label: 'Always Visible', desc: 'Do not auto-hide' }
            ].map((opt) => {
              const isSelected = (settings.streamHeaderTimeout ?? 5) === opt.seconds;
              return (
                <button
                  key={opt.seconds}
                  onClick={() => handleUpdate({ streamHeaderTimeout: opt.seconds })}
                  className={`p-3.5 sm:p-4 rounded-xl border text-left transition-all tv-focus-target min-h-[76px] flex flex-col justify-between ${
                    isSelected
                      ? 'bg-hbo-cyan/20 border-hbo-cyan text-white shadow-hbo-glow'
                      : 'bg-hbo-dark/60 border-hbo-border text-gray-400 hover:text-gray-200 hover:border-white/20'
                  }`}
                >
                  <p className={`text-xs sm:text-sm font-bold ${isSelected ? 'text-hbo-cyan' : 'text-white'}`}>
                    {opt.label}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-1 leading-snug">{opt.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Top 3 Priority Stream Resolvers */}
        <div className="bg-hbo-card border border-hbo-border rounded-2xl p-5 sm:p-7 shadow-lg space-y-5">
          <div className="flex items-start justify-between gap-4 flex-wrap sm:flex-nowrap">
            <div>
              <h3 className="text-base sm:text-lg font-bold font-display text-white flex items-center gap-2.5 mb-1.5">
                <Server className="w-5 h-5 text-hbo-cyan flex-shrink-0" />
                <span>Top 3 Priority Stream Resolvers</span>
              </h3>
              <p className="text-xs text-gray-400 leading-relaxed">
                Choose the 3 primary servers the app will use first in order to resolve streams. If the 1st server fails or buffers, the app automatically fails over to the 2nd and 3rd servers.
              </p>
            </div>
            <span className="text-xs px-3 py-1 rounded-full bg-hbo-purple/30 border border-hbo-purple/50 text-hbo-cyan font-bold whitespace-nowrap hidden sm:inline-block flex-shrink-0">
              {STREAM_PROVIDERS.length} Servers Available
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5 pt-1">
            {[
              {
                index: 0,
                priorityLabel: 'Priority #1 Server (Primary)',
                badgeClass: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
                defaultId: 'vidlink'
              },
              {
                index: 1,
                priorityLabel: 'Priority #2 Server (Failover 1)',
                badgeClass: 'bg-hbo-purple/30 text-hbo-purple-light border-hbo-purple/40',
                defaultId: 'moviesapi'
              },
              {
                index: 2,
                priorityLabel: 'Priority #3 Server (Failover 2)',
                badgeClass: 'bg-hbo-cyan/20 text-hbo-cyan border-hbo-cyan/40',
                defaultId: 'cinesrc'
              }
            ].map(({ index, priorityLabel, badgeClass, defaultId }) => {
              const currentTop = settings.topProviders && settings.topProviders.length >= 3
                ? settings.topProviders
                : ['vidlink', 'moviesapi', 'cinesrc'];
              const selectedId = currentTop[index] || defaultId;
              const selectedProviderObj = STREAM_PROVIDERS.find(p => p.id === selectedId) || STREAM_PROVIDERS[0];

              return (
                <div
                  key={index}
                  className="bg-hbo-dark/70 border border-hbo-border/90 rounded-2xl p-4 sm:p-5 flex flex-col justify-between gap-3.5 shadow-inner"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-md border ${badgeClass}`}>
                      #{index + 1} Priority
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-white/10 text-gray-300 font-bold flex-shrink-0">
                      {selectedProviderObj.badge}
                    </span>
                  </div>

                  <div className="relative" data-priority-dropdown-container="true">
                    <span className="block text-xs font-semibold text-gray-300 mb-1.5">
                      {priorityLabel}
                    </span>
                    <button
                      type="button"
                      id={`priority-server-btn-${index}`}
                      onClick={() => setOpenDropdownSlot(openDropdownSlot === index ? null : index)}
                      className="w-full flex items-center justify-between bg-hbo-card/90 border border-hbo-border text-white text-xs font-bold rounded-xl px-3.5 py-3 min-h-[52px] hover:bg-hbo-hover hover:border-hbo-cyan focus:outline-none focus:border-hbo-cyan focus:ring-2 focus:ring-hbo-cyan transition-all tv-focus-target"
                    >
                      <span className="truncate pr-2 text-xs sm:text-sm">{selectedProviderObj.name}</span>
                      <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${openDropdownSlot === index ? 'rotate-180 text-hbo-cyan' : ''}`} />
                    </button>

                    {/* Inline Dropdown Menu */}
                    {openDropdownSlot === index && (
                      <div
                        className={`absolute ${index === 2 ? 'right-0' : 'left-0'} min-w-[280px] sm:min-w-[320px] top-full mt-2 z-50 bg-hbo-card/98 border border-hbo-border rounded-2xl shadow-2xl p-2 max-h-64 overflow-y-auto space-y-1.5 focus-scroll-container backdrop-blur-2xl animate-fade-in`}
                      >
                        {STREAM_PROVIDERS.map((provider) => {
                          const isSelected = selectedId === provider.id;
                          return (
                            <button
                              key={provider.id}
                              data-provider-selected={isSelected ? 'true' : 'false'}
                              onClick={() => {
                                const updated = [...currentTop] as [string, string, string];
                                updated[index] = provider.id;
                                handleUpdate({
                                  topProviders: updated,
                                  preferredProvider: updated[0]
                                });
                                setOpenDropdownSlot(null);
                                setTimeout(() => {
                                  document.getElementById(`priority-server-btn-${index}`)?.focus();
                                }, 50);
                              }}
                              className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl text-left text-xs transition-all tv-focus-target ${
                                isSelected
                                  ? 'bg-hbo-purple/40 border border-hbo-cyan text-white font-bold shadow-hbo-glow'
                                  : 'text-gray-300 hover:bg-hbo-hover hover:text-white border border-transparent'
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <span className="font-bold text-white block text-xs">{provider.name}</span>
                                <span className="text-[10px] text-gray-400 block leading-tight mt-0.5 truncate">{provider.tagline}</span>
                              </div>
                              <span className="text-[10px] px-2 py-0.5 rounded bg-white/10 text-gray-300 font-bold flex-shrink-0 ml-1">
                                {provider.badge}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <p className="text-[11px] text-gray-400 line-clamp-2 min-h-[32px] leading-snug">
                    {selectedProviderObj.tagline}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Content Safety & Filtering */}
        <div className="bg-hbo-card border border-hbo-border rounded-2xl p-5 sm:p-6 space-y-5">
          {/* Adult Content */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0 pr-2">
              <h3 className="text-base sm:text-lg font-bold font-display text-white flex items-center gap-2 mb-1">
                <EyeOff className="w-5 h-5 text-amber-400 flex-shrink-0" />
                <span>Filter Adult & Explicit Content</span>
              </h3>
              <p className="text-xs text-gray-400">
                SafeSearch mode: Excludes 18+ adult rated media from search queries and discovery catalogs.
              </p>
            </div>

            <button
              onClick={() => handleUpdate({ filterAdult: settings.filterAdult === false ? true : false })}
              className={`flex-shrink-0 w-12 h-6 rounded-full transition-colors relative tv-focus-target ${
                settings.filterAdult !== false ? 'bg-amber-500' : 'bg-gray-700'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform transform ${
                  settings.filterAdult !== false ? 'translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {/* Unreleased Content Filter */}
          <div className="border-t border-hbo-border/60 pt-4 flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0 pr-2">
              <h3 className="text-base sm:text-lg font-bold font-display text-white flex items-center gap-2 mb-1">
                <CalendarX className="w-5 h-5 text-hbo-cyan flex-shrink-0" />
                <span>Filter Out Unreleased Titles</span>
              </h3>
              <p className="text-xs text-gray-400">
                Hide future and unreleased movies and TV series that have not yet premiered or released in theaters/streaming.
              </p>
            </div>

            <button
              onClick={() => handleUpdate({ filterUnreleased: settings.filterUnreleased === false ? true : false })}
              className={`flex-shrink-0 w-12 h-6 rounded-full transition-colors relative tv-focus-target ${
                settings.filterUnreleased !== false ? 'bg-hbo-cyan' : 'bg-gray-700'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform transform ${
                  settings.filterUnreleased !== false ? 'translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          <div className="border-t border-hbo-border/60 pt-4">
            <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-2 flex items-center gap-2">
              <Lock className="w-4 h-4 text-hbo-cyan flex-shrink-0" />
              <span>Catalog Maturity Level / Parental Filter</span>
            </h4>
            <p className="text-xs text-gray-400 mb-3">
              Limit discovery catalog recommendations to age-appropriate certification tiers.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {[
                { id: 'all', label: 'All Ratings', desc: 'Unrestricted (R, TV-MA, PG-13, PG, G)' },
                { id: 'pg13', label: 'Teens & Below', desc: 'Up to PG-13 / TV-14 (Excludes R & TV-MA)' },
                { id: 'family', label: 'Family & Kids', desc: 'Up to PG / TV-PG (Family friendly only)' },
              ].map((lvl) => {
                const isSelected = (settings.maturityLevel || 'all') === lvl.id;
                return (
                  <button
                    key={lvl.id}
                    onClick={() => handleUpdate({ maturityLevel: lvl.id as any })}
                    className={`p-3 rounded-xl border text-left transition-all tv-focus-target ${
                      isSelected
                        ? 'bg-hbo-cyan/20 border-hbo-cyan text-white shadow-hbo-glow'
                        : 'bg-hbo-dark/60 border-hbo-border text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    <p className={`text-xs font-bold ${isSelected ? 'text-hbo-cyan' : 'text-white'}`}>
                      {lvl.label}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{lvl.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Direct Stream Extractor (Option A) */}
        <div className="bg-hbo-card border border-hbo-border rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0 pr-2">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h3 className="text-base sm:text-lg font-bold font-display text-white flex items-center gap-2">
                  <Zap className="w-5 h-5 text-hbo-cyan flex-shrink-0" />
                  <span>Direct Stream Extractor (Option A)</span>
                </h3>
                <span className="px-2 py-0.5 rounded bg-hbo-purple/40 text-hbo-cyan border border-hbo-purple-light text-[10px] font-extrabold uppercase tracking-wider">
                  Experimental
                </span>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">
                Attempts background stream sniffing to extract direct <code className="text-hbo-cyan font-mono text-[11px]">.m3u8</code> / <code className="text-hbo-cyan font-mono text-[11px]">.mp4</code> media links and play them inside a clean native player instead of provider iframes. Automatically falls back to standard player if encrypted.
              </p>
            </div>

            <button
              onClick={() => handleUpdate({ directStreamMode: !settings.directStreamMode })}
              className={`flex-shrink-0 w-12 h-6 rounded-full transition-colors relative tv-focus-target ${
                settings.directStreamMode ? 'bg-hbo-cyan' : 'bg-gray-700'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-black transition-transform transform ${
                  settings.directStreamMode ? 'translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {settings.directStreamMode && (
            <div className="p-3.5 rounded-xl bg-hbo-purple/15 border border-hbo-purple-light/40 text-xs text-gray-300 space-y-1">
              <p className="font-bold text-hbo-cyan flex items-center gap-1.5">
                <span>⚡ Option A Active</span>
              </p>
              <p className="text-[11px] text-gray-400">
                Direct HLS stream extractor will initialize when opening titles. You can toggle between Native Player and Embed Player at any time on the watch screen.
              </p>
            </div>
          )}
        </div>

        {/* Ad & Popup Shield */}
        <div className="bg-hbo-card border border-hbo-border rounded-2xl p-5 sm:p-6 flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0 pr-2">
            <h3 className="text-base sm:text-lg font-bold font-display text-white flex items-center gap-2 mb-1">
              <ShieldCheck className="w-5 h-5 text-green-400 flex-shrink-0" />
              <span>Ad & Popup Sandboxing</span>
            </h3>
            <p className="text-xs text-gray-400">
              Restricts iframe popups, new window triggers, and click hijacking.
            </p>
          </div>

          <button
            onClick={() => handleUpdate({ adBlockShield: !settings.adBlockShield })}
            data-settings-bottom="true"
            className={`flex-shrink-0 w-12 h-6 rounded-full transition-colors relative tv-focus-target ${
              settings.adBlockShield ? 'bg-hbo-purple-light' : 'bg-gray-700'
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full bg-white transition-transform transform ${
                settings.adBlockShield ? 'translate-x-6' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        {/* Software Updates & Release Channel */}
        <div className="bg-hbo-card border border-hbo-border rounded-2xl p-5 sm:p-6 space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0 pr-2">
              <h3 className="text-base sm:text-lg font-bold font-display text-white flex items-center gap-2 mb-1">
                <ArrowUpCircle className="w-5 h-5 text-hbo-cyan flex-shrink-0" />
                <span>Software Update</span>
              </h3>
              <p className="text-xs text-gray-400">
                Check for new versions, bug fixes, and feature updates directly from GitHub Releases.
              </p>
            </div>

            <button
              onClick={handleCheckForUpdates}
              disabled={checkingUpdate}
              className="flex-shrink-0 px-4 py-2.5 rounded-xl bg-gradient-to-r from-hbo-purple to-hbo-cyan hover:opacity-90 active:scale-95 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-hbo-purple/30 tv-focus-target transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${checkingUpdate ? 'animate-spin' : ''}`} />
              <span>{checkingUpdate ? 'Checking...' : 'Check for Updates'}</span>
            </button>
          </div>

          {/* Update Status Banner if already checked */}
          {updateInfo && (
            <div className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs ${
              updateInfo.hasUpdate 
                ? 'bg-hbo-purple/20 border-hbo-purple-light text-white' 
                : 'bg-white/5 border-white/10 text-gray-300'
            }`}>
              <div className="flex items-center gap-2.5 min-w-0">
                {updateInfo.hasUpdate ? (
                  <Sparkles className="w-4 h-4 text-hbo-cyan flex-shrink-0" />
                ) : (
                  <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                )}
                <span className="truncate">
                  {updateInfo.hasUpdate ? `Update Available: v${updateInfo.latestVersion}` : 'You are on the latest build'}
                </span>
              </div>
              {updateInfo.hasUpdate && (
                <button
                  onClick={() => setShowUpdateModal(true)}
                  className="px-3 py-1 bg-hbo-cyan text-black font-bold rounded-lg hover:bg-hbo-cyan/90 text-xs tv-focus-target"
                >
                  View Update
                </button>
              )}
            </div>
          )}

          {updateError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{updateError}</span>
            </div>
          )}

          {/* Nightly Channel Toggle */}
          <div className="border-t border-hbo-border/60 pt-4 flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0 pr-2">
              <h4 className="text-xs font-bold text-gray-200 flex items-center gap-2 mb-0.5">
                <Moon className="w-3.5 h-3.5 text-amber-400" />
                <span>Include Nightly Builds</span>
              </h4>
              <p className="text-[11px] text-gray-400">
                Receive bleeding-edge automated daily builds before official stable releases.
              </p>
            </div>

            <button
              onClick={() => handleUpdate({ includeNightlyUpdates: !settings.includeNightlyUpdates })}
              className={`flex-shrink-0 w-12 h-6 rounded-full transition-colors relative tv-focus-target ${
                settings.includeNightlyUpdates ? 'bg-hbo-cyan' : 'bg-gray-700'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform transform ${
                  settings.includeNightlyUpdates ? 'translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </div>

        {/* About & Metadata Card */}
        <div className="w-full bg-hbo-card/40 border border-hbo-border/60 rounded-2xl p-5 sm:p-6 text-xs text-gray-400 space-y-3 text-left">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="font-bold text-gray-200 text-sm flex items-center gap-2">
                <span>TMDB Streamer v{APP_VERSION}</span>
                {APP_BUILD_CHANNEL !== 'stable' && (
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-hbo-cyan/20 text-hbo-cyan border border-hbo-cyan/40">
                    {APP_BUILD_CHANNEL}
                  </span>
                )}
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">{APP_VERSION_FULL}</p>
            </div>
            
            {/* Build Number as a dedicated focusable / selectable button */}
            <button
              type="button"
              onClick={handleBuildNumberClick}
              className="px-3.5 py-1.5 rounded-full bg-hbo-purple/30 border border-hbo-purple-light text-hbo-cyan font-mono text-xs font-bold tv-focus-target focus:outline-none focus:border-hbo-cyan focus:ring-2 focus:ring-hbo-cyan/60 focus:bg-hbo-purple/60 focus:shadow-hbo-glow transition-all cursor-pointer inline-flex items-center gap-1.5 active:scale-95"
            >
              <span>Build #{APP_BUILD_NUMBER}</span>
            </button>
          </div>
          <p className="text-gray-400 text-xs leading-relaxed">
            This application uses the TMDB API and free third-party streaming video embeds.
          </p>
        </div>
      </div>

      {/* Full Page Logo Screen (Easter Egg on 3 taps) */}
      {showEasterEgg && (
        <div
          onClick={() => setShowEasterEgg(false)}
          className="fixed inset-0 z-50 bg-hbo-dark/95 backdrop-blur-2xl flex flex-col items-center justify-center p-6 animate-fade-in cursor-pointer select-none"
        >
          <button
            onClick={() => setShowEasterEgg(false)}
            className="absolute top-8 right-8 p-3 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 text-gray-300 hover:text-white transition-all tv-focus-target focus:outline-none focus:ring-2 focus:ring-hbo-cyan"
            aria-label="Close"
          >
            <X className="w-6 h-6" />
          </button>

          <div className="flex flex-col items-center justify-center text-center space-y-6 animate-scale-in max-w-sm w-full">
            <div className="p-6 sm:p-8 rounded-3xl bg-hbo-card/90 border border-hbo-border/80 shadow-[0_0_60px_rgba(144,85,255,0.3)] flex items-center justify-center">
              <Logo size="lg" showText={true} />
            </div>

            <div className="space-y-2">
              <span className="px-3.5 py-1 rounded-full bg-hbo-purple/30 border border-hbo-purple-light text-hbo-cyan font-mono text-xs font-bold shadow-sm inline-block">
                v{APP_VERSION} (Build #{APP_BUILD_NUMBER})
              </span>
              <p className="text-xs text-gray-400">
                Community Streaming & Discovery Suite
              </p>
            </div>

            <p className="text-[11px] text-gray-500 pt-4">
              Tap anywhere or press back to return
            </p>
          </div>
        </div>
      )}

      {/* Software Update Modal Dialog */}
      {showUpdateModal && updateInfo && (
        <UpdateModal
          updateInfo={updateInfo}
          onClose={() => setShowUpdateModal(false)}
        />
      )}
    </div>
  );
};

