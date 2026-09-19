import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  const checkLandscape = useCallback(() => {
    if (typeof window === 'undefined') return false;
    const isAngleLandscape =
      (window.screen?.orientation && window.screen.orientation.type?.includes('landscape')) ||
      Math.abs(Number((window as any).orientation || 0)) === 90;
    return window.innerWidth > window.innerHeight || !!isAngleLandscape;
  }, []);

  const [isLandscape, setIsLandscape] = useState(checkLandscape);

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    const handleResize = (e?: any) => {
      if (e?.type === 'tmdb_fullscreen_changed' && e.detail?.fullscreen) {
        setIsLandscape(true);
        return;
      }
      setIsLandscape(checkLandscape());
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        setIsLandscape(checkLandscape());
      }, 150);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    window.addEventListener('tmdb_fullscreen_changed', handleResize);
    if (window.screen?.orientation) {
      window.screen.orientation.addEventListener('change', handleResize);
    }
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      window.removeEventListener('tmdb_fullscreen_changed', handleResize);
      if (window.screen?.orientation) {
        window.screen.orientation.removeEventListener('change', handleResize);
      }
    };
  }, [checkLandscape]);
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
      const isLandscape = window.innerWidth > window.innerHeight;

      // Collect focusable elements
      const closeBtn = modalRef.current.querySelector<HTMLElement>('[data-close-dialog="true"]');
      const tabs = Array.from(modalRef.current.querySelectorAll<HTMLElement>('[role="tab"]'));
      const fontBtns = Array.from(modalRef.current.querySelectorAll<HTMLElement>('[data-font-btn="true"]'));
      const syncBtns = Array.from(modalRef.current.querySelectorAll<HTMLElement>('[data-sync-btn="true"]'));
      const filterBtns = Array.from(modalRef.current.querySelectorAll<HTMLElement>('[data-lang-btn="true"]'));
      const listItems = Array.from(modalRef.current.querySelectorAll<HTMLElement>('[data-list-item="true"]'));

      // Build left column control rows
      const leftRows: HTMLElement[][] = [];
      if (tabs.length > 0) leftRows.push(tabs);
      if (fontBtns.length > 0) leftRows.push(fontBtns);
      if (syncBtns.length > 0) leftRows.push(syncBtns);
      if (filterBtns.length > 0) {
        if (isLandscape) {
          // In landscape, filter buttons are stacked vertically in left sidebar
          filterBtns.forEach((btn) => leftRows.push([btn]));
        } else {
          // In portrait, filter buttons are a horizontal row
          leftRows.push(filterBtns);
        }
      }

      const activeListTarget = () => {
        return (
          modalRef.current?.querySelector<HTMLElement>('[data-selected-item="true"]') ||
          modalRef.current?.querySelector<HTMLElement>('[data-selected-track="true"]') ||
          listItems[0] ||
          null
        );
      };

      const activeLeftTarget = () => {
        return (
          filterBtns.find((b) => b.getAttribute('data-active') === 'true') ||
          tabs.find((t) => t.getAttribute('aria-selected') === 'true') ||
          (leftRows[0] && leftRows[0][0]) ||
          null
        );
      };

      if (isLandscape) {
        // --- 2-COLUMN LANDSCAPE SPATIAL D-PAD NAVIGATION ---
        const listItemIdx = currentEl ? listItems.indexOf(currentEl) : -1;
        let leftRowIdx = -1;
        let leftColIdx = -1;

        if (currentEl) {
          for (let r = 0; r < leftRows.length; r++) {
            const c = leftRows[r].indexOf(currentEl);
            if (c !== -1) {
              leftRowIdx = r;
              leftColIdx = c;
              break;
            }
          }
        }

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          e.stopPropagation();

          if (currentEl === closeBtn) {
            const target = tabs.find((t) => t.getAttribute('aria-selected') === 'true') || tabs[0];
            target?.focus();
            return;
          }

          if (listItemIdx !== -1) {
            if (listItemIdx < listItems.length - 1) {
              const next = listItems[listItemIdx + 1];
              next.focus();
              next.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
            return;
          }

          if (leftRowIdx !== -1) {
            if (leftRowIdx < leftRows.length - 1) {
              const nextRow = leftRows[leftRowIdx + 1];
              const targetCol = Math.min(leftColIdx >= 0 ? leftColIdx : 0, nextRow.length - 1);
              const targetEl = nextRow[targetCol];
              targetEl.focus();
              targetEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            } else {
              // At bottom of left column, pressing down jumps to list
              const target = activeListTarget();
              target?.focus();
              target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
            return;
          }

          // Fallback if focus was lost
          const fallback = activeLeftTarget() || closeBtn;
          fallback?.focus();
          return;
        }

        if (e.key === 'ArrowUp') {
          e.preventDefault();
          e.stopPropagation();

          if (listItemIdx !== -1) {
            if (listItemIdx > 0) {
              const prev = listItems[listItemIdx - 1];
              prev.focus();
              prev.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            } else {
              closeBtn?.focus();
            }
            return;
          }

          if (leftRowIdx !== -1) {
            if (leftRowIdx > 0) {
              const prevRow = leftRows[leftRowIdx - 1];
              const targetCol = Math.min(leftColIdx >= 0 ? leftColIdx : 0, prevRow.length - 1);
              const targetEl = prevRow[targetCol];
              targetEl.focus();
              targetEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            } else {
              closeBtn?.focus();
            }
            return;
          }

          const fallback = activeLeftTarget() || closeBtn;
          fallback?.focus();
          return;
        }

        if (e.key === 'ArrowRight') {
          if (listItemIdx !== -1) {
            // Already in rightmost list column
            return;
          }

          // Handle tab switcher switching
          const tabSub = document.getElementById('settings-tab-subtitles');
          const tabSrv = document.getElementById('settings-tab-server');

          if (currentEl === tabSub) {
            e.preventDefault();
            e.stopPropagation();
            setActiveTab('server');
            setTimeout(() => tabSrv?.focus(), 30);
            return;
          }

          if (leftRowIdx !== -1) {
            const row = leftRows[leftRowIdx];
            if (leftColIdx < row.length - 1) {
              e.preventDefault();
              e.stopPropagation();
              row[leftColIdx + 1].focus();
              return;
            }
            // At the right end of a row or on a single item (tabSrv or filter pill) -> JUMP TO RIGHT LIST!
            e.preventDefault();
            e.stopPropagation();
            const target = activeListTarget();
            if (target) {
              target.focus();
              target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
            return;
          }
          return;
        }

        if (e.key === 'ArrowLeft') {
          if (listItemIdx !== -1) {
            // In right column: JUMP BACK TO LEFT COLUMN!
            e.preventDefault();
            e.stopPropagation();
            const target = activeLeftTarget();
            if (target) {
              target.focus();
              target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
            return;
          }

          // Handle tab switcher switching
          const tabSub = document.getElementById('settings-tab-subtitles');
          const tabSrv = document.getElementById('settings-tab-server');

          if (currentEl === tabSrv) {
            e.preventDefault();
            e.stopPropagation();
            setActiveTab('subtitles');
            setTimeout(() => tabSub?.focus(), 30);
            return;
          }

          if (leftRowIdx !== -1 && leftColIdx > 0) {
            e.preventDefault();
            e.stopPropagation();
            leftRows[leftRowIdx][leftColIdx - 1].focus();
            return;
          }
          return;
        }
      } else {
        // --- 1-COLUMN PORTRAIT NAVIGATION ---
        const rows: HTMLElement[][] = [...leftRows];
        listItems.forEach((item) => rows.push([item]));

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
            const activeTabEl = tabs.find((t) => t.getAttribute('aria-selected') === 'true') || tabs[0];
            activeTabEl?.focus();
            return;
          }

          if (currentRowIdx === -1) {
            const activeTabEl = tabs.find((t) => t.getAttribute('aria-selected') === 'true') || (rows[0] && rows[0][0]) || closeBtn;
            activeTabEl?.focus();
            return;
          }

          if (currentRowIdx < rows.length - 1) {
            const nextRow = rows[currentRowIdx + 1];
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
            if (closeBtn) closeBtn.focus();
          }
          return;
        }

        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          const delta = e.key === 'ArrowRight' ? 1 : -1;

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
        className={`w-full ${
          isLandscape ? 'max-w-3xl sm:max-w-4xl max-h-[94vh]' : 'max-w-lg max-h-[90vh]'
        } flex flex-col bg-zinc-950/95 border border-white/10 rounded-2xl shadow-2xl shadow-black/90 overflow-hidden animate-scaleUp`}
      >
        {/* Header: Title + Close Button */}
        <div className="flex items-center justify-between px-4 py-2 sm:px-5 sm:py-2.5 border-b border-white/10 bg-black/40 flex-shrink-0">
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

        {/* Main Body: Stacked in portrait, 2-Column in landscape */}
        <div className={`flex-1 flex ${isLandscape ? 'flex-row' : 'flex-col'} min-h-0 overflow-hidden`}>
          {/* Left Column: Controls Sidebar */}
          <div
            data-modal-left-col="true"
            className={`flex flex-col flex-shrink-0 ${
              isLandscape
                ? 'w-[36%] border-r border-b-0 bg-black/30 overflow-y-auto'
                : 'w-full border-b border-r-0 bg-black/25'
            } border-white/10`}
          >
            {/* Tab Switcher (Subtitles & Server) */}
            <div className="flex items-center p-2.5 sm:p-3 gap-2 border-b border-white/10 flex-shrink-0" role="tablist">
              <button
                type="button"
                role="tab"
                tabIndex={0}
                id="settings-tab-subtitles"
                aria-selected={activeTab === 'subtitles'}
                onClick={() => setActiveTab('subtitles')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl font-bold text-xs transition tv-focus-target focus:outline-none focus:ring-2 focus:ring-hbo-cyan cursor-pointer ${
                  activeTab === 'subtitles'
                    ? 'bg-hbo-cyan/20 text-hbo-cyan border border-hbo-cyan/40 shadow-sm'
                    : 'bg-white/5 hover:bg-white/10 text-gray-300 border border-transparent'
                }`}
              >
                <Subtitles className="w-3.5 h-3.5" />
                <span>Subtitles</span>
                {activeTrackId && (
                  <span className="w-1.5 h-1.5 rounded-full bg-hbo-cyan ml-0.5" />
                )}
              </button>

              <button
                type="button"
                role="tab"
                tabIndex={0}
                id="settings-tab-server"
                aria-selected={activeTab === 'server'}
                onClick={() => setActiveTab('server')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl font-bold text-xs transition tv-focus-target focus:outline-none focus:ring-2 focus:ring-hbo-cyan cursor-pointer ${
                  activeTab === 'server'
                    ? 'bg-hbo-cyan/20 text-hbo-cyan border border-hbo-cyan/40 shadow-sm'
                    : 'bg-white/5 hover:bg-white/10 text-gray-300 border border-transparent'
                }`}
              >
                <Server className="w-3.5 h-3.5" />
                <span>Server</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-gray-400 font-mono">
                  {effectiveServerIndex}/{effectiveTotalServers}
                </span>
              </button>
            </div>

            {/* Left Panel Content: Subtitles Controls */}
            {activeTab === 'subtitles' && (
              <div className="p-2.5 sm:p-3 space-y-2.5 flex-1">
                {/* Font Size Controls (Persistent Global Adjustment) */}
                {onAdjustFontSize && (
                  <div className="p-2 sm:p-2.5 rounded-xl bg-black/40 border border-white/5 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 text-gray-300 font-medium">
                        <Type className="w-3.5 h-3.5 text-hbo-cyan" />
                        <span>Font Size</span>
                      </div>
                      <span className={`font-mono font-bold text-xs ${(fontSize || 100) === 100 ? 'text-gray-400' : 'text-hbo-cyan'}`}>
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
                        className="flex-1 py-1 px-2 rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 text-white font-medium flex items-center justify-center gap-1 transition tv-focus-target focus:outline-none focus:ring-2 focus:ring-hbo-cyan cursor-pointer text-xs"
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
                          className="p-1 rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 text-hbo-cyan transition tv-focus-target focus:outline-none focus:ring-2 focus:ring-hbo-cyan cursor-pointer"
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
                        className="flex-1 py-1 px-2 rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 text-white font-medium flex items-center justify-center gap-1 transition tv-focus-target focus:outline-none focus:ring-2 focus:ring-hbo-cyan cursor-pointer text-xs"
                      >
                        <Plus className="w-3 h-3" />
                        <span>15%</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Sync Offset Controls (Visible only if a track is actively selected) */}
                {activeTrackId && (
                  <div className="p-2 sm:p-2.5 rounded-xl bg-black/40 border border-white/5 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 text-gray-300 font-medium">
                        <Clock className="w-3.5 h-3.5 text-hbo-cyan" />
                        <span>Subtitle Sync</span>
                      </div>
                      <span className={`font-mono font-bold text-xs ${syncOffset === 0 ? 'text-gray-400' : 'text-hbo-cyan'}`}>
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
                        className="flex-1 py-1 px-2 rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 text-white font-medium flex items-center justify-center gap-1 transition tv-focus-target focus:outline-none focus:ring-2 focus:ring-hbo-cyan cursor-pointer text-xs"
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
                          className="p-1 rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 text-hbo-cyan transition tv-focus-target focus:outline-none focus:ring-2 focus:ring-hbo-cyan cursor-pointer"
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
                        className="flex-1 py-1 px-2 rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 text-white font-medium flex items-center justify-center gap-1 transition tv-focus-target focus:outline-none focus:ring-2 focus:ring-hbo-cyan cursor-pointer text-xs"
                      >
                        <Plus className="w-3 h-3" />
                        <span>0.5s</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Language Filter Pills */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block">Language</span>
                  <div className={`flex ${isLandscape ? 'flex-col' : 'flex-row'} gap-1.5`}>
                    <button
                      type="button"
                      tabIndex={0}
                      onClick={() => setFilterLang('all')}
                      data-lang-btn="true"
                      data-active={filterLang === 'all' ? 'true' : undefined}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition text-left flex items-center justify-between tv-focus-target focus:outline-none focus:ring-2 focus:ring-hbo-cyan cursor-pointer ${
                        filterLang === 'all'
                          ? 'bg-hbo-cyan/20 text-hbo-cyan border border-hbo-cyan/40'
                          : 'bg-white/5 text-gray-400 hover:text-white border border-transparent'
                      }`}
                    >
                      <span>All</span>
                      <span className="text-[10px] font-mono opacity-70">({tracks.length})</span>
                    </button>
                    <button
                      type="button"
                      tabIndex={0}
                      onClick={() => setFilterLang('ms')}
                      data-lang-btn="true"
                      data-active={filterLang === 'ms' ? 'true' : undefined}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition text-left flex items-center justify-between tv-focus-target focus:outline-none focus:ring-2 focus:ring-hbo-cyan cursor-pointer ${
                        filterLang === 'ms'
                          ? 'bg-hbo-cyan/20 text-hbo-cyan border border-hbo-cyan/40'
                          : 'bg-white/5 text-gray-400 hover:text-white border border-transparent'
                      }`}
                    >
                      <span>Melayu / Indo</span>
                      <span className="text-[10px] font-mono opacity-70">({malayCount})</span>
                    </button>
                    <button
                      type="button"
                      tabIndex={0}
                      onClick={() => setFilterLang('en')}
                      data-lang-btn="true"
                      data-active={filterLang === 'en' ? 'true' : undefined}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition text-left flex items-center justify-between tv-focus-target focus:outline-none focus:ring-2 focus:ring-hbo-cyan cursor-pointer ${
                        filterLang === 'en'
                          ? 'bg-hbo-cyan/20 text-hbo-cyan border border-hbo-cyan/40'
                          : 'bg-white/5 text-gray-400 hover:text-white border border-transparent'
                      }`}
                    >
                      <span>English</span>
                      <span className="text-[10px] font-mono opacity-70">({englishCount})</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Left Panel Content: Server Controls */}
            {activeTab === 'server' && (
              <div className="p-2.5 sm:p-3 space-y-2.5 flex-1">
                {hasEmbed && hasTelegram && (
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block">Server Filter</span>
                    <div className={`flex ${isLandscape ? 'flex-col' : 'flex-row'} gap-1.5`}>
                      <button
                        type="button"
                        tabIndex={0}
                        onClick={() => setServerFilter('all')}
                        data-lang-btn="true"
                        data-active={serverFilter === 'all' ? 'true' : undefined}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition text-left flex items-center justify-between tv-focus-target focus:outline-none focus:ring-2 focus:ring-hbo-cyan cursor-pointer ${
                          serverFilter === 'all'
                            ? 'bg-white/20 text-white shadow-md border border-white/20'
                            : 'bg-white/5 text-gray-400 hover:text-white border border-transparent'
                        }`}
                      >
                        <span>All</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-gray-300 font-mono">{allAvailableProviders.length}</span>
                      </button>
                      <button
                        type="button"
                        tabIndex={0}
                        onClick={() => setServerFilter('direct')}
                        data-lang-btn="true"
                        data-active={serverFilter === 'direct' ? 'true' : undefined}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition text-left flex items-center justify-between tv-focus-target focus:outline-none focus:ring-2 focus:ring-hbo-cyan cursor-pointer ${
                          serverFilter === 'direct'
                            ? 'bg-hbo-cyan/25 text-hbo-cyan border border-hbo-cyan/40 shadow-md'
                            : 'bg-white/5 text-gray-400 hover:text-white border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <Zap className="w-3.5 h-3.5" />
                          <span>Direct</span>
                        </div>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-hbo-cyan/20 text-hbo-cyan font-mono">{directProviders.length}</span>
                      </button>
                      <button
                        type="button"
                        tabIndex={0}
                        onClick={() => setServerFilter('embed')}
                        data-lang-btn="true"
                        data-active={serverFilter === 'embed' ? 'true' : undefined}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition text-left flex items-center justify-between tv-focus-target focus:outline-none focus:ring-2 focus:ring-hbo-cyan cursor-pointer ${
                          serverFilter === 'embed'
                            ? 'bg-purple-600 text-white shadow-md border border-purple-400'
                            : 'bg-white/5 text-gray-400 hover:text-white border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <Globe className="w-3.5 h-3.5" />
                          <span>Embed</span>
                        </div>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-200 font-mono">{embedProviders.length}</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Direct vs Embed mode notices */}
                {!hasEmbed && hasTelegram && (
                  <div className="flex items-center gap-2 p-2 rounded-xl bg-hbo-cyan/10 border border-hbo-cyan/25 text-[11px] text-hbo-cyan font-medium">
                    <Zap className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>Direct Stream Mode active</span>
                  </div>
                )}
                {hasEmbed && !hasTelegram && (
                  <div className="flex items-center gap-2 p-2 rounded-xl bg-purple-500/10 border border-purple-500/25 text-[11px] text-purple-300 font-medium">
                    <Globe className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>Embed Mirrors Mode active</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Column: Scrollable List Area (Full vertical height) */}
          <div
            data-modal-right-col="true"
            className="flex-1 flex flex-col min-h-0 overflow-y-auto p-3 sm:p-4 overscroll-contain bg-black/10"
          >
            {activeTab === 'subtitles' ? (
              <div className="space-y-2">
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
            ) : (
              <div className="space-y-2">
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
                                <span className="text-[9px] px-1.5 py-0.5 rounded font-black tracking-wide bg-purple-500/20 text-purple-300 border border-purple-500/40 flex-shrink-0">
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
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
