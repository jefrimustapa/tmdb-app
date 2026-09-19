import React, { useState, useEffect, useRef } from 'react';
import { dbService } from '../../services/db';
import type { UserSettings, StreamResolverType } from '../../types/db';
import { STREAM_PROVIDERS, CATEGORY_BADGE_CONFIG, ORIGIN_COUNTRY_LABELS } from '../../services/streamProviders';
import type { OriginCountryCode } from '../../types/stream';
import { msm32Service, type Msm32HealthResult } from '../../services/msm32MappingService';
import { useDevice } from '../../hooks/useDevice';
import { Logo } from '../../components/common/Logo';
import { APP_VERSION, APP_BUILD_NUMBER, APP_VERSION_FULL, APP_BUILD_CHANNEL, APP_CHANGELOG } from '../../version';
import { updateService, type UpdateInfo } from '../../services/updateService';
import { UpdateModal } from '../../components/common/UpdateModal';
import { FormattedChangelog } from '../../components/common/FormattedChangelog';
import {
  Settings as SettingsIcon,
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
  ChevronRight,
  ChevronLeft,
  Radio,
  FileText,
  Clock,
  Percent,
  Info,
  Download,
  Upload,
  HardDrive,
  Save,
  SlidersHorizontal,
  Send,
} from 'lucide-react';

type MobileCategory = 'playback' | 'display' | 'content' | 'system';

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onBack?: () => void;
  title: string;
  subtitle?: string;
  categoryLabel?: string;
  children: React.ReactNode;
}

const SettingsDrawer: React.FC<SettingsDrawerProps> = ({
  isOpen,
  onClose,
  onBack,
  title,
  subtitle,
  categoryLabel,
  children
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (onBack) onBack();
        else onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    const prevOverflow = document.body.style.overflow;
    const prevTouchAction = document.body.style.touchAction;
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow;
      document.body.style.touchAction = prevTouchAction;
    };
  }, [isOpen, onClose, onBack]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[9999] flex flex-col justify-end lg:justify-end lg:items-end bg-black/80 backdrop-blur-sm animate-fade-in overscroll-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onTouchMove={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
        }
      }}
    >
      <div
        className="w-full max-h-[85vh] lg:max-h-full lg:h-full lg:max-w-md bg-hbo-card/95 border-t lg:border-t-0 lg:border-l border-hbo-border/80 rounded-t-3xl lg:rounded-t-none lg:rounded-l-3xl shadow-2xl flex flex-col min-h-0 overflow-hidden animate-slide-up lg:animate-slide-in-right pb-[max(1.25rem,env(safe-area-inset-bottom,24px))]"
      >
        {/* Mobile Swipe Handle */}
        <div className="w-12 h-1.5 rounded-full bg-white/20 mx-auto mt-3 mb-1 lg:hidden flex-shrink-0" />

        {/* Drawer Header */}
        <div className="p-4 sm:p-6 pb-3 border-b border-white/5 flex items-start justify-between gap-3 flex-shrink-0">
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="p-1.5 -ml-1 rounded-full bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-colors flex-shrink-0 mt-0.5"
                aria-label="Go back"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <div className="min-w-0 flex-1">
              {categoryLabel && (
                <p className="text-[10px] font-bold uppercase tracking-wider text-hbo-cyan mb-1 truncate">
                  {categoryLabel}
                </p>
              )}
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight leading-snug truncate">
                {title}
              </h2>
              {subtitle && (
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">{subtitle}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors flex-shrink-0"
            aria-label="Close drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Content Body */}
        <div
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6 pb-8 space-y-3.5 no-scrollbar touch-pan-y"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {children}
        </div>
      </div>
    </div>
  );
};

