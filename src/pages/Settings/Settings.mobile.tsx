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
  Database,
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
  Radio,
  FileText,
  Clock,
  Percent,
  SlidersHorizontal,
  Layers,
  Info
} from 'lucide-react';

type MobileCategory = 'all' | 'playback' | 'display' | 'content' | 'system';

export const Settings: React.FC = () => {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [savedMessage, setSavedMessage] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<MobileCategory>('all');
  const [isFilterFrozen, setIsFilterFrozen] = useState(false);
  const filterSentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (!filterSentinelRef.current) return;
      const rect = filterSentinelRef.current.getBoundingClientRect();
      // On mobile, the top navbar bottom threshold is around 68px
      setIsFilterFrozen(rect.top <= 68);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
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

  // Dismiss priority dropdown on escape or outside click
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
      if (
        e.key === 'Escape' ||
        e.key === 'BrowserBack' ||
        e.key === 'Back' ||
        e.keyCode === 27 ||
        e.keyCode === 4
      ) {
        e.preventDefault();
        e.stopPropagation();
        const slot = openDropdownSlot;
        setOpenDropdownSlot(null);
        setTimeout(() => {
          document.getElementById(`priority-server-btn-${slot}`)?.focus();
        }, 50);
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
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="w-8 h-8 border-4 border-hbo-cyan border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const showPlayback = activeCategory === 'all' || activeCategory === 'playback';
  const showDisplay = activeCategory === 'all' || activeCategory === 'display';
  const showContent = activeCategory === 'all' || activeCategory === 'content';
  const showSystem = activeCategory === 'all' || activeCategory === 'system';

  return (
    <div className="min-h-screen pt-[calc(max(1rem,env(safe-area-inset-top,24px))+3.75rem)] sm:pt-24 pb-36 px-3.5 sm:px-6 lg:px-8 max-w-4xl mx-auto select-none">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-hbo-border/60">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-hbo-purple/20 border border-hbo-purple/40 flex items-center justify-center flex-shrink-0 shadow-inner">
            <SettingsIcon className="w-5 h-5 text-hbo-purple-light" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black font-display text-white tracking-tight">App Settings</h1>
            <p className="text-[11px] sm:text-xs text-gray-400">Manage playback, display, content, and updates</p>
          </div>
        </div>

        {savedMessage && (
          <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 rounded-full text-[11px] font-semibold animate-fade-in flex-shrink-0">
            <Check className="w-3.5 h-3.5" />
            <span>Saved</span>
          </div>
        )}
      </div>

      {/* Sentinel & Freeze Row Filter Bar */}
      <div ref={filterSentinelRef} className="relative">
        {/* Placeholder when filter is frozen to avoid layout jump */}
        {isFilterFrozen && <div className="h-[48px] mb-6" />}

        <div
          className={`transition-all duration-150 z-30 ${
            isFilterFrozen
              ? 'fixed top-[calc(max(0.75rem,env(safe-area-inset-top,20px))+3rem)] left-0 right-0 px-3.5 sm:px-6 py-2.5 bg-[#050508]/98 backdrop-blur-2xl border-b border-hbo-border/80 shadow-2xl overflow-x-auto no-scrollbar'
              : 'relative -mx-3.5 sm:-mx-6 px-3.5 sm:px-6 py-2.5 bg-[#050508] border-b border-hbo-border/60 mb-6 overflow-x-auto no-scrollbar shadow-lg'
          }`}
        >
          <div className="flex items-center gap-2 min-w-max max-w-4xl mx-auto">
            {[
              { id: 'all' as MobileCategory, label: 'All', icon: SlidersHorizontal },
              { id: 'playback' as MobileCategory, label: 'Playback', icon: Zap },
              { id: 'display' as MobileCategory, label: 'Display', icon: Monitor },
              { id: 'content' as MobileCategory, label: 'Content', icon: ShieldCheck },
              { id: 'system' as MobileCategory, label: 'System', icon: Info },
            ].map((cat) => {
              const Icon = cat.icon;
              const isActive = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${
                    isActive
                      ? 'bg-gradient-to-r from-hbo-purple to-hbo-cyan text-white shadow-hbo-glow'
                      : 'bg-white/5 hover:bg-white/10 text-gray-400 hover:text-gray-200 border border-white/5'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="space-y-7">
        {/* ========================================================================= */}
        {/* 1. STREAMING & PLAYBACK SECTION                                          */}
        {/* ========================================================================= */}
        {showPlayback && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <Zap className="w-4 h-4 text-hbo-cyan" />
              <h2 className="text-xs font-black uppercase tracking-wider text-gray-400">Streaming & Playback</h2>
            </div>

            <div className="bg-hbo-card border border-hbo-border rounded-2xl overflow-hidden shadow-lg divide-y divide-white/5">
              {/* Auto-Play Next Episode */}
              <div className="p-4 sm:p-5 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-hbo-purple-light flex-shrink-0" />
                      <h3 className="text-sm sm:text-base font-bold text-white">Auto-Play Next Episode</h3>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      Show Up Next popup and auto-advance to next episode when countdown finishes.
                    </p>
                  </div>

                  <button
                    onClick={() => handleUpdate({ autoplayNext: settings.autoplayNext === false ? true : false })}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 flex-shrink-0 border ${
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

                {/* Sub-Settings for Auto-Play */}
                {settings.autoplayNext !== false && (
                  <div className="pt-3 border-t border-white/5 space-y-4">
                    {/* Trigger % */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
                          <Percent className="w-3.5 h-3.5 text-hbo-cyan" />
                          <span>Trigger Timing (% of Episode)</span>
                        </span>
                        <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-hbo-dark border border-hbo-border text-hbo-cyan font-bold">
                          {settings.upNextTriggerPercent || 90}% Progress
                        </span>
                      </div>
                      <div className="grid grid-cols-5 gap-1.5">
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
                              className={`py-2 px-1 rounded-xl border text-center transition-all flex flex-col items-center justify-center ${
                                isSelected
                                  ? 'bg-hbo-purple/40 border-hbo-cyan text-white font-bold shadow-md ring-1 ring-hbo-cyan/50'
                                  : 'bg-hbo-dark/60 border-hbo-border text-gray-300 hover:bg-hbo-hover'
                              }`}
                            >
                              <span className="text-xs font-bold text-white">{opt.label}</span>
                              <span className={`text-[9px] ${isSelected ? 'text-hbo-cyan font-semibold' : 'text-gray-500'}`}>
                                {opt.desc}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Countdown Timeout */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-hbo-cyan" />
                          <span>Countdown Duration</span>
                        </span>
                        <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-hbo-dark border border-hbo-border text-hbo-cyan font-bold">
                          {settings.upNextTimeout || 10} Seconds
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {[
                          { seconds: 5, label: '5s', desc: 'Fast' },
                          { seconds: 10, label: '10s', desc: 'Default' },
                          { seconds: 15, label: '15s', desc: 'Relaxed' },
                          { seconds: 20, label: '20s', desc: 'Extended' },
                        ].map((opt) => {
                          const isSelected = (settings.upNextTimeout || 10) === opt.seconds;
                          return (
                            <button
                              key={opt.seconds}
                              onClick={() => handleUpdate({ upNextTimeout: opt.seconds })}
                              className={`py-2 px-2 rounded-xl border text-left transition-all flex flex-col justify-between ${
                                isSelected
                                  ? 'bg-hbo-purple/40 border-hbo-purple-light text-white shadow-md'
                                  : 'bg-hbo-dark/60 border-hbo-border text-gray-300 hover:bg-hbo-hover'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-white">{opt.label}</span>
                                {isSelected && <Check className="w-3 h-3 text-hbo-cyan flex-shrink-0" />}
                              </div>
                              <span className={`text-[9px] ${isSelected ? 'text-hbo-cyan' : 'text-gray-500'}`}>
                                {opt.desc}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Stream Resolvers Engine */}
              <div className="p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-hbo-cyan flex-shrink-0" />
                      <h3 className="text-sm sm:text-base font-bold text-white">Stream Resolver Engines</h3>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      Multi-select enabled resolvers in priority order (<span className="text-emerald-400 font-semibold">TorBox</span> → <span className="text-hbo-cyan font-semibold">Private</span> → <span className="text-gray-300 font-semibold">Embed</span>).
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2.5 pt-1">
                  {[
                    {
                      id: 'torbox' as const,
                      title: 'TorBox Debrid',
                      priority: '#1 Priority',
                      tag: '4K Ultra HD',
                      desc: 'Direct HTTPS 4K HDR & 1080p BluRay cloud streams via TorBox CDN.'
                    },
                    {
                      id: 'private_extractor' as const,
                      title: 'Private Extractor',
                      priority: '#2 Priority',
                      tag: 'Consumet API',
                      desc: 'Direct HLS .m3u8 streams resolved via private backend API.'
                    },
                    {
                      id: 'embed' as const,
                      title: 'Embed Resolver',
                      priority: '#3 Priority',
                      tag: 'Multi-Mirror',
                      desc: 'Standard multi-server iframe embeds (VidLink, MoviesAPI) with ad sandboxing.'
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
                            if (currentEnabled.length === 1) return; // Keep at least 1
                            updated = currentEnabled.filter(r => r !== resOption.id) as ('embed' | 'private_extractor' | 'torbox')[];
                          } else {
                            updated = [...currentEnabled, resOption.id] as ('embed' | 'private_extractor' | 'torbox')[];
                          }
                          handleUpdate({
                            enabledResolvers: updated,
                            streamResolver: updated[0] || 'embed'
                          });
                        }}
                        className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                          isEnabled
                            ? 'bg-hbo-purple/30 border-hbo-cyan text-white shadow-hbo-glow'
                            : 'bg-black/30 border-hbo-border text-gray-500 opacity-60'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${isEnabled ? 'bg-hbo-cyan border-hbo-cyan' : 'border-gray-600 bg-black/40'}`}>
                              {isEnabled && <Check className="w-3 h-3 text-black stroke-[3]" />}
                            </div>
                            <span className="font-bold text-xs sm:text-sm text-white truncate">{resOption.title}</span>
                          </div>
                          <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold flex-shrink-0 ${
                            isEnabled ? 'bg-hbo-cyan/20 text-hbo-cyan border border-hbo-cyan/40' : 'bg-gray-800 text-gray-500'
                          }`}>
                            {resOption.tag}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-300 mt-2 leading-relaxed">{resOption.desc}</p>
                      </button>
                    );
                  })}
                </div>

                {/* TorBox Key Field */}
                {(settings.enabledResolvers || []).includes('torbox') && (
                  <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/40 text-xs text-gray-300 space-y-2 mt-2">
                    <p className="font-bold text-emerald-400 flex items-center gap-1.5">
                      <Radio className="w-3.5 h-3.5 text-emerald-400" />
                      <span>TorBox API Key</span>
                    </p>
                    <input
                      type="password"
                      placeholder="Paste your TorBox API Key here..."
                      value={settings.torboxApiKey || ''}
                      onChange={(e) => handleUpdate({ torboxApiKey: e.target.value })}
                      className="w-full bg-black/60 border border-gray-700 focus:border-emerald-400 text-white px-3 py-2 rounded-lg text-xs font-mono outline-none"
                    />
                  </div>
                )}
              </div>

              {/* Embed Resolver Priority Slots */}
              <div className="p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Server className="w-4 h-4 text-hbo-cyan flex-shrink-0" />
                      <h3 className="text-sm sm:text-base font-bold text-white">Embed Server Priority</h3>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      Choose the 3 primary fallback embed servers for auto-failover.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  {[
                    { index: 0, label: '#1 Priority (Primary)', badgeClass: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40', defaultId: 'vidlink' },
                    { index: 1, label: '#2 Priority (Failover 1)', badgeClass: 'bg-hbo-purple/30 text-hbo-purple-light border-hbo-purple/40', defaultId: 'moviesapi' },
                    { index: 2, label: '#3 Priority (Failover 2)', badgeClass: 'bg-hbo-cyan/20 text-hbo-cyan border-hbo-cyan/40', defaultId: 'cinesrc' }
                  ].map(({ index, label, badgeClass, defaultId }) => {
                    const currentTop = settings.topProviders && settings.topProviders.length >= 3
                      ? settings.topProviders
                      : ['vidlink', 'moviesapi', 'cinesrc'];
                    const selectedId = currentTop[index] || defaultId;
                    const selectedObj = STREAM_PROVIDERS.find(p => p.id === selectedId) || STREAM_PROVIDERS[0];

                    return (
                      <div key={index} className="bg-hbo-dark/70 border border-hbo-border/90 rounded-xl p-3.5 space-y-2 relative" data-priority-dropdown-container="true">
                        <div className="flex items-center justify-between">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${badgeClass}`}>
                            {label}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-gray-300 font-bold">
                            {selectedObj.badge}
                          </span>
                        </div>

                        <button
                          type="button"
                          id={`priority-server-btn-${index}`}
                          onClick={() => setOpenDropdownSlot(openDropdownSlot === index ? null : index)}
                          className="w-full flex items-center justify-between bg-hbo-card/90 border border-hbo-border text-white text-xs font-bold rounded-xl px-3 py-2.5 hover:border-hbo-cyan transition-all"
                        >
                          <span className="truncate pr-2">{selectedObj.name}</span>
                          <ChevronDown className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform ${openDropdownSlot === index ? 'rotate-180 text-hbo-cyan' : ''}`} />
                        </button>

                        {openDropdownSlot === index && (
                          <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 bg-hbo-card/98 border border-hbo-border rounded-xl shadow-2xl p-1.5 max-h-[220px] overflow-y-auto space-y-1 backdrop-blur-2xl animate-fade-in">
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
                                  }}
                                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-left text-xs transition-all ${
                                    isSelected
                                      ? 'bg-hbo-purple/40 border border-hbo-cyan/60 text-white font-bold'
                                      : 'text-gray-300 hover:bg-hbo-hover hover:text-white'
                                  }`}
                                >
                                  <span className="truncate">{provider.name}</span>
                                  {isSelected && <Check className="w-3 h-3 text-hbo-cyan flex-shrink-0" />}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Ad & Popup Sandboxing Shield */}
              <div className="p-4 sm:p-5 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-green-400 flex-shrink-0" />
                    <h3 className="text-sm sm:text-base font-bold text-white">Ad & Popup Sandboxing</h3>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    Blocks iframe popups, new tab hijacks, and malicious redirect scripts.
                  </p>
                </div>

                <button
                  onClick={() => handleUpdate({ adBlockShield: !settings.adBlockShield })}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 flex-shrink-0 border ${
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
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 2. DISPLAY & EXPERIENCE SECTION                                          */}
        {/* ========================================================================= */}
        {showDisplay && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <Monitor className="w-4 h-4 text-hbo-cyan" />
              <h2 className="text-xs font-black uppercase tracking-wider text-gray-400">Display & Experience</h2>
            </div>

            <div className="bg-hbo-card border border-hbo-border rounded-2xl overflow-hidden shadow-lg divide-y divide-white/5">
              {/* Device Experience Mode */}
              <div className="p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Tv2 className="w-4 h-4 text-hbo-cyan flex-shrink-0" />
                    <h3 className="text-sm sm:text-base font-bold text-white">Device Experience Mode</h3>
                  </div>
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-hbo-dark border border-hbo-border text-hbo-cyan font-bold">
                    Active: {activeLayout.toUpperCase()}
                  </span>
                </div>
                <p className="text-xs text-gray-400">
                  Select your preferred UI format or keep Auto-Detect for responsive layout adapting.
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
                  {[
                    { id: 'auto', label: 'Auto Detect', icon: Monitor, desc: detectedPlatform.toUpperCase() },
                    { id: 'mobile', label: 'Mobile Phone', icon: Smartphone, desc: 'Bottom Nav' },
                    { id: 'tablet', label: 'Tablet / Pad', icon: Tablet, desc: 'Touch Grid' },
                    { id: 'tv', label: 'Android TV', icon: Tv2, desc: 'D-Pad Focus' },
                    { id: 'desktop', label: 'Desktop / PC', icon: Monitor, desc: 'Wide Cinema' },
                  ].map((mode) => {
                    const Icon = mode.icon;
                    const isSelected = settings.deviceMode === mode.id;
                    return (
                      <button
                        key={mode.id}
                        onClick={() => handleUpdate({ deviceMode: mode.id as any })}
                        className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between min-h-[76px] ${
                          isSelected
                            ? 'bg-gradient-to-r from-hbo-purple/40 to-hbo-cyan/20 border-hbo-cyan shadow-hbo-glow'
                            : 'bg-hbo-dark/60 border-hbo-border hover:bg-hbo-hover text-gray-300'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <Icon className={`w-4 h-4 ${isSelected ? 'text-hbo-cyan' : 'text-gray-400'}`} />
                          {isSelected && <Check className="w-3 h-3 text-hbo-cyan stroke-[3]" />}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-white leading-tight">{mode.label}</p>
                          <p className={`text-[10px] mt-0.5 ${isSelected ? 'text-hbo-cyan font-semibold' : 'text-gray-500'}`}>
                            {mode.desc}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Stream Header Auto-Hide Timeout */}
              <div className="p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <EyeOff className="w-4 h-4 text-hbo-cyan flex-shrink-0" />
                    <h3 className="text-sm sm:text-base font-bold text-white">Stream Header Auto-Hide</h3>
                  </div>
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-hbo-dark border border-hbo-border text-hbo-cyan font-bold">
                    {(settings.streamHeaderTimeout || 5) === 0 ? 'Always Visible' : `${settings.streamHeaderTimeout || 5}s`}
                  </span>
                </div>
                <p className="text-xs text-gray-400">
                  Automatically fade out the top overlay header while streaming. Tap anywhere to reveal.
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                  {[
                    { seconds: 3, label: '3 Seconds', desc: 'Fast fade' },
                    { seconds: 5, label: '5s (Default)', desc: 'Standard' },
                    { seconds: 8, label: '8 Seconds', desc: 'Relaxed' },
                    { seconds: 0, label: 'Always Visible', desc: 'No hide' }
                  ].map((opt) => {
                    const isSelected = (settings.streamHeaderTimeout ?? 5) === opt.seconds;
                    return (
                      <button
                        key={opt.seconds}
                        onClick={() => handleUpdate({ streamHeaderTimeout: opt.seconds })}
                        className={`p-2.5 rounded-xl border text-left transition-all ${
                          isSelected
                            ? 'bg-hbo-cyan/20 border-hbo-cyan text-white shadow-hbo-glow'
                            : 'bg-hbo-dark/60 border-hbo-border text-gray-400 hover:text-gray-200'
                        }`}
                      >
                        <p className={`text-xs font-bold ${isSelected ? 'text-hbo-cyan' : 'text-white'}`}>
                          {opt.label}
                        </p>
                        <p className="text-[10px] text-gray-500 mt-0.5">{opt.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* UI Performance Mode */}
              <div className="p-4 sm:p-5 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-hbo-cyan flex-shrink-0" />
                    <h3 className="text-sm sm:text-base font-bold text-white">UI Performance Mode (Lite)</h3>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    Reduces GPU blurs, animations, and shadows for faster performance and lower battery drain.
                  </p>
                </div>

                <button
                  onClick={() => handleUpdate({ performanceMode: !(settings.performanceMode ?? false) })}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 flex-shrink-0 border ${
                    (settings.performanceMode ?? false)
                      ? 'bg-hbo-cyan text-black shadow-hbo-glow font-extrabold border-hbo-cyan'
                      : 'bg-white/5 border-white/10 text-gray-400'
                  }`}
                >
                  {(settings.performanceMode ?? false) ? 'Enabled' : 'Disabled'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 3. CONTENT & PARENTAL CONTROLS SECTION                                    */}
        {/* ========================================================================= */}
        {showContent && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <ShieldCheck className="w-4 h-4 text-hbo-cyan" />
              <h2 className="text-xs font-black uppercase tracking-wider text-gray-400">Content & Parental Controls</h2>
            </div>

            <div className="bg-hbo-card border border-hbo-border rounded-2xl overflow-hidden shadow-lg divide-y divide-white/5">
              {/* Catalog Maturity Level */}
              <div className="p-4 sm:p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-hbo-cyan flex-shrink-0" />
                  <h3 className="text-sm sm:text-base font-bold text-white">Catalog Maturity Rating Limit</h3>
                </div>
                <p className="text-xs text-gray-400">
                  Limit discovery catalog recommendations to age-appropriate certification tiers.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
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
                        className={`p-3 rounded-xl border text-left transition-all ${
                          isSelected
                            ? 'bg-hbo-cyan/20 border-hbo-cyan text-white shadow-hbo-glow'
                            : 'bg-hbo-dark/60 border-hbo-border text-gray-400 hover:text-gray-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <p className={`text-xs font-bold ${isSelected ? 'text-hbo-cyan' : 'text-white'}`}>
                            {lvl.label}
                          </p>
                          {isSelected && <Check className="w-3 h-3 text-hbo-cyan stroke-[3]" />}
                        </div>
                        <p className="text-[10px] text-gray-500 mt-1">{lvl.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Adult Content SafeSearch */}
              <div className="p-4 sm:p-5 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <EyeOff className="w-4 h-4 text-amber-400 flex-shrink-0" />
                    <h3 className="text-sm sm:text-base font-bold text-white">Filter Adult & Explicit Content</h3>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    SafeSearch: Excludes 18+ adult rated media from search queries and catalogs.
                  </p>
                </div>

                <button
                  onClick={() => handleUpdate({ filterAdult: settings.filterAdult === false ? true : false })}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 flex-shrink-0 border ${
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
              <div className="p-4 sm:p-5 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <CalendarX className="w-4 h-4 text-hbo-cyan flex-shrink-0" />
                    <h3 className="text-sm sm:text-base font-bold text-white">Filter Unreleased Titles</h3>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    Hides future movies and TV series that have not yet premiered or aired.
                  </p>
                </div>

                <button
                  onClick={() => handleUpdate({ filterUnreleased: settings.filterUnreleased === false ? true : false })}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 flex-shrink-0 border ${
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
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 4. SYSTEM & UPDATES SECTION                                               */}
        {/* ========================================================================= */}
        {showSystem && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <Info className="w-4 h-4 text-hbo-cyan" />
              <h2 className="text-xs font-black uppercase tracking-wider text-gray-400">System & Updates</h2>
            </div>

            <div className="bg-hbo-card border border-hbo-border rounded-2xl overflow-hidden shadow-lg divide-y divide-white/5">
              {/* Software Update Card */}
              <div className="p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <ArrowUpCircle className="w-4 h-4 text-hbo-cyan flex-shrink-0" />
                      <h3 className="text-sm sm:text-base font-bold text-white">Software Update</h3>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      Check for new versions and features directly from GitHub Releases.
                    </p>
                  </div>

                  <button
                    onClick={handleCheckForUpdates}
                    disabled={checkingUpdate}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-hbo-purple to-hbo-cyan text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-hbo-purple/30 active:scale-95 transition-all"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${checkingUpdate ? 'animate-spin' : ''}`} />
                    <span>{checkingUpdate ? 'Checking...' : 'Check for Updates'}</span>
                  </button>
                </div>

                {updateInfo && (
                  <div className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs ${
                    updateInfo.hasUpdate 
                      ? 'bg-hbo-purple/20 border-hbo-purple-light text-white' 
                      : 'bg-white/5 border-white/10 text-gray-300'
                  }`}>
                    <div className="flex items-center gap-2 min-w-0">
                      {updateInfo.hasUpdate ? (
                        <Sparkles className="w-4 h-4 text-hbo-cyan flex-shrink-0" />
                      ) : (
                        <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      )}
                      <span className="truncate font-mono">
                        {updateInfo.hasUpdate 
                          ? `v${updateInfo.latestVersion} Available (${updateInfo.apkSizeFormatted || 'APK'})` 
                          : 'You are on the latest build'}
                      </span>
                    </div>
                    {updateInfo.hasUpdate && (
                      <button
                        onClick={() => setShowUpdateModal(true)}
                        className="px-3 py-1 bg-hbo-cyan text-black font-bold rounded-lg text-xs flex-shrink-0"
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
              </div>

              {/* Auto-Check & Nightly Channel Options */}
              <div className="p-4 sm:p-5 space-y-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs font-bold text-gray-200 flex items-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 text-hbo-cyan" />
                      <span>Auto-Check on Startup</span>
                    </h4>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Automatically check for updates when opening the app.
                    </p>
                  </div>

                  <button
                    onClick={() => handleUpdate({ autoUpdateCheck: !(settings.autoUpdateCheck ?? true) })}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 flex-shrink-0 border ${
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

                <div className="pt-3 border-t border-white/5 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs font-bold text-gray-200 flex items-center gap-2">
                      <Moon className="w-3.5 h-3.5 text-amber-400" />
                      <span>Include Nightly Builds</span>
                    </h4>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Receive automated daily pre-release builds.
                    </p>
                  </div>

                  <button
                    onClick={() => handleUpdate({ includeNightlyUpdates: !settings.includeNightlyUpdates })}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 flex-shrink-0 border ${
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

              {/* Version & Build Info Card */}
              <div className="p-4 sm:p-5 flex items-center justify-between gap-3 flex-wrap bg-white/[0.02]">
                <div>
                  <p className="font-bold text-gray-200 text-xs sm:text-sm flex items-center gap-2">
                    <span>TMDB Streamer v{APP_VERSION}</span>
                    {APP_BUILD_CHANNEL !== 'stable' && (
                      <span className="text-[9px] uppercase font-mono px-2 py-0.5 rounded-full bg-hbo-cyan/20 text-hbo-cyan border border-hbo-cyan/40">
                        {APP_BUILD_CHANNEL}
                      </span>
                    )}
                  </p>
                  <p className="text-[10px] sm:text-[11px] text-gray-500 font-mono mt-0.5 truncate max-w-[200px] sm:max-w-md">
                    {APP_VERSION_FULL}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleBuildNumberClick}
                  className="px-3 py-1.5 rounded-full bg-hbo-purple/30 border border-hbo-purple-light text-hbo-cyan font-mono text-[11px] font-bold active:scale-95 transition-all inline-flex items-center gap-1.5"
                >
                  <span>Build #{APP_BUILD_NUMBER}</span>
                </button>
              </div>
            </div>
          </div>
        )}
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
          <div className="relative w-full max-w-lg bg-hbo-card/95 border border-hbo-border/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-scale-in">
            <div className="p-4 border-b border-hbo-border/60 flex items-center justify-between gap-4 bg-hbo-dark/60">
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
                className="p-2 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 text-gray-300 hover:text-white transition-all"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-4 py-2 bg-black/30 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-gray-300 uppercase tracking-wider">
                <FileText className="w-3.5 h-3.5 text-hbo-cyan" />
                <span>Installed Version Changelog</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2 font-sans scrollbar-thin scrollbar-thumb-hbo-purple transition-all bg-black/20">
              <FormattedChangelog notes={APP_CHANGELOG} />
            </div>

            <div className="p-3.5 border-t border-hbo-border/60 bg-hbo-dark/60 flex items-center justify-between gap-3">
              <p className="text-[10px] sm:text-[11px] text-gray-400 font-mono truncate max-w-[220px]">
                {APP_VERSION_FULL}
              </p>
              <button
                onClick={() => setShowEasterEgg(false)}
                className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-hbo-purple to-hbo-cyan text-white font-bold text-xs active:scale-95 transition-all"
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


