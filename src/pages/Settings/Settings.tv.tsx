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
import { Settings as SettingsIcon, Tv2, Smartphone, Tablet, Monitor, ShieldCheck, Server, Database, Check, ShieldAlert, EyeOff, Lock, Zap, X, ArrowUpCircle, RefreshCw, Moon, Sparkles, AlertCircle, CalendarX, ChevronDown, MousePointer, Radio, FileText, SkipForward, Clock, Percent } from 'lucide-react';

import { CURSOR_STYLES_LIST } from '../../components/player/TVVirtualCursor';

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
  const easterEggScrollRef = useRef<HTMLDivElement>(null);
  const easterEggCloseRef = useRef<HTMLButtonElement>(null);
  const [openDropdownSlot, setOpenDropdownSlot] = useState<number | null>(null);
  const [openCursorDropdown, setOpenCursorDropdown] = useState<'trigger' | 'timeout' | 'speed' | 'style' | null>(null);
  const clickCountRef = useRef(0);
  const clickTimerRef = useRef<NodeJS.Timeout | null>(null);
  const { deviceMode, setDeviceMode, detectedPlatform, activeLayout } = useDevice();

  const isAnyDropdownOpen = openDropdownSlot !== null || openCursorDropdown !== null;

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
    } else if (openCursorDropdown !== null) {
      setTimeout(() => {
        const activeEl = document.querySelector<HTMLElement>('[data-cursor-dropdown-container="true"] [data-cursor-selected="true"]') ||
                         document.querySelector<HTMLElement>('[data-cursor-dropdown-container="true"] .tv-focus-target');
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
  }, [openDropdownSlot, openCursorDropdown, isAnyDropdownOpen]);

  // Handle remote Back button, Escape, and Left/Right arrow dismissal for priority dropdowns & cursor dropdowns
  useEffect(() => {
    const handleCloseFromEvent = () => {
      const slot = openDropdownSlot;
      const cursorDropdown = openCursorDropdown;
      setOpenDropdownSlot(null);
      setOpenCursorDropdown(null);
      if (slot !== null) {
        setTimeout(() => {
          document.getElementById(`priority-server-btn-${slot}`)?.focus();
        }, 50);
      } else if (cursorDropdown !== null) {
        setTimeout(() => {
          document.getElementById(`cursor-${cursorDropdown}-btn`)?.focus();
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
        const cursorDropdown = openCursorDropdown;
        setOpenDropdownSlot(null);
        setOpenCursorDropdown(null);
        if (slot !== null) {
          setTimeout(() => {
            document.getElementById(`priority-server-btn-${slot}`)?.focus();
          }, 50);
        } else if (cursorDropdown !== null) {
          setTimeout(() => {
            document.getElementById(`cursor-${cursorDropdown}-btn`)?.focus();
          }, 50);
        }
        return;
      }

      // Arrow Right from inside priority dropdown closes and moves to next priority slot
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

      // Arrow Left from inside priority dropdown closes and moves to previous priority slot
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
      if (!target.closest('[data-priority-dropdown-container="true"]') && !target.closest('[data-cursor-dropdown-container="true"]')) {
        setOpenDropdownSlot(null);
        setOpenCursorDropdown(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    document.addEventListener('mousedown', handleDocumentClick);

    return () => {
      window.removeEventListener('tmdb_close_dropdowns', handleCloseFromEvent);
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      document.removeEventListener('mousedown', handleDocumentClick);
    };
  }, [openDropdownSlot, openCursorDropdown, isAnyDropdownOpen]);

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

  // Close Easter Egg on remote Back / Escape and focus scroll area on open
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
            <p className="text-xs sm:text-sm text-gray-400 mt-0.5">Manage device mode, cursor navigation, ad shields, and streaming resolvers</p>
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
                      ? 'bg-hbo-purple/40 border-hbo-purple-light text-white shadow-lg'
                      : 'bg-hbo-dark/60 border-hbo-border hover:bg-hbo-hover hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-2">
                    <Icon className={`w-5 h-5 flex-shrink-0 ${isSelected ? 'text-hbo-cyan' : 'text-gray-400'}`} />
                    {isSelected && (
                      <span className="w-4 h-4 rounded-full bg-hbo-cyan text-black flex items-center justify-center flex-shrink-0 shadow-sm">
                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                      </span>
                    )}
                  </div>
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
                      ? 'bg-hbo-purple/40 border-hbo-purple-light text-white shadow-lg'
                      : 'bg-hbo-dark/60 border-hbo-border text-gray-400 hover:text-gray-200 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <p className={`text-xs sm:text-sm font-bold ${isSelected ? 'text-hbo-cyan' : 'text-white'}`}>
                      {opt.label}
                    </p>
                    {isSelected && (
                      <span className="w-4 h-4 rounded-full bg-hbo-cyan text-black flex items-center justify-center flex-shrink-0 shadow-sm">
                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1 leading-snug">{opt.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Display & Performance Mode */}
        <div className="bg-hbo-card border border-hbo-border rounded-2xl p-5 sm:p-7 shadow-lg space-y-4">
          <div className="flex items-start justify-between gap-4 flex-wrap sm:flex-nowrap">
            <div className="pr-2">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <h3 className="text-base sm:text-lg font-bold font-display text-white flex items-center gap-2.5">
                  <Zap className="w-5 h-5 text-hbo-cyan flex-shrink-0" />
                  <span>UI Performance Mode (Lite Graphics)</span>
                </h3>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-hbo-cyan/20 text-hbo-cyan border border-hbo-cyan/40">
                  Recommended for TV
                </span>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">
                Disables GPU-heavy backdrop blurs, 4K image textures, and diffused glow shadows for smooth 60fps scrolling on low-power TV boxes (e.g. MiBox). Default is ON for TV.
              </p>
            </div>
            <button
              onClick={() => handleUpdate({ performanceMode: !(settings.performanceMode ?? true) })}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all tv-focus-target flex items-center gap-1.5 flex-shrink-0 border ${
                (settings.performanceMode ?? true)
                  ? 'bg-emerald-500/20 border-emerald-400 text-emerald-400'
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

        {/* TV Mode: On-Demand Virtual Cursor */}
        <div className="bg-hbo-card border border-hbo-border rounded-2xl p-5 sm:p-7 shadow-lg space-y-6">
          <div className="flex items-start justify-between gap-4 flex-wrap sm:flex-nowrap">
            <div className="pr-2">
              <h3 className="text-base sm:text-lg font-bold font-display text-white flex items-center gap-2.5 mb-1.5">
                <MousePointer className="w-5 h-5 text-hbo-cyan flex-shrink-0" />
                <span>On-Demand Virtual Cursor (TV Player)</span>
              </h3>
              <p className="text-xs text-gray-400 leading-relaxed">
                Enables a remote-controlled cursor overlay on the Watch page. Allows seamless interaction with embedded player controls (scrub bar, audio/subtitle tracks, resolution menu) using your remote D-Pad and OK button.
              </p>
            </div>
            <button
              onClick={() => handleUpdate({ virtualCursorEnabled: !(settings.virtualCursorEnabled ?? true) })}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all tv-focus-target flex items-center gap-1.5 flex-shrink-0 border ${
                (settings.virtualCursorEnabled ?? true)
                  ? 'bg-emerald-500/20 border-emerald-400 text-emerald-400'
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

          {(settings.virtualCursorEnabled ?? true) && (() => {
            const currentStyleId = settings.virtualCursorStyle ?? 'hbo_max';
            const currentStyleObj = CURSOR_STYLES_LIST.find((c) => c.id === currentStyleId) || CURSOR_STYLES_LIST[0];

            const currentTimeoutSec = settings.virtualCursorTimeout ?? 10;
            const timeoutOpts = [
              { seconds: 5, label: '5 Seconds', desc: 'Quick fade out after 5s idle' },
              { seconds: 10, label: '10 Seconds (Default)', desc: 'Standard cinema idle timeout' },
              { seconds: 15, label: '15 Seconds', desc: 'Extended duration before hiding' },
              { seconds: 30, label: '30 Seconds', desc: 'Long duration for browsing tracks' },
              { seconds: 0, label: 'Never (Manual Dismiss)', desc: 'Stays visible until closed with Back key' }
            ];
            const currentTimeoutObj = timeoutOpts.find((t) => t.seconds === currentTimeoutSec) || timeoutOpts[1];

            const currentSpd = settings.virtualCursorSpeed ?? 'normal';
            const speedOpts = [
              { speed: 'slow' as const, label: 'Slow (16px)', desc: 'High precision for small icons & scrubber' },
              { speed: 'normal' as const, label: 'Normal (28px - Default)', desc: 'Balanced response for standard TV remotes' },
              { speed: 'fast' as const, label: 'Fast (48px)', desc: 'Quick panning across large TV displays' }
            ];
            const currentSpeedObj = speedOpts.find((s) => s.speed === currentSpd) || speedOpts[1];

            const currentClk = settings.virtualCursorClicks ?? 2;
            const clickOpts = [
              { clicks: 2 as const, label: 'Double Press OK (Default)', desc: 'Press remote OK button 2 times rapidly' },
              { clicks: 3 as const, label: 'Triple Press OK', desc: 'Press remote OK button 3 times rapidly' }
            ];
            const currentClickObj = clickOpts.find((c) => c.clicks === currentClk) || clickOpts[0];

            return (
              <div className="space-y-5 pt-3 border-t border-hbo-border/60">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                  {/* 1. Cursor Style & Appearance Dropdown (10 Options) */}
                  <div className="relative" data-cursor-dropdown-container="true">
                    <span className="block text-xs font-semibold text-gray-300 mb-2">
                      Cursor Style & Appearance (10 Styles)
                    </span>
                    <button
                      type="button"
                      id="cursor-style-btn"
                      onClick={() => {
                        setOpenDropdownSlot(null);
                        setOpenCursorDropdown(openCursorDropdown === 'style' ? null : 'style');
                      }}
                      className="w-full flex items-center justify-between bg-hbo-dark/80 border border-hbo-border text-white text-xs font-bold rounded-xl px-4 py-3.5 min-h-[64px] hover:bg-hbo-hover transition-all tv-focus-target"
                    >
                      <div className="flex items-center gap-3.5 min-w-0 pr-2">
                        <div className="w-7 h-7 flex items-center justify-center flex-shrink-0">
                          {currentStyleObj.renderSvg(false)}
                        </div>
                        <div className="text-left min-w-0">
                          <span className="font-bold text-white text-xs sm:text-sm block truncate">{currentStyleObj.name}</span>
                          <span className="text-[11px] text-gray-400 block truncate mt-0.5">{currentStyleObj.desc}</span>
                        </div>
                      </div>
                      <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${openCursorDropdown === 'style' ? 'rotate-180 text-hbo-cyan' : ''}`} />
                    </button>

                    {/* Styles Dropdown Menu */}
                    {openCursorDropdown === 'style' && (
                      <div className="absolute left-0 right-0 w-full top-[calc(100%+4px)] z-50 bg-hbo-card/98 border border-hbo-border rounded-xl shadow-2xl p-2 max-h-[min(260px,calc(100vh-140px))] overflow-y-auto space-y-1.5 focus-scroll-container backdrop-blur-2xl animate-fade-in">
                        {CURSOR_STYLES_LIST.map((styleOpt) => {
                          const isSelected = currentStyleId === styleOpt.id;
                          return (
                            <button
                              key={styleOpt.id}
                              data-cursor-selected={isSelected ? 'true' : 'false'}
                              onClick={() => {
                                handleUpdate({ virtualCursorStyle: styleOpt.id });
                                setOpenCursorDropdown(null);
                                setTimeout(() => {
                                  document.getElementById('cursor-style-btn')?.focus();
                                }, 50);
                              }}
                              className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 sm:py-3 rounded-xl text-left text-xs transition-all tv-focus-target ${
                                isSelected
                                  ? 'bg-hbo-purple/40 border border-hbo-cyan/60 text-white font-bold'
                                  : 'text-gray-300 hover:bg-hbo-hover hover:text-white border border-transparent'
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0 flex-1 pr-1">
                                <div className="w-7 h-7 flex items-center justify-center flex-shrink-0">
                                  {styleOpt.renderSvg(false)}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <span className="font-bold text-white block text-xs sm:text-sm leading-snug truncate">{styleOpt.name}</span>
                                  <span className="text-[11px] text-gray-400 block leading-normal mt-0.5 truncate">{styleOpt.desc}</span>
                                </div>
                              </div>
                              <span className="text-[10px] px-2.5 py-0.5 rounded font-bold border border-white/20 bg-white/10 text-gray-300 flex-shrink-0 ml-2 whitespace-nowrap">
                                {styleOpt.badge}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* 2. Activation Trigger Dropdown */}
                  <div className="relative" data-cursor-dropdown-container="true">
                    <span className="block text-xs font-semibold text-gray-300 mb-2">
                      Activation Trigger (When Watching)
                    </span>
                    <button
                      type="button"
                      id="cursor-trigger-btn"
                      onClick={() => {
                        setOpenDropdownSlot(null);
                        setOpenCursorDropdown(openCursorDropdown === 'trigger' ? null : 'trigger');
                      }}
                      className="w-full flex items-center justify-between bg-hbo-dark/80 border border-hbo-border text-white text-xs font-bold rounded-xl px-4 py-3.5 min-h-[64px] hover:bg-hbo-hover transition-all tv-focus-target"
                    >
                      <div className="text-left min-w-0 pr-2">
                        <span className="font-bold text-white text-xs sm:text-sm block">
                          {currentClickObj.label}
                        </span>
                        <span className="text-[11px] text-gray-400 block mt-0.5">
                          {currentClickObj.desc}
                        </span>
                      </div>
                      <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${openCursorDropdown === 'trigger' ? 'rotate-180 text-hbo-cyan' : ''}`} />
                    </button>

                    {openCursorDropdown === 'trigger' && (
                      <div className="absolute left-0 right-0 w-full top-[calc(100%+4px)] z-50 bg-hbo-card/98 border border-hbo-border rounded-xl shadow-2xl p-2 max-h-[min(260px,calc(100vh-140px))] overflow-y-auto space-y-1.5 focus-scroll-container backdrop-blur-2xl animate-fade-in">
                        {clickOpts.map((opt) => {
                          const isSelected = currentClk === opt.clicks;
                          return (
                            <button
                              key={opt.clicks}
                              data-cursor-selected={isSelected ? 'true' : 'false'}
                              onClick={() => {
                                handleUpdate({ virtualCursorClicks: opt.clicks });
                                setOpenCursorDropdown(null);
                                setTimeout(() => {
                                  document.getElementById('cursor-trigger-btn')?.focus();
                                }, 50);
                              }}
                              className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 sm:py-3 rounded-xl text-left text-xs transition-all tv-focus-target ${
                                isSelected
                                  ? 'bg-hbo-purple/40 border border-hbo-cyan/60 text-white font-bold'
                                  : 'text-gray-300 hover:bg-hbo-hover hover:text-white border border-transparent'
                              }`}
                            >
                              <div className="min-w-0 flex-1 pr-1">
                                <span className="font-bold text-white block text-xs sm:text-sm leading-snug truncate">{opt.label}</span>
                                <span className="text-[11px] text-gray-400 block leading-normal mt-0.5 truncate">{opt.desc}</span>
                              </div>
                              {isSelected && <Check className="w-4 h-4 text-hbo-cyan flex-shrink-0 ml-2" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* 3. Inactivity Auto-Hide Duration Dropdown */}
                  <div className="relative" data-cursor-dropdown-container="true">
                    <span className="block text-xs font-semibold text-gray-300 mb-2">
                      Inactivity Auto-Hide Duration
                    </span>
                    <button
                      type="button"
                      id="cursor-timeout-btn"
                      onClick={() => {
                        setOpenDropdownSlot(null);
                        setOpenCursorDropdown(openCursorDropdown === 'timeout' ? null : 'timeout');
                      }}
                      className="w-full flex items-center justify-between bg-hbo-dark/80 border border-hbo-border text-white text-xs font-bold rounded-xl px-4 py-3.5 min-h-[64px] hover:bg-hbo-hover transition-all tv-focus-target"
                    >
                      <div className="text-left min-w-0 pr-2">
                        <span className="font-bold text-white text-xs sm:text-sm block">
                          {currentTimeoutObj.label}
                        </span>
                        <span className="text-[11px] text-gray-400 block mt-0.5">
                          {currentTimeoutObj.desc}
                        </span>
                      </div>
                      <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${openCursorDropdown === 'timeout' ? 'rotate-180 text-hbo-cyan' : ''}`} />
                    </button>

                    {openCursorDropdown === 'timeout' && (
                      <div className="absolute left-0 right-0 w-full top-[calc(100%+4px)] z-50 bg-hbo-card/98 border border-hbo-border rounded-xl shadow-2xl p-2 max-h-[min(260px,calc(100vh-140px))] overflow-y-auto space-y-1.5 focus-scroll-container backdrop-blur-2xl animate-fade-in">
                        {timeoutOpts.map((opt) => {
                          const isSelected = currentTimeoutSec === opt.seconds;
                          return (
                            <button
                              key={opt.seconds}
                              data-cursor-selected={isSelected ? 'true' : 'false'}
                              onClick={() => {
                                handleUpdate({ virtualCursorTimeout: opt.seconds });
                                setOpenCursorDropdown(null);
                                setTimeout(() => {
                                  document.getElementById('cursor-timeout-btn')?.focus();
                                }, 50);
                              }}
                              className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 sm:py-3 rounded-xl text-left text-xs transition-all tv-focus-target ${
                                isSelected
                                  ? 'bg-hbo-purple/40 border border-hbo-cyan/60 text-white font-bold'
                                  : 'text-gray-300 hover:bg-hbo-hover hover:text-white border border-transparent'
                              }`}
                            >
                              <div className="min-w-0 flex-1 pr-1">
                                <span className="font-bold text-white block text-xs sm:text-sm leading-snug truncate">{opt.label}</span>
                                <span className="text-[11px] text-gray-400 block leading-normal mt-0.5 truncate">{opt.desc}</span>
                              </div>
                              {isSelected && <Check className="w-4 h-4 text-hbo-cyan flex-shrink-0 ml-2" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* 4. Cursor Movement Speed Dropdown */}
                  <div className="relative" data-cursor-dropdown-container="true">
                    <span className="block text-xs font-semibold text-gray-300 mb-2">
                      Cursor Movement Speed
                    </span>
                    <button
                      type="button"
                      id="cursor-speed-btn"
                      onClick={() => {
                        setOpenDropdownSlot(null);
                        setOpenCursorDropdown(openCursorDropdown === 'speed' ? null : 'speed');
                      }}
                      className="w-full flex items-center justify-between bg-hbo-dark/80 border border-hbo-border text-white text-xs font-bold rounded-xl px-4 py-3.5 min-h-[64px] hover:bg-hbo-hover transition-all tv-focus-target"
                    >
                      <div className="text-left min-w-0 pr-2">
                        <span className="font-bold text-white text-xs sm:text-sm block">
                          {currentSpeedObj.label}
                        </span>
                        <span className="text-[11px] text-gray-400 block mt-0.5">
                          {currentSpeedObj.desc}
                        </span>
                      </div>
                      <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${openCursorDropdown === 'speed' ? 'rotate-180 text-hbo-cyan' : ''}`} />
                    </button>

                    {openCursorDropdown === 'speed' && (
                      <div className="absolute left-0 right-0 w-full top-[calc(100%+4px)] z-50 bg-hbo-card/98 border border-hbo-border rounded-xl shadow-2xl p-2 max-h-[min(260px,calc(100vh-140px))] overflow-y-auto space-y-1.5 focus-scroll-container backdrop-blur-2xl animate-fade-in">
                        {speedOpts.map((opt) => {
                          const isSelected = currentSpd === opt.speed;
                          return (
                            <button
                              key={opt.speed}
                              data-cursor-selected={isSelected ? 'true' : 'false'}
                              onClick={() => {
                                handleUpdate({ virtualCursorSpeed: opt.speed });
                                setOpenCursorDropdown(null);
                                setTimeout(() => {
                                  document.getElementById('cursor-speed-btn')?.focus();
                                }, 50);
                              }}
                              className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 sm:py-3 rounded-xl text-left text-xs transition-all tv-focus-target ${
                                isSelected
                                  ? 'bg-hbo-purple/40 border border-hbo-cyan/60 text-white font-bold'
                                  : 'text-gray-300 hover:bg-hbo-hover hover:text-white border border-transparent'
                              }`}
                            >
                              <div className="min-w-0 flex-1 pr-1">
                                <span className="font-bold text-white block text-xs sm:text-sm leading-snug truncate">{opt.label}</span>
                                <span className="text-[11px] text-gray-400 block leading-normal mt-0.5 truncate">{opt.desc}</span>
                              </div>
                              {isSelected && <Check className="w-4 h-4 text-hbo-cyan flex-shrink-0 ml-2" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Embed Resolver Priority */}
        <div className="bg-hbo-card border border-hbo-border rounded-2xl p-5 sm:p-7 shadow-lg space-y-5">
          <div className="flex items-start justify-between gap-4 flex-wrap sm:flex-nowrap">
            <div>
              <h3 className="text-base sm:text-lg font-bold font-display text-white flex items-center gap-2.5 mb-1.5">
                <Server className="w-5 h-5 text-hbo-cyan flex-shrink-0" />
                <span>Embed Resolver Priority</span>
              </h3>
              <p className="text-xs text-gray-400 leading-relaxed">
                Choose the 3 primary fallback embed servers the app will use when playing through the Embed Resolver. If the 1st server fails or buffers, the app automatically fails over to the 2nd and 3rd servers.
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
                      className="w-full flex items-center justify-between bg-hbo-card/90 border border-hbo-border text-white text-xs font-bold rounded-xl px-3.5 py-3 min-h-[52px] hover:bg-hbo-hover transition-all tv-focus-target"
                    >
                      <span className="truncate pr-2 text-xs sm:text-sm">{selectedProviderObj.name}</span>
                      <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${openDropdownSlot === index ? 'rotate-180 text-hbo-cyan' : ''}`} />
                    </button>

                    {/* Inline Dropdown Menu */}
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
                              className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 sm:py-3 rounded-xl text-left text-xs transition-all tv-focus-target ${
                                isSelected
                                  ? 'bg-hbo-purple/40 border border-hbo-cyan/60 text-white font-bold'
                                  : 'text-gray-300 hover:bg-hbo-hover hover:text-white border border-transparent'
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-1.5">
                                  <span className="font-bold text-white block text-xs sm:text-sm leading-snug truncate">{provider.name}</span>
                                  {isSelected && <Check className="w-3.5 h-3.5 text-hbo-cyan flex-shrink-0" />}
                                </div>
                                <span className="text-[11px] text-gray-400 block leading-normal mt-0.5 truncate">{provider.tagline}</span>
                              </div>
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
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all tv-focus-target flex items-center gap-1.5 flex-shrink-0 border ${
                settings.filterAdult !== false
                  ? 'bg-emerald-500/20 border-emerald-400 text-emerald-400'
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
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all tv-focus-target flex items-center gap-1.5 flex-shrink-0 border ${
                settings.filterUnreleased !== false
                  ? 'bg-emerald-500/20 border-emerald-400 text-emerald-400'
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
                        ? 'bg-hbo-purple/40 border-hbo-purple-light text-white shadow-lg'
                        : 'bg-hbo-dark/60 border-hbo-border text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <p className={`text-xs font-bold ${isSelected ? 'text-hbo-cyan' : 'text-white'}`}>
                        {lvl.label}
                      </p>
                      {isSelected && (
                        <span className="w-4 h-4 rounded-full bg-hbo-cyan text-black flex items-center justify-center flex-shrink-0 shadow-sm">
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5">{lvl.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Stream Resolver Engine Selection */}
        <div className="bg-hbo-card border border-hbo-border rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0 pr-2">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h3 className="text-base sm:text-lg font-bold font-display text-white flex items-center gap-2">
                  <Zap className="w-5 h-5 text-hbo-cyan flex-shrink-0" />
                  <span>Stream Resolver Engine</span>
                </h3>
                <span className="px-2 py-0.5 rounded bg-hbo-purple/40 text-hbo-cyan border border-hbo-purple-light text-[10px] font-extrabold uppercase tracking-wider">
                  Multi-Select Active
                </span>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">
                Toggle one or more stream engines to enable. When playing a title, the app queries enabled engines in priority order (<span className="text-emerald-400 font-semibold">TorBox 4K</span> → <span className="text-hbo-cyan font-semibold">Private Extractor</span> → <span className="text-gray-300 font-semibold">Embed Resolver</span>).
              </p>
            </div>
          </div>

          {/* 3 Resolver Options (Multi-Select) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              {
                id: 'torbox' as const,
                title: 'TorBox Debrid',
                priority: '#1 Priority',
                tag: '4K Ultra HD',
                desc: 'Ultra-fast direct HTTPS 4K HDR & 1080p BluRay cloud streams via TorBox CDN.'
              },
              {
                id: 'private_extractor' as const,
                title: 'Private Extractor',
                priority: '#2 Priority',
                tag: 'Consumet API',
                desc: 'Direct HLS .m3u8 streams resolved via your private backend (Render API).'
              },
              {
                id: 'embed' as const,
                title: 'Embed Resolver',
                priority: '#3 Priority',
                tag: 'Multi-Mirror',
                desc: 'Standard multi-server iframe embeds (VidLink, MoviesAPI) with ad & popup sandboxing.'
              }
            ].map((resOption) => {
              const currentEnabled = settings.enabledResolvers && settings.enabledResolvers.length > 0
                ? settings.enabledResolvers
                : ['embed'];
              const isEnabled = currentEnabled.includes(resOption.id);

              return (
                <button
                  key={resOption.id}
                  onClick={() => {
                    let updated: ('embed' | 'private_extractor' | 'torbox')[];
                    if (isEnabled) {
                      // Prevent unchecking all (keep at least 1)
                      if (currentEnabled.length === 1) return;
                      updated = currentEnabled.filter(r => r !== resOption.id) as ('embed' | 'private_extractor' | 'torbox')[];
                    } else {
                      updated = [...currentEnabled, resOption.id] as ('embed' | 'private_extractor' | 'torbox')[];
                    }
                    handleUpdate({
                      enabledResolvers: updated,
                      streamResolver: updated[0] || 'embed'
                    });
                  }}
                  className={`p-4 rounded-xl border text-left transition-all duration-200 tv-focus-target flex flex-col justify-between ${
                    isEnabled
                      ? 'bg-hbo-purple/30 border-hbo-cyan text-white shadow-hbo-glow'
                      : 'bg-black/30 border-hbo-border hover:border-gray-600 text-gray-500 opacity-60'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5 gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${isEnabled ? 'bg-hbo-cyan border-hbo-cyan' : 'border-gray-600 bg-black/40'}`}>
                          {isEnabled && <Check className="w-3 h-3 text-black stroke-[3]" />}
                        </div>
                        <span className="font-bold text-sm text-white truncate">{resOption.title}</span>
                      </div>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold flex-shrink-0 ${
                          isEnabled
                            ? 'bg-hbo-cyan/20 text-hbo-cyan border border-hbo-cyan/40'
                            : 'bg-gray-800 text-gray-500'
                        }`}
                      >
                        {resOption.tag}
                      </span>
                    </div>
                    <p className="text-xs text-gray-300 leading-relaxed mt-2">{resOption.desc}</p>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[11px] font-bold">
                    <span className={isEnabled ? 'text-hbo-cyan' : 'text-gray-500'}>
                      {resOption.priority}
                    </span>
                    <span className={isEnabled ? 'text-emerald-400' : 'text-gray-500'}>
                      {isEnabled ? '● Enabled' : '○ Disabled'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Configuration sub-panels */}
          {(settings.enabledResolvers || []).includes('private_extractor') && (
            <div className="p-4 rounded-xl bg-hbo-purple/15 border border-hbo-purple-light/40 text-xs text-gray-300 space-y-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="font-bold text-hbo-cyan flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-hbo-cyan" />
                  <span>Private Stream API Configuration</span>
                </p>
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-mono font-bold">
                  ● Online
                </span>
              </div>
              <p className="text-[11px] text-gray-300 leading-relaxed">
                Active Server: <code className="text-hbo-cyan font-mono text-[11px] bg-black/40 px-1.5 py-0.5 rounded">{settings.directStreamApiUrl || 'https://tmdb-api-yfbu.onrender.com'}</code>. Direct HLS streams are requested before falling back to embed resolvers.
              </p>
            </div>
          )}

          {(settings.enabledResolvers || []).includes('torbox') && (
            <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/40 text-xs text-gray-300 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="font-bold text-emerald-400 flex items-center gap-1.5">
                  <Radio className="w-4 h-4 text-emerald-400" />
                  <span>TorBox Debrid API Configuration</span>
                </p>
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-mono font-bold">
                  ● 212 CDN Nodes
                </span>
              </div>
              <p className="text-[11px] text-gray-300 leading-relaxed">
                Enter your free or pro TorBox API key from <a href="https://torbox.app/settings" target="_blank" rel="noreferrer" className="text-hbo-cyan underline">torbox.app/settings</a> to unlock direct 4K HDR & 1080p BluRay cloud streaming:
              </p>
              <div className="flex gap-2 items-center">
                <input
                  type="password"
                  placeholder="Paste your TorBox API Key here..."
                  value={settings.torboxApiKey || ''}
                  onChange={(e) => handleUpdate({ torboxApiKey: e.target.value })}
                  className="flex-1 bg-black/50 border border-gray-700 focus:border-emerald-400 text-white px-3 py-2 rounded-lg text-xs font-mono tv-focus-target outline-none"
                />
              </div>
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
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all tv-focus-target flex items-center gap-1.5 flex-shrink-0 border ${
              settings.adBlockShield
                ? 'bg-emerald-500/20 border-emerald-400 text-emerald-400'
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

        {/* Playback & Episode Navigation */}
        <div className="bg-hbo-card border border-hbo-border rounded-2xl p-5 sm:p-6 space-y-5">
          {/* Autoplay Next Episode */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0 pr-2">
              <h3 className="text-base sm:text-lg font-bold font-display text-white flex items-center gap-2 mb-1">
                <Sparkles className="w-5 h-5 text-hbo-purple-light flex-shrink-0" />
                <span>Auto-Play Next Episode</span>
              </h3>
              <p className="text-xs text-gray-400">
                Display the "Up Next" preview popup and automatically advance to the next series episode when the countdown ends.
              </p>
            </div>

            <button
              onClick={() => handleUpdate({ autoplayNext: settings.autoplayNext === false ? true : false })}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all tv-focus-target flex items-center gap-1.5 flex-shrink-0 border ${
                settings.autoplayNext !== false
                  ? 'bg-emerald-500/20 border-emerald-400 text-emerald-400'
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

          {/* Popup Trigger Percentage (80% - 100% with 5% Step Buttons) */}
          <div className="border-t border-hbo-border/60 pt-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-2">
                <Percent className="w-4 h-4 text-hbo-cyan flex-shrink-0" />
                <span>Popup Trigger Timing (% of Episode)</span>
              </h4>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-hbo-dark/90 border border-hbo-border text-hbo-cyan font-bold">
                {settings.upNextTriggerPercent || 90}% Progress
              </span>
            </div>
            <p className="text-xs text-gray-400 mb-3">
              Select the playback completion percentage threshold when the "Up Next" popup should appear.
            </p>

            <div className="grid grid-cols-5 gap-3">
              {[
                { percent: 80, label: '80%', desc: 'Early Credits' },
                { percent: 85, label: '85%', desc: 'Mid Credits' },
                { percent: 90, label: '90%', desc: 'Default' },
                { percent: 95, label: '95%', desc: 'End Credits' },
                { percent: 100, label: '100%', desc: 'Episode End' },
              ].map((opt) => {
                const isSelected = (settings.upNextTriggerPercent || 90) === opt.percent;
                return (
                  <button
                    key={opt.percent}
                    type="button"
                    onClick={() => handleUpdate({ upNextTriggerPercent: opt.percent })}
                    className={`py-3.5 px-3 rounded-xl border text-center transition-all tv-focus-target flex flex-col items-center justify-center gap-1 ${
                      isSelected
                        ? 'bg-hbo-purple/40 border-hbo-cyan text-white font-bold shadow-lg ring-1 ring-hbo-cyan/50'
                        : 'bg-hbo-dark/60 border-hbo-border hover:bg-hbo-hover hover:border-white/20 text-gray-300'
                    }`}
                  >
                    <span className="text-base sm:text-lg font-bold text-white leading-none">{opt.label}</span>
                    <span className={`text-[10px] ${isSelected ? 'text-hbo-cyan font-semibold' : 'text-gray-500'}`}>
                      {opt.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Countdown Timeout Before Advancing */}
          <div className="border-t border-hbo-border/60 pt-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-2">
                <Clock className="w-4 h-4 text-hbo-cyan flex-shrink-0" />
                <span>Countdown Timeout Before Next Episode</span>
              </h4>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-hbo-dark/90 border border-hbo-border text-hbo-cyan font-bold">
                {settings.upNextTimeout || 10} Seconds
              </span>
            </div>
            <p className="text-xs text-gray-400 mb-3">
              How many seconds the countdown timer displays before starting playback of the next episode.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
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
                    className={`p-3 rounded-xl border text-left transition-all tv-focus-target flex flex-col justify-between ${
                      isSelected
                        ? 'bg-hbo-purple/40 border-hbo-purple-light text-white shadow-md'
                        : 'bg-hbo-dark/60 border-hbo-border hover:bg-hbo-hover hover:border-white/20 text-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-bold text-white">{opt.label}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-hbo-cyan flex-shrink-0" />}
                    </div>
                    <span className={`text-[10px] leading-snug ${isSelected ? 'text-hbo-cyan' : 'text-gray-400'}`}>
                      {opt.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
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
                <span className="break-all font-mono">
                  {updateInfo.hasUpdate 
                    ? `Update Available: v${updateInfo.latestVersion}${updateInfo.apkSizeFormatted ? ` (${updateInfo.apkSizeFormatted})` : ''}` 
                    : 'You are on the latest build'}
                </span>
              </div>
              {updateInfo.hasUpdate && (
                <button
                  onClick={() => setShowUpdateModal(true)}
                  className="px-3 py-1.5 bg-hbo-cyan text-black font-bold rounded-lg hover:bg-hbo-cyan/90 text-xs tv-focus-target flex-shrink-0"
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

          {/* Auto-Check on Startup Toggle */}
          <div className="border-t border-hbo-border/60 pt-4 flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0 pr-2">
              <h4 className="text-xs font-bold text-gray-200 flex items-center gap-2 mb-0.5">
                <RefreshCw className="w-3.5 h-3.5 text-hbo-cyan" />
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
                  ? 'bg-emerald-500/20 border-emerald-400 text-emerald-400'
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
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all tv-focus-target flex items-center gap-1.5 flex-shrink-0 border ${
                settings.includeNightlyUpdates
                  ? 'bg-emerald-500/20 border-emerald-400 text-emerald-400'
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

      {/* Full Page Logo & Version Changelog Screen (Easter Egg on 3 taps) */}
      {showEasterEgg && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowEasterEgg(false);
            }
          }}
          className="fixed inset-0 z-50 bg-hbo-dark/95 backdrop-blur-2xl flex flex-col items-center justify-center p-4 sm:p-6 animate-fade-in select-none"
        >
          <div className="relative w-full max-w-2xl bg-hbo-card/95 border border-hbo-border/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-scale-in">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-hbo-border/60 flex items-center justify-between gap-4 bg-hbo-dark/60">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 rounded-xl bg-hbo-card border border-hbo-border/80 shadow-md flex items-center justify-center flex-shrink-0">
                  <Logo size="sm" showText={false} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold font-display text-white truncate">TMDB Streamer</h3>
                    <span className="px-2 py-0.5 rounded-full bg-hbo-purple/30 border border-hbo-purple-light text-hbo-cyan font-mono text-[10px] font-bold uppercase">
                      {APP_BUILD_CHANNEL}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 font-mono truncate">v{APP_VERSION} (Build #{APP_BUILD_NUMBER})</p>
                </div>
              </div>

              <button
                ref={easterEggCloseRef}
                onClick={() => setShowEasterEgg(false)}
                className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 text-gray-300 hover:text-white transition-all tv-focus-target focus:outline-none focus:ring-2 focus:ring-hbo-cyan flex-shrink-0"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Changelog Title Bar */}
            <div className="px-5 py-2.5 bg-black/30 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-gray-300 uppercase tracking-wider">
                <FileText className="w-4 h-4 text-hbo-cyan" />
                <span>Installed Version Changelog</span>
              </div>
              <span className="text-[10px] text-gray-400 font-mono italic">(D-Pad Up/Down to scroll)</span>
            </div>

            {/* Scrollable Changelog Content */}
            <div
              ref={easterEggScrollRef}
              tabIndex={0}
              onKeyDown={handleEasterEggScrollKeyDown}
              className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-2 font-sans scrollbar-thin scrollbar-thumb-hbo-purple tv-focus-target focus:outline-none focus:ring-2 focus:ring-hbo-cyan/60 transition-all bg-black/20"
            >
              <FormattedChangelog notes={APP_CHANGELOG} />
            </div>

            {/* Footer */}
            <div className="p-3.5 sm:p-4 border-t border-hbo-border/60 bg-hbo-dark/60 flex items-center justify-between gap-4">
              <p className="text-[11px] text-gray-400 font-mono truncate">
                {APP_VERSION_FULL}
              </p>
              <button
                onClick={() => setShowEasterEgg(false)}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-hbo-purple to-hbo-cyan text-white font-bold text-xs hover:opacity-90 active:scale-95 transition-all tv-focus-target focus:ring-2 focus:ring-hbo-cyan"
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

