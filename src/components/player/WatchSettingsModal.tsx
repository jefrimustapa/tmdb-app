import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Subtitles,
  Server,
  Check,
  X,
  Clock,
  Plus,
  Minus,
  RotateCcw,
  AlertCircle,
  Loader2,
  ShieldCheck,
  Send,
  Zap,
  Globe,
  Sparkles,
  Type
} from 'lucide-react';
import { SubtitleTrack } from '../../services/subtitleService';
import { STREAM_PROVIDERS, getOrderedProviders, getProvidersByEngine, getProviderById, CATEGORY_BADGE_CONFIG, ORIGIN_COUNTRY_LABELS, extractMediaOriginCountries, isProviderMatchingMedia } from '../../services/streamProviders';
import type { StreamProvider, StreamEngineType, OriginCountryCode } from '../../types/stream';
import type { StreamResolverType } from '../../types/db';
import { dbService } from '../../services/db';

export type WatchSettingsTab = 'subtitles' | 'servers' | 'server';

interface WatchSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: WatchSettingsTab;
  // Subtitle Props
  tracks: SubtitleTrack[];
  activeTrackId: string | null;
  onSelectTrack: (track: SubtitleTrack | null) => void;
  syncOffset: number;
  onAdjustSync: (offset: number) => void;
  fontSize?: number;
  onAdjustFontSize?: (size: number) => void;
  isLoadingSubtitles?: boolean;
  // Provider / Server Props
  currentProviderId: string;
  onSelectProvider: (provider: StreamProvider) => void;
  enabledResolvers?: StreamResolverType[];
  isProbing?: boolean;
  serverIndex?: number;
  totalServers?: number;
  isAnime?: boolean;
  isAsean?: boolean;
  isAsian?: boolean; // Backward compatibility alias
  isKorean?: boolean;
  originCountries?: OriginCountryCode[];
  details?: any;
}

