import React, { useState, useEffect, useRef } from 'react';
import { dbService } from '../../services/db';
import type { UserSettings } from '../../types/db';
import { STREAM_PROVIDERS } from '../../services/streamProviders';
import { useDevice } from '../../hooks/useDevice';
import { Logo } from '../../components/common/Logo';
import { APP_VERSION, APP_BUILD_NUMBER, APP_VERSION_FULL, APP_BUILD_CHANNEL, APP_CHANGELOG } from '../../version';
import { updateService, type UpdateInfo } from '../../services/updateService';
import { UpdateModal } from '../../components/common/UpdateModal';
import { FormattedChangelog } from '../../components/common/FormattedChangelog';
import {
  Settings as SettingsIcon,
  Tv2,
  Smartphone,
  Tablet,
  Monitor,
  ShieldCheck,
  Server,
  Check,
  EyeOff,
  Lock,
  Zap,
  X,
  ArrowUpCircle,
  RefreshCw,
  Moon,
  Sparkles,
  AlertCircle,
  CalendarX,
  ChevronDown,
  MousePointer,
  Radio,
  FileText,
  Clock,
  Percent,
  Info
} from 'lucide-react';

import { CURSOR_STYLES_LIST } from '../../components/player/TVVirtualCursor';

type TVCategory = 'playback' | 'display' | 'controls' | 'content' | 'system';

