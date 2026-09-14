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
  Info,
  Download,
  Upload,
  HardDrive,
  Save
} from 'lucide-react';

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
  const [priorityCategoryTab, setPriorityCategoryTab] = useState<'general' | 'anime' | 'asian' | 'korean'>('general');
  const [pickerModalSlot, setPickerModalSlot] = useState<number | null>(null);
  const clickCountRef = useRef(0);
  const clickTimerRef = useRef<NodeJS.Timeout | null>(null);
  const { detectedPlatform, activeLayout } = useDevice();

  const isPickerModalOpen = pickerModalSlot !== null;

  // Reset scroll position of child panel when activeCategory changes
  useEffect(() => {
    if (contentPanelRef.current) {
      contentPanelRef.current.scrollTo({ top: 0, behavior: 'instant' as any });
    }
  }, [activeCategory]);

  useEffect(() => {
    try {
      (window as any).AndroidBridge?.setDropdownOpen?.(isPickerModalOpen);
    } catch {}

    if (pickerModalSlot !== null) {
      setTimeout(() => {
        const selectedEl = document.querySelector<HTMLElement>('[data-server-modal-item][data-provider-selected="true"]') ||
                           document.querySelector<HTMLElement>('[data-server-modal-item]');
        if (selectedEl) {
          selectedEl.focus();
          selectedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }, 50);
    }

    return () => {
      try {
        (window as any).AndroidBridge?.setDropdownOpen?.(false);
      } catch {}
    };
  }, [pickerModalSlot, isPickerModalOpen]);

  // Handle remote Back button, tmdb_close_dropdowns, and Escape dismissal for picker modal
  useEffect(() => {
    const handleCloseFromEvent = () => {
      const slot = pickerModalSlot;
      setPickerModalSlot(null);
      if (slot !== null) {
        setTimeout(() => {
          document.getElementById(`priority-server-btn-${slot}`)?.focus();
        }, 50);
      }
    };

    window.addEventListener('tmdb_close_dropdowns', handleCloseFromEvent);

    if (!isPickerModalOpen) {
      return () => {
        window.removeEventListener('tmdb_close_dropdowns', handleCloseFromEvent);
      };
    }

    const handleModalKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === 'Escape' ||
        e.key === 'BrowserBack' ||
        e.key === 'Back' ||
        e.key === 'GoBack' ||
        e.keyCode === 27 ||
        e.keyCode === 4 ||
        e.keyCode === 10009
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        handleCloseFromEvent();
        return;
      }
    };

    window.addEventListener('keydown', handleModalKeyDown, { capture: true });
    return () => {
      window.removeEventListener('tmdb_close_dropdowns', handleCloseFromEvent);
      window.removeEventListener('keydown', handleModalKeyDown, { capture: true });
    };
  }, [isPickerModalOpen, pickerModalSlot]);

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
    const handleCaptureSpatialNav = (e: KeyboardEvent) => {
      // Don't interfere if picker modal, easter egg, or update modal is open
      if (isPickerModalOpen || showEasterEgg || showUpdateModal) return;

      const isDown = e.key === 'ArrowDown' || e.keyCode === 40 || e.keyCode === 20;
      const isUp = e.key === 'ArrowUp' || e.keyCode === 38 || e.keyCode === 19;
      const isLeft = e.key === 'ArrowLeft' || e.keyCode === 37 || e.keyCode === 21;
      const isRight = e.key === 'ArrowRight' || e.keyCode === 39 || e.keyCode === 22;

      if (!isDown && !isUp && !isLeft && !isRight) return;

      const active = document.activeElement as HTMLElement | null;
      if (!active) return;

      // ==========================================
      // 1. PLAYBACK & STREAM PANEL NAV
      // ==========================================
      if (activeCategory === 'playback') {
        // From Category Rail: ArrowRight -> Jump into Playback Toggle
        if (active.id === 'tv-settings-cat-playback' && isRight) {
          e.preventDefault();
          e.stopImmediatePropagation();
          const target = document.getElementById('playback-toggle-autoplay');
          target?.focus();
          target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          return;
        }

        // From Auto-Play Toggle:
        if (active.id === 'playback-toggle-autoplay') {
          if (isLeft) {
            e.preventDefault();
            e.stopImmediatePropagation();
            document.getElementById('tv-settings-cat-playback')?.focus();
            return;
          }
          if (isDown) {
            e.preventDefault();
            e.stopImmediatePropagation();
            if (settings?.autoplayNext !== false) {
              const target = document.querySelector<HTMLElement>('[data-playback-trigger-selected="true"]') ||
                             document.getElementById('playback-btn-trigger-0');
              target?.focus();
              target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            } else {
              const target = document.querySelector<HTMLElement>('[data-playback-ticker-selected="true"]') ||
                             document.getElementById('playback-btn-ticker-0');
              target?.focus();
              target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
            return;
          }
        }

        // From Trigger % (Row 2):
        if (active.getAttribute('data-playback-trigger-selected') !== null) {
          if (isUp) {
            e.preventDefault();
            e.stopImmediatePropagation();
            document.getElementById('playback-toggle-autoplay')?.focus();
            return;
          }
          if (isDown) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const target = document.querySelector<HTMLElement>('[data-playback-timeout-selected="true"]') ||
                           document.getElementById('playback-btn-timeout-0');
            target?.focus();
            target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            return;
          }
          if (isLeft && active.id === 'playback-btn-trigger-0') {
            e.preventDefault();
            e.stopImmediatePropagation();
            document.getElementById('tv-settings-cat-playback')?.focus();
            return;
          }
        }

        // From Countdown Timeout (Row 3):
        if (active.getAttribute('data-playback-timeout-selected') !== null) {
          if (isUp) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const target = document.querySelector<HTMLElement>('[data-playback-trigger-selected="true"]') ||
                           document.getElementById('playback-btn-trigger-0');
            target?.focus();
            target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            return;
          }
          if (isDown) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const target = document.querySelector<HTMLElement>('[data-playback-ticker-selected="true"]') ||
                           document.getElementById('playback-btn-ticker-0');
            target?.focus();
            target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            return;
          }
          if (isLeft && active.id === 'playback-btn-timeout-0') {
            e.preventDefault();
            e.stopImmediatePropagation();
            document.getElementById('tv-settings-cat-playback')?.focus();
            return;
          }
        }

        // From Ticker Interval (Row 4):
        if (active.getAttribute('data-playback-ticker-selected') !== null) {
          if (isUp) {
            e.preventDefault();
            e.stopImmediatePropagation();
            if (settings?.autoplayNext !== false) {
              const target = document.querySelector<HTMLElement>('[data-playback-timeout-selected="true"]') ||
                             document.getElementById('playback-btn-timeout-0');
              target?.focus();
              target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            } else {
              document.getElementById('playback-toggle-autoplay')?.focus();
            }
            return;
          }
          if (isDown) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const target = document.querySelector<HTMLElement>('[data-playback-resolver-timeout-selected="true"]') ||
                           document.getElementById('playback-btn-resolver-timeout-0');
            target?.focus();
            target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            return;
          }
          if (isLeft && active.id === 'playback-btn-ticker-0') {
            e.preventDefault();
            e.stopImmediatePropagation();
            document.getElementById('tv-settings-cat-playback')?.focus();
            return;
          }
        }

        // From Stream Resolver Timeout (Row 4b):
        if (active.getAttribute('data-playback-resolver-timeout-selected') !== null) {
          if (isUp) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const target = document.querySelector<HTMLElement>('[data-playback-ticker-selected="true"]') ||
                           document.getElementById('playback-btn-ticker-0');
            target?.focus();
            target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            return;
          }
          if (isDown) {
            e.preventDefault();
            e.stopImmediatePropagation();
            document.getElementById('playback-engine-torbox')?.focus();
            return;
          }
          if (isLeft && active.id === 'playback-btn-resolver-timeout-0') {
            e.preventDefault();
            e.stopImmediatePropagation();
            document.getElementById('tv-settings-cat-playback')?.focus();
            return;
          }
        }

        // From Torbox Button:
        if (active.id === 'playback-engine-torbox') {
          if (isLeft) {
            e.preventDefault();
            e.stopImmediatePropagation();
            document.getElementById('tv-settings-cat-playback')?.focus();
            return;
          }
          if (isUp) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const target = document.querySelector<HTMLElement>('[data-playback-resolver-timeout-selected="true"]') ||
                           document.getElementById('playback-btn-resolver-timeout-0');
            target?.focus();
            target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            return;
          }
          if (isDown) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const apikeyInput = document.getElementById('playback-input-torbox-apikey');
            const target = apikeyInput || document.getElementById('playback-engine-extractor') || document.getElementById('playback-engine-embed');
            target?.focus();
            target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            return;
          }
        }

        // From Torbox API Key Input:
        if (active.id === 'playback-input-torbox-apikey') {
          if (isLeft) {
            e.preventDefault();
            e.stopImmediatePropagation();
            document.getElementById('tv-settings-cat-playback')?.focus();
            return;
          }
          if (isUp) {
            e.preventDefault();
            e.stopImmediatePropagation();
            document.getElementById('playback-engine-torbox')?.focus();
            return;
          }
          if (isDown) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const target = document.getElementById('playback-engine-extractor') || document.getElementById('playback-engine-embed');
            target?.focus();
            target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            return;
          }
        }

        // From Private Extractor Engine:
        if (active.id === 'playback-engine-extractor') {
          if (isLeft) {
            e.preventDefault();
            e.stopImmediatePropagation();
            document.getElementById('tv-settings-cat-playback')?.focus();
            return;
          }
          if (isUp) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const apikeyInput = document.getElementById('playback-input-torbox-apikey');
            const target = apikeyInput || document.getElementById('playback-engine-torbox');
            target?.focus();
            target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            return;
          }
          if (isDown) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const target = document.getElementById('playback-engine-embed');
            target?.focus();
            target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            return;
          }
        }

        // From Embed Resolver Engine:
        if (active.id === 'playback-engine-embed') {
          if (isLeft) {
            e.preventDefault();
            e.stopImmediatePropagation();
            document.getElementById('tv-settings-cat-playback')?.focus();
            return;
          }
          if (isUp) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const target = document.getElementById('playback-engine-extractor') ||
                           document.getElementById('playback-input-torbox-apikey') ||
                           document.getElementById('playback-engine-torbox');
            target?.focus();
            target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            return;
          }
          if (isDown) {
            e.preventDefault();
            e.stopImmediatePropagation();
            // Go to active priority category tab
            const target = document.querySelector<HTMLElement>('[data-priority-tab-active="true"]') ||
                           document.getElementById('playback-tab-sub-general');
            target?.focus();
            target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            return;
          }
        }

        // From Subtabs (General, Anime, Asean, Korean):
        if (active.id && active.id.startsWith('playback-tab-sub-')) {
          if (isLeft && active.id === 'playback-tab-sub-general') {
            e.preventDefault();
            e.stopImmediatePropagation();
            document.getElementById('tv-settings-cat-playback')?.focus();
            return;
          }
          if (isUp) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const target = document.getElementById('playback-engine-embed') ||
                           document.getElementById('playback-engine-extractor') ||
                           document.getElementById('playback-engine-torbox');
            target?.focus();
            target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            return;
          }
          if (isDown) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const target = document.getElementById('priority-server-btn-0');
            target?.focus();
            target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            return;
          }
        }

        // From Priority Server Buttons (Slot 0, 1, 2):
        if (active.id && active.id.startsWith('priority-server-btn-')) {
          if (isDown) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const target = document.getElementById('playback-toggle-adshield');
            target?.focus();
            target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            return;
          }
          if (isLeft && active.id === 'priority-server-btn-0') {
            e.preventDefault();
            e.stopImmediatePropagation();
            document.getElementById('tv-settings-cat-playback')?.focus();
            return;
          }
          if (isUp) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const target = document.querySelector<HTMLElement>('[data-priority-tab-active="true"]') ||
                           document.getElementById('playback-tab-sub-general');
            target?.focus();
            target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            return;
          }
        }

        // From AdShield Toggle:
        if (active.id === 'playback-toggle-adshield') {
          if (isLeft) {
            e.preventDefault();
            e.stopImmediatePropagation();
            document.getElementById('tv-settings-cat-playback')?.focus();
            return;
          }
          if (isUp) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const target = document.getElementById('priority-server-btn-0');
            target?.focus();
            target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            return;
          }
        }
      }

      // ==========================================
      // 2. CONTENT CONTROLS PANEL NAV
      // ==========================================
      if (activeCategory === 'content') {
        // From Category Rail: ArrowRight -> Jump into selected maturity
        if (active.id === 'tv-settings-cat-content' && isRight) {
          e.preventDefault();
          e.stopImmediatePropagation();
          const target = document.querySelector<HTMLElement>('[data-content-maturity-selected="true"]') ||
                         document.getElementById('content-maturity-all');
          target?.focus();
          target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          return;
        }

        // From Maturity Buttons:
        if (active.getAttribute('data-content-maturity-selected') !== null) {
          if (isDown) {
            const id = active.id;
            // Lower row items: teen, older_kids, kids
            if (id === 'content-maturity-teen' || id === 'content-maturity-older_kids' || id === 'content-maturity-kids') {
              e.preventDefault();
              e.stopImmediatePropagation();
              document.getElementById('content-toggle-filterAdult')?.focus();
              return;
            }
          }
          if (isLeft && (active.id === 'content-maturity-all' || active.id === 'content-maturity-older_kids')) {
            e.preventDefault();
            e.stopImmediatePropagation();
            document.getElementById('tv-settings-cat-content')?.focus();
            return;
          }
        }

        // From Filter Adult Toggle:
        if (active.id === 'content-toggle-filterAdult') {
          if (isLeft) {
            e.preventDefault();
            e.stopImmediatePropagation();
            document.getElementById('tv-settings-cat-content')?.focus();
            return;
          }
          if (isUp) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const target = document.querySelector<HTMLElement>('[data-content-maturity-selected="true"]') ||
                           document.getElementById('content-maturity-all');
            target?.focus();
            target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            return;
          }
          if (isDown) {
            e.preventDefault();
            e.stopImmediatePropagation();
            document.getElementById('content-toggle-filterUnreleased')?.focus();
            return;
          }
        }

        // From Filter Unreleased Toggle:
        if (active.id === 'content-toggle-filterUnreleased') {
          if (isLeft) {
            e.preventDefault();
            e.stopImmediatePropagation();
            document.getElementById('tv-settings-cat-content')?.focus();
            return;
          }
          if (isUp) {
            e.preventDefault();
            e.stopImmediatePropagation();
            document.getElementById('content-toggle-filterAdult')?.focus();
            return;
          }
        }
      }
    };

    window.addEventListener('keydown', handleCaptureSpatialNav, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleCaptureSpatialNav, { capture: true });
    };
  }, [activeCategory, isPickerModalOpen, showEasterEgg, showUpdateModal, settings]);

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
                onKeyDown={(e) => {
                  if (e.key === 'ArrowRight') {
                    if (cat.id === 'playback') {
                      e.preventDefault();
                      const target = document.getElementById('playback-toggle-autoplay') ||
                                     document.querySelector<HTMLElement>('[data-settings-panel="true"] .tv-focus-target');
                      target?.focus();
                      target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                    } else if (cat.id === 'content') {
                      e.preventDefault();
                      const target = document.querySelector<HTMLElement>('[data-content-maturity-selected="true"]') ||
                                     document.getElementById('content-maturity-all');
                      target?.focus();
                      target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                    }
                  }
                }}
                className={`w-full p-3.5 rounded-2xl border text-left transition-all tv-focus-target flex items-center justify-between gap-3 min-h-[66px] ${
                  isSelected
                    ? 'bg-gradient-to-r from-hbo-purple/60 via-hbo-purple/30 to-hbo-cyan/20 border-hbo-cyan shadow-hbo-glow text-white ring-2 ring-hbo-cyan/60'
                    : 'bg-hbo-card/70 border-hbo-border hover:bg-hbo-hover hover:border-white/20 text-gray-300'
                }`}
              >
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  <Icon className={`w-5 h-5 flex-shrink-0 stroke-[2.2] transition-colors ${
                    isSelected ? 'text-hbo-cyan' : 'text-gray-400'
                  }`} />
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
                  id="playback-toggle-autoplay"
                  onClick={() => handleUpdate({ autoplayNext: settings.autoplayNext === false ? true : false })}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowLeft') {
                      e.preventDefault();
                      document.getElementById('tv-settings-cat-playback')?.focus();
                    } else if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      if (settings.autoplayNext !== false) {
                        const selectedTrigger = document.querySelector<HTMLElement>('[data-playback-trigger-selected="true"]') ||
                                                document.getElementById('playback-btn-trigger-0');
                        selectedTrigger?.focus();
                        selectedTrigger?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                      } else {
                        const selectedTicker = document.querySelector<HTMLElement>('[data-playback-ticker-selected="true"]') ||
                                               document.getElementById('playback-btn-ticker-0');
                        selectedTicker?.focus();
                        selectedTicker?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                      }
                    }
                  }}
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
                        {settings.upNextTriggerPercent || 96}% Progress
                      </span>
                    </div>

                    <div className="grid grid-cols-5 gap-2">
                      {[
                        { percent: 96, label: '96%', desc: 'Credits' },
                        { percent: 98, label: '98%', desc: 'Late' },
                        { percent: 100, label: '100%', desc: 'End' },
                        { percent: 102, label: '102%', desc: 'Outro' },
                        { percent: 104, label: '104%', desc: 'Max' },
                      ].map((opt, idx) => {
                        const isSelected = (settings.upNextTriggerPercent || 96) === opt.percent;
                        return (
                          <button
                            key={opt.percent}
                            id={`playback-btn-trigger-${idx}`}
                            data-playback-trigger-selected={isSelected ? 'true' : 'false'}
                            type="button"
                            onClick={() => handleUpdate({ upNextTriggerPercent: opt.percent })}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowLeft' && idx === 0) {
                                e.preventDefault();
                                document.getElementById('tv-settings-cat-playback')?.focus();
                              } else if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                document.getElementById('playback-toggle-autoplay')?.focus();
                              } else if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                const target = document.querySelector<HTMLElement>('[data-playback-timeout-selected="true"]') ||
                                               document.getElementById('playback-btn-timeout-0');
                                target?.focus();
                                target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                              }
                            }}
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
                        {settings.upNextTimeout || 20} Seconds
                      </span>
                    </div>

                    <div className="grid grid-cols-4 gap-2.5">
                      {[
                        { seconds: 20, label: '20s', desc: 'Standard' },
                        { seconds: 40, label: '40s', desc: 'Medium' },
                        { seconds: 60, label: '60s', desc: 'Relaxed' },
                        { seconds: 80, label: '80s', desc: 'Extended' },
                      ].map((opt, idx) => {
                        const isSelected = (settings.upNextTimeout || 20) === opt.seconds;
                        return (
                          <button
                            key={opt.seconds}
                            id={`playback-btn-timeout-${idx}`}
                            data-playback-timeout-selected={isSelected ? 'true' : 'false'}
                            onClick={() => handleUpdate({ upNextTimeout: opt.seconds })}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowLeft' && idx === 0) {
                                e.preventDefault();
                                document.getElementById('tv-settings-cat-playback')?.focus();
                              } else if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                const target = document.querySelector<HTMLElement>('[data-playback-trigger-selected="true"]') ||
                                               document.getElementById('playback-btn-trigger-0');
                                target?.focus();
                                target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                              } else if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                const target = document.querySelector<HTMLElement>('[data-playback-ticker-selected="true"]') ||
                                               document.getElementById('playback-btn-ticker-0');
                                target?.focus();
                                target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                              }
                            }}
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

              {/* Row 4: Watch Progress Update Interval (Embed / KissKH) */}
              <div
                data-settings-row="true"
                className="bg-hbo-card border border-hbo-border rounded-2xl p-4 shadow-lg space-y-2.5"
              >
                <div className="flex items-center justify-between mb-0.5">
                  <div>
                    <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-hbo-cyan flex-shrink-0" />
                      <span>Watch Progress Update Interval</span>
                    </h4>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      How frequently playback progress is tracked and saved for web embed streams (e.g. KissKH).
                    </p>
                  </div>
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-black/80 border border-hbo-border text-hbo-cyan font-bold flex-shrink-0">
                    {settings.watchProgressTickerInterval || 5}s
                  </span>
                </div>

                <div className="grid grid-cols-5 gap-2">
                  {[
                    { seconds: 1, label: '1s', desc: 'Realtime' },
                    { seconds: 2, label: '2s', desc: 'Mobile Default' },
                    { seconds: 3, label: '3s', desc: 'Frequent' },
                    { seconds: 5, label: '5s', desc: 'TV Default' },
                    { seconds: 10, label: '10s', desc: 'Eco Mode' },
                  ].map((opt, idx) => {
                    const currentVal = settings.watchProgressTickerInterval || 5;
                    const isSelected = currentVal === opt.seconds;
                    return (
                      <button
                        key={opt.seconds}
                        id={`playback-btn-ticker-${idx}`}
                        data-playback-ticker-selected={isSelected ? 'true' : 'false'}
                        type="button"
                        onClick={() => handleUpdate({ watchProgressTickerInterval: opt.seconds })}
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowLeft' && idx === 0) {
                            e.preventDefault();
                            document.getElementById('tv-settings-cat-playback')?.focus();
                          } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            if (settings.autoplayNext !== false) {
                              const target = document.querySelector<HTMLElement>('[data-playback-timeout-selected="true"]') ||
                                             document.getElementById('playback-btn-timeout-0');
                              target?.focus();
                              target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                            } else {
                              document.getElementById('playback-toggle-autoplay')?.focus();
                            }
                          } else if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            const target = document.querySelector<HTMLElement>('[data-playback-resolver-timeout-selected="true"]') ||
                                           document.getElementById('playback-btn-resolver-timeout-0');
                            target?.focus();
                            target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                          }
                        }}
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

              {/* Row 4b: Provider Stream Resolution Timeout */}
              <div
                data-settings-row="true"
                className="bg-hbo-card border border-hbo-border rounded-2xl p-4 shadow-lg space-y-2.5"
              >
                <div className="flex items-center justify-between mb-0.5">
                  <div>
                    <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-hbo-cyan flex-shrink-0" />
                      <span>Stream Resolver Timeout</span>
                    </h4>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Max time allowed for fast-path providers (KissKH, LARI21) before auto-failing over to backup servers.
                    </p>
                  </div>
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-black/80 border border-hbo-border text-hbo-cyan font-bold flex-shrink-0">
                    {`${settings.streamResolverTimeout || 5} Seconds`}
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-2.5">
                  {[
                    { seconds: 3, label: '3 Seconds', desc: 'Aggressive failover' },
                    { seconds: 5, label: '5 Seconds (Default)', desc: 'Balanced' },
                    { seconds: 8, label: '8 Seconds', desc: 'Patient connection' },
                    { seconds: 12, label: '12 Seconds', desc: 'Slow network/Wi-Fi' }
                  ].map((opt, idx) => {
                    const isSelected = (settings.streamResolverTimeout ?? 5) === opt.seconds;
                    return (
                      <button
                        key={opt.seconds}
                        id={`playback-btn-resolver-timeout-${idx}`}
                        data-playback-resolver-timeout-selected={isSelected ? 'true' : 'false'}
                        onClick={() => handleUpdate({ streamResolverTimeout: opt.seconds })}
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowLeft' && idx === 0) {
                            e.preventDefault();
                            document.getElementById('tv-settings-cat-playback')?.focus();
                          } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            const target = document.querySelector<HTMLElement>('[data-playback-ticker-selected="true"]') ||
                                           document.getElementById('playback-btn-ticker-0');
                            target?.focus();
                            target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                          } else if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            const nextTarget = document.getElementById('playback-engine-torbox');
                            nextTarget?.focus();
                            nextTarget?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                          }
                        }}
                        className={`p-3 rounded-xl border text-left transition-all tv-focus-target min-h-[68px] flex flex-col justify-between ${
                          isSelected
                            ? 'bg-hbo-purple/40 border-hbo-cyan text-white shadow-lg ring-1 ring-hbo-cyan/50 font-bold'
                            : 'bg-hbo-dark/60 border-hbo-border hover:bg-hbo-hover hover:border-white/20 text-gray-300'
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
                      id="playback-engine-torbox"
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
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowLeft') {
                          e.preventDefault();
                          document.getElementById('tv-settings-cat-playback')?.focus();
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          const target = document.querySelector<HTMLElement>('[data-playback-resolver-timeout-selected="true"]') ||
                                         document.getElementById('playback-btn-resolver-timeout-0');
                          target?.focus();
                          target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                        }
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
                    id="playback-input-torbox-apikey"
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
                      id="playback-engine-extractor"
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
                      id="playback-engine-embed"
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

                {/* Sub-tab: General Content vs Anime vs Asian */}
                <div className="flex items-center gap-2 p-1 bg-black/40 border border-white/10 rounded-xl w-fit">
                  <button
                    type="button"
                    id="playback-tab-sub-general"
                    data-priority-tab-active={priorityCategoryTab === 'general' ? 'true' : 'false'}
                    onClick={() => {
                      setPriorityCategoryTab('general');
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all tv-focus-target ${
                      priorityCategoryTab === 'general'
                        ? 'bg-hbo-purple text-white shadow-md'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    General
                  </button>
                  <button
                    type="button"
                    id="playback-tab-sub-anime"
                    data-priority-tab-active={priorityCategoryTab === 'anime' ? 'true' : 'false'}
                    onClick={() => {
                      setPriorityCategoryTab('anime');
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all tv-focus-target ${
                      priorityCategoryTab === 'anime'
                        ? 'bg-gradient-to-r from-pink-600 to-purple-600 text-white shadow-md'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    Anime
                  </button>
                  <button
                    type="button"
                    id="playback-tab-sub-asian"
                    data-priority-tab-active={priorityCategoryTab === 'asian' ? 'true' : 'false'}
                    onClick={() => {
                      setPriorityCategoryTab('asian');
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all tv-focus-target ${
                      priorityCategoryTab === 'asian'
                        ? 'bg-gradient-to-r from-amber-600 to-red-600 text-white shadow-md'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    Asean
                  </button>
                  <button
                    type="button"
                    id="playback-tab-sub-korean"
                    data-priority-tab-active={priorityCategoryTab === 'korean' ? 'true' : 'false'}
                    onClick={() => {
                      setPriorityCategoryTab('korean');
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all tv-focus-target ${
                      priorityCategoryTab === 'korean'
                        ? 'bg-gradient-to-r from-rose-600 to-pink-600 text-white shadow-md'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    Korean
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  {(priorityCategoryTab === 'korean'
                    ? [
                        { index: 0, priorityLabel: 'Korean #1 (Primary)', badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40', defaultId: 'kisskh-kdrama' },
                        { index: 1, priorityLabel: 'Korean #2 (Failover 1)', badgeClass: 'bg-hbo-purple/30 text-hbo-purple-light border-hbo-purple/40', defaultId: 'cinesrc' },
                        { index: 2, priorityLabel: 'Korean #3 (Failover 2)', badgeClass: 'bg-hbo-cyan/20 text-hbo-cyan border-hbo-cyan/40', defaultId: 'moviesapi' }
                      ]
                    : priorityCategoryTab === 'asian'
                    ? [
                        { index: 0, priorityLabel: 'Asean #1 (Primary)', badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40', defaultId: 'vidlink' },
                        { index: 1, priorityLabel: 'Asean #2 (Failover 1)', badgeClass: 'bg-hbo-purple/30 text-hbo-purple-light border-hbo-purple/40', defaultId: '111movies' },
                        { index: 2, priorityLabel: 'Asean #3 (Failover 2)', badgeClass: 'bg-hbo-cyan/20 text-hbo-cyan border-hbo-cyan/40', defaultId: 'lari21-asian' }
                      ]
                    : priorityCategoryTab === 'anime'
                    ? [
                        { index: 0, priorityLabel: 'Anime #1 (Primary)', badgeClass: 'bg-pink-500/20 text-pink-300 border-pink-500/40', defaultId: 'megaplay-anime' },
                        { index: 1, priorityLabel: 'Anime #2 (Failover 1)', badgeClass: 'bg-hbo-purple/30 text-hbo-purple-light border-hbo-purple/40', defaultId: 'cinesrc' },
                        { index: 2, priorityLabel: 'Anime #3 (Failover 2)', badgeClass: 'bg-hbo-cyan/20 text-hbo-cyan border-hbo-cyan/40', defaultId: 'moviesapi' }
                      ]
                    : [
                        { index: 0, priorityLabel: '#1 Priority (Primary)', badgeClass: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40', defaultId: 'vidlink' },
                        { index: 1, priorityLabel: '#2 Priority (Failover 1)', badgeClass: 'bg-hbo-purple/30 text-hbo-purple-light border-hbo-purple/40', defaultId: 'moviesapi' },
                        { index: 2, priorityLabel: '#3 Priority (Failover 2)', badgeClass: 'bg-hbo-cyan/20 text-hbo-cyan border-hbo-cyan/40', defaultId: 'cinesrc' }
                      ]
                  ).map(({ index, priorityLabel, badgeClass, defaultId }) => {
                    const isKoreanTab = priorityCategoryTab === 'korean';
                    const isAsianTab = priorityCategoryTab === 'asian';
                    const isAnimeTab = priorityCategoryTab === 'anime';
                    const currentTop = isKoreanTab
                      ? (settings.topKoreanProviders && settings.topKoreanProviders.length >= 3
                          ? settings.topKoreanProviders
                          : ['kisskh-kdrama', 'cinesrc', 'moviesapi'])
                      : isAsianTab
                      ? (settings.topAsianProviders && settings.topAsianProviders.length >= 3
                          ? settings.topAsianProviders
                          : ['vidlink', '111movies', 'lari21-asian'])
                      : isAnimeTab
                      ? (settings.topAnimeProviders && settings.topAnimeProviders.length >= 3
                          ? settings.topAnimeProviders
                          : ['megaplay-anime', 'cinesrc', 'moviesapi'])
                      : (settings.topProviders && settings.topProviders.length >= 3
                          ? settings.topProviders
                          : ['vidlink', 'moviesapi', 'cinesrc']);
                    const selectedId = currentTop[index] || defaultId;
                    const selectedProviderObj = STREAM_PROVIDERS.find(p => p.id === selectedId) || STREAM_PROVIDERS[0];

                    return (
                      <div
                        key={`${priorityCategoryTab}-${index}`}
                        className="bg-hbo-dark/70 border border-hbo-border/90 rounded-xl p-2.5 flex flex-col justify-between gap-1.5"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-md border ${badgeClass}`}>
                            {priorityLabel}
                          </span>
                        </div>

                        <div>
                          <button
                            type="button"
                            id={`priority-server-btn-${index}`}
                            onClick={() => setPickerModalSlot(index)}
                            className="w-full flex items-center justify-between bg-hbo-card/90 border border-hbo-border text-white text-xs font-bold rounded-xl px-2.5 py-2 hover:bg-hbo-hover hover:border-hbo-cyan focus:outline-none focus:border-hbo-cyan focus:ring-2 focus:ring-hbo-cyan transition-all tv-focus-target"
                          >
                            <span className="truncate pr-1 text-xs">{selectedProviderObj.name}</span>
                            <ChevronDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
                          </button>
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
                  id="playback-toggle-adshield"
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
              {/* Row 1: Stream Header Auto-Hide Timeout */}
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

              {/* Row 4: Performance HUD Mode Selection */}
              <div
                data-settings-row="true"
                className="bg-hbo-card border border-hbo-border rounded-2xl p-4 shadow-lg space-y-3"
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm sm:text-base font-bold font-display text-white">Performance HUD</span>
                      <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-hbo-cyan/10 text-hbo-cyan border border-hbo-cyan/20">
                        Debug Tool
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400">
                      Display real-time CPU %, GPU usage, and RAM consumption.
                    </p>
                  </div>
                </div>

                {/* Segmented D-pad accessible options */}
                <div className="grid grid-cols-3 gap-2.5 pt-1">
                  {[
                    { id: 'off', label: 'Disabled', desc: 'HUD is completely hidden' },
                    { id: 'watch_only', label: 'Watch Page Only', desc: 'Only visible while playing video' },
                    { id: 'all_pages', label: 'All Pages', desc: 'Visible throughout entire app' }
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
                        onClick={() => handleUpdate({ showPerformanceHud: opt.id as any })}
                        className={`p-3 rounded-xl border text-left transition-all tv-focus-target min-h-[64px] flex flex-col justify-between ${
                          isSelected
                            ? 'bg-hbo-cyan/20 border-hbo-cyan text-white shadow-hbo-glow ring-1 ring-hbo-cyan/50'
                            : 'bg-hbo-dark/60 border-hbo-border text-gray-400 hover:text-gray-200 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <p className={`text-xs font-bold ${isSelected ? 'text-hbo-cyan' : 'text-white'}`}>
                            {opt.label}
                          </p>
                          {isSelected && (
                            <Check className="w-3.5 h-3.5 text-hbo-cyan stroke-[2.5]" />
                          )}
                        </div>
                        <p className="text-[9px] text-gray-400 mt-0.5 leading-snug">{opt.desc}</p>
                      </button>
                    );
                  })}
                </div>
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

                <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {[
                    { id: 'all', label: 'All Ratings (18+)', desc: 'Unrestricted: R, TV-MA, NC-17, 18, 21+' },
                    { id: 'mature', label: 'Young Adult (16+)', desc: 'Up to R / 15 / 16 (Excludes NC-17, 18SX)' },
                    { id: 'teen', label: 'Teens (13+)', desc: 'Up to PG-13 / 12A / TV-14 (Excludes R)' },
                    { id: 'older_kids', label: 'Older Kids (7+)', desc: 'Up to PG / TV-PG (Gentle scares, fantasy)' },
                    { id: 'kids', label: 'Little Kids (All Ages)', desc: 'Strictly G / U / TV-Y / TV-G (Preschool & family)' },
                  ].map((lvl, idx) => {
                    const currentMaturity = settings.maturityLevel === 'pg13' ? 'teen' : settings.maturityLevel === 'family' ? 'older_kids' : (settings.maturityLevel || 'all');
                    const isSelected = currentMaturity === lvl.id;
                    return (
                      <button
                        key={lvl.id}
                        id={`content-maturity-${lvl.id}`}
                        data-content-maturity-selected={isSelected ? 'true' : 'false'}
                        onClick={() => handleUpdate({ maturityLevel: lvl.id as any })}
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowLeft' && (idx === 0 || idx === 3)) {
                            e.preventDefault();
                            document.getElementById('tv-settings-cat-content')?.focus();
                          } else if (e.key === 'ArrowDown') {
                            if (idx >= 2) {
                              e.preventDefault();
                              document.getElementById('content-toggle-filterAdult')?.focus();
                            }
                          }
                        }}
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
                    SafeSearch mode: Excludes explicit sexual and adult rated media (18SX, 19, R18+, NC-17, R21, Cat III, softcore) from search queries and catalogs.
                  </p>
                </div>

                <button
                  id="content-toggle-filterAdult"
                  onClick={() => handleUpdate({ filterAdult: settings.filterAdult === false ? true : false })}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowLeft') {
                      e.preventDefault();
                      document.getElementById('tv-settings-cat-content')?.focus();
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      const target = document.querySelector<HTMLElement>('[data-content-maturity-selected="true"]') ||
                                     document.getElementById('content-maturity-all');
                      target?.focus();
                      target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                    } else if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      document.getElementById('content-toggle-filterUnreleased')?.focus();
                    }
                  }}
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
                  id="content-toggle-filterUnreleased"
                  onClick={() => handleUpdate({ filterUnreleased: settings.filterUnreleased === false ? true : false })}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowLeft') {
                      e.preventDefault();
                      document.getElementById('tv-settings-cat-content')?.focus();
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      document.getElementById('content-toggle-filterAdult')?.focus();
                    }
                  }}
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

              {/* Row 4: Persistent Storage & Backup */}
              <div
                data-settings-row="true"
                className="bg-hbo-card border border-hbo-border rounded-2xl p-4 sm:p-5 shadow-lg space-y-4"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0 pr-2">
                    <h4 className="text-sm sm:text-base font-bold text-gray-200 flex items-center gap-2 mb-0.5">
                      <HardDrive className="w-4 h-4 text-hbo-cyan" />
                      <span>Persistent Storage & Backup</span>
                    </h4>
                    <p className="text-[11px] text-gray-400">
                      Saves your history, settings, and watchlist outside app storage so they survive app uninstalls.
                    </p>
                  </div>
                  {backupMeta.available && (
                    <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[10px] font-mono flex-shrink-0">
                      Auto-Protected
                    </span>
                  )}
                </div>

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

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                  <button
                    type="button"
                    onClick={handleBackupNow}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white transition tv-focus-target active:scale-95"
                  >
                    <Save className="w-3.5 h-3.5 text-hbo-cyan" />
                    <span>Backup Now</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleRestoreNow}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white transition tv-focus-target active:scale-95"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                    <span>Restore</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportJson}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-gray-300 hover:text-white transition tv-focus-target active:scale-95"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Export JSON</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-gray-300 hover:text-white transition tv-focus-target active:scale-95"
                  >
                    <Upload className="w-3.5 h-3.5 text-purple-400" />
                    <span>Import JSON</span>
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

              {/* Row 5: Version Info & Easter Egg Card */}
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

      {/* Android TV Priority Server Picker Modal Dialog */}
      {pickerModalSlot !== null && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[9999] flex items-center justify-center p-6 bg-black/85 backdrop-blur-xl animate-fade-in"
          onClick={() => {
            const slot = pickerModalSlot;
            setPickerModalSlot(null);
            setTimeout(() => {
              document.getElementById(`priority-server-btn-${slot}`)?.focus();
            }, 50);
          }}
        >
          <div
            className="relative w-full max-w-xl bg-hbo-card/98 border border-hbo-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 border-b border-hbo-border/70 bg-black/60 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 rounded-xl bg-hbo-purple/20 border border-hbo-purple/40 text-hbo-cyan">
                  <Server className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-white">
                    Select Server (Slot #{pickerModalSlot + 1})
                  </h3>
                  <p className="text-[11px] text-gray-400">
                    Category: <span className="font-semibold text-hbo-cyan capitalize">{priorityCategoryTab}</span> • {STREAM_PROVIDERS.length} available
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const slot = pickerModalSlot;
                  setPickerModalSlot(null);
                  setTimeout(() => {
                    document.getElementById(`priority-server-btn-${slot}`)?.focus();
                  }, 50);
                }}
                className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-gray-400 hover:text-white transition-all tv-focus-target"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Server List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2 focus-scroll-container">
              {(() => {
                const isKoreanTab = priorityCategoryTab === 'korean';
                const isAsianTab = priorityCategoryTab === 'asian';
                const isAnimeTab = priorityCategoryTab === 'anime';
                const currentTop = isKoreanTab
                  ? (settings.topKoreanProviders && settings.topKoreanProviders.length >= 3
                      ? settings.topKoreanProviders
                      : ['kisskh-kdrama', 'cinesrc', 'moviesapi'])
                  : isAsianTab
                  ? (settings.topAsianProviders && settings.topAsianProviders.length >= 3
                      ? settings.topAsianProviders
                      : ['vidlink', '111movies', 'lari21-asian'])
                  : isAnimeTab
                  ? (settings.topAnimeProviders && settings.topAnimeProviders.length >= 3
                      ? settings.topAnimeProviders
                      : ['megaplay-anime', 'cinesrc', 'moviesapi'])
                  : (settings.topProviders && settings.topProviders.length >= 3
                      ? settings.topProviders
                      : ['vidlink', 'moviesapi', 'cinesrc']);
                const currentSelectedId = currentTop[pickerModalSlot] || STREAM_PROVIDERS[0].id;

                return STREAM_PROVIDERS.map((provider, itemIdx) => {
                  const isSelected = currentSelectedId === provider.id;
                  return (
                    <button
                      key={provider.id}
                      type="button"
                      data-server-modal-item="true"
                      data-provider-selected={isSelected ? 'true' : 'false'}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          e.stopPropagation();
                          const allButtons = Array.from(document.querySelectorAll<HTMLElement>('[data-server-modal-item="true"]'));
                          if (itemIdx < allButtons.length - 1) {
                            allButtons[itemIdx + 1].focus();
                            allButtons[itemIdx + 1].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                          }
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          e.stopPropagation();
                          const allButtons = Array.from(document.querySelectorAll<HTMLElement>('[data-server-modal-item="true"]'));
                          if (itemIdx > 0) {
                            allButtons[itemIdx - 1].focus();
                            allButtons[itemIdx - 1].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                          }
                        }
                      }}
                      onClick={() => {
                        const updated = [...currentTop] as [string, string, string];
                        updated[pickerModalSlot] = provider.id;
                        if (isKoreanTab) {
                          handleUpdate({ topKoreanProviders: updated });
                        } else if (isAsianTab) {
                          handleUpdate({ topAsianProviders: updated });
                        } else if (isAnimeTab) {
                          handleUpdate({ topAnimeProviders: updated });
                        } else {
                          handleUpdate({ topProviders: updated, preferredProvider: updated[0] });
                        }
                        const slot = pickerModalSlot;
                        setPickerModalSlot(null);
                        setTimeout(() => {
                          document.getElementById(`priority-server-btn-${slot}`)?.focus();
                        }, 50);
                      }}
                      className={`w-full flex items-center justify-between gap-3 p-3 rounded-xl text-left transition-all tv-focus-target border ${
                        isSelected
                          ? 'bg-hbo-purple/40 border-hbo-cyan text-white shadow-hbo-glow ring-1 ring-hbo-cyan/50'
                          : 'bg-black/30 border-white/5 text-gray-300 hover:bg-hbo-hover hover:border-white/20'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className="font-bold text-xs sm:text-sm text-white truncate">{provider.name}</span>
                          {isSelected && (
                            <div className="flex items-center gap-1 text-[11px] font-bold text-hbo-cyan">
                              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                              <span>Current</span>
                            </div>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-400 line-clamp-1">{provider.tagline}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {provider.badge === 'Anime' && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-pink-500/20 text-pink-300 border border-pink-500/30 font-semibold">Anime Specialist</span>
                          )}
                          {provider.badge === 'Asian' && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">Asian Specialist</span>
                          )}
                          {provider.badge === 'TorBox' && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold">TorBox Debrid</span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                });
              })()}
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-hbo-border/70 bg-black/60 flex items-center justify-between text-[11px] text-gray-400">
              <span>Press <strong className="text-white">OK/Select</strong> to choose • <strong className="text-white">Back</strong> to cancel</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