export const WatchSettingsModal: React.FC<WatchSettingsModalProps> = ({
  originCountries,
  details,
  isOpen,
  onClose,
  defaultTab = 'subtitles',
  tracks,
  activeTrackId,
  onSelectTrack,
  syncOffset,
  onAdjustSync,
  fontSize = 100,
  onAdjustFontSize,
  isLoadingSubtitles = false,
  currentProviderId,
  onSelectProvider,
  enabledResolvers,
  isProbing = false,
  serverIndex = 1,
  totalServers = STREAM_PROVIDERS.length,
  isAnime = false,
  isAsean = false,
  isAsian = false,
  isKorean = false
}) => {
  const [activeTab, setActiveTab] = useState<WatchSettingsTab>(defaultTab === 'servers' ? 'server' : defaultTab);
  const [filterLang, setFilterLang] = useState<'all' | 'ms' | 'en'>('all');
  const modalRef = useRef<HTMLDivElement>(null);
  const activeAsean = isAsean || isAsian;

  const hasEmbed = !enabledResolvers || enabledResolvers.includes('embed');
  const hasTelegram = Boolean(enabledResolvers && enabledResolvers.includes('telegram'));

  const [tgCountries, setTgCountries] = useState<Record<string, OriginCountryCode[]> | undefined>();
  const [tgEnabledList, setTgEnabledList] = useState<string[] | undefined>();

  useEffect(() => {
    if (isOpen) {
      dbService.getSettings().then((s) => {
        if (s?.telegramProviderCountries) setTgCountries(s.telegramProviderCountries);
        if (s?.enabledTelegramProviders) setTgEnabledList(s.enabledTelegramProviders);
      });
    }
  }, [isOpen]);

  // 1. Direct Stream Providers (Telegram / Native Player filtered by origin matching)
  const directProviders = React.useMemo(() => {
    if (!hasTelegram) return [];
    const mediaOrigins = (originCountries && originCountries.length > 0)
      ? originCountries
      : extractMediaOriginCountries(details, isAnime, isKorean, activeAsean);
    return getProvidersByEngine('telegram').filter((p) =>
      isProviderMatchingMedia(p, mediaOrigins, tgCountries, tgEnabledList)
    );
  }, [hasTelegram, originCountries, details, isAnime, isKorean, activeAsean, tgCountries, tgEnabledList]);

  // 2. Embed Stream Providers (Web Iframe Mirrors)
  const embedProviders = React.useMemo(() => {
    if (!hasEmbed) return [];
    if (isKorean) return getOrderedProviders(undefined, false, false, true).filter(p => (p.engine || 'embed') === 'embed');
    if (activeAsean) return getOrderedProviders(undefined, false, true, false).filter(p => (p.engine || 'embed') === 'embed');
    if (isAnime) return getOrderedProviders(undefined, true, false, false).filter(p => (p.engine || 'embed') === 'embed');
    return getProvidersByEngine('embed');
  }, [hasEmbed, isKorean, activeAsean, isAnime]);

  // Combined available providers (Direct first, then Embed)
  const allAvailableProviders = React.useMemo(() => {
    return [...directProviders, ...embedProviders];
  }, [directProviders, embedProviders]);

  const [serverFilter, setServerFilter] = useState<'all' | 'direct' | 'embed'>('all');

  useEffect(() => {
    if (isOpen) {
      setActiveTab(defaultTab);
      if (!hasEmbed && hasTelegram) {
        setServerFilter('direct');
      } else if (hasEmbed && !hasTelegram) {
        setServerFilter('embed');
      } else {
        setServerFilter('all');
      }
    }
  }, [isOpen, defaultTab, hasEmbed, hasTelegram]);

  const effectiveTotalServers = allAvailableProviders.length;
  const currentProviderIndex = allAvailableProviders.findIndex(p => p.id === currentProviderId);
  const effectiveServerIndex = currentProviderIndex >= 0
    ? currentProviderIndex + 1
    : (serverIndex <= effectiveTotalServers ? serverIndex : 1);

  useEffect(() => {
    if (!isOpen) {
      try {
        (window as any).AndroidBridge?.setModalOpen?.(false);
        (window as any).AndroidBridge?.setDropdownOpen?.(false);
      } catch (e) {}
      return;
    }

    // Pause playback when modal is opened (no auto-resume on close)
    try {
      window.dispatchEvent(new CustomEvent('tmdb_pause_player'));
    } catch (e) {}

    try {
      (window as any).AndroidBridge?.setModalOpen?.(true);
      (window as any).AndroidBridge?.setDropdownOpen?.(false);
    } catch (e) {}

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Back' || e.keyCode === 27) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        const settingsBtn = document.getElementById('watch-settings-btn');
        if (settingsBtn) settingsBtn.focus();
        return;
      }

      if (!modalRef.current) return;

      const currentEl = document.activeElement as HTMLElement | null;

      // Group focusables into logical rows so vertical navigation jumps rows directly!
      const closeBtn = modalRef.current.querySelector<HTMLElement>('[data-close-dialog="true"]');
      const tabs = Array.from(modalRef.current.querySelectorAll<HTMLElement>('[role="tab"]'));
      const syncBtns = Array.from(modalRef.current.querySelectorAll<HTMLElement>('[data-sync-btn="true"]'));
      const langBtns = Array.from(modalRef.current.querySelectorAll<HTMLElement>('[data-lang-btn="true"]'));
      const listItems = Array.from(modalRef.current.querySelectorAll<HTMLElement>('[data-list-item="true"]'));

      const rows: HTMLElement[][] = [];
      if (tabs.length > 0) rows.push(tabs);
      if (syncBtns.length > 0) rows.push(syncBtns);
      if (langBtns.length > 0) rows.push(langBtns);
      listItems.forEach((item) => rows.push([item]));

      // Determine which row current element belongs to
      let currentRowIdx = -1;
      let currentColIdx = -1;

      if (currentEl) {
        for (let r = 0; r < rows.length; r++) {
          const c = rows[r].indexOf(currentEl);
          if (c !== -1) {
            currentRowIdx = r;
            currentColIdx = c;
            break;
          }
        }
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();

        if (currentEl === closeBtn) {
          // Move from close button to active tab
          const activeTabEl = tabs.find((t) => t.getAttribute('aria-selected') === 'true') || tabs[0];
          activeTabEl?.focus();
          return;
        }

        if (currentRowIdx === -1) {
          // If current element is outside modal, focus active tab or first element
          const activeTabEl = tabs.find((t) => t.getAttribute('aria-selected') === 'true') || (rows[0] && rows[0][0]) || closeBtn;
          if (activeTabEl && activeTabEl !== currentEl) {
            activeTabEl.focus();
            return;
          }
          // If already on active tab or couldn't match, move to row 1 (content)
          if (rows.length > 1 && rows[1].length > 0) {
            rows[1][0].focus();
            rows[1][0].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            return;
          }
        }

        if (currentRowIdx < rows.length - 1) {
          const nextRow = rows[currentRowIdx + 1];
          // Try to preserve relative horizontal index if possible, else 0
          const targetCol = Math.min(currentColIdx >= 0 ? currentColIdx : 0, nextRow.length - 1);
          const targetEl = nextRow[targetCol];
          targetEl.focus();
          targetEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();

        if (currentRowIdx === -1) {
          const activeTabEl = tabs.find((t) => t.getAttribute('aria-selected') === 'true') || (rows[0] && rows[0][0]) || closeBtn;
          activeTabEl?.focus();
          return;
        }

        if (currentRowIdx > 0) {
          const prevRow = rows[currentRowIdx - 1];
          const targetCol = Math.min(currentColIdx >= 0 ? currentColIdx : 0, prevRow.length - 1);
          const targetEl = prevRow[targetCol];
          targetEl.focus();
          targetEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } else if (currentRowIdx === 0) {
          // From top tab switcher, ArrowUp moves to close button
          if (closeBtn) closeBtn.focus();
        }
        return;
      }

      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const delta = e.key === 'ArrowRight' ? 1 : -1;

        if (currentRowIdx === -1) {
          const activeTabEl = tabs.find((t) => t.getAttribute('aria-selected') === 'true') || (rows[0] && rows[0][0]) || closeBtn;
          activeTabEl?.focus();
          return;
        }

        // If on tab buttons, switch active tab with left/right
        const tabSub = document.getElementById('settings-tab-subtitles');
        const tabSrv = document.getElementById('settings-tab-server');

        if (currentEl === tabSub && delta === 1) {
          e.preventDefault();
          e.stopPropagation();
          setActiveTab('server');
          setTimeout(() => tabSrv?.focus(), 30);
          return;
        }
        if (currentEl === tabSrv && delta === -1) {
          e.preventDefault();
          e.stopPropagation();
          setActiveTab('subtitles');
          setTimeout(() => tabSub?.focus(), 30);
          return;
        }

        // Inside a multi-item row (sync offset buttons or language filter pills), navigate horizontally
        if (currentRowIdx !== -1) {
          const row = rows[currentRowIdx];
          if (row.length > 1 && currentColIdx !== -1) {
            const nextCol = currentColIdx + delta;
            if (nextCol >= 0 && nextCol < row.length) {
              e.preventDefault();
              e.stopPropagation();
              row[nextCol].focus();
              row[nextCol].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
          }
        }
      }
    };

    const handleCloseDialog = () => { onClose(); };
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('tmdb_close_dialog', handleCloseDialog);

    // Reliable focus pull into modal from iframe / background
    const focusActiveModalElement = () => {
      // Forcefully release focus from any embed iframe
      try {
        window.focus();
        document.querySelectorAll('iframe').forEach((f) => {
          try {
            f.blur();
            if (f.contentWindow) f.contentWindow.blur();
          } catch (e) {}
        });
      } catch (e) {}

      const modalEl = modalRef.current || document.querySelector<HTMLElement>('[role="dialog"]');
      if (modalEl) {
        const current = document.activeElement as HTMLElement | null;
        if (current && !modalEl.contains(current)) {
          current.blur();
        }
        // If already inside modal and not on modal root, keep current focus
        if (current && modalEl.contains(current) && current !== modalEl) {
          return;
        }
        const selected = modalEl.querySelector<HTMLElement>(
          '[data-selected-item="true"], [data-selected-track="true"], button[role="tab"][aria-selected="true"]'
        );
        if (selected) {
          selected.focus();
          selected.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } else {
          const firstFocusable = modalEl.querySelector<HTMLElement>('button:not([disabled])');
          if (firstFocusable) firstFocusable.focus();
        }
      }
    };

    // Pull focus on multiple animation frames to ensure DOM is ready and iframe cannot steal it back
    focusActiveModalElement();
    const t1 = setTimeout(focusActiveModalElement, 50);
    const t2 = setTimeout(focusActiveModalElement, 150);
    const t3 = setTimeout(focusActiveModalElement, 300);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('tmdb_close_dialog', handleCloseDialog);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      try {
        (window as any).AndroidBridge?.setModalOpen?.(false);
      } catch (e) {}
      window.dispatchEvent(new CustomEvent('tmdb_resume_player'));
    };
  }, [isOpen, activeTab, onClose]);

  if (!isOpen) return null;

  const filteredTracks = tracks.filter((t) => {
    if (filterLang === 'all') return true;
    const lang = (t.language || '').toLowerCase();
    if (filterLang === 'ms') {
      return lang.includes('malay') || lang.includes('indo') || lang === 'ms' || lang === 'id';
    }
    if (filterLang === 'en') {
      return lang.includes('eng') || lang === 'en';
    }
    return true;
  });

  const malayCount = tracks.filter((t) => {
    const l = (t.language || '').toLowerCase();
    return l.includes('malay') || l.includes('indo') || l === 'ms' || l === 'id';
  }).length;

  const englishCount = tracks.filter((t) => {
    const l = (t.language || '').toLowerCase();
    return l.includes('eng') || l === 'en';
  }).length;

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fadeIn select-none"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="watch-settings-title"
    >
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[85vh] flex flex-col bg-zinc-950/95 border border-white/10 rounded-2xl shadow-2xl shadow-black/90 overflow-hidden animate-scaleUp"
      >
        {/* Header: Title + Close Button */}
        <div className="flex items-center justify-between px-4 py-2.5 sm:px-5 sm:py-2.5 border-b border-white/10 bg-black/40 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-white">
              {activeTab === 'subtitles' ? (
                <Subtitles className="w-4 h-4 text-white" />
              ) : (
                <Server className="w-4 h-4 text-white" />
              )}
            </div>
            <h2 id="watch-settings-title" className="text-sm sm:text-base font-bold text-white leading-tight">
              Playback Settings
            </h2>
          </div>
          <button
            type="button"
            tabIndex={0}
            onClick={onClose}
            aria-label="Close"
            data-close-dialog="true"
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 active:scale-95 transition tv-focus-target focus:outline-none focus:border-hbo-cyan focus:ring-2 focus:ring-hbo-cyan cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher (Subtitles & Server) */}
        <div className="flex items-center border-b border-white/10 bg-black/25 px-5 py-2.5 gap-2 flex-shrink-0" role="tablist">
          <button
            type="button"
            role="tab"
            tabIndex={0}
            id="settings-tab-subtitles"
            aria-selected={activeTab === 'subtitles'}
            onClick={() => setActiveTab('subtitles')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl font-bold text-xs sm:text-sm transition tv-focus-target focus:outline-none focus:ring-2 focus:ring-hbo-cyan cursor-pointer ${
              activeTab === 'subtitles'
                ? 'bg-hbo-cyan/20 text-hbo-cyan border border-hbo-cyan/40 shadow-sm'
                : 'bg-white/5 hover:bg-white/10 text-gray-300 border border-transparent'
            }`}
          >
            <Subtitles className="w-4 h-4" />
            <span>Subtitles</span>
            {activeTrackId && (
              <span className="w-2 h-2 rounded-full bg-hbo-cyan ml-0.5" />
            )}
          </button>

          <button
            type="button"
            role="tab"
            tabIndex={0}
            id="settings-tab-server"
            aria-selected={activeTab === 'server'}
            onClick={() => setActiveTab('server')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl font-bold text-xs sm:text-sm transition tv-focus-target focus:outline-none focus:ring-2 focus:ring-hbo-cyan cursor-pointer ${
              activeTab === 'server'
                ? 'bg-hbo-cyan/20 text-hbo-cyan border border-hbo-cyan/40 shadow-sm'
                : 'bg-white/5 hover:bg-white/10 text-gray-300 border border-transparent'
            }`}
          >
            <Server className="w-4 h-4" />
            <span>Server</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-gray-400 font-mono">
              {effectiveServerIndex}/{effectiveTotalServers}
            </span>
          </button>
        </div>

        {/* TAB 1: SUBTITLES */}
        {activeTab === 'subtitles' && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Sync Offset Controls (Visible only if a track is actively selected) */}
            {activeTrackId && (
              <div className="flex items-center justify-between px-5 py-2.5 bg-black/40 border-b border-white/10 text-xs flex-shrink-0">
                <div className="flex items-center gap-2 text-gray-300">
                  <Clock className="w-3.5 h-3.5 text-hbo-cyan" />
                  <span>Subtitle Sync:</span>
                  <span className={`font-mono font-bold ${syncOffset === 0 ? 'text-gray-400' : 'text-hbo-cyan'}`}>
                    {syncOffset > 0 ? `+${syncOffset.toFixed(1)}s` : `${syncOffset.toFixed(1)}s`}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    tabIndex={0}
                    onClick={() => onAdjustSync(Math.round((syncOffset - 0.5) * 10) / 10)}
                    data-sync-btn="true"
                    title="Delay subtitle by 0.5s"
                    className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 text-white font-medium flex items-center gap-1 transition tv-focus-target focus:outline-none focus:ring-2 focus:ring-hbo-cyan cursor-pointer"
                  >
                    <Minus className="w-3 h-3" />
                    <span>0.5s</span>
                  </button>
                  {syncOffset !== 0 && (
                    <button
                      type="button"
                      tabIndex={0}
                      onClick={() => onAdjustSync(0)}
                      data-sync-btn="true"
                      title="Reset subtitle offset to 0"
                      className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 text-hbo-cyan transition tv-focus-target focus:outline-none focus:ring-2 focus:ring-hbo-cyan cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                  )}
                  <button
                    type="button"
                    tabIndex={0}
                    onClick={() => onAdjustSync(Math.round((syncOffset + 0.5) * 10) / 10)}
                    data-sync-btn="true"
                    title="Advance subtitle by 0.5s"
                    className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 text-white font-medium flex items-center gap-1 transition tv-focus-target focus:outline-none focus:ring-2 focus:ring-hbo-cyan cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>0.5s</span>
                  </button>
                </div>
              </div>
            )}

            {/* Font Size Controls (Persistent Global Adjustment) */}
            {onAdjustFontSize && (
              <div className="flex items-center justify-between px-4 py-2 sm:px-5 sm:py-2.5 bg-black/30 border-b border-white/10 text-xs flex-shrink-0">
                <div className="flex items-center gap-2 text-gray-300">
                  <Type className="w-3.5 h-3.5 text-hbo-cyan" />
                  <span>Font Size:</span>
                  <span className={`font-mono font-bold ${(fontSize || 100) === 100 ? 'text-gray-400' : 'text-hbo-cyan'}`}>
                    {fontSize || 100}%
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    tabIndex={0}
                    onClick={() => onAdjustFontSize(Math.max(70, (fontSize || 100) - 15))}
                    data-font-btn="true"
                    title="Decrease subtitle font size"
                    className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 text-white font-medium flex items-center gap-1 transition tv-focus-target focus:outline-none focus:ring-2 focus:ring-hbo-cyan cursor-pointer"
                  >
                    <Minus className="w-3 h-3" />
                    <span>15%</span>
                  </button>
                  {(fontSize || 100) !== 100 && (
                    <button
                      type="button"
                      tabIndex={0}
                      onClick={() => onAdjustFontSize(100)}
                      data-font-btn="true"
                      title="Reset font size to 100%"
                      className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 text-hbo-cyan transition tv-focus-target focus:outline-none focus:ring-2 focus:ring-hbo-cyan cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                  )}
                  <button
                    type="button"
                    tabIndex={0}
                    onClick={() => onAdjustFontSize(Math.min(190, (fontSize || 100) + 15))}
                    data-font-btn="true"
                    title="Increase subtitle font size"
                    className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 text-white font-medium flex items-center gap-1 transition tv-focus-target focus:outline-none focus:ring-2 focus:ring-hbo-cyan cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>15%</span>
                  </button>
                </div>
              </div>
            )}

            {/* Language Tabs */}
            <div className="flex items-center gap-2 px-5 py-2.5 border-b border-white/10 bg-black/20 text-xs flex-shrink-0">
              <button
                type="button"
                tabIndex={0}
                onClick={() => setFilterLang('all')} data-lang-btn="true"
                className={`px-3 py-1.5 rounded-lg font-semibold transition tv-focus-target focus:outline-none focus:ring-2 focus:ring-hbo-cyan cursor-pointer ${
                  filterLang === 'all'
                    ? 'bg-hbo-cyan/20 text-hbo-cyan border border-hbo-cyan/40'
                    : 'bg-white/5 text-gray-400 hover:text-white'
                }`}
              >
                All ({tracks.length})
              </button>
              <button
                type="button"
                tabIndex={0}
                onClick={() => setFilterLang('ms')} data-lang-btn="true"
                className={`px-3 py-1.5 rounded-lg font-semibold transition tv-focus-target focus:outline-none focus:ring-2 focus:ring-hbo-cyan cursor-pointer ${
                  filterLang === 'ms'
                    ? 'bg-hbo-cyan/20 text-hbo-cyan border border-hbo-cyan/40'
                    : 'bg-white/5 text-gray-400 hover:text-white'
                }`}
              >
                Melayu / Indo ({malayCount})
              </button>
              <button
                type="button"
                tabIndex={0}
                onClick={() => setFilterLang('en')} data-lang-btn="true"
                className={`px-3 py-1.5 rounded-lg font-semibold transition tv-focus-target focus:outline-none focus:ring-2 focus:ring-hbo-cyan cursor-pointer ${
                  filterLang === 'en'
                    ? 'bg-hbo-cyan/20 text-hbo-cyan border border-hbo-cyan/40'
                    : 'bg-white/5 text-gray-400 hover:text-white'
                }`}
              >
                English ({englishCount})
              </button>
            </div>

            {/* Subtitle Track List */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2 overscroll-contain">
              {/* Option: Off / Disable */}
              <button
                type="button"
                tabIndex={0}
                data-selected-item={activeTrackId === null ? 'true' : undefined}
                data-selected-track={activeTrackId === null ? 'true' : undefined}
                data-list-item="true"
                onClick={() => {
                  onSelectTrack(null);
                  onClose();
                }}
                className={`w-full flex items-center justify-between p-3 rounded-xl text-left border transition cursor-pointer tv-focus-target focus:outline-none focus:border-hbo-cyan focus:ring-2 focus:ring-hbo-cyan ${
                  activeTrackId === null
                    ? 'bg-hbo-purple/25 border-hbo-cyan/50 text-white shadow-hbo-glow'
                    : 'bg-white/5 hover:bg-white/10 border-white/5 text-gray-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                      activeTrackId === null ? 'border-hbo-cyan bg-hbo-cyan' : 'border-gray-500'
                    }`}
                  >
                    {activeTrackId === null && <Check className="w-3 h-3 text-black stroke-[3]" />}
                  </div>
                  <div>
                    <span className="font-semibold text-sm">Off (Tanpa Sarikata)</span>
                    <p className="text-xs text-gray-500">Disable all subtitles</p>
                  </div>
                </div>
              </button>

              {isLoadingSubtitles && (
                <div className="flex items-center justify-center py-6 text-gray-400 gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-hbo-cyan" />
                  <span className="text-xs">Searching subtitle tracks...</span>
                </div>
              )}

              {!isLoadingSubtitles && filteredTracks.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 text-center px-4 text-gray-400 space-y-2">
                  <AlertCircle className="w-6 h-6 text-gray-500" />
                  <p className="text-sm font-medium text-gray-300">No subtitles available</p>
                  <p className="text-xs text-gray-500 max-w-xs">
                    Try switching languages or check another server stream.
                  </p>
                </div>
              )}

              {filteredTracks.map((track) => {
                const isSelected = activeTrackId === track.id;
                const rawLang = (track.language || 'en').toLowerCase();
                const langCode = (rawLang.includes('malay') || rawLang === 'ms' || rawLang === 'id' || rawLang.includes('indo'))
                  ? 'MY'
                  : rawLang.slice(0, 2).toUpperCase();

                const sameLangTracks = tracks.filter((t) => {
                  const l = (t.language || 'en').toLowerCase();
                  const c = (l.includes('malay') || l === 'ms' || l === 'id' || l.includes('indo'))
                    ? 'MY'
                    : l.slice(0, 2).toUpperCase();
                  return c === langCode;
                });
                const langIdx = sameLangTracks.findIndex((t) => t.id === track.id);
                const trackBadge = `${langCode}-${langIdx >= 0 ? langIdx + 1 : 1}`;

                return (
                  <button
                    key={track.id}
                    type="button"
                    tabIndex={0}
                    data-selected-item={isSelected ? 'true' : undefined}
                    data-selected-track={isSelected ? 'true' : undefined}
                    data-list-item="true"
                    onClick={() => {
                      onSelectTrack(track);
                      onClose();
                    }}
                    className={`w-full flex items-center justify-between p-3 rounded-xl text-left border transition cursor-pointer tv-focus-target focus:outline-none focus:border-hbo-cyan focus:ring-2 focus:ring-hbo-cyan ${
                      isSelected
                        ? 'bg-hbo-purple/25 border-hbo-cyan/50 text-white shadow-hbo-glow'
                        : 'bg-white/5 hover:bg-white/10 border-white/5 text-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div
                        className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 ${
                          isSelected ? 'border-hbo-cyan bg-hbo-cyan' : 'border-gray-500'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 text-black stroke-[3]" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] px-1.5 py-0.5 rounded bg-white/10 text-white font-mono font-bold flex-shrink-0 border border-white/15">
                            {trackBadge}
                          </span>
                          <span className="font-semibold text-sm truncate text-white">{track.display}</span>
                          {track.source && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-gray-400 font-mono uppercase flex-shrink-0">
                              {track.source}
                            </span>
                          )}
                        </div>
                        {track.release && (
                          <p className="text-[11px] text-gray-400 font-mono truncate mt-0.5">
                            {track.release}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: STREAM SERVERS */}
        {activeTab === 'server' && (
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2 overscroll-contain min-h-0">
            {/* Filter segmented tabs if both direct and embed engines are available */}
            {hasEmbed && hasTelegram && (
              <div className="flex items-center gap-1.5 mb-3 p-1 rounded-xl bg-white/5 border border-white/10 flex-shrink-0">
                <button
                  type="button"
                  tabIndex={0}
                  onClick={() => setServerFilter('all')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition tv-focus-target focus:outline-none focus:ring-2 focus:ring-hbo-cyan cursor-pointer ${
                    serverFilter === 'all'
                      ? 'bg-white/20 text-white shadow-md'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <span>All</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-gray-300 font-mono">{allAvailableProviders.length}</span>
                </button>
                <button
                  type="button"
                  tabIndex={0}
                  onClick={() => setServerFilter('direct')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition tv-focus-target focus:outline-none focus:ring-2 focus:ring-hbo-cyan cursor-pointer ${
                    serverFilter === 'direct'
                      ? 'bg-hbo-cyan/25 text-hbo-cyan border border-hbo-cyan/40 shadow-md'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Direct</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-hbo-cyan/20 text-hbo-cyan font-mono">{directProviders.length}</span>
                </button>
                <button
                  type="button"
                  tabIndex={0}
                  onClick={() => setServerFilter('embed')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition tv-focus-target focus:outline-none focus:ring-2 focus:ring-hbo-cyan cursor-pointer ${
                    serverFilter === 'embed'
                      ? 'bg-purple-600 text-white shadow-md'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>Embed</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-200 font-mono">{embedProviders.length}</span>
                </button>
              </div>
            )}

            {/* Informative notification if only Direct is enabled */}
            {!hasEmbed && hasTelegram && (
              <div className="flex items-center gap-2 mb-2.5 px-3 py-2 rounded-xl bg-hbo-cyan/10 border border-hbo-cyan/25 text-xs text-hbo-cyan font-medium">
                <Zap className="w-4 h-4 flex-shrink-0" />
                <span>Direct Stream Mode • Web embed mirrors disabled in Settings</span>
              </div>
            )}

            {/* Informative notification if only Embed is enabled */}
            {hasEmbed && !hasTelegram && (
              <div className="flex items-center gap-2 mb-2.5 px-3 py-2 rounded-xl bg-purple-500/10 border border-purple-500/25 text-xs text-purple-300 font-medium">
                <Globe className="w-4 h-4 flex-shrink-0" />
                <span>Embed Mirrors Mode • Direct stream engine disabled in Settings</span>
              </div>
            )}

            {/* Empty State */}
            {allAvailableProviders.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-center px-4 text-gray-400 space-y-2">
                <AlertCircle className="w-6 h-6 text-gray-500" />
                <p className="text-sm font-medium text-gray-300">No servers available</p>
                <p className="text-xs text-gray-500 max-w-xs">
                  All stream resolvers are disabled. Enable Embed or Telegram in Settings.
                </p>
              </div>
            )}

            {/* DIRECT STREAM SERVERS SECTION */}
            {(serverFilter === 'all' || serverFilter === 'direct') && directProviders.length > 0 && (
              <div className="space-y-2 mb-3">
                <div className="flex items-center justify-between px-1.5 pt-1 pb-1 text-xs font-bold text-hbo-cyan uppercase tracking-wider">
                  <div className="flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5" />
                    <span>Direct Stream Servers ({directProviders.length})</span>
                  </div>
                  <span className="text-[10px] text-gray-400 font-normal normal-case">In-app player • custom controls</span>
                </div>

                {directProviders.map((p, idx) => {
                  const isSelected = p.id === currentProviderId;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      tabIndex={0}
                      data-selected-item={isSelected ? 'true' : undefined}
                      data-list-item="true"
                      onClick={() => {
                        onSelectProvider(p);
                        onClose();
                      }}
                      className={`w-full flex items-center justify-between p-3 rounded-xl text-left border transition cursor-pointer tv-focus-target focus:outline-none focus:border-hbo-cyan focus:ring-2 focus:ring-hbo-cyan ${
                        isSelected
                          ? 'bg-hbo-cyan/15 border-hbo-cyan/60 text-white shadow-hbo-glow'
                          : 'bg-white/5 hover:bg-white/10 border-white/5 text-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div
                          className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 ${
                            isSelected ? 'border-hbo-cyan bg-hbo-cyan' : 'border-gray-500'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 text-black stroke-[3]" />}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm text-white truncate">{p.name}</span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded font-black tracking-wide bg-hbo-cyan/20 text-hbo-cyan border border-hbo-cyan/40 flex-shrink-0">
                              DIRECT ⚡
                            </span>
                            {p.countries && p.countries.length > 0 && p.countries.map(c => (
                              <span
                                key={c}
                                className="text-[9px] px-1.5 py-0.5 rounded font-bold whitespace-nowrap bg-sky-500/20 text-sky-300 border border-sky-500/40"
                              >
                                {ORIGIN_COUNTRY_LABELS[c] || c}
                              </span>
                            ))}
                            {p.categories.map((cat) => {
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
                          <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                            <span className="text-hbo-cyan font-semibold">Server #{idx + 1}</span>
                            <span>•</span>
                            <span className="truncate">{p.tagline || 'Direct in-app stream'}</span>
                          </div>
                        </div>
                      </div>

                      {isSelected && isProbing && (
                        <div className="flex items-center gap-1.5 text-xs text-hbo-cyan animate-pulse flex-shrink-0 ml-2">
                          <span className="w-2 h-2 rounded-full bg-hbo-cyan" />
                          <span>Active</span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* EMBED STREAM SERVERS SECTION */}
            {(serverFilter === 'all' || serverFilter === 'embed') && embedProviders.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1.5 pt-2 pb-1 text-xs font-bold text-purple-300 uppercase tracking-wider">
                  <div className="flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5" />
                    <span>Embed Stream Servers ({embedProviders.length})</span>
                  </div>
                  <span className="text-[10px] text-gray-400 font-normal normal-case">Web iframe mirrors</span>
                </div>

                {embedProviders.map((p, idx) => {
                  const isSelected = p.id === currentProviderId;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      tabIndex={0}
                      data-selected-item={isSelected ? 'true' : undefined}
                      data-list-item="true"
                      onClick={() => {
                        onSelectProvider(p);
                        onClose();
                      }}
                      className={`w-full flex items-center justify-between p-3 rounded-xl text-left border transition cursor-pointer tv-focus-target focus:outline-none focus:border-hbo-cyan focus:ring-2 focus:ring-hbo-cyan ${
                        isSelected
                          ? 'bg-hbo-purple/25 border-hbo-cyan/50 text-white shadow-hbo-glow'
                          : 'bg-white/5 hover:bg-white/10 border-white/5 text-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div
                          className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 ${
                            isSelected ? 'border-hbo-cyan bg-hbo-cyan' : 'border-gray-500'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 text-black stroke-[3]" />}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm text-white truncate">{p.name}</span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded font-bold tracking-wide bg-purple-500/20 text-purple-300 border border-purple-500/40 flex-shrink-0">
                              EMBED 🌐
                            </span>
                            {p.countries && p.countries.length > 0 && p.countries.map(c => (
                              <span
                                key={c}
                                className="text-[9px] px-1.5 py-0.5 rounded font-bold whitespace-nowrap bg-sky-500/20 text-sky-300 border border-sky-500/40"
                              >
                                {ORIGIN_COUNTRY_LABELS[c] || c}
                              </span>
                            ))}
                            {p.categories.map((cat) => {
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
                          <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                            <span>Server #{directProviders.length + idx + 1}</span>
                            <span>•</span>
                            <span className="truncate">{p.tagline || 'Mirror'}</span>
                          </div>
                        </div>
                      </div>

                      {isSelected && isProbing && (
                        <div className="flex items-center gap-1.5 text-xs text-hbo-cyan animate-pulse flex-shrink-0 ml-2">
                          <span className="w-2 h-2 rounded-full bg-hbo-cyan" />
                          <span>Active</span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