export const Settings: React.FC = () => {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [savedMessage, setSavedMessage] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<MobileCategory>('playback');
  const [isFilterFrozen, setIsFilterFrozen] = useState(false);
  const [activeDrawer, setActiveDrawer] = useState<
    | 'autoplay'
    | 'autoplayTrigger'
    | 'autoplayTimeout'
    | 'ticker'
    | 'resolvers'
    | 'engine-priority'
    | 'engine-telegram'
    | 'telegram-msm32'
    | 'telegram-chunk'
    | 'telegram-country'
    | 'engine-embed'
    | 'priorityPicker'
    | 'adblock'
    | 'headerTimeout'
    | 'perfMode'
    | 'perfHud'
    | 'maturity'
    | 'filterAdult'
    | 'filterUnreleased'
    | 'autoUpdate'
    | 'nightlyUpdate'
    | 'backup'
    | null
  >(null);
  const [priorityPickerSlot, setPriorityPickerSlot] = useState<{
    tab: 'general' | 'anime' | 'asean' | 'korean';
    index: number;
    label: string;
    currentId: string;
  } | null>(null);

  const [testingMsm32, setTestingMsm32] = useState(false);
  const [msm32TestResult, setMsm32TestResult] = useState<Msm32HealthResult | null>(null);
  const [msmUrlInput, setMsmUrlInput] = useState<string>('');

  // Keep local msmUrlInput in sync with persisted settings
  useEffect(() => {
    if (settings?.msm32GetterUrl !== undefined) {
      setMsmUrlInput(settings.msm32GetterUrl || 'https://msm-getter.onrender.com');
    }
  }, [settings?.msm32GetterUrl]);

  // Auto-ping MSM Getter microservice whenever the user enters the Telegram or MSM32 drawer
  useEffect(() => {
    if (activeDrawer === 'engine-telegram' || activeDrawer === 'telegram-msm32') {
      setTestingMsm32(true);
      setMsm32TestResult(null);
      const url = settings?.msm32GetterUrl;
      msm32Service.testConnection(url)
        .then((res) => setMsm32TestResult(res))
        .catch((err: any) => setMsm32TestResult({ ok: false, error: err?.message || 'Connection failed' }))
        .finally(() => setTestingMsm32(false));
    }
  }, [activeDrawer, settings?.msm32GetterUrl]);

  const filterSentinelRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [backupStatusMsg, setBackupStatusMsg] = useState<{ text: string; isError?: boolean } | null>(null);
  const [backupMeta, setBackupMeta] = useState(() => dbService.getPersistentBackupMeta());

  const handleBackupNow = async () => {
    try {
      const ok = await dbService.backupToPersistentStorage();
      if (ok) {
        setBackupStatusMsg({ text: 'Persistent backup created successfully!' });
        setBackupMeta(dbService.getPersistentBackupMeta());
      } else {
        setBackupStatusMsg({ text: 'Backup failed or device bridge not available.', isError: true });
      }
    } catch (err: any) {
      setBackupStatusMsg({ text: err?.message || 'Backup failed', isError: true });
    }
    setTimeout(() => setBackupStatusMsg(null), 4000);
  };

  const handleRestoreNow = async () => {
    try {
      const res = await dbService.restoreFromPersistentStorage();
      if (res && res.success) {
        setBackupStatusMsg({ text: `Restored: ${res.count?.history || 0} history, ${res.count?.watchlist || 0} watchlist, ${res.count?.likes || 0} likes!` });
        const refreshed = await dbService.getSettings();
        setSettings(refreshed);
      } else {
        setBackupStatusMsg({ text: 'No backup file found or restore failed.', isError: true });
      }
    } catch (err: any) {
      setBackupStatusMsg({ text: err?.message || 'Restore failed', isError: true });
    }
    setTimeout(() => setBackupStatusMsg(null), 5000);
  };

  const handleExportJson = async () => {
    try {
      const json = await dbService.exportAllData();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tmdb_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setBackupStatusMsg({ text: 'Backup JSON downloaded!' });
    } catch (err: any) {
      setBackupStatusMsg({ text: 'Export failed: ' + err?.message, isError: true });
    }
    setTimeout(() => setBackupStatusMsg(null), 4000);
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const text = evt.target?.result as string;
        const res = await dbService.importAllData(text);
        if (res.success) {
          setBackupStatusMsg({ text: `Imported: ${res.count.history} history, ${res.count.watchlist} watchlist, ${res.count.likes} likes!` });
          const refreshed = await dbService.getSettings();
          setSettings(refreshed);
        } else {
          setBackupStatusMsg({ text: 'Import failed: Invalid backup file format', isError: true });
        }
      } catch (err: any) {
        setBackupStatusMsg({ text: 'Import error: ' + err?.message, isError: true });
      }
      setTimeout(() => setBackupStatusMsg(null), 5000);
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  useEffect(() => {
    const handleScroll = () => {
      if (!filterSentinelRef.current) return;
      const rect = filterSentinelRef.current.getBoundingClientRect();
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
  const [priorityCategoryTab, setPriorityCategoryTab] = useState<'general' | 'anime' | 'asean' | 'korean'>('general');
  const clickCountRef = useRef(0);
  const clickTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    try {
      (window as any).AndroidBridge?.setDropdownOpen?.(activeDrawer !== null);
    } catch {}

    return () => {
      try {
        (window as any).AndroidBridge?.setDropdownOpen?.(false);
      } catch {}
    };
  }, [activeDrawer]);

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

  const CATEGORIES: { id: MobileCategory; label: string; desc: string; icon: any }[] = [
    { id: 'playback', label: 'Playback & Stream', desc: 'Auto-play, resolvers, priority', icon: Zap },
    { id: 'display', label: 'Display & UI', desc: 'Timeouts, performance, graphics', icon: Monitor },
    { id: 'content', label: 'Content Controls', desc: 'Maturity, explicit filters', icon: ShieldCheck },
    { id: 'system', label: 'System & Updates', desc: 'Storage, backup, software info', icon: Info },
  ];

  const maturityLabels: Record<string, string> = {
    all: 'All Ratings (18+)',
    mature: 'Young Adult (16+)',
    teen: 'Teens (13+)',
    older_kids: 'Older Kids (7+)',
    kids: 'Little Kids (All Ages)'
  };
  const currentMaturityKey = settings.maturityLevel === 'pg13' ? 'teen' : settings.maturityLevel === 'family' ? 'older_kids' : (settings.maturityLevel || 'all');

  const perfHudLabel = settings.showPerformanceHud === true || settings.showPerformanceHud === 'all_pages'
    ? 'All Pages'
    : settings.showPerformanceHud === 'watch_only'
    ? 'Watch Only'
    : 'Disabled';

  return (
    <div className="min-h-screen pt-[calc(max(0.5rem,env(safe-area-inset-top,16px))+3.25rem)] sm:pt-24 pb-36 px-3.5 sm:px-6 lg:px-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 pb-2.5 sm:mb-6 sm:pb-4 border-b border-hbo-border/60">
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

      {/* Top Scrollable Tab Bar for Small Screens & Tablet Portrait (< lg) */}
      <div ref={filterSentinelRef} className="lg:hidden relative mb-4 sm:mb-6">
        {isFilterFrozen && <div className="h-[44px]" />}

        <div
          className={`transition-all duration-150 z-30 ${
            isFilterFrozen
              ? 'fixed top-[calc(max(0.5rem,env(safe-area-inset-top,16px))+2.75rem)] left-0 right-0 px-3.5 sm:px-6 py-2 bg-[#050508] border-b border-hbo-border/80 shadow-2xl overflow-x-auto no-scrollbar'
              : 'relative -mx-3.5 sm:-mx-6 px-3.5 sm:px-6 py-1.5 bg-[#050508] border-b border-hbo-border/60 overflow-x-auto no-scrollbar shadow-lg'
          }`}
        >
          <div className="flex items-center gap-2 min-w-max">
            {CATEGORIES.map((cat) => {
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

      {/* Main Responsive Grid: Side Tab Rail (>= lg) + Content Area */}
      <div className="flex flex-col lg:flex-row lg:gap-8 lg:items-start">
        {/* Left Side Tab Rail for Tablet Landscape & Desktop (>= lg) */}
        <div className="hidden lg:flex flex-col w-72 flex-shrink-0 space-y-2.5 sticky top-28">
          <span className="text-[11px] font-black uppercase tracking-wider text-gray-400 px-3 block mb-1">
            Categories
          </span>

          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isSelected = activeCategory === cat.id;

            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`w-full p-3.5 rounded-2xl border text-left transition-all flex items-center justify-between gap-3 ${
                  isSelected
                    ? 'bg-gradient-to-r from-hbo-purple/40 via-hbo-purple/20 to-transparent border-hbo-cyan/40 text-white shadow-hbo-glow'
                    : 'bg-hbo-card/50 border-white/5 hover:bg-hbo-hover hover:border-white/20 text-gray-400 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Icon className={`w-5 h-5 flex-shrink-0 stroke-[2.2] transition-colors ${
                    isSelected ? 'text-hbo-cyan' : 'text-gray-400'
                  }`} />
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-bold leading-tight truncate ${isSelected ? 'text-white' : 'text-gray-300'}`}>
                      {cat.label}
                    </p>
                    <p className={`text-[10px] mt-0.5 truncate ${isSelected ? 'text-hbo-cyan font-medium' : 'text-gray-500'}`}>
                      {cat.desc}
                    </p>
                  </div>
                </div>

                {isSelected && (
                  <span className="w-2 h-2 rounded-full bg-hbo-cyan flex-shrink-0" />
                )}
              </button>
            );
          })}
        </div>

        {/* Right Settings Content Area */}
        <div className="flex-1 min-w-0 space-y-6">
          {/* ========================================================================= */}
          {/* 1. STREAMING & PLAYBACK SECTION                                          */}
          {/* ========================================================================= */}
          {activeCategory === 'playback' && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center gap-2 px-1">
                <Zap className="w-4 h-4 text-hbo-cyan" />
                <h2 className="text-xs font-black uppercase tracking-wider text-gray-400">Streaming & Playback</h2>
              </div>

              <div className="bg-hbo-card border border-hbo-border rounded-2xl overflow-hidden shadow-lg divide-y divide-white/5">
                {/* Auto-Play Next Episode Hub Row */}
                <div
                  onClick={() => setActiveDrawer('autoplay')}
                  className="p-4 sm:p-5 flex items-center justify-between gap-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex-1 min-w-0 pr-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-hbo-purple-light flex-shrink-0" />
                      <h3 className="text-sm sm:text-base font-bold text-white">Auto-Play Next Episode</h3>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      Display Up Next overlay and advance automatically when episode concludes.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {settings.autoplayNext !== false ? (
                      <span className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-bold flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        <span>Enabled • {settings.upNextTriggerPercent || 96}% • {settings.upNextTimeout || 20}s</span>
                      </span>
                    ) : (
                      <span className="text-[11px] px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-gray-400 font-bold flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
                        <span>Disabled</span>
                      </span>
                    )}
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </div>
                </div>

                {/* Watch Progress Update Interval Hub Row */}
                <div
                  onClick={() => setActiveDrawer('ticker')}
                  className="p-4 sm:p-5 flex items-center justify-between gap-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex-1 min-w-0 pr-2">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-hbo-cyan flex-shrink-0" />
                      <h3 className="text-sm sm:text-base font-bold text-white">Watch Progress Interval</h3>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      Frequency for syncing playback progress and resume points.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs font-bold text-hbo-cyan">
                      {settings.watchProgressTickerInterval || 2} Seconds
                    </span>
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </div>
                </div>

                {/* Stream Resolvers Engine & Priority Servers Hub Row */}
                <div
                  onClick={() => setActiveDrawer('resolvers')}
                  className="p-4 sm:p-5 flex items-center justify-between gap-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex-1 min-w-0 pr-2">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-hbo-cyan flex-shrink-0" />
                      <h3 className="text-sm sm:text-base font-bold text-white">Stream Resolver Engines & Priority</h3>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      Configure Telegram direct streaming, fallback embed mirrors, and resolution order.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs font-bold text-hbo-cyan">
                      {(settings.enabledResolvers?.length || 1)} Active
                    </span>
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </div>
                </div>

                {/* Ad & Popup Sandboxing Shield Hub Row */}
                <div
                  onClick={() => setActiveDrawer('adblock')}
                  className="p-4 sm:p-5 flex items-center justify-between gap-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex-1 min-w-0 pr-2">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-green-400 flex-shrink-0" />
                      <h3 className="text-sm sm:text-base font-bold text-white">Ad & Popup Sandboxing</h3>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      Blocks iframe popups, new tab hijacks, and malicious redirect scripts.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {settings.adBlockShield ? (
                      <span className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-bold flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        <span>Enabled</span>
                      </span>
                    ) : (
                      <span className="text-[11px] px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-gray-400 font-bold flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
                        <span>Disabled</span>
                      </span>
                    )}
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 2. DISPLAY & EXPERIENCE SECTION                                          */}
          {/* ========================================================================= */}
          {activeCategory === 'display' && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center gap-2 px-1">
                <Monitor className="w-4 h-4 text-hbo-cyan" />
                <h2 className="text-xs font-black uppercase tracking-wider text-gray-400">Display & Experience</h2>
              </div>

              <div className="bg-hbo-card border border-hbo-border rounded-2xl overflow-hidden shadow-lg divide-y divide-white/5">
                {/* Stream Header Auto-Hide Timeout Hub Row */}
                <div
                  onClick={() => setActiveDrawer('headerTimeout')}
                  className="p-4 sm:p-5 flex items-center justify-between gap-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex-1 min-w-0 pr-2">
                    <div className="flex items-center gap-2">
                      <EyeOff className="w-4 h-4 text-hbo-cyan flex-shrink-0" />
                      <h3 className="text-sm sm:text-base font-bold text-white">Stream Header Auto-Hide</h3>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      Configure top header overlay timeout while streaming.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs font-bold text-hbo-cyan">
                      {(settings.streamHeaderTimeout || 5) === 0 ? 'Always Visible' : `${settings.streamHeaderTimeout || 5}s`}
                    </span>
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </div>
                </div>

                {/* UI Performance Mode Hub Row */}
                <div
                  onClick={() => setActiveDrawer('perfMode')}
                  className="p-4 sm:p-5 flex items-center justify-between gap-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex-1 min-w-0 pr-2">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-hbo-cyan flex-shrink-0" />
                      <h3 className="text-sm sm:text-base font-bold text-white">UI Performance Mode (Lite)</h3>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      Reduces GPU blurs, animations, and shadows for higher FPS and lower battery drain.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {(settings.performanceMode ?? false) ? (
                      <span className="text-[11px] px-2.5 py-1 rounded-full bg-hbo-cyan/15 border border-hbo-cyan/30 text-hbo-cyan font-bold flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-hbo-cyan" />
                        <span>Enabled</span>
                      </span>
                    ) : (
                      <span className="text-[11px] px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-gray-400 font-bold flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
                        <span>Disabled</span>
                      </span>
                    )}
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </div>
                </div>

                {/* Performance HUD Hub Row */}
                <div
                  onClick={() => setActiveDrawer('perfHud')}
                  className="p-4 sm:p-5 flex items-center justify-between gap-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex-1 min-w-0 pr-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm sm:text-base font-bold text-white">Performance HUD</h3>
                      <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-hbo-cyan/10 text-hbo-cyan border border-hbo-cyan/20">
                        Debug
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      Real-time CPU %, framerate, and resource metrics.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs font-bold text-hbo-cyan">
                      {perfHudLabel}
                    </span>
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 3. CONTENT & PARENTAL CONTROLS SECTION                                    */}
          {/* ========================================================================= */}
          {activeCategory === 'content' && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center gap-2 px-1">
                <ShieldCheck className="w-4 h-4 text-hbo-cyan" />
                <h2 className="text-xs font-black uppercase tracking-wider text-gray-400">Content & Parental Controls</h2>
              </div>

              <div className="bg-hbo-card border border-hbo-border rounded-2xl overflow-hidden shadow-lg divide-y divide-white/5">
                {/* Catalog Maturity Level Hub Row */}
                <div className="p-4 sm:p-5 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Lock className="w-4 h-4 text-hbo-cyan flex-shrink-0" />
                      <h3 className="text-sm sm:text-base font-bold text-white">Catalog Maturity Rating Limit</h3>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      Limit discovery catalog recommendations to age-appropriate certification tiers.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setActiveDrawer('maturity')}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-hbo-cyan transition-all flex-shrink-0"
                  >
                    <span className="text-xs font-bold text-hbo-cyan">
                      {maturityLabels[currentMaturityKey] || 'All Ratings (18+)'}
                    </span>
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </button>
                </div>

                {/* Adult Content SafeSearch */}
                <div
                  onClick={() => setActiveDrawer('filterAdult')}
                  className="p-4 sm:p-5 flex items-center justify-between gap-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex-1 min-w-0 pr-2">
                    <div className="flex items-center gap-2">
                      <EyeOff className="w-4 h-4 text-amber-400 flex-shrink-0" />
                      <h3 className="text-sm sm:text-base font-bold text-white">Filter Adult & Explicit Content</h3>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      SafeSearch: Excludes explicit sexual and adult rated media (18SX, R18+, NC-17).
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {settings.filterAdult !== false ? (
                      <span className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-bold flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        <span>Enabled</span>
                      </span>
                    ) : (
                      <span className="text-[11px] px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-gray-400 font-bold flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
                        <span>Disabled</span>
                      </span>
                    )}
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </div>
                </div>

                {/* Unreleased Content Filter */}
                <div
                  onClick={() => setActiveDrawer('filterUnreleased')}
                  className="p-4 sm:p-5 flex items-center justify-between gap-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex-1 min-w-0 pr-2">
                    <div className="flex items-center gap-2">
                      <CalendarX className="w-4 h-4 text-hbo-cyan flex-shrink-0" />
                      <h3 className="text-sm sm:text-base font-bold text-white">Filter Unreleased Titles</h3>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      Hides future movies and TV series that have not yet premiered or aired.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {settings.filterUnreleased !== false ? (
                      <span className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-bold flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        <span>Enabled</span>
                      </span>
                    ) : (
                      <span className="text-[11px] px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-gray-400 font-bold flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
                        <span>Disabled</span>
                      </span>
                    )}
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 4. SYSTEM & UPDATES SECTION                                               */}
          {/* ========================================================================= */}
          {activeCategory === 'system' && (
            <div className="space-y-4 animate-fade-in">
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

                {/* Auto-Check on Startup Row */}
                <div
                  onClick={() => setActiveDrawer('autoUpdate')}
                  className="p-4 sm:p-5 flex items-center justify-between gap-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex-1 min-w-0 pr-2">
                    <h4 className="text-xs sm:text-sm font-bold text-gray-200 flex items-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 text-hbo-cyan" />
                      <span>Auto-Check on Startup</span>
                    </h4>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Automatically check for updates when opening the app.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {(settings.autoUpdateCheck ?? true) ? (
                      <span className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-bold flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        <span>Enabled</span>
                      </span>
                    ) : (
                      <span className="text-[11px] px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-gray-400 font-bold flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
                        <span>Disabled</span>
                      </span>
                    )}
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </div>
                </div>

                {/* Include Nightly Builds Row */}
                <div
                  onClick={() => setActiveDrawer('nightlyUpdate')}
                  className="p-4 sm:p-5 flex items-center justify-between gap-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex-1 min-w-0 pr-2">
                    <h4 className="text-xs sm:text-sm font-bold text-gray-200 flex items-center gap-2">
                      <Moon className="w-3.5 h-3.5 text-amber-400" />
                      <span>Include Nightly Builds</span>
                    </h4>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Receive automated daily pre-release builds.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {settings.includeNightlyUpdates ? (
                      <span className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-bold flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        <span>Enabled</span>
                      </span>
                    ) : (
                      <span className="text-[11px] px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-gray-400 font-bold flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
                        <span>Disabled</span>
                      </span>
                    )}
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </div>
                </div>

                {/* Persistent Storage & Backup Hub Row */}
                <div
                  onClick={() => setActiveDrawer('backup')}
                  className="p-4 sm:p-5 flex items-center justify-between gap-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex-1 min-w-0 pr-2">
                    <div className="flex items-center gap-2">
                      <HardDrive className="w-4 h-4 text-hbo-cyan" />
                      <h4 className="text-sm font-bold text-white">Persistent Storage & Backup</h4>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      Backup, restore, and export database history and watchlist.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs font-bold text-emerald-400">
                      {backupMeta.available ? 'Auto-Protected' : 'Manage'}
                    </span>
                    <ChevronRight className="w-4 h-4 text-gray-400" />
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
      </div>

      {/* ========================================================================= */}
      {/* ADAPTIVE DRAWERS (Bottom on < lg, Right-Side on >= lg)                   */}
      {/* ========================================================================= */}

      {/* 1. Autoplay Master Drawer */}
      <SettingsDrawer
        isOpen={activeDrawer === 'autoplay'}
        onClose={() => setActiveDrawer(null)}
        title="Auto-Play Next Episode"
        subtitle="Automatic episode transitions, 'Up Next' preview card, and countdown timers."
        categoryLabel="Playback & Stream"
      >
        <div className="space-y-3">
          {/* Master Enable/Disable Button */}
          <button
            type="button"
            onClick={() => handleUpdate({ autoplayNext: settings.autoplayNext === false ? true : false })}
            className="w-full flex items-center justify-between gap-3 p-4 rounded-xl text-left transition-all border bg-black/40 border-white/10 hover:border-white/20"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-bold text-sm text-white">Auto-Play Next Episode</span>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide border ${
                  settings.autoplayNext !== false
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                    : 'bg-white/5 text-gray-400 border-white/10'
                }`}>
                  {settings.autoplayNext !== false ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <p className="text-[11px] text-gray-400 leading-snug">
                Advance automatically and show 'Up Next' prompt when current episode reaches completion
              </p>
            </div>
          </button>

          {/* Sub-Drawers for Timing & Countdown */}
          {settings.autoplayNext !== false && (
            <div className="space-y-2 pt-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 px-1">
                Configuration Options
              </span>

              {/* Sub-Drawer Link: Trigger Timing */}
              <button
                type="button"
                onClick={() => setActiveDrawer('autoplayTrigger')}
                className="w-full flex items-center justify-between gap-3 p-3.5 rounded-xl text-left transition-all border bg-black/30 border-white/5 hover:border-hbo-cyan/40 hover:bg-white/[0.03]"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-8 h-8 rounded-lg bg-hbo-cyan/10 border border-hbo-cyan/30 flex items-center justify-center flex-shrink-0">
                    <Percent className="w-4 h-4 text-hbo-cyan" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="font-bold text-xs sm:text-sm text-white">Trigger Timing</span>
                      <span className="text-xs font-bold text-hbo-cyan">
                        {settings.upNextTriggerPercent || 96}%
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400 truncate">
                      Episode completion threshold when the preview card appears
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
              </button>

              {/* Sub-Drawer Link: Countdown Duration */}
              <button
                type="button"
                onClick={() => setActiveDrawer('autoplayTimeout')}
                className="w-full flex items-center justify-between gap-3 p-3.5 rounded-xl text-left transition-all border bg-black/30 border-white/5 hover:border-hbo-cyan/40 hover:bg-white/[0.03]"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-8 h-8 rounded-lg bg-hbo-purple/10 border border-hbo-purple/30 flex items-center justify-center flex-shrink-0">
                    <Clock className="w-4 h-4 text-hbo-purple-light" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="font-bold text-xs sm:text-sm text-white">Countdown Duration</span>
                      <span className="text-xs font-bold text-hbo-cyan">
                        {settings.upNextTimeout || 20}s
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400 truncate">
                      Countdown duration before the next episode advances
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
              </button>
            </div>
          )}
        </div>
      </SettingsDrawer>

      {/* 1a. Level 2 Sub-Drawer: Trigger Timing */}
      <SettingsDrawer
        isOpen={activeDrawer === 'autoplayTrigger'}
        onClose={() => setActiveDrawer(null)}
        onBack={() => setActiveDrawer('autoplay')}
        title="Popup Trigger Timing"
        subtitle="Select the episode progress percentage that triggers the 'Up Next' prompt."
        categoryLabel="Playback > Auto-Play"
      >
        <div className="space-y-2">
          {[
            { percent: 96, label: '96% - Credits Outro (Recommended)', desc: 'Earliest trigger for shows with standard end credits' },
            { percent: 98, label: '98% - Late Credits', desc: 'Slightly delayed trigger for shows with short credits' },
            { percent: 100, label: '100% - Episode Conclusion', desc: 'Triggers exactly when video reaches its full duration' },
            { percent: 102, label: '102% - Extended Padding', desc: 'Allows full outro song and silence before prompt' },
            { percent: 104, label: '104% - Maximum Tail', desc: 'Only advances at absolute player terminus' },
          ].map((opt) => {
            const isSelected = (settings.upNextTriggerPercent || 96) === opt.percent;
            return (
              <button
                key={opt.percent}
                type="button"
                onClick={() => {
                  handleUpdate({ upNextTriggerPercent: opt.percent });
                  setActiveDrawer('autoplay');
                }}
                className={`w-full p-3.5 rounded-xl border text-left transition-all flex items-center justify-between gap-3 ${
                  isSelected
                    ? 'bg-hbo-purple/30 border-hbo-cyan text-white shadow-hbo-glow'
                    : 'bg-black/30 border-white/5 hover:border-white/20 text-gray-300'
                }`}
              >
                <div>
                  <p className={`text-xs sm:text-sm font-bold ${isSelected ? 'text-hbo-cyan' : 'text-white'}`}>
                    {opt.label}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{opt.desc}</p>
                </div>
                {isSelected && <Check className="w-4 h-4 text-hbo-cyan stroke-[2.5] flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      </SettingsDrawer>

      {/* 1b. Level 2 Sub-Drawer: Countdown Duration */}
      <SettingsDrawer
        isOpen={activeDrawer === 'autoplayTimeout'}
        onClose={() => setActiveDrawer(null)}
        onBack={() => setActiveDrawer('autoplay')}
        title="Countdown Duration"
        subtitle="Select the seconds to display the countdown before auto-playing next episode."
        categoryLabel="Playback > Auto-Play"
      >
        <div className="space-y-2">
          {[
            { seconds: 10, label: '10 Seconds (Fast)', desc: 'Quick transition for rapid binge-watching' },
            { seconds: 15, label: '15 Seconds (Quick)', desc: 'Brief window to cancel before auto-advancing' },
            { seconds: 20, label: '20 Seconds (Default)', desc: 'Recommended balance for comfortable previews' },
            { seconds: 30, label: '30 Seconds (Relaxed)', desc: 'Extended duration with plenty of time to inspect details' },
          ].map((opt) => {
            const isSelected = (settings.upNextTimeout || 20) === opt.seconds;
            return (
              <button
                key={opt.seconds}
                type="button"
                onClick={() => {
                  handleUpdate({ upNextTimeout: opt.seconds });
                  setActiveDrawer('autoplay');
                }}
                className={`w-full p-3.5 rounded-xl border text-left transition-all flex items-center justify-between gap-3 ${
                  isSelected
                    ? 'bg-hbo-purple/30 border-hbo-cyan text-white shadow-hbo-glow'
                    : 'bg-black/30 border-white/5 hover:border-white/20 text-gray-300'
                }`}
              >
                <div>
                  <p className={`text-xs sm:text-sm font-bold ${isSelected ? 'text-hbo-cyan' : 'text-white'}`}>
                    {opt.label}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{opt.desc}</p>
                </div>
                {isSelected && <Check className="w-4 h-4 text-hbo-cyan stroke-[2.5] flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      </SettingsDrawer>

      {/* 2. Watch Progress Interval Drawer */}
      <SettingsDrawer
        isOpen={activeDrawer === 'ticker'}
        onClose={() => setActiveDrawer(null)}
        title="Watch Progress Update Interval"
        subtitle="How frequently playback progress is synced to storage for web embeds."
        categoryLabel="Playback & Stream"
      >
        <div className="space-y-2">
          {[
            { seconds: 1, label: '1 Second', desc: 'Realtime tracking with highest precision' },
            { seconds: 2, label: '2 Seconds (Default)', desc: 'Fast tracking recommended for mobile' },
            { seconds: 3, label: '3 Seconds', desc: 'Frequent tracking with low overhead' },
            { seconds: 5, label: '5 Seconds', desc: 'Balanced interval recommended for TV' },
            { seconds: 10, label: '10 Seconds', desc: 'Eco mode with minimum storage writes' },
          ].map((opt) => {
            const currentVal = settings.watchProgressTickerInterval || 2;
            const isSelected = currentVal === opt.seconds;
            return (
              <button
                key={opt.seconds}
                type="button"
                onClick={() => {
                  handleUpdate({ watchProgressTickerInterval: opt.seconds });
                  setActiveDrawer(null);
                }}
                className={`w-full p-3.5 rounded-xl border text-left transition-all flex items-center justify-between gap-3 ${
                  isSelected
                    ? 'bg-hbo-purple/40 border-hbo-cyan text-white shadow-hbo-glow'
                    : 'bg-hbo-dark/60 border-hbo-border hover:border-gray-500 text-gray-300'
                }`}
              >
                <div>
                  <p className={`text-xs sm:text-sm font-bold ${isSelected ? 'text-hbo-cyan' : 'text-white'}`}>
                    {opt.label}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{opt.desc}</p>
                </div>
                {isSelected && <Check className="w-4 h-4 text-hbo-cyan stroke-[2.5] flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      </SettingsDrawer>

      {/* 3. Stream Engines & Priority Servers Drawer */}
      <SettingsDrawer
        isOpen={activeDrawer === 'resolvers'}
        onClose={() => setActiveDrawer(null)}
        title="Stream Engines & Priority Servers"
        subtitle="Multi-select enabled resolvers and configure failover priority servers."
        categoryLabel="Playback & Stream"
      >
        <div className="space-y-4">
          {/* Priority Order Subdrawer Button */}
          {(() => {
            const currentPriority = (settings.enginePriority && settings.enginePriority.length > 0)
              ? settings.enginePriority
              : ['telegram', 'embed'];
            return (
              <div className="rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-transparent p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs sm:text-sm text-white">Engine Priority Order</span>
                    <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      Sequence
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveDrawer('engine-priority')}
                    className="px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40 hover:bg-amber-500/30 text-amber-300 text-xs font-bold transition-all flex items-center gap-1"
                  >
                    <span>Sort Order</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-[11px] text-gray-300 mt-1.5 leading-relaxed">
                  Sort priority order for stream extraction &amp; failover.
                </p>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300/90 overflow-x-hidden truncate mt-2">
                  {currentPriority.map((eng, idx) => (
                    <span key={eng} className="flex items-center gap-1">
                      {idx > 0 && <span className="text-gray-500 font-mono text-[10px]">→</span>}
                      <span className="capitalize">{eng}</span>
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Engine Cards — each has toggle + Configure sub-drawer */}
          {[
            { id: 'telegram' as const, title: 'Telegram Provider', tag: 'Direct MTProto', desc: 'Direct in-app video streaming from Telegram bots (MovieSubMalay / @msm32bot).', subDrawer: 'engine-telegram' as const },
            { id: 'embed' as const, title: 'Embed Resolver', tag: 'Multi-Mirror', desc: 'Standard multi-server iframe embeds (VidLink, MoviesAPI) with ad sandboxing.', subDrawer: 'engine-embed' as const },
          ].map((resOption) => {
            const currentEnabled = settings.enabledResolvers && settings.enabledResolvers.length > 0
              ? settings.enabledResolvers : ['embed'];
            const isEnabled = currentEnabled.includes(resOption.id as any);
            return (
              <div
                key={resOption.id}
                className={`rounded-xl border transition-all ${isEnabled ? 'bg-hbo-purple/20 border-hbo-cyan/60' : 'bg-black/30 border-hbo-border opacity-60'}`}
              >
                <button
                  type="button"
                  className="w-full p-3.5 text-left"
                  onClick={() => {
                    let updated: ('embed' | 'telegram')[];
                    if (isEnabled) {
                      if (currentEnabled.length === 1) return;
                      updated = currentEnabled.filter(r => r !== resOption.id) as ('embed' | 'telegram')[];
                    } else {
                      updated = [...currentEnabled, resOption.id] as ('embed' | 'telegram')[];
                    }
                    handleUpdate({ enabledResolvers: updated, streamResolver: updated[0] || 'embed' });
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${isEnabled ? 'bg-hbo-cyan border-hbo-cyan' : 'border-gray-600 bg-black/40'}`}>
                        {isEnabled && <Check className="w-3 h-3 text-black stroke-[3]" />}
                      </div>
                      <span className="font-bold text-xs sm:text-sm text-white truncate">{resOption.title}</span>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold flex-shrink-0 border ${isEnabled ? 'bg-hbo-cyan/20 text-hbo-cyan border-hbo-cyan/40' : 'bg-gray-800 text-gray-500 border-transparent'}`}>
                      {resOption.tag}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1.5 leading-relaxed">{resOption.desc}</p>
                </button>
                <div className="px-3.5 pb-3">
                  <button
                    type="button"
                    onClick={() => setActiveDrawer(resOption.subDrawer)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-white/5 border border-white/10 hover:border-hbo-cyan/50 hover:bg-white/10 transition-all"
                  >
                    <span className="text-[11px] font-semibold text-gray-300">Configure</span>
                    <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </SettingsDrawer>

      {/* 3a-Priority. Sub-Drawer: Engine Priority Order Settings */}
      <SettingsDrawer
        isOpen={activeDrawer === 'engine-priority'}
        onClose={() => setActiveDrawer(null)}
        onBack={() => setActiveDrawer('resolvers')}
        title="Engine Priority Order"
        subtitle="Sort priority order for stream extraction & failover sequence."
        categoryLabel="Stream Engines > Priority"
      >
        <div className="space-y-3">
          {(() => {
            const currentPriority: StreamResolverType[] = (settings.enginePriority && settings.enginePriority.length > 0)
              ? settings.enginePriority
              : ['telegram', 'embed'];

            const currentEnabled = settings.enabledResolvers && settings.enabledResolvers.length > 0
              ? settings.enabledResolvers
              : ['embed'];

            const engineMeta: Record<StreamResolverType, { title: string; tag: string; desc: string; tagClass: string }> = {
              telegram: {
                title: 'Telegram Provider',
                tag: 'Direct MTProto',
                desc: 'Direct in-app video streaming from Telegram bots (MovieSubMalay / @msm32bot).',
                tagClass: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
              },
              embed: {
                title: 'Embed Resolver',
                tag: 'Multi-Mirror',
                desc: 'Standard multi-server iframe embeds (VidLink, MoviesAPI) with ad sandboxing.',
                tagClass: 'bg-hbo-cyan/20 text-hbo-cyan border-hbo-cyan/40',
              },
            };

            const rankLabels = [
              { badge: '#1 Primary', class: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
              { badge: '#2 Fallback', class: 'bg-sky-500/20 text-sky-300 border-sky-500/40' },
            ];

            return currentPriority.map((engineKey, idx) => {
              const meta = engineMeta[engineKey];
              const rank = rankLabels[idx] || { badge: `#${idx + 1}`, class: 'bg-gray-800 text-gray-400' };
              const isEnabled = currentEnabled.includes(engineKey);

              const moveUp = () => {
                if (idx <= 0) return;
                const updated = [...currentPriority];
                const temp = updated[idx];
                updated[idx] = updated[idx - 1];
                updated[idx - 1] = temp;
                handleUpdate({ enginePriority: updated });
              };

              const moveDown = () => {
                if (idx >= currentPriority.length - 1) return;
                const updated = [...currentPriority];
                const temp = updated[idx];
                updated[idx] = updated[idx + 1];
                updated[idx + 1] = temp;
                handleUpdate({ enginePriority: updated });
              };

              return (
                <div
                  key={engineKey}
                  className="p-3.5 rounded-xl border bg-black/40 border-hbo-border flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold border ${rank.class}`}>
                        {rank.badge}
                      </span>
                      <span className="font-bold text-xs sm:text-sm text-white truncate">{meta?.title || engineKey}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold border ${meta?.tagClass || 'bg-gray-800 text-gray-400'}`}>
                        {meta?.tag || ''}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400 leading-snug mb-1">{meta?.desc || ''}</p>
                    <div className="flex items-center gap-1.5 text-[11px]">
                      {isEnabled ? (
                        <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          Active
                        </span>
                      ) : (
                        <span className="text-gray-500 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-600" />
                          Disabled
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={moveUp}
                      className={`w-9 h-9 rounded-lg border flex items-center justify-center transition-all ${
                        idx === 0
                          ? 'opacity-25 border-white/5 bg-white/5 text-gray-600 cursor-not-allowed'
                          : 'bg-white/5 border-white/10 hover:border-amber-400 hover:bg-amber-500/20 text-amber-300'
                      }`}
                      title="Move Up"
                    >
                      <span className="font-bold text-sm">▲</span>
                    </button>
                    <button
                      type="button"
                      disabled={idx === currentPriority.length - 1}
                      onClick={moveDown}
                      className={`w-9 h-9 rounded-lg border flex items-center justify-center transition-all ${
                        idx === currentPriority.length - 1
                          ? 'opacity-25 border-white/5 bg-white/5 text-gray-600 cursor-not-allowed'
                          : 'bg-white/5 border-white/10 hover:border-amber-400 hover:bg-amber-500/20 text-amber-300'
                      }`}
                      title="Move Down"
                    >
                      <span className="font-bold text-sm">▼</span>
                    </button>
                  </div>
                </div>
              );
            });
          })()}
        </div>
      </SettingsDrawer>

      {/* 3a-TG. Sub-Drawer: Telegram Engine Settings */}
      <SettingsDrawer
        isOpen={activeDrawer === 'engine-telegram'}
        onClose={() => setActiveDrawer(null)}
        onBack={() => setActiveDrawer('resolvers')}
        title="Telegram Provider"
        subtitle="Configure MSM Getter microservice and sub-provider settings."
        categoryLabel="Stream Engines > Telegram"
      >
        <div className="space-y-4">
          {/* Sub-Drawer Navigation: MovieSubMalay (@msm32bot) */}
          {(() => {
            const enabledTg = settings.enabledTelegramProviders || ['telegram-msm32'];
            const isMsmEnabled = enabledTg.includes('telegram-msm32');
            const displayUrl = (settings.msm32GetterUrl || 'https://msm-getter.onrender.com').replace(/^https?:\/\//, '');
            return (
              <button
                type="button"
                onClick={() => setActiveDrawer('telegram-msm32')}
                className="w-full flex items-center justify-between p-3.5 rounded-xl bg-white/5 border border-white/10 hover:border-sky-400/50 hover:bg-white/10 transition-all text-left"
              >
                <div className="space-y-0.5 min-w-0 pr-2">
                  <div className="flex items-center gap-1.5">
                    <Send className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                    <span className="text-xs font-semibold text-white truncate">MovieSubMalay (@msm32bot)</span>
                  </div>
                  <span className="text-[11px] text-gray-400 block truncate">
                    Microservice: <span className="font-mono text-sky-300">{displayUrl}</span>
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${isMsmEnabled ? 'bg-sky-500/20 text-sky-300 border-sky-500/40' : 'bg-white/5 text-gray-400 border-white/10'}`}>
                    {isMsmEnabled ? 'Active' : 'Disabled'}
                  </span>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </div>
              </button>
            );
          })()}

          {/* Navigation to Stream Chunk Sub-Drawer */}
          <button
            type="button"
            onClick={() => setActiveDrawer('telegram-chunk')}
            className="w-full flex items-center justify-between p-3.5 rounded-xl bg-white/5 border border-white/10 hover:border-sky-400/50 hover:bg-white/10 transition-all text-left"
          >
            <div className="space-y-0.5">
              <span className="text-xs font-semibold text-white block">Stream Chunk Slice Buffer</span>
              <span className="text-[11px] text-gray-400">Configure seek latency and throughput slice size</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-[10px] text-sky-400 font-mono font-bold bg-sky-500/10 px-2 py-0.5 rounded border border-sky-400/20">
                {((settings.msm32ChunkSize || 524288) / 1024).toFixed(0)} KB
              </span>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </div>
          </button>

          {/* Navigation to Origin Country Filter Sub-Drawer */}
          <button
            type="button"
            onClick={() => setActiveDrawer('telegram-country')}
            className="w-full flex items-center justify-between p-3.5 rounded-xl bg-white/5 border border-white/10 hover:border-sky-400/50 hover:bg-white/10 transition-all text-left"
          >
            <div className="space-y-0.5">
              <span className="text-xs font-semibold text-white block">Active Country Origin Filters</span>
              <span className="text-[11px] text-gray-400">Trigger provider based on title origin countries</span>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {(() => {
                const currentCountries: OriginCountryCode[] =
                  (settings.telegramProviderCountries && settings.telegramProviderCountries['telegram-msm32']) || ['MY', 'ID', 'SG'];
                return (
                  <span className="text-[10px] text-sky-400 font-mono font-bold bg-sky-500/10 px-2 py-0.5 rounded border border-sky-400/20">
                    {currentCountries.length} active
                  </span>
                );
              })()}
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </div>
          </button>
        </div>
      </SettingsDrawer>

      {/* 3a-TG-MSM. Sub-Drawer: MSM32bot Settings */}
      <SettingsDrawer
        isOpen={activeDrawer === 'telegram-msm32'}
        onClose={() => setActiveDrawer(null)}
        onBack={() => setActiveDrawer('engine-telegram')}
        title="MSM32bot Provider"
        subtitle="Configure MSM Getter microservice endpoint, connection, and streaming."
        categoryLabel="Telegram > MSM32bot"
      >
        <div className="space-y-4">
          {/* Provider Active Switch */}
          {(() => {
            const enabledTg = settings.enabledTelegramProviders || ['telegram-msm32'];
            const isMsmEnabled = enabledTg.includes('telegram-msm32');
            return (
              <div className="p-3.5 rounded-xl bg-sky-950/20 border border-sky-500/40 text-xs text-gray-300 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Send className="w-4 h-4 text-sky-400" />
                    <div>
                      <span className="font-bold text-white block text-xs">Enable @msm32bot</span>
                      <span className="text-[10px] text-gray-400">Probe and stream releases from MovieSubMalay bot</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const updated = isMsmEnabled ? enabledTg.filter(id => id !== 'telegram-msm32') : [...enabledTg, 'telegram-msm32'];
                      handleUpdate({ enabledTelegramProviders: updated });
                    }}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5 border ${
                      isMsmEnabled ? 'bg-sky-500/20 text-sky-300 border-sky-500/40' : 'bg-white/5 text-gray-400 border-white/10'
                    }`}
                  >
                    {isMsmEnabled ? <Check className="w-3.5 h-3.5 stroke-[2.5]" /> : <X className="w-3.5 h-3.5 stroke-[2.5]" />}
                    <span>{isMsmEnabled ? 'Active' : 'Disabled'}</span>
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Microservice Endpoint URL Configuration */}
          <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-3">
            <div>
              <span className="text-xs font-semibold text-white block">Microservice Endpoint URL</span>
              <span className="text-[10px] text-gray-400">
                Backend host running Telegram GramJS MTProto client (Render cloud or local PC)
              </span>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={msmUrlInput}
                  onChange={(e) => setMsmUrlInput(e.target.value)}
                  placeholder="https://msm-getter.onrender.com"
                  className="flex-1 bg-black/40 border border-white/15 rounded-xl px-3 py-2 text-xs text-white font-mono placeholder:text-gray-600 focus:outline-none focus:border-sky-400/80 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => {
                    const trimmed = msmUrlInput.trim().replace(/\/+$/, '');
                    const finalUrl = trimmed || 'https://msm-getter.onrender.com';
                    handleUpdate({ msm32GetterUrl: finalUrl });
                    setMsmUrlInput(finalUrl);
                    setTestingMsm32(true);
                    setMsm32TestResult(null);
                    msm32Service.testConnection(finalUrl)
                      .then((res) => setMsm32TestResult(res))
                      .catch((err: any) => setMsm32TestResult({ ok: false, error: err?.message || 'Connection failed' }))
                      .finally(() => setTestingMsm32(false));
                  }}
                  className="px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-black font-bold text-xs flex items-center gap-1.5 transition-colors flex-shrink-0"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save</span>
                </button>
              </div>

              {/* Quick Presets */}
              <div className="flex items-center gap-2 pt-1">
                <span className="text-[10px] text-gray-400 font-semibold flex-shrink-0">Presets:</span>
                <button
                  type="button"
                  onClick={() => {
                    const renderUrl = 'https://msm-getter.onrender.com';
                    setMsmUrlInput(renderUrl);
                    handleUpdate({ msm32GetterUrl: renderUrl });
                  }}
                  className={`text-[10px] px-2.5 py-1 rounded-lg border font-semibold transition-all ${
                    (settings.msm32GetterUrl || 'https://msm-getter.onrender.com') === 'https://msm-getter.onrender.com'
                      ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                      : 'bg-white/5 text-gray-400 border-white/10 hover:text-white'
                  }`}
                >
                  Render Cloud (Default)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const localUrl = 'http://localhost:3033';
                    setMsmUrlInput(localUrl);
                    handleUpdate({ msm32GetterUrl: localUrl });
                  }}
                  className={`text-[10px] px-2.5 py-1 rounded-lg border font-semibold transition-all ${
                    settings.msm32GetterUrl === 'http://localhost:3033'
                      ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                      : 'bg-white/5 text-gray-400 border-white/10 hover:text-white'
                  }`}
                >
                  Localhost (3033)
                </button>
              </div>
            </div>
          </div>

          {/* Microservice Health & Re-ping */}
          <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-white block">Microservice Connectivity</span>
                <span className="text-[10px] text-gray-400">Test health endpoint and Telegram MTProto status</span>
              </div>
            </div>

            <button
              type="button"
              disabled={testingMsm32}
              onClick={async () => {
                setTestingMsm32(true);
                setMsm32TestResult(null);
                try {
                  const res = await msm32Service.testConnection(settings.msm32GetterUrl);
                  setMsm32TestResult(res);
                } catch (err: any) {
                  setMsm32TestResult({ ok: false, error: err?.message || 'Connection failed' });
                } finally {
                  setTestingMsm32(false);
                }
              }}
              className="w-full py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-black font-bold text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${testingMsm32 ? 'animate-spin' : ''}`} />
              <span>{testingMsm32 ? 'Pinging Server (Waking Up)...' : 'Test / Re-ping Server'}</span>
            </button>

            {msm32TestResult ? (
              <div className={`p-2.5 rounded-lg text-[11px] flex items-center gap-1.5 border ${
                msm32TestResult.ok ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/40' : 'bg-rose-950/40 text-rose-300 border-rose-500/40'
              }`}>
                {msm32TestResult.ok ? <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />}
                <span className="truncate">
                  {msm32TestResult.ok
                    ? `Connected! Status: ${msm32TestResult.status || 'online'} • MTProto: ${msm32TestResult.isConnected ? 'Ready' : 'Standby'}`
                    : `Error / Waking Up: ${msm32TestResult.error}`}
                </span>
              </div>
            ) : testingMsm32 && (
              <div className="p-2.5 rounded-lg text-[11px] flex items-center gap-1.5 border bg-sky-950/40 text-sky-300 border-sky-500/40">
                <RefreshCw className="w-3.5 h-3.5 text-sky-400 flex-shrink-0 animate-spin" />
                <span className="truncate">Pinging server... Please wait if waking up from sleep.</span>
              </div>
            )}
          </div>

          <p className="text-[11px] text-gray-400 leading-relaxed">
            The MSM Getter microservice executes queries against the Telegram bot <span className="text-sky-300 font-mono">@msm32bot</span>, resolving file documents and generating chunked HTTP byte-range streams directly into the custom player.
          </p>
        </div>
      </SettingsDrawer>

      {/* 3a-TG-CHUNK. Sub-Drawer: Stream Chunk Slice Buffer */}
      <SettingsDrawer
        isOpen={activeDrawer === 'telegram-chunk'}
        onClose={() => setActiveDrawer(null)}
        onBack={() => setActiveDrawer('engine-telegram')}
        title="Stream Chunk Buffer"
        subtitle="Configure buffer chunk slice size for Telegram streaming."
        categoryLabel="Telegram > Buffer Size"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-300 block">Current Chunk Size:</span>
            <span className="text-xs text-sky-400 font-mono font-bold">
              {((settings.msm32ChunkSize || 524288) / 1024).toFixed(0)} KB
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2">
            {[
              { label: '256 KB', desc: 'Fastest Seek • Recommended for Mobile/Cellular data connections', val: 262144 },
              { label: '512 KB', desc: 'Balanced (Default) • Optimum balance between start latency & throughput', val: 524288 },
              { label: '1 MB', desc: 'High Bitrate • Best for fast Wi-Fi and high-speed fiber broadband', val: 1048576 }
            ].map((c) => {
              const isCurrent = (settings.msm32ChunkSize || 524288) === c.val;
              return (
                <button
                  key={c.val}
                  type="button"
                  onClick={() => handleUpdate({ msm32ChunkSize: c.val })}
                  className={`p-3.5 rounded-xl border text-left transition-all flex items-center justify-between ${
                    isCurrent
                      ? 'bg-sky-500/20 border-sky-400 text-white shadow-sm'
                      : 'bg-white/5 border-white/10 text-gray-400 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <div>
                    <div className={`text-xs font-bold ${isCurrent ? 'text-sky-300' : 'text-white'}`}>{c.label}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">{c.desc}</div>
                  </div>
                  {isCurrent && <Check className="w-4 h-4 text-sky-400 stroke-[3] flex-shrink-0" />}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-gray-500 leading-relaxed">
            Smaller chunks start playback and seek faster by downloading smaller initial byte ranges; larger chunks yield higher sustained throughput.
          </p>
        </div>
      </SettingsDrawer>

      {/* 3a-TG-COUNTRY. Sub-Drawer: MSM32 Country Origin Filters */}
      <SettingsDrawer
        isOpen={activeDrawer === 'telegram-country'}
        onClose={() => setActiveDrawer(null)}
        onBack={() => setActiveDrawer('engine-telegram')}
        title="Country Origin Filters"
        subtitle="Select which origin countries trigger Telegram provider resolution."
        categoryLabel="Telegram > Origin Filters"
      >
        <div className="space-y-4">
          <p className="text-[11px] text-gray-400 leading-relaxed">
            Telegram MSM32 specializes in Southeast Asian releases. Select the content origin countries where MSM32 should probe for matching streams:
          </p>

          {(() => {
            const currentCountries: OriginCountryCode[] =
              (settings.telegramProviderCountries && settings.telegramProviderCountries['telegram-msm32']) || ['MY', 'ID', 'SG'];
            const availableCodes: OriginCountryCode[] = ['MY', 'ID', 'SG', 'TH', 'KR', 'JP', 'US', 'GLOBAL'];
            return (
              <div className="space-y-2">
                {availableCodes.map((code) => {
                  const isSelected = currentCountries.includes(code);
                  return (
                    <button
                      key={code}
                      type="button"
                      onClick={() => {
                        let updated: OriginCountryCode[];
                        if (isSelected) {
                          if (currentCountries.length === 1) return;
                          updated = currentCountries.filter(c => c !== code);
                        } else {
                          updated = [...currentCountries, code];
                        }
                        handleUpdate({
                          telegramProviderCountries: {
                            ...(settings.telegramProviderCountries || {}),
                            'telegram-msm32': updated
                          }
                        });
                      }}
                      className={`w-full p-3 rounded-xl border text-left transition-all flex items-center justify-between ${
                        isSelected
                          ? 'bg-sky-500/20 border-sky-400 text-white'
                          : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                          isSelected ? 'bg-sky-500 border-sky-500' : 'border-gray-600 bg-black/40'
                        }`}>
                          {isSelected && <Check className="w-3 h-3 text-black stroke-[3]" />}
                        </div>
                        <span className="text-xs font-bold text-white">{ORIGIN_COUNTRY_LABELS[code]}</span>
                      </div>
                      <span className="text-[10px] font-mono text-gray-400 uppercase">{code}</span>
                    </button>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </SettingsDrawer>



      {/* 3a-EM. Sub-Drawer: Embed Resolver Settings */}
      <SettingsDrawer
        isOpen={activeDrawer === 'engine-embed'}
        onClose={() => setActiveDrawer(null)}
        onBack={() => setActiveDrawer('resolvers')}
        title="Embed Resolver"
        subtitle="Configure failover priority servers, connection timeout & retries."
        categoryLabel="Stream Engines > Embed"
      >
        <div className="space-y-4">
          {/* Timeout & Retries Config */}
          <div className="space-y-3 pb-3 border-b border-white/10">
            {/* Stream Resolver Timeout */}
            <div className="bg-black/30 border border-hbo-border rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-white block">Resolver Timeout</span>
                  <span className="text-[10px] text-gray-400">Max wait time before auto-failover</span>
                </div>
                <span className="text-xs font-bold text-hbo-cyan">
                  {(settings.streamResolverTimeout ?? 0) === 0 ? 'Unlimited' : `${settings.streamResolverTimeout}s`}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5 pt-1">
                {[
                  { seconds: 0, label: 'Unlimited' },
                  { seconds: 10, label: '10s' },
                  { seconds: 15, label: '15s' },
                  { seconds: 20, label: '20s' },
                  { seconds: 25, label: '25s' },
                  { seconds: 30, label: '30s' },
                ].map((opt) => {
                  const isSelected = (settings.streamResolverTimeout ?? 0) === opt.seconds;
                  return (
                    <button
                      key={opt.seconds}
                      type="button"
                      onClick={() => handleUpdate({ streamResolverTimeout: opt.seconds })}
                      className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all border ${
                        isSelected
                          ? 'bg-hbo-cyan/20 border-hbo-cyan text-hbo-cyan shadow-sm'
                          : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Stream Resolver Retries */}
            <div className="bg-black/30 border border-hbo-border rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-white block">Resolver Retries</span>
                  <span className="text-[10px] text-gray-400">Retry count on failure before failover</span>
                </div>
                <span className="text-xs font-bold text-hbo-cyan">
                  {(settings.streamResolverRetries ?? 1) === 0 ? 'No Retry' : `${settings.streamResolverRetries ?? 1}× Attempts`}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1.5 pt-1">
                {[
                  { retries: 0, label: '0×' },
                  { retries: 1, label: '1×' },
                  { retries: 2, label: '2×' },
                  { retries: 3, label: '3×' },
                ].map((opt) => {
                  const isSelected = (settings.streamResolverRetries ?? 1) === opt.retries;
                  return (
                    <button
                      key={opt.retries}
                      type="button"
                      onClick={() => handleUpdate({ streamResolverRetries: opt.retries })}
                      className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all border ${
                        isSelected
                          ? 'bg-hbo-cyan/20 border-hbo-cyan text-hbo-cyan shadow-sm'
                          : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <span className="text-xs font-semibold text-gray-300 block">Embed Failover Priority Servers</span>
          <div className="flex items-center gap-1.5 p-1 bg-black/40 border border-white/10 rounded-xl">
            {(['general', 'anime', 'asean', 'korean'] as const).map((tab) => (
              <button key={tab} type="button" onClick={() => setPriorityCategoryTab(tab)}
                className={`flex-1 py-1 px-1.5 rounded-lg text-[11px] font-bold capitalize transition-all ${priorityCategoryTab === tab ? 'bg-hbo-purple text-white shadow-md' : 'text-gray-400 hover:text-white'}`}>
                {tab === 'general' ? 'General' : tab === 'asean' ? 'ASEAN' : tab}
              </button>
            ))}
          </div>
          <div className="space-y-2.5">
            {(priorityCategoryTab === 'korean'
              ? [{ index: 0, label: 'Korean #1 (Primary)',    badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40',            defaultId: 'kisskh-kdrama' },
                 { index: 1, label: 'Korean #2 (Failover 1)', badgeClass: 'bg-hbo-purple/30 text-hbo-purple-light border-hbo-purple/40', defaultId: 'cinesrc' },
                 { index: 2, label: 'Korean #3 (Failover 2)', badgeClass: 'bg-hbo-cyan/20 text-hbo-cyan border-hbo-cyan/40',            defaultId: 'moviesapi' }]
              : priorityCategoryTab === 'asean'
              ? [{ index: 0, label: 'Asean #1 (Primary)',    badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',          defaultId: 'pencurimovie-my' },
                 { index: 1, label: 'Asean #2 (Failover 1)', badgeClass: 'bg-hbo-purple/30 text-hbo-purple-light border-hbo-purple/40', defaultId: 'vidlink' },
                 { index: 2, label: 'Asean #3 (Failover 2)', badgeClass: 'bg-hbo-cyan/20 text-hbo-cyan border-hbo-cyan/40',            defaultId: '111movies' }]
              : priorityCategoryTab === 'anime'
              ? [{ index: 0, label: 'Anime #1 (Primary)',    badgeClass: 'bg-pink-500/20 text-pink-300 border-pink-500/40',             defaultId: 'megaplay-anime' },
                 { index: 1, label: 'Anime #2 (Failover 1)', badgeClass: 'bg-hbo-purple/30 text-hbo-purple-light border-hbo-purple/40', defaultId: 'cinesrc' },
                 { index: 2, label: 'Anime #3 (Failover 2)', badgeClass: 'bg-hbo-cyan/20 text-hbo-cyan border-hbo-cyan/40',            defaultId: 'moviesapi' }]
              : [{ index: 0, label: '#1 Priority (Primary)',    badgeClass: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',  defaultId: 'vidlink' },
                 { index: 1, label: '#2 Priority (Failover 1)', badgeClass: 'bg-hbo-purple/30 text-hbo-purple-light border-hbo-purple/40', defaultId: 'moviesapi' },
                 { index: 2, label: '#3 Priority (Failover 2)', badgeClass: 'bg-hbo-cyan/20 text-hbo-cyan border-hbo-cyan/40',          defaultId: 'cinesrc' }]
            ).map(({ index, label, badgeClass, defaultId }) => {
              const isKoreanTab = priorityCategoryTab === 'korean';
              const isAseanTab  = priorityCategoryTab === 'asean';
              const isAnimeTab  = priorityCategoryTab === 'anime';
              const currentTop = isKoreanTab
                ? (settings.topKoreanProviders && settings.topKoreanProviders.length >= 3 ? settings.topKoreanProviders : ['kisskh-kdrama', 'cinesrc', 'moviesapi'])
                : isAseanTab
                ? ((settings.topAseanProviders || (settings as any).topAsianProviders) && (settings.topAseanProviders || (settings as any).topAsianProviders).length >= 3 ? (settings.topAseanProviders || (settings as any).topAsianProviders) : ['pencurimovie-my', 'vidlink', '111movies'])
                : isAnimeTab
                ? (settings.topAnimeProviders && settings.topAnimeProviders.length >= 3 ? settings.topAnimeProviders : ['megaplay-anime', 'cinesrc', 'moviesapi'])
                : (settings.topProviders && settings.topProviders.length >= 3 ? settings.topProviders : ['vidlink', 'moviesapi', 'cinesrc']);
              const selectedId  = currentTop[index] || defaultId;
              const selectedObj = STREAM_PROVIDERS.find(p => p.id === selectedId) || STREAM_PROVIDERS[0];
              return (
                <div key={`${priorityCategoryTab}-${index}`} className="bg-hbo-dark/70 border border-hbo-border/90 rounded-xl p-3 space-y-2 relative">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${badgeClass} flex-shrink-0`}>{label}</span>
                    <div className="flex items-center gap-1 flex-wrap justify-end">
                      {selectedObj.categories.map((cat) => {
                        const config = CATEGORY_BADGE_CONFIG[cat];
                        if (!config) return null;
                        return <span key={cat} className={`text-[9px] px-1.5 py-0.5 rounded font-bold border ${config.className}`}>{config.label}</span>;
                      })}
                    </div>
                  </div>
                  <button type="button"
                    onClick={() => { setPriorityPickerSlot({ tab: priorityCategoryTab, index, label, currentId: selectedId }); setActiveDrawer('priorityPicker'); }}
                    className="w-full flex items-center justify-between bg-hbo-card/90 border border-hbo-border text-white text-xs font-bold rounded-xl px-3 py-2.5 hover:border-hbo-cyan transition-all">
                    <span className="truncate pr-2">{selectedObj.name}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </SettingsDrawer>

      {/* 3a. Level 2 Sub-Drawer: Stream Provider Selection */}
      {/* 3a. Level 2 Sub-Drawer: Stream Provider Selection */}
      <SettingsDrawer
        isOpen={activeDrawer === 'priorityPicker'}
        onClose={() => setActiveDrawer(null)}
        onBack={() => setActiveDrawer('resolvers')}
        title="Select Stream Provider"
        subtitle={priorityPickerSlot ? `Assign provider for ${priorityPickerSlot.label}` : 'Choose streaming provider'}
        categoryLabel="Playback > Resolvers"
      >
        <div className="space-y-2">
          {STREAM_PROVIDERS.map((provider) => {
            const isSelected = priorityPickerSlot?.currentId === provider.id;
            return (
              <button
                key={provider.id}
                type="button"
                onClick={() => {
                  if (!priorityPickerSlot) return;
                  const { tab, index } = priorityPickerSlot;
                  if (tab === 'korean') {
                    const current = settings.topKoreanProviders && settings.topKoreanProviders.length >= 3
                      ? [...settings.topKoreanProviders]
                      : ['kisskh-kdrama', 'cinesrc', 'moviesapi'];
                    current[index] = provider.id;
                    handleUpdate({ topKoreanProviders: current as [string, string, string] });
                  } else if (tab === 'asean') {
                    const current = (settings.topAseanProviders || (settings as any).topAsianProviders) && (settings.topAseanProviders || (settings as any).topAsianProviders).length >= 3
                      ? [...(settings.topAseanProviders || (settings as any).topAsianProviders)]
                      : ['pencurimovie-my', 'vidlink', '111movies'];
                    current[index] = provider.id;
                    handleUpdate({
                      topAseanProviders: current as [string, string, string],
                      topAsianProviders: current as [string, string, string]
                    });
                  } else if (tab === 'anime') {
                    const current = settings.topAnimeProviders && settings.topAnimeProviders.length >= 3
                      ? [...settings.topAnimeProviders]
                      : ['megaplay-anime', 'cinesrc', 'moviesapi'];
                    current[index] = provider.id;
                    handleUpdate({ topAnimeProviders: current as [string, string, string] });
                  } else {
                    const current = settings.topProviders && settings.topProviders.length >= 3
                      ? [...settings.topProviders]
                      : ['vidlink', 'moviesapi', 'cinesrc'];
                    current[index] = provider.id;
                    handleUpdate({
                      topProviders: current as [string, string, string],
                      preferredProvider: current[0]
                    });
                  }
                  setActiveDrawer('resolvers');
                }}
                className={`w-full p-3.5 rounded-xl border text-left transition-all flex items-center justify-between gap-3 ${
                  isSelected
                    ? 'bg-hbo-purple/30 border-hbo-cyan text-white shadow-hbo-glow'
                    : 'bg-black/30 border-white/5 hover:border-white/20 text-gray-300'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex items-center gap-1 flex-wrap flex-shrink-0">
                    {provider.categories.map((cat) => {
                      const config = CATEGORY_BADGE_CONFIG[cat];
                      if (!config) return null;
                      return (
                        <span
                          key={cat}
                          className={`text-[9px] px-1.5 py-0.5 rounded font-bold border ${config.className}`}
                        >
                          {config.label}
                        </span>
                      );
                    })}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs sm:text-sm font-bold ${isSelected ? 'text-hbo-cyan' : 'text-white'} truncate`}>
                      {provider.name}
                    </p>
                  </div>
                </div>
                {isSelected && <Check className="w-4 h-4 text-hbo-cyan stroke-[2.5] flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      </SettingsDrawer>

      {/* 4. Ad & Popup Sandboxing Shield Drawer */}
      <SettingsDrawer
        isOpen={activeDrawer === 'adblock'}
        onClose={() => setActiveDrawer(null)}
        title="Ad & Popup Sandboxing Shield"
        subtitle="Hardware-level iframe sandbox policies to prevent redirects and malicious popups."
        categoryLabel="Playback & Stream"
      >
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => handleUpdate({ adBlockShield: !settings.adBlockShield })}
            className="w-full flex items-center justify-between gap-3 p-4 rounded-xl text-left transition-all border bg-black/40 border-white/10 hover:border-white/20"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-bold text-sm text-white">Ad &amp; Popup Sandboxing</span>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide border ${
                  settings.adBlockShield
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                    : 'bg-white/5 text-gray-400 border-white/10'
                }`}>
                  {settings.adBlockShield ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <p className="text-[11px] text-gray-400 leading-snug">
                Blocks external script injection, window hijacking, and automatic browser redirects
              </p>
            </div>
          </button>

          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-2 text-xs text-gray-400 leading-relaxed">
            <p className="font-bold text-white flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-green-400" />
              <span>Sandbox Protection Benefits</span>
            </p>
            <p>
              When enabled, all embedded streaming mirrors run inside a locked down iframe with restricted permissions.
              This prevents rogue advertising domains from launching new tabs or hijacking your playback session.
            </p>
          </div>
        </div>
      </SettingsDrawer>

      {/* 5. Stream Header Auto-Hide Timeout Drawer */}
      <SettingsDrawer
        isOpen={activeDrawer === 'headerTimeout'}
        onClose={() => setActiveDrawer(null)}
        title="Stream Header Auto-Hide Timeout"
        subtitle="Configure how long the top overlay header remains visible during playback."
        categoryLabel="Display & UI"
      >
        <div className="space-y-2">
          {[
            { seconds: 0, label: 'Always Visible', desc: 'Header overlay never auto-hides' },
            { seconds: 3, label: '3 Seconds', desc: 'Fast fade for maximum video immersion' },
            { seconds: 5, label: '5 Seconds (Default)', desc: 'Standard comfortable viewing duration' },
            { seconds: 8, label: '8 Seconds', desc: 'Relaxed display before fading out' },
            { seconds: 10, label: '10 Seconds', desc: 'Extended duration for titles and clocks' },
          ].map((opt) => {
            const isSelected = (settings.streamHeaderTimeout ?? 5) === opt.seconds;
            return (
              <button
                key={opt.seconds}
                type="button"
                onClick={() => {
                  handleUpdate({ streamHeaderTimeout: opt.seconds });
                  setActiveDrawer(null);
                }}
                className={`w-full p-3.5 rounded-xl border text-left transition-all flex items-center justify-between gap-3 ${
                  isSelected
                    ? 'bg-hbo-purple/40 border-hbo-cyan text-white shadow-hbo-glow'
                    : 'bg-hbo-dark/60 border-hbo-border hover:border-gray-500 text-gray-300'
                }`}
              >
                <div>
                  <p className={`text-xs sm:text-sm font-bold ${isSelected ? 'text-hbo-cyan' : 'text-white'}`}>
                    {opt.label}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{opt.desc}</p>
                </div>
                {isSelected && <Check className="w-4 h-4 text-hbo-cyan stroke-[2.5] flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      </SettingsDrawer>

      {/* 6. UI Performance Mode (Lite) Drawer */}
      <SettingsDrawer
        isOpen={activeDrawer === 'perfMode'}
        onClose={() => setActiveDrawer(null)}
        title="UI Performance Mode (Lite)"
        subtitle="Graphic optimizations designed for lower-end devices or battery conservation."
        categoryLabel="Display & UI"
      >
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => handleUpdate({ performanceMode: !(settings.performanceMode ?? false) })}
            className="w-full flex items-center justify-between gap-3 p-4 rounded-xl text-left transition-all border bg-black/40 border-white/10 hover:border-white/20"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-bold text-sm text-white">UI Performance Mode</span>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide border ${
                  (settings.performanceMode ?? false)
                    ? 'bg-hbo-cyan/20 text-hbo-cyan border-hbo-cyan/40'
                    : 'bg-white/5 text-gray-400 border-white/10'
                }`}>
                  {(settings.performanceMode ?? false) ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <p className="text-[11px] text-gray-400 leading-snug">
                Disables backdrop blur filters and reduces UI shadows to increase overall frame rates
              </p>
            </div>
          </button>

          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-2 text-xs text-gray-400 leading-relaxed">
            <p className="font-bold text-white flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-hbo-cyan" />
              <span>Optimizations Included</span>
            </p>
            <ul className="list-disc list-inside space-y-1 text-gray-300">
              <li>Replaces multi-pass GPU Gaussian blurs with solid translucent backdrops</li>
              <li>Reduces layout repaints and box shadow recalculations</li>
              <li>Improves UI responsiveness and extends battery life</li>
            </ul>
          </div>
        </div>
      </SettingsDrawer>

      {/* 7. Performance HUD Drawer */}
      <SettingsDrawer
        isOpen={activeDrawer === 'perfHud'}
        onClose={() => setActiveDrawer(null)}
        title="UI Performance HUD"
        subtitle="Display live real-time hardware performance metrics on-screen."
        categoryLabel="Display & UI"
      >
        <div className="space-y-2">
          {[
            { id: 'off', label: 'Disabled (Default)', desc: 'No performance overlay rendered' },
            { id: 'watch_only', label: 'Watch Screen Only', desc: 'HUD active only during video playback' },
            { id: 'all_pages', label: 'All Pages (Full Debug)', desc: 'Realtime FPS, CPU, and RAM on every page' }
          ].map((opt) => {
            const currentVal = settings.showPerformanceHud === true 
              ? 'all_pages' 
              : (settings.showPerformanceHud === 'watch_only' || settings.showPerformanceHud === 'all_pages' 
                  ? settings.showPerformanceHud 
                  : 'off');
            const isSelected = currentVal === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  handleUpdate({ showPerformanceHud: opt.id as any });
                  setActiveDrawer(null);
                }}
                className={`w-full p-3.5 rounded-xl border text-left transition-all flex items-center justify-between gap-3 ${
                  isSelected
                    ? 'bg-hbo-purple/40 border-hbo-cyan text-white shadow-hbo-glow'
                    : 'bg-hbo-dark/60 border-hbo-border hover:border-gray-500 text-gray-300'
                }`}
              >
                <div>
                  <p className={`text-xs sm:text-sm font-bold ${isSelected ? 'text-hbo-cyan' : 'text-white'}`}>
                    {opt.label}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{opt.desc}</p>
                </div>
                {isSelected && <Check className="w-4 h-4 text-hbo-cyan stroke-[2.5] flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      </SettingsDrawer>

      {/* 8. Catalog Maturity Filter Drawer */}
      <SettingsDrawer
        isOpen={activeDrawer === 'maturity'}
        onClose={() => setActiveDrawer(null)}
        title="Catalog Maturity Rating Limit"
        subtitle="Filter media catalog recommendations by maximum age certification."
        categoryLabel="Content Controls"
      >
        <div className="space-y-2">
          {[
            { id: 'all', label: 'All Ratings (18+)', desc: 'Unrestricted: R, TV-MA, NC-17, 18, 21+' },
            { id: 'mature', label: 'Young Adult (16+)', desc: 'Up to R / 15 / 16 (Excludes NC-17, 18SX)' },
            { id: 'teen', label: 'Teens (13+)', desc: 'Up to PG-13 / 12A / TV-14 (Excludes R)' },
            { id: 'older_kids', label: 'Older Kids (7+)', desc: 'Up to PG / TV-PG (Gentle scares, fantasy)' },
            { id: 'kids', label: 'Little Kids (All Ages)', desc: 'Strictly G / U / TV-Y / TV-G (Preschool & family)' },
          ].map((lvl) => {
            const isSelected = currentMaturityKey === lvl.id;
            return (
              <button
                key={lvl.id}
                type="button"
                onClick={() => {
                  handleUpdate({ maturityLevel: lvl.id as any });
                  setActiveDrawer(null);
                }}
                className={`w-full p-3.5 rounded-xl border text-left transition-all flex items-center justify-between gap-3 ${
                  isSelected
                    ? 'bg-hbo-purple/40 border-hbo-cyan text-white shadow-hbo-glow'
                    : 'bg-hbo-dark/60 border-hbo-border hover:border-gray-500 text-gray-300'
                }`}
              >
                <div>
                  <p className={`text-xs sm:text-sm font-bold ${isSelected ? 'text-hbo-cyan' : 'text-white'}`}>
                    {lvl.label}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{lvl.desc}</p>
                </div>
                {isSelected && <Check className="w-4 h-4 text-hbo-cyan stroke-[2.5] flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      </SettingsDrawer>

      {/* 9. Filter Adult & Explicit Content Drawer */}
      <SettingsDrawer
        isOpen={activeDrawer === 'filterAdult'}
        onClose={() => setActiveDrawer(null)}
        title="Filter Adult & Explicit Content"
        subtitle="SafeSearch configuration to exclude explicit sexual and adult rated material."
        categoryLabel="Content Controls"
      >
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => handleUpdate({ filterAdult: settings.filterAdult === false ? true : false })}
            className="w-full flex items-center justify-between gap-3 p-4 rounded-xl text-left transition-all border bg-black/40 border-white/10 hover:border-white/20"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-bold text-sm text-white">Adult SafeSearch Filter</span>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide border ${
                  settings.filterAdult !== false
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                    : 'bg-white/5 text-gray-400 border-white/10'
                }`}>
                  {settings.filterAdult !== false ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <p className="text-[11px] text-gray-400 leading-snug">
                Filter out explicit 18SX, R18+, NC-17, and pornography metadata from search and categories
              </p>
            </div>
          </button>

          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-2 text-xs text-gray-400 leading-relaxed">
            <p className="font-bold text-white flex items-center gap-1.5">
              <EyeOff className="w-4 h-4 text-amber-400" />
              <span>SafeSearch Protection</span>
            </p>
            <p>
              When enabled, TMDB and backend queries automatically append explicit content exclusion flags, preventing accidental display of adult-only video recommendations.
            </p>
          </div>
        </div>
      </SettingsDrawer>

      {/* 10. Filter Unreleased Titles Drawer */}
      <SettingsDrawer
        isOpen={activeDrawer === 'filterUnreleased'}
        onClose={() => setActiveDrawer(null)}
        title="Filter Unreleased Titles"
        subtitle="Hide movies and series that have not yet arrived in theaters or on broadcast networks."
        categoryLabel="Content Controls"
      >
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => handleUpdate({ filterUnreleased: settings.filterUnreleased === false ? true : false })}
            className="w-full flex items-center justify-between gap-3 p-4 rounded-xl text-left transition-all border bg-black/40 border-white/10 hover:border-white/20"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-bold text-sm text-white">Hide Unreleased Titles</span>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide border ${
                  settings.filterUnreleased !== false
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                    : 'bg-white/5 text-gray-400 border-white/10'
                }`}>
                  {settings.filterUnreleased !== false ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <p className="text-[11px] text-gray-400 leading-snug">
                Excludes upcoming movies and TV series that are still in production or pre-premiere
              </p>
            </div>
          </button>

          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-2 text-xs text-gray-400 leading-relaxed">
            <p className="font-bold text-white flex items-center gap-1.5">
              <CalendarX className="w-4 h-4 text-hbo-cyan" />
              <span>Catalog Cleanliness</span>
            </p>
            <p>
              When enabled, media cards whose air dates or theatrical releases are in the future will be filtered out from rows and search, avoiding dead streams for unreleased media.
            </p>
          </div>
        </div>
      </SettingsDrawer>

      {/* 11. Auto-Check on Startup Drawer */}
      <SettingsDrawer
        isOpen={activeDrawer === 'autoUpdate'}
        onClose={() => setActiveDrawer(null)}
        title="Auto-Check on Startup"
        subtitle="Check for app updates automatically whenever the application launches."
        categoryLabel="System & Updates"
      >
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => handleUpdate({ autoUpdateCheck: !(settings.autoUpdateCheck ?? true) })}
            className="w-full flex items-center justify-between gap-3 p-4 rounded-xl text-left transition-all border bg-black/40 border-white/10 hover:border-white/20"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-bold text-sm text-white">Auto-Check on Startup</span>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide border ${
                  (settings.autoUpdateCheck ?? true)
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                    : 'bg-white/5 text-gray-400 border-white/10'
                }`}>
                  {(settings.autoUpdateCheck ?? true) ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <p className="text-[11px] text-gray-400 leading-snug">
                Check GitHub releases silently on background launch and display non-intrusive update badges
              </p>
            </div>
          </button>

          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-2 text-xs text-gray-400 leading-relaxed">
            <p className="font-bold text-white flex items-center gap-1.5">
              <RefreshCw className="w-4 h-4 text-hbo-cyan" />
              <span>Seamless Updates</span>
            </p>
            <p>
              Keeping this enabled ensures you are immediately notified when bugfixes, new stream providers, or UI enhancements become available.
            </p>
          </div>
        </div>
      </SettingsDrawer>

      {/* 12. Include Nightly Builds Drawer */}
      <SettingsDrawer
        isOpen={activeDrawer === 'nightlyUpdate'}
        onClose={() => setActiveDrawer(null)}
        title="Include Nightly Builds"
        subtitle="Subscribe to experimental daily releases and pre-release test channels."
        categoryLabel="System & Updates"
      >
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => handleUpdate({ includeNightlyUpdates: !settings.includeNightlyUpdates })}
            className="w-full flex items-center justify-between gap-3 p-4 rounded-xl text-left transition-all border bg-black/40 border-white/10 hover:border-white/20"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-bold text-sm text-white">Include Nightly Builds</span>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide border ${
                  settings.includeNightlyUpdates
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                    : 'bg-white/5 text-gray-400 border-white/10'
                }`}>
                  {settings.includeNightlyUpdates ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <p className="text-[11px] text-gray-400 leading-snug">
                Receive automated nightly pre-release builds and early experimental features
              </p>
            </div>
          </button>

          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-2 text-xs text-gray-400 leading-relaxed">
            <p className="font-bold text-white flex items-center gap-1.5">
              <Moon className="w-4 h-4 text-amber-400" />
              <span>Channel Information</span>
            </p>
            <p>
              Nightly builds contain early bugfixes and new resolver scripts before official stable release tag creation. Nightly builds can occasionally introduce experimental behaviors.
            </p>
          </div>
        </div>
      </SettingsDrawer>

      {/* 13. Persistent Storage & Backup Drawer */}
      <SettingsDrawer
        isOpen={activeDrawer === 'backup'}
        onClose={() => setActiveDrawer(null)}
        title="Persistent Storage & Backup"
        subtitle="Export, backup, and restore your watch history, watchlist, and custom settings."
        categoryLabel="System & Updates"
      >
        <div className="space-y-3.5">
          {backupStatusMsg && (
            <div className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
              backupStatusMsg.isError ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
            }`}>
              {backupStatusMsg.isError ? <AlertCircle className="w-4 h-4 flex-shrink-0" /> : <Check className="w-4 h-4 flex-shrink-0" />}
              <span>{backupStatusMsg.text}</span>
            </div>
          )}

          {backupMeta.timestamp > 0 && (
            <p className="text-[11px] text-gray-400 font-mono">
              Last backup: {new Date(backupMeta.timestamp).toLocaleString()}
            </p>
          )}

          <div className="space-y-2">
            <button
              type="button"
              onClick={handleBackupNow}
              className="w-full flex items-center justify-between p-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white transition active:scale-95"
            >
              <div className="flex items-center gap-2.5">
                <Save className="w-4 h-4 text-hbo-cyan" />
                <span>Backup to Device Storage</span>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </button>

            <button
              type="button"
              onClick={handleRestoreNow}
              className="w-full flex items-center justify-between p-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white transition active:scale-95"
            >
              <div className="flex items-center gap-2.5">
                <RefreshCw className="w-4 h-4 text-amber-400" />
                <span>Restore from Storage</span>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </button>

            <button
              type="button"
              onClick={handleExportJson}
              className="w-full flex items-center justify-between p-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-gray-300 hover:text-white transition active:scale-95"
            >
              <div className="flex items-center gap-2.5">
                <Download className="w-4 h-4 text-emerald-400" />
                <span>Export Backup File (.json)</span>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-between p-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-gray-300 hover:text-white transition active:scale-95"
            >
              <div className="flex items-center gap-2.5">
                <Upload className="w-4 h-4 text-purple-400" />
                <span>Import Backup File (.json)</span>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleImportJson}
              className="hidden"
            />
          </div>
        </div>
      </SettingsDrawer>

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