export const Settings: React.FC = () => {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [savedMessage, setSavedMessage] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<TVCategory>('playback');

  const contentPanelRef = useRef<HTMLDivElement>(null);

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
  const easterEggScrollRef = useRef<HTMLDivElement>(null);
  const [openDropdownSlot, setOpenDropdownSlot] = useState<number | null>(null);
  const clickCountRef = useRef(0);
  const clickTimerRef = useRef<NodeJS.Timeout | null>(null);
  const { deviceMode, setDeviceMode, detectedPlatform, activeLayout } = useDevice();

  const isAnyDropdownOpen = openDropdownSlot !== null;

  // Reset scroll position of child panel when activeCategory changes
  useEffect(() => {
    if (contentPanelRef.current) {
      contentPanelRef.current.scrollTo({ top: 0, behavior: 'instant' as any });
    }
  }, [activeCategory]);

  useEffect(() => {
    try {
      (window as any).AndroidBridge?.setDropdownOpen?.(isAnyDropdownOpen);
    } catch {}

    if (openDropdownSlot !== null) {
      setTimeout(() => {
        const activeEl = document.querySelector<HTMLElement>('[data-priority-dropdown-container="true"] [data-provider-selected="true"]') ||
                         document.querySelector<HTMLElement>('[data-priority-dropdown-container="true"] .tv-focus-target');
        if (activeEl) {
          activeEl.focus();
          activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }, 50);
    }

    return () => {
      try {
        (window as any).AndroidBridge?.setDropdownOpen?.(false);
      } catch {}
    };
  }, [openDropdownSlot, isAnyDropdownOpen]);

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

    if (!isAnyDropdownOpen) {
      return () => {
        window.removeEventListener('tmdb_close_dropdowns', handleCloseFromEvent);
      };
    }

    const handleKeyDown = (e: KeyboardEvent) => {
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
        if (slot !== null) {
          setTimeout(() => {
            document.getElementById(`priority-server-btn-${slot}`)?.focus();
          }, 50);
        }
        return;
      }

      if (e.key === 'ArrowRight' && openDropdownSlot !== null && openDropdownSlot < 2) {
        e.preventDefault();
        e.stopPropagation();
        const nextSlot = openDropdownSlot + 1;
        setOpenDropdownSlot(null);
        setTimeout(() => {
          document.getElementById(`priority-server-btn-${nextSlot}`)?.focus();
        }, 50);
        return;
      }

      if (e.key === 'ArrowLeft' && openDropdownSlot !== null && openDropdownSlot > 0) {
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
  }, [openDropdownSlot, isAnyDropdownOpen]);

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

  const handleEasterEggScrollKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!easterEggScrollRef.current) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      easterEggScrollRef.current.scrollBy({ top: 80, behavior: 'smooth' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      easterEggScrollRef.current.scrollBy({ top: -80, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    if (!showEasterEgg) return;

    const handleEasterEggBack = (e: KeyboardEvent) => {
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
        setShowEasterEgg(false);
      }
    };

    window.addEventListener('keydown', handleEasterEggBack, { capture: true });
    setTimeout(() => {
      easterEggScrollRef.current?.focus();
    }, 50);

    return () => {
      window.removeEventListener('keydown', handleEasterEggBack, { capture: true });
    };
  }, [showEasterEgg]);

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
      <div className="h-screen flex items-center justify-center bg-black">
        <div className="w-8 h-8 border-4 border-hbo-cyan border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const categories: { id: TVCategory; label: string; icon: any; desc: string }[] = [
    { id: 'playback', label: 'Playback & Stream', icon: Zap, desc: 'Auto-play, resolvers, priority' },
    { id: 'display', label: 'Display & UI', icon: Monitor, desc: 'Device mode, timeouts, graphics' },
    { id: 'controls', label: 'Remote & Cursor', icon: MousePointer, desc: 'Virtual cursor, styles, speed' },
    { id: 'content', label: 'Content Controls', icon: ShieldCheck, desc: 'Maturity, explicit filters' },
    { id: 'system', label: 'System & Updates', icon: Info, desc: 'Software updates, build info' },
  ];

  return (
    <div className="h-screen w-full overflow-hidden flex flex-col pt-5 px-6 pb-3 select-none">
      {/* 1. Static Top Title Header - Same exact background color as the body (#050508) */}
      <div className="flex items-center justify-between mb-3.5 pb-2.5 border-b border-hbo-border/60 flex-shrink-0 z-20 bg-[#050508]">
        <div className="flex items-center gap-3.5">
          <div className="w-9 h-9 rounded-xl bg-hbo-purple/20 border border-hbo-purple/40 flex items-center justify-center flex-shrink-0 shadow-inner">
            <SettingsIcon className="w-4.5 h-4.5 text-hbo-purple-light" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black font-display text-white tracking-tight leading-none">System Settings</h1>
            <p className="text-[11px] text-gray-400 mt-0.5">Manage streaming resolvers, display, cursor controls, and software updates</p>
          </div>
        </div>

        {savedMessage && (
          <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 rounded-full text-xs font-semibold animate-fade-in flex-shrink-0">
            <Check className="w-3.5 h-3.5" />
            <span>Saved</span>
          </div>
        )}
      </div>

      {/* 2. Main Content Split View: Left Static Category Rail + Right Vertical Sliding Rail */}
      <div className="flex-1 min-h-0 flex flex-row gap-6 items-start overflow-visible">
        {/* Left Static Category Rail - Ample Width and Clean 8px Ring Padding Buffer */}
        <div className="w-80 flex-shrink-0 space-y-2.5 px-2 py-1">
          <span className="text-[11px] font-black uppercase tracking-wider text-gray-400 px-2 block mb-1">
            Categories
          </span>

          {categories.map((cat) => {
            const Icon = cat.icon;
            const isSelected = activeCategory === cat.id;

            return (
              <button
                key={cat.id}
                id={`tv-settings-cat-${cat.id}`}
                data-tv-category-item="true"
                data-tv-category-active={isSelected ? 'true' : 'false'}
                onClick={() => setActiveCategory(cat.id)}
                onFocus={() => setActiveCategory(cat.id)}
                className={`w-full p-3.5 rounded-2xl border text-left transition-all tv-focus-target flex items-center justify-between gap-3 min-h-[66px] ${
                  isSelected
                    ? 'bg-gradient-to-r from-hbo-purple/60 via-hbo-purple/30 to-hbo-cyan/20 border-hbo-cyan shadow-hbo-glow text-white ring-2 ring-hbo-cyan/60'
                    : 'bg-hbo-card/70 border-hbo-border hover:bg-hbo-hover hover:border-white/20 text-gray-300'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className={`w-8.5 h-8.5 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    isSelected ? 'bg-hbo-cyan text-black' : 'bg-white/10 text-gray-400'
                  }`}>
                    <Icon className="w-4.5 h-4.5 stroke-[2.5]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs sm:text-sm font-bold leading-tight truncate ${isSelected ? 'text-white' : 'text-gray-200'}`}>
                      {cat.label}
                    </p>
                    <p className={`text-[10px] mt-0.5 truncate ${isSelected ? 'text-hbo-cyan font-medium' : 'text-gray-400'}`}>
                      {cat.desc}
                    </p>
                  </div>
                </div>

                {isSelected && (
                  <span className="w-2 h-2 rounded-full bg-hbo-cyan animate-pulse flex-shrink-0" />
                )}
              </button>
            );
          })}
        </div>

        {/* Right Vertical Sliding Rail (Child Panel) */}
        <div
          ref={contentPanelRef}
          data-settings-panel="true"
          className="flex-1 min-w-0 h-full overflow-y-auto overflow-x-hidden pr-3 pb-32 space-y-3.5 focus-scroll-container scroll-smooth"
        >
          {/* ========================================================================= */}
          {/* 1. PLAYBACK & STREAMING PANEL                                            */}
          {/* ========================================================================= */}
          {activeCategory === 'playback' && (
            <div className="space-y-3.5 animate-fade-in">
              {/* Row 1: Auto-Play Next Episode Toggle */}
              <div
                data-settings-row="true"
                className="bg-hbo-card border border-hbo-border rounded-2xl p-4 shadow-lg flex items-center justify-between gap-4"
              >
                <div className="flex-1 min-w-0 pr-2">
                  <h3 className="text-sm sm:text-base font-bold font-display text-white flex items-center gap-2 mb-0.5">
                    <Sparkles className="w-4.5 h-4.5 text-hbo-purple-light flex-shrink-0" />
                    <span>Auto-Play Next Episode</span>
                  </h3>
                  <p className="text-[11px] text-gray-400">
                    Display the "Up Next" preview popup and advance automatically to next episode.
                  </p>
                </div>

                <button
                  onClick={() => handleUpdate({ autoplayNext: settings.autoplayNext === false ? true : false })}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all tv-focus-target flex items-center gap-1.5 flex-shrink-0 border ${
                    settings.autoplayNext !== false
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-400 shadow-md'
                      : 'bg-white/5 border-white/10 text-gray-400'
                  }`}
                >
                  {settings.autoplayNext !== false ? (
                    <>
                      <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Enabled</span>
                    </>
                  ) : (
                    <>
                      <X className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Disabled</span>
                    </>
                  )}
                </button>
              </div>

              {settings.autoplayNext !== false && (
                <>
                  {/* Row 2: Popup Trigger Timing (% of Episode) */}
                  <div
                    data-settings-row="true"
                    className="bg-hbo-card border border-hbo-border rounded-2xl p-4 shadow-lg space-y-2.5"
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <div>
                        <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider flex items-center gap-1.5">
                          <Percent className="w-3.5 h-3.5 text-hbo-cyan flex-shrink-0" />
                          <span>Popup Trigger Timing (% of Episode)</span>
                        </h4>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          Playback completion percentage when the "Up Next" popup appears.
                        </p>
                      </div>
                      <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-black/80 border border-hbo-border text-hbo-cyan font-bold flex-shrink-0">
                        {settings.upNextTriggerPercent || 90}% Progress
                      </span>
                    </div>

                    <div className="grid grid-cols-5 gap-2">
                      {[
                        { percent: 80, label: '80%', desc: 'Early' },
                        { percent: 85, label: '85%', desc: 'Mid' },
                        { percent: 90, label: '90%', desc: 'Default' },
                        { percent: 95, label: '95%', desc: 'End' },
                        { percent: 100, label: '100%', desc: 'Finish' },
                      ].map((opt) => {
                        const isSelected = (settings.upNextTriggerPercent || 90) === opt.percent;
                        return (
                          <button
                            key={opt.percent}
                            type="button"
                            onClick={() => handleUpdate({ upNextTriggerPercent: opt.percent })}
                            className={`py-2.5 px-1.5 rounded-xl border text-center transition-all tv-focus-target flex flex-col items-center justify-center gap-0.5 ${
                              isSelected
                                ? 'bg-hbo-purple/40 border-hbo-cyan text-white font-bold shadow-lg ring-1 ring-hbo-cyan/50'
                                : 'bg-hbo-dark/60 border-hbo-border hover:bg-hbo-hover hover:border-white/20 text-gray-300'
                            }`}
                          >
                            <span className="text-sm font-bold text-white leading-none">{opt.label}</span>
                            <span className={`text-[9px] ${isSelected ? 'text-hbo-cyan font-semibold' : 'text-gray-500'}`}>
                              {opt.desc}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Row 3: Countdown Timeout Before Next Episode */}
                  <div
                    data-settings-row="true"
                    className="bg-hbo-card border border-hbo-border rounded-2xl p-4 shadow-lg space-y-2.5"
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <div>
                        <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-hbo-cyan flex-shrink-0" />
                          <span>Countdown Timeout Before Next Episode</span>
                        </h4>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          Seconds countdown timer displays before starting the next episode.
                        </p>
                      </div>
                      <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-black/80 border border-hbo-border text-hbo-cyan font-bold flex-shrink-0">
                        {settings.upNextTimeout || 10} Seconds
                      </span>
                    </div>

                    <div className="grid grid-cols-4 gap-2.5">
                      {[
                        { seconds: 5, label: '5s', desc: 'Fast transition' },
                        { seconds: 10, label: '10s', desc: 'Standard (Default)' },
                        { seconds: 15, label: '15s', desc: 'Relaxed duration' },
                        { seconds: 20, label: '20s', desc: 'Extended time' },
                      ].map((opt) => {
                        const isSelected = (settings.upNextTimeout || 10) === opt.seconds;
                        return (
                          <button
                            key={opt.seconds}
                            onClick={() => handleUpdate({ upNextTimeout: opt.seconds })}
                            className={`p-2.5 rounded-xl border text-left transition-all tv-focus-target flex flex-col justify-between ${
                              isSelected
                                ? 'bg-hbo-purple/40 border-hbo-purple-light text-white shadow-md ring-1 ring-hbo-purple-light/50'
                                : 'bg-hbo-dark/60 border-hbo-border hover:bg-hbo-hover hover:border-white/20 text-gray-300'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="text-xs sm:text-sm font-bold text-white">{opt.label}</span>
                              {isSelected && <Check className="w-3 h-3 text-hbo-cyan flex-shrink-0" />}
                            </div>
                            <span className={`text-[9px] leading-snug ${isSelected ? 'text-hbo-cyan font-medium' : 'text-gray-400'}`}>
                              {opt.desc}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              {/* Row 4: Stream Engine - TorBox Debrid */}
              {(() => {
                const currentEnabled = settings.enabledResolvers && settings.enabledResolvers.length > 0
                  ? settings.enabledResolvers
                  : ['embed'];
                const isTorboxEnabled = currentEnabled.includes('torbox');

                return (
                  <div
                    data-settings-row="true"
                    className="bg-hbo-card border border-hbo-border rounded-2xl p-4 shadow-lg"
                  >
                    <button
                      onClick={() => {
                        let updated: ('embed' | 'private_extractor' | 'torbox')[];
                        if (isTorboxEnabled) {
                          if (currentEnabled.length === 1) return;
                          updated = currentEnabled.filter(r => r !== 'torbox') as ('embed' | 'private_extractor' | 'torbox')[];
                        } else {
                          updated = [...currentEnabled, 'torbox'] as ('embed' | 'private_extractor' | 'torbox')[];
                        }
                        handleUpdate({
                          enabledResolvers: updated,
                          streamResolver: updated[0] || 'embed'
                        });
                      }}
                      className={`w-full p-3.5 rounded-xl border text-left transition-all tv-focus-target flex flex-col justify-between ${
                        isTorboxEnabled
                          ? 'bg-hbo-purple/30 border-hbo-cyan text-white shadow-hbo-glow ring-1 ring-hbo-cyan/40'
                          : 'bg-black/30 border-hbo-border hover:border-gray-600 text-gray-500 opacity-60'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1 gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${isTorboxEnabled ? 'bg-hbo-cyan border-hbo-cyan' : 'border-gray-600 bg-black/40'}`}>
                              {isTorboxEnabled && <Check className="w-3 h-3 text-black stroke-[3]" />}
                            </div>
                            <span className="font-bold text-xs sm:text-sm text-white truncate">TorBox Debrid Stream Engine</span>
                          </div>
                          <span className={`text-[9px] px-2 py-0.5 rounded font-mono font-bold flex-shrink-0 ${isTorboxEnabled ? 'bg-hbo-cyan/20 text-hbo-cyan border border-hbo-cyan/40' : 'bg-gray-800 text-gray-500'}`}>
                            4K Ultra HD
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-300 leading-relaxed">Direct HTTPS 4K HDR & 1080p BluRay cloud streams via TorBox CDN.</p>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[10px] font-bold">
                        <span className={isTorboxEnabled ? 'text-hbo-cyan' : 'text-gray-500'}>#1 Priority Engine</span>
                        <span className={isTorboxEnabled ? 'text-emerald-400' : 'text-gray-500'}>{isTorboxEnabled ? '● Enabled' : '○ Disabled'}</span>
                      </div>
                    </button>
                  </div>
                );
              })()}

              {/* Row 5: TorBox API Key Input (if enabled) */}
              {(settings.enabledResolvers || []).includes('torbox') && (
                <div
                  data-settings-row="true"
                  className="bg-hbo-card border border-emerald-500/40 rounded-2xl p-4 shadow-lg space-y-1.5"
                >
                  <p className="font-bold text-xs text-emerald-400 flex items-center gap-1.5">
                    <Radio className="w-3.5 h-3.5 text-emerald-400" />
                    <span>TorBox Debrid API Key</span>
                  </p>
                  <input
                    type="password"
                    placeholder="Paste your TorBox API Key here..."
                    value={settings.torboxApiKey || ''}
                    onChange={(e) => handleUpdate({ torboxApiKey: e.target.value })}
                    className="w-full bg-black/60 border border-gray-700 focus:border-emerald-400 text-white px-3 py-2 rounded-xl text-xs font-mono outline-none tv-focus-target"
                  />
                </div>
              )}

              {/* Row 6: Stream Engine - Private Extractor */}
              {(() => {
                const currentEnabled = settings.enabledResolvers && settings.enabledResolvers.length > 0
                  ? settings.enabledResolvers
                  : ['embed'];
                const isExtractorEnabled = currentEnabled.includes('private_extractor');

                return (
                  <div
                    data-settings-row="true"
                    className="bg-hbo-card border border-hbo-border rounded-2xl p-4 shadow-lg"
                  >
                    <button
                      onClick={() => {
                        let updated: ('embed' | 'private_extractor' | 'torbox')[];
                        if (isExtractorEnabled) {
                          if (currentEnabled.length === 1) return;
                          updated = currentEnabled.filter(r => r !== 'private_extractor') as ('embed' | 'private_extractor' | 'torbox')[];
                        } else {
                          updated = [...currentEnabled, 'private_extractor'] as ('embed' | 'private_extractor' | 'torbox')[];
                        }
                        handleUpdate({
                          enabledResolvers: updated,
                          streamResolver: updated[0] || 'embed'
                        });
                      }}
                      className={`w-full p-3.5 rounded-xl border text-left transition-all tv-focus-target flex flex-col justify-between ${
                        isExtractorEnabled
                          ? 'bg-hbo-purple/30 border-hbo-cyan text-white shadow-hbo-glow ring-1 ring-hbo-cyan/40'
                          : 'bg-black/30 border-hbo-border hover:border-gray-600 text-gray-500 opacity-60'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1 gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${isExtractorEnabled ? 'bg-hbo-cyan border-hbo-cyan' : 'border-gray-600 bg-black/40'}`}>
                              {isExtractorEnabled && <Check className="w-3 h-3 text-black stroke-[3]" />}
                            </div>
                            <span className="font-bold text-xs sm:text-sm text-white truncate">Private Extractor Stream Engine</span>
                          </div>
                          <span className={`text-[9px] px-2 py-0.5 rounded font-mono font-bold flex-shrink-0 ${isExtractorEnabled ? 'bg-hbo-cyan/20 text-hbo-cyan border border-hbo-cyan/40' : 'bg-gray-800 text-gray-500'}`}>
                            Consumet API
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-300 leading-relaxed">Direct HLS .m3u8 streams resolved via your private backend (Render API).</p>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[10px] font-bold">
                        <span className={isExtractorEnabled ? 'text-hbo-cyan' : 'text-gray-500'}>#2 Priority Engine</span>
                        <span className={isExtractorEnabled ? 'text-emerald-400' : 'text-gray-500'}>{isExtractorEnabled ? '● Enabled' : '○ Disabled'}</span>
                      </div>
                    </button>
                  </div>
                );
              })()}

              {/* Row 7: Stream Engine - Embed Resolver */}
              {(() => {
                const currentEnabled = settings.enabledResolvers && settings.enabledResolvers.length > 0
                  ? settings.enabledResolvers
                  : ['embed'];
                const isEmbedEnabled = currentEnabled.includes('embed');

                return (
                  <div
                    data-settings-row="true"
                    className="bg-hbo-card border border-hbo-border rounded-2xl p-4 shadow-lg"
                  >
                    <button
                      onClick={() => {
                        let updated: ('embed' | 'private_extractor' | 'torbox')[];
                        if (isEmbedEnabled) {
                          if (currentEnabled.length === 1) return;
                          updated = currentEnabled.filter(r => r !== 'embed') as ('embed' | 'private_extractor' | 'torbox')[];
                        } else {
                          updated = [...currentEnabled, 'embed'] as ('embed' | 'private_extractor' | 'torbox')[];
                        }
                        handleUpdate({
                          enabledResolvers: updated,
                          streamResolver: updated[0] || 'embed'
                        });
                      }}
                      className={`w-full p-3.5 rounded-xl border text-left transition-all tv-focus-target flex flex-col justify-between ${
                        isEmbedEnabled
                          ? 'bg-hbo-purple/30 border-hbo-cyan text-white shadow-hbo-glow ring-1 ring-hbo-cyan/40'
                          : 'bg-black/30 border-hbo-border hover:border-gray-600 text-gray-500 opacity-60'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1 gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${isEmbedEnabled ? 'bg-hbo-cyan border-hbo-cyan' : 'border-gray-600 bg-black/40'}`}>
                              {isEmbedEnabled && <Check className="w-3 h-3 text-black stroke-[3]" />}
                            </div>
                            <span className="font-bold text-xs sm:text-sm text-white truncate">Embed Resolver Stream Engine</span>
                          </div>
                          <span className={`text-[9px] px-2 py-0.5 rounded font-mono font-bold flex-shrink-0 ${isEmbedEnabled ? 'bg-hbo-cyan/20 text-hbo-cyan border border-hbo-cyan/40' : 'bg-gray-800 text-gray-500'}`}>
                            Multi-Mirror
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-300 leading-relaxed">Standard multi-server iframe embeds (VidLink, MoviesAPI) with ad & popup sandboxing.</p>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[10px] font-bold">
                        <span className={isEmbedEnabled ? 'text-hbo-cyan' : 'text-gray-500'}>#3 Priority Engine</span>
                        <span className={isEmbedEnabled ? 'text-emerald-400' : 'text-gray-500'}>{isEmbedEnabled ? '● Enabled' : '○ Disabled'}</span>
                      </div>
                    </button>
                  </div>
                );
              })()}

              {/* Row 8: Embed Resolver Priority Server Slots */}
              <div
                data-settings-row="true"
                className="bg-hbo-card border border-hbo-border rounded-2xl p-4 shadow-lg space-y-2.5"
              >
                <div className="flex items-center justify-between mb-0.5">
                  <div>
                    <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
                      <Server className="w-3.5 h-3.5 text-hbo-cyan flex-shrink-0" />
                      <span>Embed Resolver Priority Servers</span>
                    </h3>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Choose the 3 primary fallback embed servers for Embed Resolver playback.
                    </p>
                  </div>
                  <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-hbo-purple/30 border border-hbo-purple/50 text-hbo-cyan font-bold flex-shrink-0">
                    {STREAM_PROVIDERS.length} Servers Available
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  {[
                    { index: 0, priorityLabel: '#1 Priority (Primary)', badgeClass: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40', defaultId: 'vidlink' },
                    { index: 1, priorityLabel: '#2 Priority (Failover 1)', badgeClass: 'bg-hbo-purple/30 text-hbo-purple-light border-hbo-purple/40', defaultId: 'moviesapi' },
                    { index: 2, priorityLabel: '#3 Priority (Failover 2)', badgeClass: 'bg-hbo-cyan/20 text-hbo-cyan border-hbo-cyan/40', defaultId: 'cinesrc' }
                  ].map(({ index, priorityLabel, badgeClass, defaultId }) => {
                    const currentTop = settings.topProviders && settings.topProviders.length >= 3
                      ? settings.topProviders
                      : ['vidlink', 'moviesapi', 'cinesrc'];
                    const selectedId = currentTop[index] || defaultId;
                    const selectedProviderObj = STREAM_PROVIDERS.find(p => p.id === selectedId) || STREAM_PROVIDERS[0];

                    return (
                      <div
                        key={index}
                        className="bg-hbo-dark/70 border border-hbo-border/90 rounded-xl p-2.5 flex flex-col justify-between gap-1.5"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-md border ${badgeClass}`}>
                            {priorityLabel}
                          </span>
                        </div>

                        <div className="relative" data-priority-dropdown-container="true">
                          <button
                            type="button"
                            id={`priority-server-btn-${index}`}
                            onClick={() => setOpenDropdownSlot(openDropdownSlot === index ? null : index)}
                            className="w-full flex items-center justify-between bg-hbo-card/90 border border-hbo-border text-white text-xs font-bold rounded-xl px-2.5 py-2 hover:bg-hbo-hover hover:border-hbo-cyan focus:outline-none focus:border-hbo-cyan focus:ring-2 focus:ring-hbo-cyan transition-all tv-focus-target"
                          >
                            <span className="truncate pr-1 text-xs">{selectedProviderObj.name}</span>
                            <ChevronDown className={`w-3 h-3 text-gray-400 flex-shrink-0 transition-transform ${openDropdownSlot === index ? 'rotate-180 text-hbo-cyan' : ''}`} />
                          </button>

                          {openDropdownSlot === index && (
                            <div
                              className="absolute left-0 right-0 w-full top-[calc(100%+4px)] z-50 bg-hbo-card/98 border border-hbo-border rounded-xl shadow-2xl p-2 max-h-[min(260px,calc(100vh-140px))] overflow-y-auto space-y-1.5 focus-scroll-container backdrop-blur-2xl animate-fade-in"
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
                                    className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-left text-xs transition-all tv-focus-target ${
                                      isSelected
                                        ? 'bg-hbo-purple/40 border border-hbo-cyan/60 text-white font-bold'
                                        : 'text-gray-300 hover:bg-hbo-hover hover:text-white border border-transparent'
                                    }`}
                                  >
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center justify-between gap-1.5">
                                        <span className="font-bold text-white block text-xs truncate">{provider.name}</span>
                                        {isSelected && <Check className="w-3 h-3 text-hbo-cyan flex-shrink-0" />}
                                      </div>
                                      <span className="text-[9px] text-gray-400 block leading-normal mt-0.5 truncate">{provider.tagline}</span>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Row 9: Ad & Popup Sandboxing Shield */}
              <div
                data-settings-row="true"
                className="bg-hbo-card border border-hbo-border rounded-2xl p-4 shadow-lg flex items-center justify-between gap-4"
              >
                <div className="flex-1 min-w-0 pr-2">
                  <h3 className="text-sm sm:text-base font-bold font-display text-white flex items-center gap-2 mb-0.5">
                    <ShieldCheck className="w-4.5 h-4.5 text-green-400 flex-shrink-0" />
                    <span>Ad & Popup Sandboxing</span>
                  </h3>
                  <p className="text-[11px] text-gray-400">
                    Restricts iframe popups, new window triggers, and click hijacking.
                  </p>
                </div>

                <button
                  onClick={() => handleUpdate({ adBlockShield: !settings.adBlockShield })}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all tv-focus-target flex items-center gap-1.5 flex-shrink-0 border ${
                    settings.adBlockShield
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-400 shadow-md'
                      : 'bg-white/5 border-white/10 text-gray-400'
                  }`}
                >
                  {settings.adBlockShield ? (
                    <>
                      <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Enabled</span>
                    </>
                  ) : (
                    <>
                      <X className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Disabled</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 2. DISPLAY & UI PANEL                                                    */}
          {/* ========================================================================= */}
          {activeCategory === 'display' && (
            <div className="space-y-3.5 animate-fade-in">
              {/* Row 1: Device Experience Mode */}
              <div
                data-settings-row="true"
                className="bg-hbo-card border border-hbo-border rounded-2xl p-4 shadow-lg space-y-2.5"
              >
                <div className="flex items-center justify-between mb-0.5">
                  <div>
                    <h3 className="text-sm sm:text-base font-bold font-display text-white flex items-center gap-2">
                      <Tv2 className="w-4.5 h-4.5 text-hbo-cyan flex-shrink-0" />
                      <span>Device Experience Mode</span>
                    </h3>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Select your preferred display format or keep Auto-Detect for responsive switching.
                    </p>
                  </div>
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-black/80 border border-hbo-border text-hbo-cyan font-semibold flex-shrink-0">
                    Active: {activeLayout.toUpperCase()} ({settings.deviceMode === 'auto' ? 'Auto' : 'Override'})
                  </span>
                </div>

                <div className="grid grid-cols-5 gap-2.5">
                  {[
                    { id: 'auto', label: 'Auto Detect', icon: Monitor, desc: `Live: ${detectedPlatform.toUpperCase()}` },
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
                        className={`p-3 rounded-xl border text-left transition-all tv-focus-target flex flex-col justify-between min-h-[84px] ${
                          isSelected
                            ? 'bg-gradient-to-r from-hbo-purple/40 to-hbo-cyan/20 border-hbo-cyan shadow-hbo-glow ring-1 ring-hbo-cyan/50'
                            : 'bg-hbo-dark/60 border-hbo-border hover:bg-hbo-hover hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full mb-1">
                          <Icon className={`w-4.5 h-4.5 flex-shrink-0 ${isSelected ? 'text-hbo-cyan' : 'text-gray-400'}`} />
                          {isSelected && (
                            <span className="w-3.5 h-3.5 rounded-full bg-hbo-cyan text-black flex items-center justify-center flex-shrink-0 shadow-sm">
                              <Check className="w-2.5 h-2.5 stroke-[3]" />
                            </span>
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-white leading-tight">{mode.label}</p>
                          <p className={`text-[9px] mt-0.5 leading-snug ${isSelected ? 'text-hbo-cyan font-semibold' : 'text-gray-400'}`}>
                            {mode.desc}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Row 2: Stream Header Auto-Hide Timeout */}
              <div
                data-settings-row="true"
                className="bg-hbo-card border border-hbo-border rounded-2xl p-4 shadow-lg space-y-2.5"
              >
                <div className="flex items-center justify-between mb-0.5">
                  <div>
                    <h3 className="text-sm sm:text-base font-bold font-display text-white flex items-center gap-2">
                      <EyeOff className="w-4.5 h-4.5 text-hbo-cyan flex-shrink-0" />
                      <span>Stream Header Auto-Hide Timeout</span>
                    </h3>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Automatically fade out top header while playing. Press remote Back to reveal.
                    </p>
                  </div>
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-black/80 border border-hbo-border text-hbo-cyan font-semibold flex-shrink-0">
                    {(settings.streamHeaderTimeout || 5) === 0 ? 'Always Visible' : `${settings.streamHeaderTimeout || 5} Seconds`}
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-2.5">
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
                        className={`p-3 rounded-xl border text-left transition-all tv-focus-target min-h-[68px] flex flex-col justify-between ${
                          isSelected
                            ? 'bg-hbo-cyan/20 border-hbo-cyan text-white shadow-hbo-glow ring-1 ring-hbo-cyan/50'
                            : 'bg-hbo-dark/60 border-hbo-border text-gray-400 hover:text-gray-200 hover:border-white/20'
                        }`}
                      >
                        <p className={`text-xs font-bold ${isSelected ? 'text-hbo-cyan' : 'text-white'}`}>
                          {opt.label}
                        </p>
                        <p className="text-[9px] text-gray-400 mt-0.5 leading-snug">{opt.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Row 3: UI Performance Mode */}
              <div
                data-settings-row="true"
                className="bg-hbo-card border border-hbo-border rounded-2xl p-4 shadow-lg flex items-center justify-between gap-4"
              >
                <div className="flex-1 min-w-0 pr-2">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <h3 className="text-sm sm:text-base font-bold font-display text-white flex items-center gap-2">
                      <Zap className="w-4.5 h-4.5 text-hbo-cyan flex-shrink-0" />
                      <span>UI Performance Mode (Lite Graphics)</span>
                    </h3>
                    <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-white/10 text-gray-300 border border-white/20">
                      Recommended: ON
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Optimizes framerate on budget TV hardware by disabling GPU backdrop blurs.
                  </p>
                </div>

                <button
                  onClick={() => handleUpdate({ performanceMode: !(settings.performanceMode ?? true) })}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all tv-focus-target flex items-center gap-1.5 flex-shrink-0 border ${
                    (settings.performanceMode ?? true)
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-400 shadow-md'
                      : 'bg-white/5 border-white/10 text-gray-400'
                  }`}
                >
                  {(settings.performanceMode ?? true) ? (
                    <>
                      <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Enabled</span>
                    </>
                  ) : (
                    <>
                      <X className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Disabled</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 3. REMOTE & VIRTUAL CURSOR PANEL                                         */}
          {/* ========================================================================= */}
          {activeCategory === 'controls' && (
            <div className="space-y-3.5 animate-fade-in">
              {/* Row 1: On-Demand Virtual Cursor Toggle */}
              <div
                data-settings-row="true"
                className="bg-hbo-card border border-hbo-border rounded-2xl p-4 shadow-lg flex items-center justify-between gap-4"
              >
                <div className="flex-1 min-w-0 pr-2">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="text-sm sm:text-base font-bold font-display text-white flex items-center gap-2">
                      <MousePointer className="w-4.5 h-4.5 text-hbo-cyan flex-shrink-0" />
                      <span>On-Demand Virtual Cursor (TV Player)</span>
                    </h3>
                    <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-hbo-cyan/20 text-hbo-cyan border border-hbo-cyan/40">
                      TV Only
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Control unclickable web player dialogs using remote D-pad as a mouse pointer.
                  </p>
                </div>

                <button
                  onClick={() => handleUpdate({ virtualCursorEnabled: !(settings.virtualCursorEnabled ?? true) })}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all tv-focus-target flex items-center gap-1.5 flex-shrink-0 border ${
                    (settings.virtualCursorEnabled ?? true)
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-400 shadow-md'
                      : 'bg-white/5 border-white/10 text-gray-400'
                  }`}
                >
                  {(settings.virtualCursorEnabled ?? true) ? (
                    <>
                      <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Enabled</span>
                    </>
                  ) : (
                    <>
                      <X className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Disabled</span>
                    </>
                  )}
                </button>
              </div>

              {(settings.virtualCursorEnabled ?? true) && (
                <>
                  {/* Row 2: Activation Trigger Mode */}
                  <div
                    data-settings-row="true"
                    className="bg-hbo-card border border-hbo-border rounded-2xl p-4 shadow-lg space-y-2.5"
                  >
                    <div>
                      <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider flex items-center gap-1.5">
                        <Radio className="w-3.5 h-3.5 text-hbo-cyan flex-shrink-0" />
                        <span>Activation Trigger</span>
                      </h4>
                      <p className="text-[11px] text-gray-400 mt-0.5">How the virtual cursor is activated while watching a video.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 max-w-md">
                      {[
                        { clicks: 2 as const, label: 'Double OK Press', desc: 'Press OK twice quickly' },
                        { clicks: 3 as const, label: 'Triple OK Press', desc: 'Press OK 3 times' },
                      ].map((mode) => {
                        const isSel = (settings.virtualCursorClicks || 2) === mode.clicks;
                        return (
                          <button
                            key={mode.clicks}
                            onClick={() => handleUpdate({ virtualCursorClicks: mode.clicks })}
                            className={`p-2.5 rounded-xl border text-center text-xs font-bold transition-all tv-focus-target ${
                              isSel
                                ? 'bg-hbo-purple/40 border-hbo-cyan text-white shadow-md ring-1 ring-hbo-cyan/50'
                                : 'bg-hbo-dark/60 border-hbo-border text-gray-400 hover:text-white'
                            }`}
                          >
                            <p className="text-xs sm:text-sm font-bold text-white leading-tight">{mode.label}</p>
                            <p className={`text-[9px] mt-0.5 ${isSel ? 'text-hbo-cyan' : 'text-gray-400'}`}>{mode.desc}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Row 3: Cursor Reticle Style */}
                  <div
                    data-settings-row="true"
                    className="bg-hbo-card border border-hbo-border rounded-2xl p-4 shadow-lg space-y-2.5"
                  >
                    <div>
                      <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-hbo-cyan flex-shrink-0" />
                        <span>Cursor Reticle Style</span>
                      </h4>
                      <p className="text-[11px] text-gray-400 mt-0.5">Visual look and accent colors of the TV mouse pointer.</p>
                    </div>

                    <div className="grid grid-cols-4 gap-2.5">
                      {CURSOR_STYLES_LIST.slice(0, 4).map((style) => {
                        const isSel = (settings.virtualCursorStyle || 'hbo_max') === style.id;
                        return (
                          <button
                            key={style.id}
                            onClick={() => handleUpdate({ virtualCursorStyle: style.id as any })}
                            className={`p-3 rounded-xl border text-left text-xs font-bold transition-all tv-focus-target min-h-[60px] flex flex-col justify-between ${
                              isSel
                                ? 'bg-hbo-purple/40 border-hbo-cyan text-white shadow-md ring-1 ring-hbo-cyan/50'
                                : 'bg-hbo-dark/60 border-hbo-border text-gray-400 hover:text-white'
                            }`}
                          >
                            <div className="flex items-center justify-between w-full">
                              <span className="text-xs font-bold text-white truncate">{style.name}</span>
                              {isSel && <Check className="w-3 h-3 text-hbo-cyan flex-shrink-0" />}
                            </div>
                            <span className={`text-[9px] ${isSel ? 'text-hbo-cyan' : 'text-gray-400'}`}>{style.desc}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* 4. CONTENT CONTROLS PANEL                                                */}
          {/* ========================================================================= */}
          {activeCategory === 'content' && (
            <div className="space-y-3.5 animate-fade-in">
              {/* Row 1: Catalog Maturity Level */}
              <div
                data-settings-row="true"
                className="bg-hbo-card border border-hbo-border rounded-2xl p-4 shadow-lg space-y-2.5"
              >
                <div>
                  <h3 className="text-sm sm:text-base font-bold font-display text-white flex items-center gap-2">
                    <Lock className="w-4.5 h-4.5 text-hbo-cyan flex-shrink-0" />
                    <span>Catalog Maturity Level / Parental Filter</span>
                  </h3>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Limit discovery catalog recommendations to age-appropriate certification tiers.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2.5">
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
                        className={`p-3 rounded-xl border text-left transition-all tv-focus-target min-h-[68px] flex flex-col justify-between ${
                          isSelected
                            ? 'bg-hbo-cyan/20 border-hbo-cyan text-white shadow-hbo-glow ring-1 ring-hbo-cyan/50'
                            : 'bg-hbo-dark/60 border-hbo-border text-gray-400 hover:text-gray-200'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-0.5">
                          <p className={`text-xs font-bold ${isSelected ? 'text-hbo-cyan' : 'text-white'}`}>
                            {lvl.label}
                          </p>
                          {isSelected && <Check className="w-3 h-3 text-hbo-cyan stroke-[3]" />}
                        </div>
                        <p className="text-[9px] text-gray-400">{lvl.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Row 2: Filter Adult & Explicit Content */}
              <div
                data-settings-row="true"
                className="bg-hbo-card border border-hbo-border rounded-2xl p-4 shadow-lg flex items-center justify-between gap-4"
              >
                <div className="flex-1 min-w-0 pr-2">
                  <h4 className="text-sm sm:text-base font-bold text-white flex items-center gap-2 mb-0.5">
                    <EyeOff className="w-4.5 h-4.5 text-amber-400 flex-shrink-0" />
                    <span>Filter Adult & Explicit Content</span>
                  </h4>
                  <p className="text-[11px] text-gray-400">
                    SafeSearch mode: Excludes 18+ adult rated media from search queries and catalogs.
                  </p>
                </div>

                <button
                  onClick={() => handleUpdate({ filterAdult: settings.filterAdult === false ? true : false })}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all tv-focus-target flex items-center gap-1.5 flex-shrink-0 border ${
                    settings.filterAdult !== false
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-400 shadow-md'
                      : 'bg-white/5 border-white/10 text-gray-400'
                  }`}
                >
                  {settings.filterAdult !== false ? (
                    <>
                      <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Enabled</span>
                    </>
                  ) : (
                    <>
                      <X className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Disabled</span>
                    </>
                  )}
                </button>
              </div>

              {/* Row 3: Filter Out Unreleased Titles */}
              <div
                data-settings-row="true"
                className="bg-hbo-card border border-hbo-border rounded-2xl p-4 shadow-lg flex items-center justify-between gap-4"
              >
                <div className="flex-1 min-w-0 pr-2">
                  <h4 className="text-sm sm:text-base font-bold text-white flex items-center gap-2 mb-0.5">
                    <CalendarX className="w-4.5 h-4.5 text-hbo-cyan flex-shrink-0" />
                    <span>Filter Out Unreleased Titles</span>
                  </h4>
                  <p className="text-[11px] text-gray-400">
                    Hide future and unreleased movies and TV series that have not yet premiered.
                  </p>
                </div>

                <button
                  onClick={() => handleUpdate({ filterUnreleased: settings.filterUnreleased === false ? true : false })}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all tv-focus-target flex items-center gap-1.5 flex-shrink-0 border ${
                    settings.filterUnreleased !== false
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-400 shadow-md'
                      : 'bg-white/5 border-white/10 text-gray-400'
                  }`}
                >
                  {settings.filterUnreleased !== false ? (
                    <>
                      <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Enabled</span>
                    </>
                  ) : (
                    <>
                      <X className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Disabled</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 5. SYSTEM & UPDATES PANEL                                                */}
          {/* ========================================================================= */}
          {activeCategory === 'system' && (
            <div className="space-y-3.5 animate-fade-in">
              {/* Row 1: Software Update */}
              <div
                data-settings-row="true"
                className="bg-hbo-card border border-hbo-border rounded-2xl p-4 shadow-lg space-y-2.5"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0 pr-2">
                    <h3 className="text-sm sm:text-base font-bold font-display text-white flex items-center gap-2 mb-0.5">
                      <ArrowUpCircle className="w-4.5 h-4.5 text-hbo-cyan flex-shrink-0" />
                      <span>Software Update</span>
                    </h3>
                    <p className="text-[11px] text-gray-400">
                      Check for new versions, bug fixes, and feature updates directly from GitHub.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={handleCheckForUpdates}
                      disabled={checkingUpdate}
                      className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-hbo-purple to-hbo-cyan hover:opacity-90 active:scale-95 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-hbo-purple/30 tv-focus-target transition-all"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${checkingUpdate ? 'animate-spin' : ''}`} />
                      <span>{checkingUpdate ? 'Checking...' : 'Check for Updates'}</span>
                    </button>

                    {updateInfo?.hasUpdate && (
                      <button
                        onClick={() => setShowUpdateModal(true)}
                        className="px-3 py-2 bg-hbo-cyan text-black font-bold rounded-xl hover:bg-hbo-cyan/90 text-xs tv-focus-target shadow-md"
                      >
                        View Update
                      </button>
                    )}
                  </div>
                </div>

                {updateInfo && (
                  <div className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 text-xs ${
                    updateInfo.hasUpdate 
                      ? 'bg-hbo-purple/20 border-hbo-purple-light text-white' 
                      : 'bg-white/5 border-white/10 text-gray-300'
                  }`}>
                    <div className="flex items-center gap-2 min-w-0">
                      {updateInfo.hasUpdate ? (
                        <Sparkles className="w-4 h-4 text-hbo-cyan flex-shrink-0" />
                      ) : (
                        <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                      )}
                      <span className="truncate font-mono text-[11px]">
                        {updateInfo.hasUpdate 
                          ? `v${updateInfo.latestVersion} Available (${updateInfo.apkSizeFormatted || 'APK'})` 
                          : 'You are on the latest build'}
                      </span>
                    </div>
                  </div>
                )}

                {updateError && (
                  <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="text-[11px]">{updateError}</span>
                  </div>
                )}
              </div>

              {/* Row 2: Auto-Check on Startup */}
              <div
                data-settings-row="true"
                className="bg-hbo-card border border-hbo-border rounded-2xl p-4 shadow-lg flex items-center justify-between gap-4"
              >
                <div className="flex-1 min-w-0 pr-2">
                  <h4 className="text-sm sm:text-base font-bold text-gray-200 flex items-center gap-2 mb-0.5">
                    <RefreshCw className="w-4 h-4 text-hbo-cyan" />
                    <span>Auto-Check on Startup</span>
                  </h4>
                  <p className="text-[11px] text-gray-400">
                    Automatically scan for newer releases in the background when the application starts.
                  </p>
                </div>

                <button
                  onClick={() => handleUpdate({ autoUpdateCheck: !(settings.autoUpdateCheck ?? true) })}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all tv-focus-target flex items-center gap-1.5 flex-shrink-0 border ${
                    (settings.autoUpdateCheck ?? true)
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-400 shadow-md'
                      : 'bg-white/5 border-white/10 text-gray-400'
                  }`}
                >
                  {(settings.autoUpdateCheck ?? true) ? (
                    <>
                      <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Enabled</span>
                    </>
                  ) : (
                    <>
                      <X className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Disabled</span>
                    </>
                  )}
                </button>
              </div>

              {/* Row 3: Nightly Channel */}
              <div
                data-settings-row="true"
                className="bg-hbo-card border border-hbo-border rounded-2xl p-4 shadow-lg flex items-center justify-between gap-4"
              >
                <div className="flex-1 min-w-0 pr-2">
                  <h4 className="text-sm sm:text-base font-bold text-gray-200 flex items-center gap-2 mb-0.5">
                    <Moon className="w-3.5 h-3.5 text-amber-400" />
                    <span>Include Nightly Builds</span>
                  </h4>
                  <p className="text-[11px] text-gray-400">
                    Receive bleeding-edge automated daily builds before official stable releases.
                  </p>
                </div>

                <button
                  onClick={() => handleUpdate({ includeNightlyUpdates: !settings.includeNightlyUpdates })}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all tv-focus-target flex items-center gap-1.5 flex-shrink-0 border ${
                    settings.includeNightlyUpdates
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-400 shadow-md'
                      : 'bg-white/5 border-white/10 text-gray-400'
                  }`}
                >
                  {settings.includeNightlyUpdates ? (
                    <>
                      <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Enabled</span>
                    </>
                  ) : (
                    <>
                      <X className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Disabled</span>
                    </>
                  )}
                </button>
              </div>

              {/* Row 4: Version Info & Easter Egg Card */}
              <div
                data-settings-row="true"
                className="w-full bg-hbo-card/40 border border-hbo-border/60 rounded-2xl p-4 text-xs text-gray-400 space-y-2 text-left"
              >
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <p className="font-bold text-gray-200 text-xs sm:text-sm flex items-center gap-2">
                      <span>TMDB Streamer v{APP_VERSION}</span>
                      {APP_BUILD_CHANNEL !== 'stable' && (
                        <span className="text-[9px] uppercase font-mono px-2 py-0.5 rounded-full bg-hbo-cyan/20 text-hbo-cyan border border-hbo-cyan/40">
                          {APP_BUILD_CHANNEL}
                        </span>
                      )}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{APP_VERSION_FULL}</p>
                  </div>
                  
                  <button
                    type="button"
                    onClick={handleBuildNumberClick}
                    className="px-3 py-1 rounded-full bg-hbo-purple/30 border border-hbo-purple-light text-hbo-cyan font-mono text-xs font-bold tv-focus-target focus:outline-none focus:border-hbo-cyan focus:ring-2 focus:ring-hbo-cyan/60 focus:bg-hbo-purple/60 focus:shadow-hbo-glow transition-all cursor-pointer inline-flex items-center gap-1 active:scale-95"
                  >
                    <span>Build #{APP_BUILD_NUMBER}</span>
                  </button>
                </div>
                <p className="text-gray-400 text-[11px] leading-relaxed">
                  This application uses the TMDB API and free third-party streaming video embeds.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Full Page Logo & Version Changelog Screen (Easter Egg on 3 taps) */}
      {showEasterEgg && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowEasterEgg(false);
            }
          }}
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-2xl flex flex-col items-center justify-center p-4 sm:p-6 animate-fade-in select-none"
        >
          <div className="relative w-full max-w-2xl bg-hbo-card/95 border border-hbo-border/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-scale-in">
            {/* Header */}
            <div className="p-4 border-b border-hbo-border/60 flex items-center justify-between gap-4 bg-black/60">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 rounded-xl bg-hbo-card border border-hbo-border/80 shadow-md flex items-center justify-center flex-shrink-0">
                  <Logo size="sm" showText={false} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm sm:text-base font-bold font-display text-white truncate">TMDB Streamer</h3>
                    <span className="px-2 py-0.5 rounded-full bg-hbo-purple/30 border border-hbo-purple-light text-hbo-cyan font-mono text-[10px] font-bold uppercase">
                      {APP_BUILD_CHANNEL}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 font-mono truncate">v{APP_VERSION} (Build #{APP_BUILD_NUMBER})</p>
                </div>
              </div>

              <button
                onClick={() => setShowEasterEgg(false)}
                className="p-2 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 text-gray-300 hover:text-white transition-all focus:outline-none focus:ring-2 focus:ring-hbo-cyan flex-shrink-0 tv-focus-target"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Changelog Title Bar */}
            <div className="px-4 py-2 bg-black/40 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-gray-300 uppercase tracking-wider">
                <FileText className="w-3.5 h-3.5 text-hbo-cyan" />
                <span>Installed Version Changelog</span>
              </div>
            </div>

            {/* Scrollable Changelog Content */}
            <div
              ref={easterEggScrollRef}
              tabIndex={0}
              onKeyDown={handleEasterEggScrollKeyDown}
              className="flex-1 overflow-y-auto p-4 space-y-2 font-sans scrollbar-thin scrollbar-thumb-hbo-purple transition-all bg-black/20 focus:outline-none focus:ring-1 focus:ring-hbo-cyan"
            >
              <FormattedChangelog notes={APP_CHANGELOG} />
            </div>

            {/* Footer */}
            <div className="p-3.5 border-t border-hbo-border/60 bg-black/60 flex items-center justify-between gap-3">
              <p className="text-[10px] sm:text-[11px] text-gray-400 font-mono truncate max-w-[220px]">
                {APP_VERSION_FULL}
              </p>
              <button
                onClick={() => setShowEasterEgg(false)}
                className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-hbo-purple to-hbo-cyan text-white font-bold text-xs hover:opacity-90 active:scale-95 transition-all tv-focus-target"
              >
                Close
              </button>
            </div>
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
