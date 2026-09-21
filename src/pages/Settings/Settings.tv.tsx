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
  ChevronRight,
  MousePointer,
  Radio,
  FileText,
  Clock,
  Percent,
  Info,
  Download,
  Upload,
  HardDrive,
  Globe,
  Sliders,
  Save,
  Send,
  Trash2,
  Terminal,
  ExternalLink,
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
  const [priorityCategoryTab, setPriorityCategoryTab] = useState<'general' | 'anime' | 'asean' | 'korean'>('general');
  const [pickerModalSlot, setPickerModalSlot] = useState<number | null>(null);
  const [showMaturityDrawer, setShowMaturityDrawer] = useState(false);
  const [showTriggerDrawer, setShowTriggerDrawer] = useState(false);
  const [showAutoplayDrawer, setShowAutoplayDrawer] = useState(false);
  const [showAutoplayTriggerDrawer, setShowAutoplayTriggerDrawer] = useState(false);
  const [showAutoplayTimeoutDrawer, setShowAutoplayTimeoutDrawer] = useState(false);
  const [showEnginesDrawer, setShowEnginesDrawer] = useState(false);
  const [showEnginePriorityDrawer, setShowEnginePriorityDrawer] = useState(false);
  const [showTelegramDrawer, setShowTelegramDrawer] = useState(false);
  const [showTelegramMsmDrawer, setShowTelegramMsmDrawer] = useState(false);
  const [showTelegramUrlDrawer, setShowTelegramUrlDrawer] = useState(false);
  const [showTelegramChunkDrawer, setShowTelegramChunkDrawer] = useState(false);
  const [showTelegramCountryDrawer, setShowTelegramCountryDrawer] = useState(false);
  const [showEmbedResolverDrawer, setShowEmbedResolverDrawer] = useState(false);
  const [showEmbedTimeoutDrawer, setShowEmbedTimeoutDrawer] = useState(false);
  const [showEmbedRetryDrawer, setShowEmbedRetryDrawer] = useState(false);
  const [activePriorityDrawer, setActivePriorityDrawer] = useState<'general' | 'anime' | 'asean' | 'korean' | null>(null);
  const [showTickerDrawer, setShowTickerDrawer] = useState(false);
  const [showHeaderTimeoutDrawer, setShowHeaderTimeoutDrawer] = useState(false);
  const [showPerfHudDrawer, setShowPerfHudDrawer] = useState(false);
  const [showBackupDrawer, setShowBackupDrawer] = useState(false);
  const [testingMsm32, setTestingMsm32] = useState(false);
  const [msm32TestResult, setMsm32TestResult] = useState<Msm32HealthResult | null>(null);
  const [msmUrlInput, setMsmUrlInput] = useState<string>('');
  const clickCountRef = useRef(0);
  const clickTimerRef = useRef<NodeJS.Timeout | null>(null);
  const { detectedPlatform, activeLayout } = useDevice();

  const isPickerModalOpen = pickerModalSlot !== null;
  const isAnyModalOpen = isPickerModalOpen || showMaturityDrawer || showTriggerDrawer || showAutoplayDrawer || showAutoplayTriggerDrawer || showAutoplayTimeoutDrawer || showEnginesDrawer || showEnginePriorityDrawer || showTelegramDrawer || showTelegramMsmDrawer || showTelegramUrlDrawer || showTelegramChunkDrawer || showTelegramCountryDrawer || showEmbedResolverDrawer || showEmbedTimeoutDrawer || showEmbedRetryDrawer || activePriorityDrawer !== null || showTickerDrawer || showHeaderTimeoutDrawer || showPerfHudDrawer || showBackupDrawer;

  // Viewport scroll helpers for TV remote navigation (snaps to absolute top / bottom)
  const scrollToPanelTop = () => {
    if (contentPanelRef.current) {
      contentPanelRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const scrollToPanelBottom = () => {
    if (contentPanelRef.current) {
      contentPanelRef.current.scrollTo({ top: contentPanelRef.current.scrollHeight, behavior: 'smooth' });
    }
  };

  // Reset scroll position of child panel when activeCategory changes
  useEffect(() => {
    if (contentPanelRef.current) {
      contentPanelRef.current.scrollTo({ top: 0, behavior: 'instant' as any });
    }
  }, [activeCategory]);

  // Keep local msmUrlInput in sync with persisted settings
  useEffect(() => {
    if (settings?.msm32GetterUrl !== undefined) {
      setMsmUrlInput(settings.msm32GetterUrl || 'http://julietmike.net:3033');
    }
  }, [settings?.msm32GetterUrl]);

  // Auto-ping MSM Getter microservice whenever the user enters the Telegram provider or MSM32 drawer
  useEffect(() => {
    if (showTelegramDrawer || showTelegramMsmDrawer) {
      setTestingMsm32(true);
      setMsm32TestResult(null);
      const url = settings?.msm32GetterUrl;
      msm32Service.testConnection(url)
        .then((res) => {
          setMsm32TestResult(res);
        })
        .catch((err: any) => {
          setMsm32TestResult({ ok: false, error: err?.message || 'Connection failed' });
        })
        .finally(() => {
          setTestingMsm32(false);
        });
    }
  }, [showTelegramDrawer, showTelegramMsmDrawer, settings?.msm32GetterUrl]);

  useEffect(() => {
    try {
      (window as any).AndroidBridge?.setDropdownOpen?.(isAnyModalOpen);
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
    } else if (showMaturityDrawer) {
      setTimeout(() => {
        const selectedEl = document.querySelector<HTMLElement>('[data-maturity-drawer-item][data-maturity-selected="true"]') ||
                           document.querySelector<HTMLElement>('[data-maturity-drawer-item]');
        if (selectedEl) {
          selectedEl.focus();
          selectedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }, 50);
    } else if (showTriggerDrawer) {
      setTimeout(() => {
        const selectedEl = document.querySelector<HTMLElement>('[data-trigger-drawer-item][data-trigger-selected="true"]') ||
                           document.querySelector<HTMLElement>('[data-trigger-drawer-item]');
        if (selectedEl) {
          selectedEl.focus();
          selectedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }, 50);
    } else if (showAutoplayTriggerDrawer) {
      setTimeout(() => {
        const selectedEl = document.querySelector<HTMLElement>('[data-ap-trigger-drawer-item][data-ap-trigger-selected="true"]') ||
                           document.querySelector<HTMLElement>('[data-ap-trigger-drawer-item]');
        if (selectedEl) {
          selectedEl.focus();
          selectedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }, 50);
    } else if (showAutoplayTimeoutDrawer) {
      setTimeout(() => {
        const selectedEl = document.querySelector<HTMLElement>('[data-ap-timeout-drawer-item][data-ap-timeout-selected="true"]') ||
                           document.querySelector<HTMLElement>('[data-ap-timeout-drawer-item]');
        if (selectedEl) {
          selectedEl.focus();
          selectedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }, 50);
    } else if (showAutoplayDrawer) {
      setTimeout(() => {
        const defaultEl = document.getElementById('drawer-ap-toggle') ||
                          document.querySelector<HTMLElement>('[data-autoplay-drawer-item="true"]');
        if (defaultEl) {
          defaultEl.focus();
          defaultEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }, 50);
    } else if (showEnginesDrawer) {
      setTimeout(() => {
        const defaultEl = document.getElementById('drawer-engine-item-priority') ||
                          document.getElementById('drawer-engine-item-telegram') ||
                          document.querySelector<HTMLElement>('[data-engine-drawer-item="true"]');
        if (defaultEl) {
          defaultEl.focus();
          defaultEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }, 50);
    } else if (showEnginePriorityDrawer) {
      setTimeout(() => {
        const defaultEl = document.getElementById('drawer-prio-down-0') ||
                          document.getElementById('drawer-prio-up-0') ||
                          document.querySelector<HTMLElement>('[data-engine-prio-item="true"]');
        if (defaultEl) {
          defaultEl.focus();
          defaultEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }, 50);
    } else if (showTelegramDrawer) {
      setTimeout(() => {
        const defaultEl = document.getElementById('drawer-telegram-toggle') ||
                          document.querySelector<HTMLElement>('[data-telegram-drawer-item="true"]');
        if (defaultEl) {
          defaultEl.focus();
          defaultEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }, 50);
    } else if (showTelegramMsmDrawer) {
      setTimeout(() => {
        const defaultEl = document.getElementById('drawer-msm-toggle') ||
                          document.getElementById('drawer-msm32-sub-url') ||
                          document.querySelector<HTMLElement>('[data-telegram-msm-drawer-item="true"]');
        if (defaultEl) {
          defaultEl.focus();
          defaultEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }, 50);
    } else if (showTelegramUrlDrawer) {
      setTimeout(() => {
        const defaultEl = document.querySelector<HTMLElement>('[data-telegram-url-drawer-item][data-telegram-url-selected="true"]') ||
                          document.getElementById('drawer-msm-preset-render') ||
                          document.querySelector<HTMLElement>('[data-telegram-url-drawer-item]');
        if (defaultEl) {
          defaultEl.focus();
          defaultEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }, 50);
    } else if (showTelegramChunkDrawer) {
      setTimeout(() => {
        const selectedEl = document.querySelector<HTMLElement>('[data-telegram-chunk-drawer-item][data-telegram-chunk-selected="true"]') ||
                           document.querySelector<HTMLElement>('[data-telegram-chunk-drawer-item]');
        if (selectedEl) {
          selectedEl.focus();
          selectedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }, 50);
    } else if (showTelegramCountryDrawer) {
      setTimeout(() => {
        const defaultEl = document.getElementById('drawer-telegram-country-MY') ||
                          document.querySelector<HTMLElement>('[data-telegram-country-drawer-item]');
        if (defaultEl) {
          defaultEl.focus();
          defaultEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }, 50);
    } else if (showEmbedResolverDrawer) {
      setTimeout(() => {
        const defaultEl = document.getElementById('drawer-embed-toggle') ||
                          document.querySelector<HTMLElement>('[data-embed-drawer-item="true"]');
        if (defaultEl) {
          defaultEl.focus();
          defaultEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }, 50);
    } else if (showEmbedTimeoutDrawer) {
      setTimeout(() => {
        const selectedEl = document.querySelector<HTMLElement>('[data-embed-timeout-drawer-item][data-embed-timeout-selected="true"]') ||
                           document.querySelector<HTMLElement>('[data-embed-timeout-drawer-item]');
        if (selectedEl) {
          selectedEl.focus();
          selectedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }, 50);
    } else if (showEmbedRetryDrawer) {
      setTimeout(() => {
        const selectedEl = document.querySelector<HTMLElement>('[data-embed-retry-drawer-item][data-embed-retry-selected="true"]') ||
                           document.querySelector<HTMLElement>('[data-embed-retry-drawer-item]');
        if (selectedEl) {
          selectedEl.focus();
          selectedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }, 50);
    } else if (showEmbedResolverDrawer) {

      setTimeout(() => {
        const defaultEl = document.getElementById('drawer-embed-sub-timeout') ||
                          document.querySelector<HTMLElement>('[data-embed-drawer-item="true"]');
        if (defaultEl) {
          defaultEl.focus();
          defaultEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }, 50);
    } else if (activePriorityDrawer !== null) {
      setTimeout(() => {
        const defaultEl = document.getElementById('priority-server-btn-0') ||
                          document.querySelector<HTMLElement>('[data-priority-server-item="true"]');
        if (defaultEl) {
          defaultEl.focus();
          defaultEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }, 50);
    } else if (showTickerDrawer) {
      setTimeout(() => {
        const selectedEl = document.querySelector<HTMLElement>('[data-ticker-drawer-item][data-ticker-selected="true"]') ||
                           document.querySelector<HTMLElement>('[data-ticker-drawer-item]');
        if (selectedEl) {
          selectedEl.focus();
          selectedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }, 50);
    } else if (showHeaderTimeoutDrawer) {
      setTimeout(() => {
        const selectedEl = document.querySelector<HTMLElement>('[data-headertimeout-drawer-item][data-headertimeout-selected="true"]') ||
                           document.querySelector<HTMLElement>('[data-headertimeout-drawer-item]');
        if (selectedEl) {
          selectedEl.focus();
          selectedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }, 50);
    } else if (showPerfHudDrawer) {
      setTimeout(() => {
        const selectedEl = document.querySelector<HTMLElement>('[data-perfhud-drawer-item][data-perfhud-selected="true"]') ||
                           document.querySelector<HTMLElement>('[data-perfhud-drawer-item]');
        if (selectedEl) {
          selectedEl.focus();
          selectedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }, 50);
    } else if (showBackupDrawer) {
      setTimeout(() => {
        const defaultEl = document.getElementById('drawer-backup-btn-now') ||
                          document.querySelector<HTMLElement>('[data-backup-drawer-item="true"]');
        if (defaultEl) {
          defaultEl.focus();
          defaultEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }, 50);
    }

    return () => {
      try {
        (window as any).AndroidBridge?.setDropdownOpen?.(false);
      } catch {}
    };
  }, [pickerModalSlot, isPickerModalOpen, showMaturityDrawer, showTriggerDrawer, showAutoplayDrawer, showAutoplayTriggerDrawer, showAutoplayTimeoutDrawer, showEnginesDrawer, showEnginePriorityDrawer, showTelegramDrawer, showTelegramMsmDrawer, showTelegramUrlDrawer, showTelegramChunkDrawer, showTelegramCountryDrawer, showEmbedResolverDrawer, showEmbedTimeoutDrawer, showEmbedRetryDrawer, activePriorityDrawer, showTickerDrawer, showHeaderTimeoutDrawer, showPerfHudDrawer, showBackupDrawer, isAnyModalOpen]);

  // Handle remote Back button, tmdb_close_dropdowns, and Escape dismissal for modals / drawers
  useEffect(() => {
    const handleCloseFromEvent = () => {
      // Level 4 Picker Modal inside Category Priority Drawer
      if (pickerModalSlot !== null) {
        const slot = pickerModalSlot;
        setPickerModalSlot(null);
        setTimeout(() => {
          document.getElementById(`priority-server-btn-${slot}`)?.focus();
        }, 50);
        return;
      }
      // Level 3 Category Priority Server Drawer (General, Anime, Asean, Korean): Return to Embed Resolver Drawer
      if (activePriorityDrawer !== null) {
        const cat = activePriorityDrawer;
        setActivePriorityDrawer(null);
        setShowEmbedResolverDrawer(true);
        setTimeout(() => {
          document.getElementById(`drawer-embed-priority-${cat}`)?.focus();
        }, 50);
        return;
      }
      // Level 3 Timeout Drawer inside Embed Resolver: Return to Embed Resolver Drawer
      if (showEmbedTimeoutDrawer) {
        setShowEmbedTimeoutDrawer(false);
        setShowEmbedResolverDrawer(true);
        setTimeout(() => {
          document.getElementById('drawer-embed-sub-timeout')?.focus();
        }, 50);
        return;
      }
      // Level 3 Drawers inside Telegram: Return to Telegram Drawer
      if (showTelegramMsmDrawer) {
        setShowTelegramMsmDrawer(false);
        setShowTelegramDrawer(true);
        setTimeout(() => {
          document.getElementById('drawer-msm32-sub')?.focus();
        }, 50);
        return;
      }
      if (showTelegramUrlDrawer) {
        setShowTelegramUrlDrawer(false);
        setShowTelegramMsmDrawer(true);
        setTimeout(() => {
          document.getElementById('drawer-msm32-sub-url')?.focus();
        }, 50);
        return;
      }
      if (showTelegramChunkDrawer) {
        setShowTelegramChunkDrawer(false);
        setShowTelegramMsmDrawer(true);
        setTimeout(() => {
          document.getElementById('drawer-msm32-sub-chunk')?.focus();
        }, 50);
        return;
      }
      if (showTelegramCountryDrawer) {
        setShowTelegramCountryDrawer(false);
        setShowTelegramMsmDrawer(true);
        setTimeout(() => {
          document.getElementById('drawer-msm32-sub-country')?.focus();
        }, 50);
        return;
      }
      // Level 2 Drawers: Return to Level 1 Autoplay Drawer
      if (showAutoplayTriggerDrawer) {
        setShowAutoplayTriggerDrawer(false);
        setShowAutoplayDrawer(true);
        return;
      }
      if (showAutoplayTimeoutDrawer) {
        setShowAutoplayTimeoutDrawer(false);
        setShowAutoplayDrawer(true);
        return;
      }
      // Level 2 Drawers: Return to Level 1 Engines Drawer
      if (showEnginePriorityDrawer) {
        setShowEnginePriorityDrawer(false);
        setShowEnginesDrawer(true);
        setTimeout(() => {
          document.getElementById('drawer-engine-item-priority')?.focus();
        }, 50);
        return;
      }
      if (showTelegramDrawer) {
        setShowTelegramDrawer(false);
        setShowEnginesDrawer(true);
        setTimeout(() => {
          document.getElementById('drawer-engine-item-telegram')?.focus();
        }, 50);
        return;
      }
      if (showEmbedResolverDrawer) {
        setShowEmbedResolverDrawer(false);
        setShowEnginesDrawer(true);
        return;
      }
      // Level 1 Drawers: Return to Main Settings
      if (showTickerDrawer) {
        setShowTickerDrawer(false);
        setTimeout(() => {
          document.getElementById('playback-btn-ticker-hub')?.focus();
        }, 50);
        return;
      }
      if (showHeaderTimeoutDrawer) {
        setShowHeaderTimeoutDrawer(false);
        setTimeout(() => {
          document.getElementById('display-btn-headertimeout-hub')?.focus();
        }, 50);
        return;
      }
      if (showPerfHudDrawer) {
        setShowPerfHudDrawer(false);
        setTimeout(() => {
          document.getElementById('display-btn-perfhud-hub')?.focus();
        }, 50);
        return;
      }
      if (showBackupDrawer) {
        setShowBackupDrawer(false);
        setTimeout(() => {
          document.getElementById('system-btn-backup-hub')?.focus();
        }, 50);
        return;
      }
      if (showAutoplayDrawer) {
        setShowAutoplayDrawer(false);
        setTimeout(() => {
          document.getElementById('playback-btn-autoplay-hub')?.focus();
        }, 50);
        return;
      }
      if (showEnginesDrawer) {
        setShowEnginesDrawer(false);
        setTimeout(() => {
          document.getElementById('playback-btn-engines-hub')?.focus();
        }, 50);
        return;
      }
      if (showMaturityDrawer) {
        setShowMaturityDrawer(false);
        setTimeout(() => {
          document.getElementById('content-btn-maturity')?.focus();
        }, 50);
        return;
      }
      if (showTriggerDrawer) {
        setShowTriggerDrawer(false);
        setTimeout(() => {
          document.getElementById('controls-btn-trigger')?.focus();
        }, 50);
        return;
      }
    };

    window.addEventListener('tmdb_close_dropdowns', handleCloseFromEvent);

    if (!isAnyModalOpen) {
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
  }, [
    isPickerModalOpen,
    pickerModalSlot,
    showMaturityDrawer,
    showTriggerDrawer,
    showAutoplayDrawer,
    showAutoplayTriggerDrawer,
    showAutoplayTimeoutDrawer,
    showEnginesDrawer,
    showEnginePriorityDrawer,
    showTelegramDrawer,
    showTelegramMsmDrawer,
    showTelegramUrlDrawer,
    showTelegramChunkDrawer,
    showTelegramCountryDrawer,
    showEmbedResolverDrawer,
    showEmbedTimeoutDrawer,
    showEmbedRetryDrawer,
    activePriorityDrawer,
    showTickerDrawer,
    showHeaderTimeoutDrawer,
    showPerfHudDrawer,
    showBackupDrawer,
    isAnyModalOpen
  ]);

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
        // From Category Rail: ArrowRight -> Jump into Playback Autoplay Hub Button
        if (active.id === 'tv-settings-cat-playback' && isRight) {
          e.preventDefault();
          e.stopImmediatePropagation();
          const target = document.getElementById('playback-btn-autoplay-hub');
          target?.focus();
          scrollToPanelTop();
          return;
        }

        // From Auto-Play Hub Button (Top-most item):
        if (active.id === 'playback-btn-autoplay-hub') {
          if (isLeft) {
            e.preventDefault();
            e.stopImmediatePropagation();
            document.getElementById('tv-settings-cat-playback')?.focus();
            return;
          }
          if (isUp) {
            e.preventDefault();
            e.stopImmediatePropagation();
            scrollToPanelTop();
            return;
          }
          if (isDown) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const target = document.getElementById('playback-btn-ticker-hub');
            target?.focus();
            target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            return;
          }
        }

        // From Ticker Interval Hub Button:
        if (active.id === 'playback-btn-ticker-hub') {
          if (isLeft) {
            e.preventDefault();
            e.stopImmediatePropagation();
            document.getElementById('tv-settings-cat-playback')?.focus();
            return;
          }
          if (isUp) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const target = document.getElementById('playback-btn-autoplay-hub');
            target?.focus();
            scrollToPanelTop();
            return;
          }
          if (isDown) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const target = document.getElementById('playback-btn-engines-hub');
            target?.focus();
            target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            return;
          }
        }

        // From Playback Engines Hub Button:
        if (active.id === 'playback-btn-engines-hub') {
          if (isLeft) {
            e.preventDefault();
            e.stopImmediatePropagation();
            document.getElementById('tv-settings-cat-playback')?.focus();
            return;
          }
          if (isUp) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const target = document.getElementById('playback-btn-ticker-hub');
            target?.focus();
            target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            return;
          }
          if (isDown) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const target = document.getElementById('playback-toggle-adshield');
            target?.focus();
            scrollToPanelBottom();
            return;
          }
        }

        // From AdShield Toggle (Bottom-most item):
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
            const target = document.getElementById('playback-btn-engines-hub');
            target?.focus();
            target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            return;
          }
          if (isDown) {
            e.preventDefault();
            e.stopImmediatePropagation();
            scrollToPanelBottom();
            return;
          }
        }
      }

      // ==========================================
      // 2. REMOTE & VIRTUAL CURSOR PANEL NAV
      // ==========================================
      if (activeCategory === 'controls') {
        // From Category Rail: ArrowRight -> Jump into Virtual Cursor Toggle
        if (active.id === 'tv-settings-cat-controls' && isRight) {
          e.preventDefault();
          e.stopImmediatePropagation();
          const target = document.getElementById('controls-toggle-cursor') ||
                         document.getElementById('controls-btn-trigger');
          target?.focus();
          scrollToPanelTop();
          return;
        }

        // From Virtual Cursor Toggle (Top-most item):
        if (active.id === 'controls-toggle-cursor') {
          if (isLeft) {
            e.preventDefault();
            e.stopImmediatePropagation();
            document.getElementById('tv-settings-cat-controls')?.focus();
            return;
          }
          if (isUp) {
            e.preventDefault();
            e.stopImmediatePropagation();
            scrollToPanelTop();
            return;
          }
          if (isDown) {
            if (settings?.virtualCursorEnabled ?? true) {
              e.preventDefault();
              e.stopImmediatePropagation();
              const target = document.getElementById('controls-btn-trigger');
              target?.focus();
              scrollToPanelBottom();
              return;
            } else {
              e.preventDefault();
              e.stopImmediatePropagation();
              scrollToPanelBottom();
              return;
            }
          }
        }

        // From Trigger Button (Bottom-most item):
        if (active.id === 'controls-btn-trigger') {
          if (isLeft) {
            e.preventDefault();
            e.stopImmediatePropagation();
            document.getElementById('tv-settings-cat-controls')?.focus();
            return;
          }
          if (isUp) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const target = document.getElementById('controls-toggle-cursor');
            target?.focus();
            scrollToPanelTop();
            return;
          }
          if (isDown) {
            e.preventDefault();
            e.stopImmediatePropagation();
            scrollToPanelBottom();
            return;
          }
        }
      }

      // ==========================================
      // 3. CONTENT CONTROLS PANEL NAV
      // ==========================================
      if (activeCategory === 'content') {
        // From Category Rail: ArrowRight -> Jump into maturity button
        if (active.id === 'tv-settings-cat-content' && isRight) {
          e.preventDefault();
          e.stopImmediatePropagation();
          const target = document.getElementById('content-btn-maturity');
          target?.focus();
          scrollToPanelTop();
          return;
        }

        // From Maturity Button (Top-most item):
        if (active.id === 'content-btn-maturity') {
          if (isLeft) {
            e.preventDefault();
            e.stopImmediatePropagation();
            document.getElementById('tv-settings-cat-content')?.focus();
            return;
          }
          if (isUp) {
            e.preventDefault();
            e.stopImmediatePropagation();
            scrollToPanelTop();
            return;
          }
          if (isDown) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const target = document.getElementById('content-toggle-filterAdult');
            target?.focus();
            target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
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
            const target = document.getElementById('content-btn-maturity');
            target?.focus();
            scrollToPanelTop();
            return;
          }
          if (isDown) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const target = document.getElementById('content-toggle-filterUnreleased');
            target?.focus();
            scrollToPanelBottom();
            return;
          }
        }

        // From Filter Unreleased Toggle (Bottom-most item):
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
            const target = document.getElementById('content-toggle-filterAdult');
            target?.focus();
            target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            return;
          }
          if (isDown) {
            e.preventDefault();
            e.stopImmediatePropagation();
            scrollToPanelBottom();
            return;
          }
        }
      }

      // ==========================================
      // 4. DISPLAY & UI PANEL NAV
      // ==========================================
      if (activeCategory === 'display') {
        // From Category Rail: ArrowRight -> Jump into header timeout button
        if (active.id === 'tv-settings-cat-display' && isRight) {
          e.preventDefault();
          e.stopImmediatePropagation();
          const target = document.getElementById('display-btn-headertimeout-hub');
          target?.focus();
          scrollToPanelTop();
          return;
        }

        // From Header Timeout Hub (Top-most item):
        if (active.id === 'display-btn-headertimeout-hub') {
          if (isLeft) {
            e.preventDefault();
            e.stopImmediatePropagation();
            document.getElementById('tv-settings-cat-display')?.focus();
            return;
          }
          if (isUp) {
            e.preventDefault();
            e.stopImmediatePropagation();
            scrollToPanelTop();
            return;
          }
          if (isDown) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const target = document.getElementById('display-toggle-perfmode');
            target?.focus();
            target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            return;
          }
        }

        // From UI Performance Mode Toggle:
        if (active.id === 'display-toggle-perfmode') {
          if (isLeft) {
            e.preventDefault();
            e.stopImmediatePropagation();
            document.getElementById('tv-settings-cat-display')?.focus();
            return;
          }
          if (isUp) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const target = document.getElementById('display-btn-headertimeout-hub');
            target?.focus();
            scrollToPanelTop();
            return;
          }
          if (isDown) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const target = document.getElementById('display-btn-perfhud-hub');
            target?.focus();
            scrollToPanelBottom();
            return;
          }
        }

        // From Performance HUD Hub (Bottom-most item):
        if (active.id === 'display-btn-perfhud-hub') {
          if (isLeft) {
            e.preventDefault();
            e.stopImmediatePropagation();
            document.getElementById('tv-settings-cat-display')?.focus();
            return;
          }
          if (isUp) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const target = document.getElementById('display-toggle-perfmode');
            target?.focus();
            target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            return;
          }
          if (isDown) {
            e.preventDefault();
            e.stopImmediatePropagation();
            scrollToPanelBottom();
            return;
          }
        }
      }

      // ==========================================
      // 5. SYSTEM & UPDATES PANEL NAV
      // ==========================================
      if (activeCategory === 'system') {
        // From Category Rail: ArrowRight -> Jump into check update button
        if (active.id === 'tv-settings-cat-system' && isRight) {
          e.preventDefault();
          e.stopImmediatePropagation();
          const target = document.getElementById('system-btn-check-update');
          target?.focus();
          scrollToPanelTop();
          return;
        }

        // From Check Updates Button (Top-most item):
        if (active.id === 'system-btn-check-update') {
          if (isLeft) {
            e.preventDefault();
            e.stopImmediatePropagation();
            document.getElementById('tv-settings-cat-system')?.focus();
            return;
          }
          if (isUp) {
            e.preventDefault();
            e.stopImmediatePropagation();
            scrollToPanelTop();
            return;
          }
          if (isDown) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const target = document.getElementById('system-toggle-autoupdate');
            target?.focus();
            target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            return;
          }
        }

        // From Auto-Check on Startup Toggle:
        if (active.id === 'system-toggle-autoupdate') {
          if (isLeft) {
            e.preventDefault();
            e.stopImmediatePropagation();
            document.getElementById('tv-settings-cat-system')?.focus();
            return;
          }
          if (isUp) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const target = document.getElementById('system-btn-check-update');
            target?.focus();
            scrollToPanelTop();
            return;
          }
          if (isDown) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const target = document.getElementById('system-toggle-nightly');
            target?.focus();
            target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            return;
          }
        }

        // From Nightly Toggle:
        if (active.id === 'system-toggle-nightly') {
          if (isLeft) {
            e.preventDefault();
            e.stopImmediatePropagation();
            document.getElementById('tv-settings-cat-system')?.focus();
            return;
          }
          if (isUp) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const target = document.getElementById('system-toggle-autoupdate');
            target?.focus();
            target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            return;
          }
          if (isDown) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const target = document.getElementById('system-btn-backup-hub');
            target?.focus();
            target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            return;
          }
        }

        // From Backup Hub Button:
        if (active.id === 'system-btn-backup-hub') {
          if (isLeft) {
            e.preventDefault();
            e.stopImmediatePropagation();
            document.getElementById('tv-settings-cat-system')?.focus();
            return;
          }
          if (isUp) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const target = document.getElementById('system-toggle-nightly');
            target?.focus();
            target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            return;
          }
          if (isDown) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const target = document.getElementById('system-btn-build-easter');
            target?.focus();
            scrollToPanelBottom();
            return;
          }
        }

        // From Easter Egg Build Button (Bottom-most item):
        if (active.id === 'system-btn-build-easter') {
          if (isLeft) {
            e.preventDefault();
            e.stopImmediatePropagation();
            document.getElementById('tv-settings-cat-system')?.focus();
            return;
          }
          if (isUp) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const target = document.getElementById('system-btn-backup-hub');
            target?.focus();
            target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            return;
          }
          if (isDown) {
            e.preventDefault();
            e.stopImmediatePropagation();
            scrollToPanelBottom();
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
                  if (e.key === 'ArrowRight' || e.keyCode === 22) {
                    e.preventDefault();
                    if (cat.id === 'playback') {
                      const target = document.getElementById('playback-btn-autoplay-hub') ||
                                     document.querySelector<HTMLElement>('[data-settings-panel="true"] .tv-focus-target');
                      target?.focus();
                      scrollToPanelTop();
                    } else if (cat.id === 'display') {
                      const target = document.getElementById('display-btn-headertimeout-hub') ||
                                     document.getElementById('display-toggle-perfmode');
                      target?.focus();
                      scrollToPanelTop();
                    } else if (cat.id === 'controls') {
                      const target = document.getElementById('controls-toggle-cursor') ||
                                     document.getElementById('controls-btn-trigger');
                      target?.focus();
                      scrollToPanelTop();
                    } else if (cat.id === 'content') {
                      const target = document.getElementById('content-btn-maturity') ||
                                     document.getElementById('content-toggle-filterAdult');
                      target?.focus();
                      scrollToPanelTop();
                    } else if (cat.id === 'system') {
                      const target = document.getElementById('system-btn-check-update') ||
                                     document.getElementById('system-toggle-autoupdate');
                      target?.focus();
                      scrollToPanelTop();
                    }
                  }
                }}
                className={`w-full p-3.5 rounded-2xl border text-left transition-all tv-focus-target flex items-center justify-between gap-3 min-h-[66px] ${
                  isSelected
                    ? 'bg-gradient-to-r from-hbo-purple/40 via-hbo-purple/20 to-transparent border-hbo-purple text-white focus:border-hbo-cyan focus:ring-2 focus:ring-hbo-cyan focus:shadow-hbo-glow focus:from-hbo-purple/60 focus:to-hbo-cyan/20'
                    : 'bg-hbo-card/70 border-hbo-border hover:bg-hbo-hover hover:border-white/20 text-gray-300 focus:border-hbo-cyan focus:ring-2 focus:ring-hbo-cyan focus:text-white'
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
              {/* Row 1: Auto-Play Next Episode Hub (Single-line with Summary & Sub-Drawer access) */}
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
                  id="playback-btn-autoplay-hub"
                  type="button"
                  onClick={() => setShowAutoplayDrawer(true)}
                  onFocus={() => scrollToPanelTop()}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowLeft') {
                      e.preventDefault();
                      document.getElementById('tv-settings-cat-playback')?.focus();
                    } else if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      document.getElementById('playback-btn-ticker-hub')?.focus();
                    }
                  }}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold transition-all tv-focus-target flex items-center gap-2.5 flex-shrink-0 border bg-hbo-dark/60 border-hbo-border hover:bg-hbo-hover hover:border-white/20 text-white"
                >
                  <div className="flex items-center gap-2 text-right">
                    {settings.autoplayNext !== false ? (
                      <div className="flex items-center gap-1.5">
                        <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />
                        <span className="text-emerald-400 font-bold">Enabled</span>
                        <span className="text-gray-500">•</span>
                        <span className="text-gray-300 font-medium">{settings.upNextTriggerPercent || 96}%</span>
                        <span className="text-gray-500">•</span>
                        <span className="text-hbo-cyan font-bold">{settings.upNextTimeout || 20}s</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="inline-block w-2 h-2 rounded-full bg-rose-400" />
                        <span className="text-rose-400 font-bold">Disabled</span>
                      </div>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400 stroke-[2.2]" />
                </button>
              </div>

              {/* Row 2: Watch Progress Update Interval Hub (Drawer Trigger) */}
              <div
                data-settings-row="true"
                className="bg-hbo-card border border-hbo-border rounded-2xl p-4 shadow-lg flex items-center justify-between gap-4"
              >
                <div className="flex-1 min-w-0 pr-2">
                  <h3 className="text-sm sm:text-base font-bold font-display text-white flex items-center gap-2 mb-0.5">
                    <Clock className="w-4.5 h-4.5 text-hbo-cyan flex-shrink-0" />
                    <span>Watch Progress Update Interval</span>
                  </h3>
                  <p className="text-[11px] text-gray-400">
                    How frequently playback progress is tracked and saved for web embed streams (e.g. KissKH).
                  </p>
                </div>

                <button
                  id="playback-btn-ticker-hub"
                  type="button"
                  onClick={() => setShowTickerDrawer(true)}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowLeft') {
                      e.preventDefault();
                      document.getElementById('tv-settings-cat-playback')?.focus();
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      document.getElementById('playback-btn-autoplay-hub')?.focus();
                    } else if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      document.getElementById('playback-btn-engines-hub')?.focus();
                    }
                  }}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold transition-all tv-focus-target flex items-center gap-2.5 flex-shrink-0 border bg-hbo-dark/60 border-hbo-border hover:bg-hbo-hover hover:border-white/20 text-white"
                >
                  <div className="flex items-center gap-2 text-right">
                    <div className="flex items-center gap-1.5">
                      <span className="inline-block w-2 h-2 rounded-full bg-hbo-cyan" />
                      <span className="text-hbo-cyan font-bold">{settings.watchProgressTickerInterval || 5} Seconds</span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400 stroke-[2.2]" />
                </button>
              </div>

              {/* Row 3: Stream Engines Hub (Telegram, Embed Resolver) */}
              <div
                data-settings-row="true"
                className="bg-hbo-card border border-hbo-border rounded-2xl p-4 shadow-lg flex items-center justify-between gap-4"
              >
                <div className="flex-1 min-w-0 pr-2">
                  <h3 className="text-sm sm:text-base font-bold font-display text-white flex items-center gap-2 mb-0.5">
                    <Radio className="w-4.5 h-4.5 text-hbo-cyan flex-shrink-0" />
                    <span>Playback Stream Engines</span>
                  </h3>
                  <p className="text-[11px] text-gray-400">
                    Enable and configure Telegram direct streaming and multi-mirror embeds.
                  </p>
                </div>

                <button
                  id="playback-btn-engines-hub"
                  type="button"
                  onClick={() => setShowEnginesDrawer(true)}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowLeft') {
                      e.preventDefault();
                      document.getElementById('tv-settings-cat-playback')?.focus();
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      document.getElementById('playback-btn-ticker-hub')?.focus();
                    } else if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      document.getElementById('playback-toggle-adshield')?.focus();
                    }
                  }}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold transition-all tv-focus-target flex items-center gap-2.5 flex-shrink-0 border bg-hbo-dark/60 border-hbo-border hover:bg-hbo-hover hover:border-white/20 text-white"
                >
                  {(() => {
                    const enabled = settings.enabledResolvers && settings.enabledResolvers.length > 0
                      ? settings.enabledResolvers
                      : ['embed'];
                    const count = enabled.length;

                    return (
                      <div className="flex items-center gap-2 text-right">
                        <div className="flex items-center gap-1.5">
                          <span className="inline-block w-2 h-2 rounded-full bg-hbo-cyan" />
                          <span className="text-hbo-cyan font-bold">{count} Active {count === 1 ? 'Engine' : 'Engines'}</span>
                          <span className="text-gray-500">•</span>
                          <span className="text-gray-300 font-medium text-[11px]">
                            {enabled.map(k => k === 'telegram' ? 'Telegram' : 'Embed').join(', ')}
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                  <ChevronRight className="w-4 h-4 text-gray-400 stroke-[2.2]" />
                </button>
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
                  onFocus={() => scrollToPanelBottom()}
                  onClick={() => handleUpdate({ adBlockShield: !settings.adBlockShield })}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowLeft') {
                      e.preventDefault();
                      document.getElementById('tv-settings-cat-playback')?.focus();
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      const target = document.getElementById('playback-btn-engines-hub');
                      target?.focus();
                      target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                    }
                  }}
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
              {/* Row 1: Stream Header Auto-Hide Timeout Hub */}
              <div
                data-settings-row="true"
                className="bg-hbo-card border border-hbo-border rounded-2xl p-4 shadow-lg flex items-center justify-between gap-4"
              >
                <div className="flex-1 min-w-0 pr-2">
                  <h3 className="text-sm sm:text-base font-bold font-display text-white flex items-center gap-2 mb-0.5">
                    <EyeOff className="w-4.5 h-4.5 text-hbo-cyan flex-shrink-0" />
                    <span>Stream Header Auto-Hide Timeout</span>
                  </h3>
                  <p className="text-[11px] text-gray-400">
                    Automatically fade out top header while playing. Press remote Back to reveal.
                  </p>
                </div>

                <button
                  id="display-btn-headertimeout-hub"
                  type="button"
                  onClick={() => setShowHeaderTimeoutDrawer(true)}
                  onFocus={() => scrollToPanelTop()}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowLeft') {
                      e.preventDefault();
                      document.getElementById('tv-settings-cat-display')?.focus();
                    } else if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      const target = document.getElementById('display-toggle-perfmode');
                      target?.focus();
                      target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                    }
                  }}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold transition-all tv-focus-target flex items-center gap-2.5 flex-shrink-0 border bg-hbo-dark/60 border-hbo-border hover:bg-hbo-hover hover:border-white/20 text-white"
                >
                  <div className="flex items-center gap-2 text-right">
                    <div className="flex items-center gap-1.5">
                      <span className="inline-block w-2 h-2 rounded-full bg-hbo-cyan" />
                      <span className="text-hbo-cyan font-bold">
                        {(settings.streamHeaderTimeout || 5) === 0 ? 'Always Visible' : `${settings.streamHeaderTimeout || 5} Seconds`}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400 stroke-[2.2]" />
                </button>
              </div>

              {/* Row 2: UI Performance Mode */}
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
                  id="display-toggle-perfmode"
                  type="button"
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowLeft') {
                      e.preventDefault();
                      document.getElementById('tv-settings-cat-display')?.focus();
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      document.getElementById('display-btn-headertimeout-hub')?.focus();
                    } else if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      document.getElementById('display-btn-perfhud-hub')?.focus();
                    }
                  }}
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

              {/* Row 3: Performance HUD Hub */}
              <div
                data-settings-row="true"
                className="bg-hbo-card border border-hbo-border rounded-2xl p-4 shadow-lg flex items-center justify-between gap-4"
              >
                <div className="flex-1 min-w-0 pr-2">
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

                <button
                  id="display-btn-perfhud-hub"
                  type="button"
                  onClick={() => setShowPerfHudDrawer(true)}
                  onFocus={() => scrollToPanelBottom()}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowLeft') {
                      e.preventDefault();
                      document.getElementById('tv-settings-cat-display')?.focus();
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      const target = document.getElementById('display-toggle-perfmode');
                      target?.focus();
                      target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                    }
                  }}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold transition-all tv-focus-target flex items-center gap-2.5 flex-shrink-0 border bg-hbo-dark/60 border-hbo-border hover:bg-hbo-hover hover:border-white/20 text-white"
                >
                  <div className="flex items-center gap-2 text-right">
                    <div className="flex items-center gap-1.5">
                      {(() => {
                        const currentVal = settings.showPerformanceHud === true 
                          ? 'all_pages' 
                          : (settings.showPerformanceHud === 'watch_only' || settings.showPerformanceHud === 'all_pages' 
                              ? settings.showPerformanceHud 
                              : 'off');
                        const isEnabled = currentVal !== 'off';
                        return (
                          <>
                            <span className={`inline-block w-2 h-2 rounded-full ${isEnabled ? 'bg-emerald-400' : 'bg-gray-500'}`} />
                            <span className={`font-bold ${isEnabled ? 'text-hbo-cyan' : 'text-gray-400'}`}>
                              {currentVal === 'all_pages' ? 'All Pages' : currentVal === 'watch_only' ? 'Watch Only' : 'Disabled'}
                            </span>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400 stroke-[2.2]" />
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
                  id="controls-toggle-cursor"
                  type="button"
                  onFocus={() => scrollToPanelTop()}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowLeft') {
                      e.preventDefault();
                      document.getElementById('tv-settings-cat-controls')?.focus();
                    } else if (e.key === 'ArrowDown') {
                      if (settings.virtualCursorEnabled ?? true) {
                        e.preventDefault();
                        const target = document.getElementById('controls-btn-trigger');
                        target?.focus();
                        scrollToPanelBottom();
                      }
                    }
                  }}
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
                    className="bg-hbo-card border border-hbo-border rounded-2xl p-4 sm:p-4.5 shadow-lg flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      <div className="p-2.5 rounded-xl bg-hbo-cyan/15 border border-hbo-cyan/30 text-hbo-cyan flex-shrink-0">
                        <Radio className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm sm:text-base font-bold text-white">Activation Trigger</h4>
                        <p className="text-[11px] text-gray-400 mt-0.5 truncate">
                          How the virtual cursor is activated while watching a video
                        </p>
                      </div>
                    </div>

                    <div className="flex-shrink-0">
                      {(() => {
                        const currentClicks = settings.virtualCursorClicks || 2;
                        const label = currentClicks === 3 ? 'Triple OK Press' : 'Double OK Press';

                        return (
                          <button
                            type="button"
                            id="controls-btn-trigger"
                            onClick={() => setShowTriggerDrawer(true)}
                            onFocus={() => scrollToPanelBottom()}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowLeft') {
                                e.preventDefault();
                                document.getElementById('tv-settings-cat-controls')?.focus();
                              } else if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                const target = document.getElementById('controls-toggle-cursor');
                                target?.focus();
                                scrollToPanelTop();
                              }
                            }}
                            className="flex items-center justify-between gap-3 bg-hbo-dark/80 border border-hbo-border text-white text-xs font-bold rounded-xl px-3.5 py-2.5 hover:bg-hbo-hover hover:border-hbo-cyan focus:outline-none focus:border-hbo-cyan focus:ring-2 focus:ring-hbo-cyan transition-all tv-focus-target shadow-md min-w-[170px]"
                          >
                            <span className="text-hbo-cyan truncate">{label}</span>
                            <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          </button>
                        );
                      })()}
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
                className="bg-hbo-card border border-hbo-border rounded-2xl p-4 sm:p-4.5 shadow-lg flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  <div className="p-2.5 rounded-xl bg-hbo-purple/20 border border-hbo-purple/40 text-hbo-cyan flex-shrink-0">
                    <Lock className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm sm:text-base font-bold text-white">Catalog Maturity Level / Parental Filter</h3>
                    <p className="text-[11px] text-gray-400 mt-0.5 truncate">
                      Limit discovery catalog recommendations to age-appropriate certification tiers.
                    </p>
                  </div>
                </div>

                <div className="flex-shrink-0">
                  {(() => {
                    const currentMaturity = settings.maturityLevel === 'pg13' ? 'teen' : settings.maturityLevel === 'family' ? 'older_kids' : (settings.maturityLevel || 'all');
                    const maturityLabels: Record<string, string> = {
                      all: 'All Ratings (18+)',
                      mature: 'Young Adult (16+)',
                      teen: 'Teens (13+)',
                      older_kids: 'Older Kids (7+)',
                      kids: 'Little Kids (All Ages)'
                    };
                    const label = maturityLabels[currentMaturity] || 'All Ratings (18+)';

                    return (
                      <button
                        type="button"
                        id="content-btn-maturity"
                        onClick={() => setShowMaturityDrawer(true)}
                        onFocus={() => scrollToPanelTop()}
                        className="flex items-center justify-between gap-3 bg-hbo-dark/80 border border-hbo-border text-white text-xs font-bold rounded-xl px-3.5 py-2.5 hover:bg-hbo-hover hover:border-hbo-cyan focus:outline-none focus:border-hbo-cyan focus:ring-2 focus:ring-hbo-cyan transition-all tv-focus-target shadow-md min-w-[180px]"
                      >
                        <span className="text-hbo-cyan truncate">{label}</span>
                        <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      </button>
                    );
                  })()}
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
                  onFocus={() => scrollToPanelBottom()}
                  onClick={() => handleUpdate({ filterUnreleased: settings.filterUnreleased === false ? true : false })}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowLeft') {
                      e.preventDefault();
                      document.getElementById('tv-settings-cat-content')?.focus();
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      const target = document.getElementById('content-toggle-filterAdult');
                      target?.focus();
                      target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
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
                      id="system-btn-check-update"
                      type="button"
                      onClick={handleCheckForUpdates}
                      disabled={checkingUpdate}
                      onFocus={() => scrollToPanelTop()}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowLeft') {
                          e.preventDefault();
                          document.getElementById('tv-settings-cat-system')?.focus();
                        } else if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          document.getElementById('system-toggle-autoupdate')?.focus();
                        }
                      }}
                      className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-hbo-purple to-hbo-cyan hover:opacity-90 active:scale-95 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-hbo-purple/30 tv-focus-target transition-all"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${checkingUpdate ? 'animate-spin' : ''}`} />
                      <span>{checkingUpdate ? 'Checking...' : 'Check for Updates'}</span>
                    </button>

                    {updateInfo?.hasUpdate && (
                      <button
                        id="system-btn-view-update"
                        type="button"
                        onClick={() => setShowUpdateModal(true)}
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowLeft') {
                            e.preventDefault();
                            document.getElementById('system-btn-check-update')?.focus();
                          } else if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            document.getElementById('system-toggle-autoupdate')?.focus();
                          }
                        }}
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
                  id="system-toggle-autoupdate"
                  type="button"
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowLeft') {
                      e.preventDefault();
                      document.getElementById('tv-settings-cat-system')?.focus();
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      document.getElementById('system-btn-check-update')?.focus();
                    } else if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      document.getElementById('system-toggle-nightly')?.focus();
                    }
                  }}
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
                  id="system-toggle-nightly"
                  type="button"
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowLeft') {
                      e.preventDefault();
                      document.getElementById('tv-settings-cat-system')?.focus();
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      document.getElementById('system-toggle-autoupdate')?.focus();
                    } else if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      document.getElementById('system-btn-backup-hub')?.focus();
                    }
                  }}
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

              {/* Row 4: Persistent Storage & Backup Hub */}
              <div
                data-settings-row="true"
                className="bg-hbo-card border border-hbo-border rounded-2xl p-4 shadow-lg flex items-center justify-between gap-4"
              >
                <div className="flex-1 min-w-0 pr-2">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h4 className="text-sm sm:text-base font-bold text-gray-200 flex items-center gap-2">
                      <HardDrive className="w-4 h-4 text-hbo-cyan" />
                      <span>Persistent Storage &amp; Backup</span>
                    </h4>
                    {backupMeta.available && (
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[9px] font-mono flex-shrink-0">
                        Auto-Protected
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Saves your history, settings, and watchlist outside app storage so they survive app uninstalls.
                  </p>
                </div>

                <button
                  id="system-btn-backup-hub"
                  type="button"
                  onClick={() => setShowBackupDrawer(true)}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowLeft') {
                      e.preventDefault();
                      document.getElementById('tv-settings-cat-system')?.focus();
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      document.getElementById('system-toggle-nightly')?.focus();
                    } else if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      document.getElementById('system-btn-build-easter')?.focus();
                    }
                  }}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold transition-all tv-focus-target flex items-center gap-2.5 flex-shrink-0 border bg-hbo-dark/60 border-hbo-border hover:bg-hbo-hover hover:border-white/20 text-white"
                >
                  <div className="flex items-center gap-2 text-right">
                    <div className="flex items-center gap-1.5">
                      <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />
                      <span className="text-emerald-400 font-bold">Manage Backup</span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400 stroke-[2.2]" />
                </button>
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
                    id="system-btn-build-easter"
                    type="button"
                    onClick={handleBuildNumberClick}
                    onFocus={() => scrollToPanelBottom()}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowLeft') {
                        e.preventDefault();
                        document.getElementById('tv-settings-cat-system')?.focus();
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        const target = document.getElementById('system-btn-backup-hub');
                        target?.focus();
                        target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                      }
                    }}
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
                const isAseanTab = priorityCategoryTab === 'asean';
                const isAnimeTab = priorityCategoryTab === 'anime';
                const currentTop = isKoreanTab
                  ? (settings.topKoreanProviders && settings.topKoreanProviders.length >= 3
                      ? settings.topKoreanProviders
                      : ['kisskh-kdrama', 'cinesrc', 'moviesapi'])
                  : isAseanTab
                  ? ((settings.topAseanProviders || (settings as any).topAsianProviders) && (settings.topAseanProviders || (settings as any).topAsianProviders).length >= 3
                      ? (settings.topAseanProviders || (settings as any).topAsianProviders)
                      : ['pencurimovie-my', 'vidlink', '111movies'])
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
                        } else if (isAseanTab) {
                          handleUpdate({
                            topAseanProviders: updated,
                            topAsianProviders: updated
                          });
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
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {provider.categories.map((cat) => {
                            const config = CATEGORY_BADGE_CONFIG[cat];
                            if (!config) return null;
                            return (
                              <span
                                key={cat}
                                className={`text-[9px] px-1.5 py-0.5 rounded font-semibold border ${config.className}`}
                              >
                                {config.label}
                              </span>
                            );
                          })}
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

      {/* Android TV Catalog Maturity Level Right Drawer */}
      {showMaturityDrawer && (
        <div
          role="dialog"
          aria-modal="true"
          data-drawer-container="true"
          className="fixed inset-0 z-[9999] flex justify-end bg-black/80 backdrop-blur-md animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowMaturityDrawer(false);
              setTimeout(() => {
                document.getElementById('content-btn-maturity')?.focus();
              }, 50);
            }
          }}
        >
          {/* Left Side Parent Path Context */}
          <div className="flex-1 hidden md:flex flex-col justify-center pl-16 pr-8 pointer-events-none select-none">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-400 tracking-wider uppercase mb-2">
              <span className="text-gray-400">Settings</span>
              <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-hbo-cyan font-semibold">Content Controls</span>
            </div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight mb-2">Catalog Maturity</h1>
            <p className="text-sm text-gray-400 max-w-md leading-relaxed">
              Limit discovery catalog recommendations and search results to age-appropriate certification tiers.
            </p>
          </div>

          <div className="w-full max-w-md h-full bg-hbo-card/95 border-l border-hbo-border/80 shadow-2xl flex flex-col justify-between animate-slide-in-right overflow-hidden">
            {/* Drawer Body: Single Column Options */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-3 font-sans">
              {(() => {
                const currentMaturity = settings.maturityLevel === 'pg13' ? 'teen' : settings.maturityLevel === 'family' ? 'older_kids' : (settings.maturityLevel || 'all');
                const maturityOptions = [
                  { id: 'all' as const, label: 'All Ratings (18+)', desc: 'Unrestricted: R, TV-MA, NC-17, 18, 21+' },
                  { id: 'mature' as const, label: 'Young Adult (16+)', desc: 'Up to R / 15 / 16 (Excludes NC-17, 18SX)' },
                  { id: 'teen' as const, label: 'Teens (13+)', desc: 'Up to PG-13 / 12A / TV-14 (Excludes R)' },
                  { id: 'older_kids' as const, label: 'Older Kids (7+)', desc: 'Up to PG / TV-PG (Gentle scares, fantasy)' },
                  { id: 'kids' as const, label: 'Little Kids (All Ages)', desc: 'Strictly G / U / TV-Y / TV-G (Preschool & family)' },
                ];

                return maturityOptions.map((opt, itemIdx) => {
                  const isSelected = currentMaturity === opt.id;
                  const isFirst = itemIdx === 0;
                  const isLast = itemIdx === maturityOptions.length - 1;

                  return (
                    <button
                      key={opt.id}
                      type="button"
                      data-maturity-drawer-item="true"
                      data-maturity-selected={isSelected ? 'true' : 'false'}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          e.stopPropagation();
                          const allButtons = Array.from(document.querySelectorAll<HTMLElement>('[data-maturity-drawer-item="true"]'));
                          if (itemIdx < allButtons.length - 1) {
                            allButtons[itemIdx + 1].focus();
                            allButtons[itemIdx + 1].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                          }
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          e.stopPropagation();
                          const allButtons = Array.from(document.querySelectorAll<HTMLElement>('[data-maturity-drawer-item="true"]'));
                          if (itemIdx > 0) {
                            allButtons[itemIdx - 1].focus();
                            allButtons[itemIdx - 1].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                          }
                        }
                      }}
                      onClick={() => {
                        handleUpdate({ maturityLevel: opt.id });
                        setShowMaturityDrawer(false);
                        setTimeout(() => {
                          document.getElementById('content-btn-maturity')?.focus();
                        }, 50);
                      }}
                      className={`w-full flex items-center justify-between gap-3 p-4 rounded-xl text-left transition-all tv-focus-target border ${
                        isFirst ? 'mt-1' : ''
                      } ${isLast ? 'mb-1' : ''} ${
                        isSelected
                          ? 'bg-hbo-purple/40 border-hbo-cyan text-white shadow-hbo-glow ring-1 ring-hbo-cyan/50'
                          : 'bg-black/30 border-white/5 text-gray-300 hover:bg-hbo-hover hover:border-white/20'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className={`font-bold text-xs sm:text-sm ${isSelected ? 'text-hbo-cyan' : 'text-white'}`}>
                            {opt.label}
                          </span>
                          {isSelected && (
                            <div className="flex items-center gap-1 text-[11px] font-bold text-hbo-cyan">
                              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                              <span>Selected</span>
                            </div>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-400 leading-snug">{opt.desc}</p>
                      </div>
                    </button>
                  );
                });
              })()}
            </div>

            {/* Drawer Footer Hint */}
            <div className="p-4 border-t border-hbo-border/50 bg-black/40 flex items-center justify-center text-xs text-gray-400 select-none">
              <span>Press <strong className="text-white font-semibold">Back</strong> to close</span>
            </div>
          </div>
        </div>
      )}

      {/* Android TV Activation Trigger Right Drawer */}
      {showTriggerDrawer && (
        <div
          role="dialog"
          aria-modal="true"
          data-drawer-container="true"
          className="fixed inset-0 z-[9999] flex justify-end bg-black/80 backdrop-blur-md animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowTriggerDrawer(false);
              setTimeout(() => {
                document.getElementById('controls-btn-trigger')?.focus();
              }, 50);
            }
          }}
        >
          {/* Left Side Parent Path Context */}
          <div className="flex-1 hidden md:flex flex-col justify-center pl-16 pr-8 pointer-events-none select-none">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-400 tracking-wider uppercase mb-2">
              <span className="text-gray-400">Settings</span>
              <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-hbo-cyan font-semibold">Remote &amp; Virtual Cursor</span>
            </div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight mb-2">Activation Trigger</h1>
            <p className="text-sm text-gray-400 max-w-md leading-relaxed">
              Configure how the on-demand virtual cursor is activated during playback using your TV remote.
            </p>
          </div>

          <div className="w-full max-w-md h-full bg-hbo-card/95 border-l border-hbo-border/80 shadow-2xl flex flex-col justify-between animate-slide-in-right overflow-hidden">
            {/* Drawer Body: Single Column Options */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-3 font-sans">
              {(() => {
                const currentClicks = settings.virtualCursorClicks || 2;
                const triggerOptions = [
                  { clicks: 2 as const, label: 'Double OK Press', desc: 'Press OK / Select twice rapidly while watching' },
                  { clicks: 3 as const, label: 'Triple OK Press', desc: 'Press OK / Select 3 times in quick succession' },
                ];

                return triggerOptions.map((opt, itemIdx) => {
                  const isSelected = currentClicks === opt.clicks;
                  const isFirst = itemIdx === 0;
                  const isLast = itemIdx === triggerOptions.length - 1;

                  return (
                    <button
                      key={opt.clicks}
                      type="button"
                      data-trigger-drawer-item="true"
                      data-trigger-selected={isSelected ? 'true' : 'false'}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          e.stopPropagation();
                          const allButtons = Array.from(document.querySelectorAll<HTMLElement>('[data-trigger-drawer-item="true"]'));
                          if (itemIdx < allButtons.length - 1) {
                            allButtons[itemIdx + 1].focus();
                            allButtons[itemIdx + 1].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                          }
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          e.stopPropagation();
                          const allButtons = Array.from(document.querySelectorAll<HTMLElement>('[data-trigger-drawer-item="true"]'));
                          if (itemIdx > 0) {
                            allButtons[itemIdx - 1].focus();
                            allButtons[itemIdx - 1].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                          }
                        }
                      }}
                      onClick={() => {
                        handleUpdate({ virtualCursorClicks: opt.clicks });
                        setShowTriggerDrawer(false);
                        setTimeout(() => {
                          document.getElementById('controls-btn-trigger')?.focus();
                        }, 50);
                      }}
                      className={`w-full flex items-center justify-between gap-3 p-4 rounded-xl text-left transition-all tv-focus-target border ${
                        isFirst ? 'mt-1' : ''
                      } ${isLast ? 'mb-1' : ''} ${
                        isSelected
                          ? 'bg-hbo-purple/40 border-hbo-cyan text-white shadow-hbo-glow ring-1 ring-hbo-cyan/50'
                          : 'bg-black/30 border-white/5 text-gray-300 hover:bg-hbo-hover hover:border-white/20'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className={`font-bold text-xs sm:text-sm ${isSelected ? 'text-hbo-cyan' : 'text-white'}`}>
                            {opt.label}
                          </span>
                          {isSelected && (
                            <div className="flex items-center gap-1 text-[11px] font-bold text-hbo-cyan">
                              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                              <span>Selected</span>
                            </div>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-400 leading-snug">{opt.desc}</p>
                      </div>
                    </button>
                  );
                });
              })()}
            </div>

            {/* Drawer Footer Hint */}
            <div className="p-4 border-t border-hbo-border/50 bg-black/40 flex items-center justify-center text-xs text-gray-400 select-none">
              <span>Press <strong className="text-white font-semibold">Back</strong> to close</span>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* LEVEL 1: Android TV Autoplay Next Episode Master Drawer                  */}
      {/* ========================================================================= */}
      {showAutoplayDrawer && !showAutoplayTriggerDrawer && !showAutoplayTimeoutDrawer && (
        <div
          role="dialog"
          aria-modal="true"
          data-drawer-container="true"
          className="fixed inset-0 z-[9999] flex justify-end bg-black/80 backdrop-blur-md animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowAutoplayDrawer(false);
              setTimeout(() => {
                document.getElementById('playback-btn-autoplay-hub')?.focus();
              }, 50);
            }
          }}
        >
          {/* Left Side Parent Path Context */}
          <div className="flex-1 hidden md:flex flex-col justify-center pl-16 pr-8 pointer-events-none select-none">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-400 tracking-wider uppercase mb-2">
              <span className="text-gray-400">Settings</span>
              <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-hbo-cyan font-semibold">Playback &amp; Streaming</span>
            </div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight mb-2">Autoplay Next Episode</h1>
            <p className="text-sm text-gray-400 max-w-md leading-relaxed">
              Configure automatic episode transitions, "Up Next" preview popup timing, and countdown timeouts between episodes.
            </p>
          </div>

          <div className="w-full max-w-md h-full bg-hbo-card/95 border-l border-hbo-border/80 shadow-2xl flex flex-col justify-between animate-slide-in-right overflow-hidden">
            {/* Drawer Body: Level 1 Menu Items */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-3 font-sans">
              {/* Item 1: Master Enable / Disable Toggle */}
              <button
                id="drawer-ap-toggle"
                data-autoplay-drawer-item="true"
                type="button"
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    e.stopPropagation();
                    if (settings.autoplayNext !== false) {
                      document.getElementById('drawer-ap-sub-trigger')?.focus();
                    }
                  }
                }}
                onClick={() => handleUpdate({ autoplayNext: settings.autoplayNext === false ? true : false })}
                className="w-full flex items-center justify-between gap-3 p-4 rounded-xl text-left transition-all tv-focus-target border bg-black/30 border-white/5 text-gray-300 hover:bg-hbo-hover hover:border-white/20 mt-1"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="font-bold text-xs sm:text-sm text-white">Autoplay Next Episode</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide border ${
                      settings.autoplayNext !== false
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                        : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                    }`}>
                      {settings.autoplayNext !== false ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400 leading-snug">
                    Turn on automatic transitions and "Up Next" popups
                  </p>
                </div>
              </button>

              {/* Only show deep configuration when autoplay is enabled */}
              {settings.autoplayNext !== false && (
                <>
                  {/* Item 2: Popup Trigger Timing -> Opens Level 2 Trigger Drawer */}
                  <button
                    id="drawer-ap-sub-trigger"
                    data-autoplay-drawer-item="true"
                    type="button"
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        e.stopPropagation();
                        document.getElementById('drawer-ap-toggle')?.focus();
                      } else if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        e.stopPropagation();
                        document.getElementById('drawer-ap-sub-timeout')?.focus();
                      }
                    }}
                    onClick={() => setShowAutoplayTriggerDrawer(true)}
                    className="w-full flex items-center justify-between gap-3 p-4 rounded-xl text-left transition-all tv-focus-target border bg-black/30 border-white/5 text-gray-300 hover:bg-hbo-hover hover:border-white/20"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className="font-bold text-xs sm:text-sm text-white">Popup Trigger Timing</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-hbo-cyan">{settings.upNextTriggerPercent || 96}%</span>
                          <ChevronRight className="w-3.5 h-3.5 text-gray-400 stroke-[2.2]" />
                        </div>
                      </div>
                      <p className="text-[11px] text-gray-400 leading-snug">
                        Episode completion threshold when the preview card appears
                      </p>
                    </div>
                  </button>

                  {/* Item 3: Countdown Timeout -> Opens Level 2 Timeout Drawer */}
                  <button
                    id="drawer-ap-sub-timeout"
                    data-autoplay-drawer-item="true"
                    type="button"
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        e.stopPropagation();
                        document.getElementById('drawer-ap-sub-trigger')?.focus();
                      }
                    }}
                    onClick={() => setShowAutoplayTimeoutDrawer(true)}
                    className="w-full flex items-center justify-between gap-3 p-4 rounded-xl text-left transition-all tv-focus-target border bg-black/30 border-white/5 text-gray-300 hover:bg-hbo-hover hover:border-white/20 mb-1"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className="font-bold text-xs sm:text-sm text-white">Countdown Timeout</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-hbo-cyan">{settings.upNextTimeout || 20}s</span>
                          <ChevronRight className="w-3.5 h-3.5 text-gray-400 stroke-[2.2]" />
                        </div>
                      </div>
                      <p className="text-[11px] text-gray-400 leading-snug">
                        Seconds the timer counts down before starting next episode
                      </p>
                    </div>
                  </button>
                </>
              )}
            </div>

            {/* Drawer Footer Hint */}
            <div className="p-4 border-t border-hbo-border/50 bg-black/40 flex items-center justify-center text-xs text-gray-400 select-none">
              <span>Press <strong className="text-white font-semibold">Back</strong> to exit</span>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* LEVEL 2: Nested Drawer for Popup Trigger Timing (% of Episode)           */}
      {/* ========================================================================= */}
      {showAutoplayTriggerDrawer && (
        <div
          role="dialog"
          aria-modal="true"
          data-drawer-container="true"
          className="fixed inset-0 z-[10000] flex justify-end bg-black/80 backdrop-blur-md animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowAutoplayTriggerDrawer(false);
              setTimeout(() => {
                document.getElementById('drawer-ap-sub-trigger')?.focus();
              }, 50);
            }
          }}
        >
          {/* Left Side Nested Parent Path Context */}
          <div className="flex-1 hidden md:flex flex-col justify-center pl-16 pr-8 pointer-events-none select-none">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-gray-400 tracking-wider uppercase mb-2">
              <span className="text-gray-400">Settings</span>
              <ChevronRight className="w-3 h-3 text-gray-500" />
              <span className="text-gray-400">Playback &amp; Streaming</span>
              <ChevronRight className="w-3 h-3 text-gray-500" />
              <span className="text-hbo-cyan font-semibold">Autoplay Next Episode</span>
            </div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight mb-2">Popup Trigger Timing</h1>
            <p className="text-sm text-gray-400 max-w-md leading-relaxed">
              Select the episode completion percentage when the "Up Next" preview popup appears.
            </p>
          </div>

          <div className="w-full max-w-md h-full bg-hbo-card/95 border-l border-hbo-border/80 shadow-2xl flex flex-col justify-between animate-slide-in-right overflow-hidden">
            {/* Drawer Body: Single Column Options */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-3 font-sans">
              {(() => {
                const currentPercent = settings.upNextTriggerPercent || 96;
                const triggerOptions = [
                  { percent: 96, label: '96% (Standard Credits)', desc: 'Appears right when closing credits usually begin' },
                  { percent: 98, label: '98% (Late Credits)', desc: 'Displays shortly before end of episode' },
                  { percent: 100, label: '100% (Episode End)', desc: 'Waits until exact video stream completion' },
                  { percent: 102, label: '102% (Outro Padding)', desc: 'Extended allowance for long post-credit scenes' },
                  { percent: 104, label: '104% (Maximum Buffer)', desc: 'Maximum threshold for deep outro sequences' },
                ];

                return triggerOptions.map((opt, itemIdx) => {
                  const isSelected = currentPercent === opt.percent;
                  const isFirst = itemIdx === 0;
                  const isLast = itemIdx === triggerOptions.length - 1;

                  return (
                    <button
                      key={opt.percent}
                      type="button"
                      data-ap-trigger-drawer-item="true"
                      data-ap-trigger-selected={isSelected ? 'true' : 'false'}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          e.stopPropagation();
                          const allButtons = Array.from(document.querySelectorAll<HTMLElement>('[data-ap-trigger-drawer-item="true"]'));
                          if (itemIdx < allButtons.length - 1) {
                            allButtons[itemIdx + 1].focus();
                            allButtons[itemIdx + 1].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                          }
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          e.stopPropagation();
                          const allButtons = Array.from(document.querySelectorAll<HTMLElement>('[data-ap-trigger-drawer-item="true"]'));
                          if (itemIdx > 0) {
                            allButtons[itemIdx - 1].focus();
                            allButtons[itemIdx - 1].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                          }
                        }
                      }}
                      onClick={() => {
                        handleUpdate({ upNextTriggerPercent: opt.percent });
                        setShowAutoplayTriggerDrawer(false);
                        setTimeout(() => {
                          document.getElementById('drawer-ap-sub-trigger')?.focus();
                        }, 50);
                      }}
                      className={`w-full flex items-center justify-between gap-3 p-4 rounded-xl text-left transition-all tv-focus-target border ${
                        isFirst ? 'mt-1' : ''
                      } ${isLast ? 'mb-1' : ''} ${
                        isSelected
                          ? 'bg-hbo-purple/40 border-hbo-cyan text-white shadow-hbo-glow ring-1 ring-hbo-cyan/50'
                          : 'bg-black/30 border-white/5 text-gray-300 hover:bg-hbo-hover hover:border-white/20'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className={`font-bold text-xs sm:text-sm ${isSelected ? 'text-hbo-cyan' : 'text-white'}`}>
                            {opt.label}
                          </span>
                          {isSelected && (
                            <div className="flex items-center gap-1 text-[11px] font-bold text-hbo-cyan">
                              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                              <span>Selected</span>
                            </div>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-400 leading-snug">{opt.desc}</p>
                      </div>
                    </button>
                  );
                });
              })()}
            </div>

            {/* Drawer Footer Hint */}
            <div className="p-4 border-t border-hbo-border/50 bg-black/40 flex items-center justify-center text-xs text-gray-400 select-none">
              <span>Press <strong className="text-white font-semibold">Back</strong> to return</span>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* LEVEL 2: Nested Drawer for Countdown Timeout Before Next Episode          */}
      {/* ========================================================================= */}
      {showAutoplayTimeoutDrawer && (
        <div
          role="dialog"
          aria-modal="true"
          data-drawer-container="true"
          className="fixed inset-0 z-[10000] flex justify-end bg-black/80 backdrop-blur-md animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowAutoplayTimeoutDrawer(false);
              setTimeout(() => {
                document.getElementById('drawer-ap-sub-timeout')?.focus();
              }, 50);
            }
          }}
        >
          {/* Left Side Nested Parent Path Context */}
          <div className="flex-1 hidden md:flex flex-col justify-center pl-16 pr-8 pointer-events-none select-none">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-gray-400 tracking-wider uppercase mb-2">
              <span className="text-gray-400">Settings</span>
              <ChevronRight className="w-3 h-3 text-gray-500" />
              <span className="text-gray-400">Playback &amp; Streaming</span>
              <ChevronRight className="w-3 h-3 text-gray-500" />
              <span className="text-hbo-cyan font-semibold">Autoplay Next Episode</span>
            </div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight mb-2">Countdown Duration</h1>
            <p className="text-sm text-gray-400 max-w-md leading-relaxed">
              Choose how many seconds the countdown timer will run before automatically launching the next episode.
            </p>
          </div>

          <div className="w-full max-w-md h-full bg-hbo-card/95 border-l border-hbo-border/80 shadow-2xl flex flex-col justify-between animate-slide-in-right overflow-hidden">
            {/* Drawer Body: Single Column Options */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-3 font-sans">
              {(() => {
                const currentTimeout = settings.upNextTimeout || 20;
                const timeoutOptions = [
                  { seconds: 20, label: '20 Seconds (Standard)', desc: 'Optimal balance between preview time and quick progression' },
                  { seconds: 40, label: '40 Seconds (Medium)', desc: 'Extra time to check credits or decide next watch' },
                  { seconds: 60, label: '60 Seconds (Relaxed)', desc: 'One full minute countdown window' },
                  { seconds: 80, label: '80 Seconds (Extended)', desc: 'Extended duration for leisurely viewing sessions' },
                ];

                return timeoutOptions.map((opt, itemIdx) => {
                  const isSelected = currentTimeout === opt.seconds;
                  const isFirst = itemIdx === 0;
                  const isLast = itemIdx === timeoutOptions.length - 1;

                  return (
                    <button
                      key={opt.seconds}
                      type="button"
                      data-ap-timeout-drawer-item="true"
                      data-ap-timeout-selected={isSelected ? 'true' : 'false'}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          e.stopPropagation();
                          const allButtons = Array.from(document.querySelectorAll<HTMLElement>('[data-ap-timeout-drawer-item="true"]'));
                          if (itemIdx < allButtons.length - 1) {
                            allButtons[itemIdx + 1].focus();
                            allButtons[itemIdx + 1].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                          }
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          e.stopPropagation();
                          const allButtons = Array.from(document.querySelectorAll<HTMLElement>('[data-ap-timeout-drawer-item="true"]'));
                          if (itemIdx > 0) {
                            allButtons[itemIdx - 1].focus();
                            allButtons[itemIdx - 1].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                          }
                        }
                      }}
                      onClick={() => {
                        handleUpdate({ upNextTimeout: opt.seconds });
                        setShowAutoplayTimeoutDrawer(false);
                        setTimeout(() => {
                          document.getElementById('drawer-ap-sub-timeout')?.focus();
                        }, 50);
                      }}
                      className={`w-full flex items-center justify-between gap-3 p-4 rounded-xl text-left transition-all tv-focus-target border ${
                        isFirst ? 'mt-1' : ''
                      } ${isLast ? 'mb-1' : ''} ${
                        isSelected
                          ? 'bg-hbo-purple/40 border-hbo-cyan text-white shadow-hbo-glow ring-1 ring-hbo-cyan/50'
                          : 'bg-black/30 border-white/5 text-gray-300 hover:bg-hbo-hover hover:border-white/20'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className={`font-bold text-xs sm:text-sm ${isSelected ? 'text-hbo-cyan' : 'text-white'}`}>
                            {opt.label}
                          </span>
                          {isSelected && (
                            <div className="flex items-center gap-1 text-[11px] font-bold text-hbo-cyan">
                              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                              <span>Selected</span>
                            </div>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-400 leading-snug">{opt.desc}</p>
                      </div>
                    </button>
                  );
                });
              })()}
            </div>

            {/* Drawer Footer Hint */}
            <div className="p-4 border-t border-hbo-border/50 bg-black/40 flex items-center justify-center text-xs text-gray-400 select-none">
              <span>Press <strong className="text-white font-semibold">Back</strong> to return</span>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* Android TV Playback Stream Engines Right Drawer (Level 1)                  */}
      {/* ========================================================================= */}
      {showEnginesDrawer && (
        <div
          role="dialog"
          aria-modal="true"
          data-drawer-container="true"
          className="fixed inset-0 z-[9999] flex justify-end bg-black/80 backdrop-blur-md animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowEnginesDrawer(false);
              setTimeout(() => {
                document.getElementById('playback-btn-engines-hub')?.focus();
              }, 50);
            }
          }}
        >
          {/* Left Side Parent Path Context */}
          <div className="flex-1 hidden md:flex flex-col justify-center pl-16 pr-8 pointer-events-none select-none">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-400 tracking-wider uppercase mb-2">
              <span className="text-gray-400">Settings</span>
              <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-hbo-cyan font-semibold">Playback &amp; Streaming</span>
            </div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight mb-2">Stream Engines</h1>
            <p className="text-sm text-gray-400 max-w-md leading-relaxed">
              Configure and prioritize the engines used to fetch, extract, and stream video content.
            </p>
          </div>

          <div className="w-full max-w-md h-full bg-hbo-card/95 border-l border-hbo-border/80 shadow-2xl flex flex-col justify-between animate-slide-in-right overflow-hidden">
            {/* Drawer Body: 3 Sub-Engine Level 2 Entry Items */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-3 font-sans">
              {(() => {
                const currentEnabled = settings.enabledResolvers && settings.enabledResolvers.length > 0
                  ? settings.enabledResolvers
                  : ['embed'];
                const isTelegramEnabled = currentEnabled.includes('telegram');
                const isEmbedEnabled = currentEnabled.includes('embed');

                const priorityOrder: StreamResolverType[] = (settings.enginePriority && settings.enginePriority.length > 0)
                  ? settings.enginePriority
                  : ['telegram', 'embed'];

                return (
                  <>
                    {/* Item 0: Engine Priority Order Reordering Hub */}
                    <button
                      id="drawer-engine-item-priority"
                      data-engine-drawer-item="true"
                      type="button"
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          document.getElementById('drawer-engine-item-telegram')?.focus();
                        }
                      }}
                      onClick={() => {
                        setShowEnginesDrawer(false);
                        setShowEnginePriorityDrawer(true);
                      }}
                      className="w-full p-4 rounded-2xl border text-left transition-all tv-focus-target flex items-center justify-between gap-3 bg-gradient-to-r from-amber-500/20 via-orange-500/15 to-transparent border-amber-500/50 hover:border-amber-400 shadow-lg ring-1 ring-amber-500/30"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-sm text-white truncate">Engine Priority Order</span>
                        </div>
                        <p className="text-[11px] text-gray-300 mb-1.5 leading-snug">Sort priority order for stream extraction &amp; failover.</p>
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300/90 overflow-x-hidden truncate">
                          {priorityOrder.map((eng, idx) => (
                            <span key={eng} className="flex items-center gap-1">
                              {idx > 0 && <span className="text-gray-500 font-mono text-[10px]">→</span>}
                              <span className="capitalize">{eng}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-amber-400 stroke-[2.2] flex-shrink-0" />
                    </button>

                    {/* Item 1: Telegram Provider Stream Engine */}
                    <button
                      id="drawer-engine-item-telegram"
                      data-engine-drawer-item="true"
                      type="button"
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          document.getElementById('drawer-engine-item-priority')?.focus();
                        } else if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          document.getElementById('drawer-engine-item-embed')?.focus();
                        }
                      }}
                      onClick={() => {
                        setShowEnginesDrawer(false);
                        setShowTelegramDrawer(true);
                      }}
                      className="w-full p-4 rounded-2xl border text-left transition-all tv-focus-target flex items-center justify-between gap-3 bg-hbo-dark/60 border-hbo-border hover:bg-hbo-hover hover:border-white/20"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-sm text-white truncate">Telegram Provider</span>
                          <span className="text-[9px] px-2 py-0.5 rounded font-mono font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40">
                            Direct MTProto
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-400 mb-1.5 leading-snug">Direct in-app video streaming from Telegram bots (MovieSubMalay / @msm32bot).</p>
                        <div className="flex items-center gap-2 text-xs font-semibold">
                          {isTelegramEnabled ? (
                            <span className="text-sky-400 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                              Enabled (MovieSubMalay Active)
                            </span>
                          ) : (
                            <span className="text-gray-500 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-gray-600" />
                              Disabled
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-400 stroke-[2.2] flex-shrink-0" />
                    </button>

                    {/* Item 2: Embed Resolver Stream Engine */}
                    <button
                      id="drawer-engine-item-embed"
                      data-engine-drawer-item="true"
                      type="button"
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          document.getElementById('drawer-engine-item-telegram')?.focus();
                        }
                      }}
                      onClick={() => {
                        setShowEnginesDrawer(false);
                        setShowEmbedResolverDrawer(true);
                      }}
                      className="w-full p-4 rounded-2xl border text-left transition-all tv-focus-target flex items-center justify-between gap-3 bg-hbo-dark/60 border-hbo-border hover:bg-hbo-hover hover:border-white/20"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-sm text-white truncate">Embed Resolver</span>
                          <span className="text-[9px] px-2 py-0.5 rounded font-mono font-bold bg-hbo-cyan/20 text-hbo-cyan border border-hbo-cyan/40">
                            Multi-Mirror
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-400 mb-1.5 leading-snug">Multi-server fallback embeds with customizable timeout &amp; priority servers.</p>
                        <div className="flex items-center gap-2 text-xs font-semibold">
                          {isEmbedEnabled ? (
                            <span className="text-emerald-400 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                              Enabled • {(settings.streamResolverTimeout ?? 0) === 0 ? 'Unlimited' : `${settings.streamResolverTimeout}s`} Timeout
                            </span>
                          ) : (
                            <span className="text-gray-500 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-gray-600" />
                              Disabled
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-400 stroke-[2.2] flex-shrink-0" />
                    </button>
                  </>
                );
              })()}
            </div>

            {/* Drawer Footer Hint */}
            <div className="p-4 border-t border-hbo-border/50 bg-black/40 flex items-center justify-center text-xs text-gray-400 select-none">
              <span>Press <strong className="text-white font-semibold">Back</strong> to return</span>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* Android TV Engine Priority Order Right Drawer (Level 2)                   */}
      {/* ========================================================================= */}
      {showEnginePriorityDrawer && (
        <div
          role="dialog"
          aria-modal="true"
          data-drawer-container="true"
          className="fixed inset-0 z-[9999] flex justify-end bg-black/80 backdrop-blur-md animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowEnginePriorityDrawer(false);
              setShowEnginesDrawer(true);
              setTimeout(() => {
                document.getElementById('drawer-engine-item-priority')?.focus();
              }, 50);
            }
          }}
        >
          {/* Left Side Parent Path Context */}
          <div className="flex-1 hidden md:flex flex-col justify-center pl-16 pr-8 pointer-events-none select-none">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-400 tracking-wider uppercase mb-2">
              <span className="text-gray-400">Settings</span>
              <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-gray-400">Playback &amp; Streaming</span>
              <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-gray-400">Stream Engines</span>
              <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-amber-400 font-semibold">Priority Order</span>
            </div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight mb-2">Engine Priority Order</h1>
            <p className="text-sm text-gray-400 max-w-md leading-relaxed">
              Rearrange the sequence in which stream engines attempt video resolution. When an engine fails or is unavailable, the player cascade moves to the next engine.
            </p>
          </div>

          <div className="w-full max-w-md h-full bg-hbo-card/95 border-l border-hbo-border/80 shadow-2xl flex flex-col justify-between animate-slide-in-right overflow-hidden">
            {/* Drawer Body: 4 Engine Reordering Cards */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-3 font-sans">
              <div className="flex items-center justify-between pb-1">
                <span className="text-xs font-bold text-gray-300">Resolution Sequence</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40">
                  2 Engines
                </span>
              </div>

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
                    setTimeout(() => {
                      document.getElementById(`drawer-prio-up-${idx - 1}`)?.focus();
                    }, 50);
                  };

                  const moveDown = () => {
                    if (idx >= currentPriority.length - 1) return;
                    const updated = [...currentPriority];
                    const temp = updated[idx];
                    updated[idx] = updated[idx + 1];
                    updated[idx + 1] = temp;
                    handleUpdate({ enginePriority: updated });
                    setTimeout(() => {
                      document.getElementById(`drawer-prio-down-${idx + 1}`)?.focus();
                    }, 50);
                  };

                  return (
                    <div
                      key={engineKey}
                      id={`drawer-engine-prio-card-${idx}`}
                      data-engine-prio-item="true"
                      className="p-3.5 rounded-2xl border bg-hbo-dark/60 border-hbo-border flex items-center justify-between gap-3 transition-all"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold border ${rank.class}`}>
                            {rank.badge}
                          </span>
                          <span className="font-bold text-sm text-white truncate">{meta?.title || engineKey}</span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold border ${meta?.tagClass || 'bg-gray-800 text-gray-400'}`}>
                            {meta?.tag || ''}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-400 leading-snug mb-1 truncate">{meta?.desc || ''}</p>
                        <div className="flex items-center gap-1.5 text-[11px]">
                          {isEnabled ? (
                            <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                              Active in Streams
                            </span>
                          ) : (
                            <span className="text-gray-500 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-gray-600" />
                              Disabled in Settings
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Reorder Action Buttons (Move Up / Move Down) with TV D-Pad navigation */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          id={`drawer-prio-up-${idx}`}
                          data-engine-prio-btn="true"
                          type="button"
                          disabled={idx === 0}
                          onKeyDown={(e) => {
                            if (e.key === 'ArrowRight') {
                              e.preventDefault();
                              document.getElementById(`drawer-prio-down-${idx}`)?.focus();
                            } else if (e.key === 'ArrowUp') {
                              e.preventDefault();
                              if (idx > 0) {
                                document.getElementById(`drawer-prio-up-${idx - 1}`)?.focus();
                              }
                            } else if (e.key === 'ArrowDown') {
                              e.preventDefault();
                              if (idx < currentPriority.length - 1) {
                                document.getElementById(`drawer-prio-up-${idx + 1}`)?.focus();
                              }
                            }
                          }}
                          onClick={moveUp}
                          className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all tv-focus-target ${
                            idx === 0
                              ? 'opacity-25 border-white/5 bg-white/5 text-gray-600 cursor-not-allowed'
                              : 'bg-hbo-dark border-hbo-border hover:border-amber-400 hover:bg-amber-500/20 text-amber-300'
                          }`}
                          title="Move Up"
                        >
                          <span className="font-bold text-sm">▲</span>
                        </button>

                        <button
                          id={`drawer-prio-down-${idx}`}
                          data-engine-prio-btn="true"
                          type="button"
                          disabled={idx === currentPriority.length - 1}
                          onKeyDown={(e) => {
                            if (e.key === 'ArrowLeft') {
                              e.preventDefault();
                              document.getElementById(`drawer-prio-up-${idx}`)?.focus();
                            } else if (e.key === 'ArrowUp') {
                              e.preventDefault();
                              if (idx > 0) {
                                document.getElementById(`drawer-prio-down-${idx - 1}`)?.focus();
                              }
                            } else if (e.key === 'ArrowDown') {
                              e.preventDefault();
                              if (idx < currentPriority.length - 1) {
                                document.getElementById(`drawer-prio-down-${idx + 1}`)?.focus();
                              }
                            }
                          }}
                          onClick={moveDown}
                          className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all tv-focus-target ${
                            idx === currentPriority.length - 1
                              ? 'opacity-25 border-white/5 bg-white/5 text-gray-600 cursor-not-allowed'
                              : 'bg-hbo-dark border-hbo-border hover:border-amber-400 hover:bg-amber-500/20 text-amber-300'
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

            {/* Drawer Footer Hint */}
            <div className="p-4 border-t border-hbo-border/50 bg-black/40 flex items-center justify-center text-xs text-gray-400 select-none">
              <span>Press <strong className="text-white font-semibold">Back</strong> to return</span>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* Android TV Telegram Provider Right Drawer (Level 2)                       */}
      {/* ========================================================================= */}
      {showTelegramDrawer && (
        <div
          role="dialog"
          aria-modal="true"
          data-drawer-container="true"
          className="fixed inset-0 z-[9999] flex justify-end bg-black/80 backdrop-blur-md animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowTelegramDrawer(false);
              setShowEnginesDrawer(true);
            }
          }}
        >
          {/* Left Side Parent Path Context */}
          <div className="flex-1 hidden md:flex flex-col justify-center pl-16 pr-8 pointer-events-none select-none">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-400 tracking-wider uppercase mb-2">
              <span className="text-gray-400">Settings</span>
              <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-gray-400">Playback &amp; Streaming</span>
              <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-hbo-cyan font-semibold">Stream Engines</span>
            </div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight mb-2">Telegram Provider</h1>
            <p className="text-sm text-gray-400 max-w-md leading-relaxed">
              Direct MTProto video streaming from Telegram channels and bots (e.g. MovieSubMalay) into the player without saving files to disk.
            </p>
          </div>

          <div className="w-full max-w-md h-full bg-hbo-card/95 border-l border-hbo-border/80 shadow-2xl flex flex-col justify-between animate-slide-in-right overflow-hidden">
            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4 font-sans">
              {(() => {
                const currentEnabled = settings.enabledResolvers && settings.enabledResolvers.length > 0
                  ? settings.enabledResolvers
                  : ['embed'];
                const isTelegramEnabled = currentEnabled.includes('telegram');
                const enabledTg = settings.enabledTelegramProviders || ['telegram-msm32'];
                const isMsmEnabled = enabledTg.includes('telegram-msm32');
                const currentCountries: OriginCountryCode[] =
                  (settings.telegramProviderCountries && settings.telegramProviderCountries['telegram-msm32']) ||
                  ['MY', 'ID', 'SG'];
                const availableCodes: OriginCountryCode[] = ['MY', 'ID', 'SG', 'TH', 'KR', 'JP', 'GLOBAL'];

                return (
                  <>
                    {/* Enable / Disable Telegram Engine Toggle */}
                    <button
                      id="drawer-telegram-toggle"
                      data-telegram-drawer-item="true"
                      type="button"
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          const target = document.getElementById('drawer-msm32-sub');
                          target?.focus();
                          target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                        }
                      }}
                      onClick={() => {
                        let updated: StreamResolverType[];
                        if (isTelegramEnabled) {
                          if (currentEnabled.length === 1) return;
                          updated = currentEnabled.filter(r => r !== 'telegram') as any;
                        } else {
                          updated = [...currentEnabled, 'telegram'] as any;
                        }
                        handleUpdate({
                          enabledResolvers: updated,
                          streamResolver: updated[0] || 'embed'
                        });
                      }}
                      className={`w-full p-4 rounded-xl border text-left transition-all tv-focus-target flex items-center justify-between ${
                        isTelegramEnabled
                          ? 'bg-sky-950/40 border-sky-400 text-white shadow-hbo-glow ring-1 ring-sky-400/40'
                          : 'bg-black/30 border-hbo-border hover:border-gray-600 text-gray-400'
                      }`}
                    >
                      <div className="min-w-0 pr-3">
                        <div className="font-bold text-sm text-white mb-0.5">Enable Telegram Engine</div>
                        <p className="text-[11px] text-gray-400">Enables in-memory chunk streaming from Telegram MTProto.</p>
                      </div>
                      <div className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 ${
                        isTelegramEnabled ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40' : 'bg-white/5 text-gray-400 border border-white/10'
                      }`}>
                        {isTelegramEnabled ? <Check className="w-3.5 h-3.5 stroke-[2.5]" /> : <X className="w-3.5 h-3.5 stroke-[2.5]" />}
                        <span>{isTelegramEnabled ? 'Enabled' : 'Disabled'}</span>
                      </div>
                    </button>

                    {/* MSM32 Sub-drawer Entry */}
                    <button
                      id="drawer-msm32-sub"
                      data-telegram-drawer-item="true"
                      type="button"
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          document.getElementById('drawer-telegram-toggle')?.focus();
                        }
                      }}
                      onClick={() => {
                        setShowTelegramDrawer(false);
                        setShowTelegramMsmDrawer(true);
                      }}
                      className="w-full p-4 rounded-xl border text-left transition-all tv-focus-target flex items-center justify-between bg-black/30 border-hbo-border hover:border-sky-400/50"
                    >
                      <div className="min-w-0 pr-3">
                        <div className="font-bold text-sm text-white mb-0.5 flex items-center gap-2">
                          <Send className="w-4 h-4 text-sky-400 flex-shrink-0" />
                          <span>MovieSubMalay (@msm32bot)</span>
                        </div>
                        <p className="text-[11px] text-gray-400">
                          Configure microservice URL (Render / Local PC), server ping, chunk slice buffer, and bot settings.
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <div className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 ${
                          isMsmEnabled ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40' : 'bg-white/5 text-gray-400 border border-white/10'
                        }`}>
                          {isMsmEnabled ? <Check className="w-3.5 h-3.5 stroke-[2.5]" /> : <X className="w-3.5 h-3.5 stroke-[2.5]" />}
                          <span>{isMsmEnabled ? 'Active' : 'Disabled'}</span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      </div>
                    </button>
                  </>
                );
              })()}
            </div>

            {/* Drawer Footer Hint */}
            <div className="p-4 border-t border-hbo-border/50 bg-black/40 flex items-center justify-center text-xs text-gray-400 select-none">
              <span>Press <strong className="text-white font-semibold">Back</strong> to return</span>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* Android TV Telegram Stream Chunk Buffer Right Drawer (Level 3)            */}
      {/* ========================================================================= */}
      {showTelegramChunkDrawer && (
        <div
          role="dialog"
          aria-modal="true"
          data-drawer-container="true"
          className="fixed inset-0 z-[9999] flex justify-end bg-black/80 backdrop-blur-md animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowTelegramChunkDrawer(false);
              setShowTelegramMsmDrawer(true);
            }
          }}
        >
          {/* Left Side Parent Path Context */}
          <div className="flex-1 hidden md:flex flex-col justify-center pl-16 pr-8 pointer-events-none select-none">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-400 tracking-wider uppercase mb-2">
              <span className="text-gray-400">Settings</span>
              <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-gray-400">Playback &amp; Streaming</span>
              <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-gray-400">Stream Engines</span>
              <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-gray-400">Telegram</span>
              <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-hbo-cyan font-semibold">MSM32bot</span>
            </div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight mb-2">Stream Chunk Buffer</h1>
            <p className="text-sm text-gray-400 max-w-md leading-relaxed">
              Configure in-memory chunk slice buffer size for Telegram MTProto video streaming.
            </p>
          </div>

          <div className="w-full max-w-md h-full bg-hbo-card/95 border-l border-hbo-border/80 shadow-2xl flex flex-col justify-between animate-slide-in-right overflow-hidden">
            {/* Drawer Body: Single Column Options */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-3 font-sans">
              {(() => {
                const chunkOptions = [
                  { val: 262144, label: '256 KB (Eco Pipeline)', desc: '2 parallel streams (512KB in-flight) • Fastest seek & low data usage for mobile hotspot.' },
                  { val: 524288, label: '512 KB (Standard Pipeline)', desc: '4 parallel streams (2MB in-flight) • Optimum balance between seek response and stable throughput.' },
                  { val: 1048576, label: '1 MB (Turbo Pipeline)', desc: '6 parallel streams (3MB in-flight) • Maximum prefetch throughput for smooth, zero-stutter 1080p.' },
                ];
                const currentVal = settings.msm32ChunkSize || 524288;

                return chunkOptions.map((opt, idx) => {
                  const isSelected = currentVal === opt.val;
                  return (
                    <button
                      key={opt.val}
                      id={`drawer-telegram-chunk-${opt.val}`}
                      data-telegram-chunk-drawer-item="true"
                      data-telegram-chunk-selected={isSelected ? 'true' : 'false'}
                      type="button"
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowUp' && idx > 0) {
                          e.preventDefault();
                          const target = document.getElementById(`drawer-telegram-chunk-${chunkOptions[idx - 1].val}`);
                          target?.focus();
                          target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                        } else if (e.key === 'ArrowDown' && idx < chunkOptions.length - 1) {
                          e.preventDefault();
                          const target = document.getElementById(`drawer-telegram-chunk-${chunkOptions[idx + 1].val}`);
                          target?.focus();
                          target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                        }
                      }}
                      onClick={() => {
                        handleUpdate({ msm32ChunkSize: opt.val });
                        setShowTelegramChunkDrawer(false);
                        setShowTelegramMsmDrawer(true);
                        setTimeout(() => {
                          document.getElementById('drawer-msm32-sub-chunk')?.focus();
                        }, 50);
                      }}
                      className={`w-full p-4 rounded-xl border text-left transition-all tv-focus-target flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'bg-sky-950/40 border-sky-400 text-white shadow-hbo-glow ring-1 ring-sky-400/40'
                          : 'bg-black/30 border-hbo-border hover:border-gray-600 text-gray-400'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-sm text-white">{opt.label}</span>
                          <span className="text-[10px] text-sky-400 font-mono font-bold bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-400/20">
                            {(opt.val / 1024).toFixed(0)} KB
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-400 leading-snug">{opt.desc}</p>
                      </div>
                      <div className={`w-6 h-6 rounded-full border flex items-center justify-center flex-shrink-0 ${
                        isSelected ? 'bg-sky-500 border-sky-400 text-black' : 'border-gray-600 bg-black/40 text-transparent'
                      }`}>
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </div>
                    </button>
                  );
                });
              })()}
            </div>

            {/* Drawer Footer Hint */}
            <div className="p-4 border-t border-hbo-border/50 bg-black/40 flex items-center justify-center text-xs text-gray-400 select-none">
              <span>Press <strong className="text-white font-semibold">Back</strong> to return</span>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* Android TV Telegram Country Origin Filters Right Drawer (Level 3)          */}
      {/* ========================================================================= */}
      {showTelegramCountryDrawer && (
        <div
          role="dialog"
          aria-modal="true"
          data-drawer-container="true"
          className="fixed inset-0 z-[9999] flex justify-end bg-black/80 backdrop-blur-md animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowTelegramCountryDrawer(false);
              setShowTelegramMsmDrawer(true);
            }
          }}
        >
          {/* Left Side Parent Path Context */}
          <div className="flex-1 hidden md:flex flex-col justify-center pl-16 pr-8 pointer-events-none select-none">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-400 tracking-wider uppercase mb-2">
              <span className="text-gray-400">Settings</span>
              <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-gray-400">Playback &amp; Streaming</span>
              <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-gray-400">Stream Engines</span>
              <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-gray-400">Telegram</span>
              <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-hbo-cyan font-semibold">MSM32bot</span>
            </div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight mb-2">Country Origin Filters</h1>
            <p className="text-sm text-gray-400 max-w-md leading-relaxed">
              Select which content origin countries trigger Telegram MSM32 provider resolution.
            </p>
          </div>

          <div className="w-full max-w-md h-full bg-hbo-card/95 border-l border-hbo-border/80 shadow-2xl flex flex-col justify-between animate-slide-in-right overflow-hidden">
            {/* Drawer Body: Single Column Options */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-2.5 font-sans">
              <p className="text-xs text-gray-400 mb-2 leading-relaxed">
                Telegram MSM32 specializes in Southeast Asian releases. Select the content origin countries where MSM32 should probe for matching streams:
              </p>
              {(() => {
                const currentCountries: OriginCountryCode[] =
                  (settings.telegramProviderCountries && settings.telegramProviderCountries['telegram-msm32']) ||
                  ['MY', 'ID', 'SG'];
                const availableCodes: OriginCountryCode[] = ['MY', 'ID', 'SG', 'TH', 'KR', 'JP', 'US', 'GLOBAL'];

                return availableCodes.map((code, idx) => {
                  const isSelected = currentCountries.includes(code);
                  return (
                    <button
                      key={code}
                      id={`drawer-telegram-country-${code}`}
                      data-telegram-country-drawer-item="true"
                      data-telegram-country-selected={isSelected ? 'true' : 'false'}
                      type="button"
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowUp' && idx > 0) {
                          e.preventDefault();
                          const target = document.getElementById(`drawer-telegram-country-${availableCodes[idx - 1]}`);
                          target?.focus();
                          target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                        } else if (e.key === 'ArrowDown' && idx < availableCodes.length - 1) {
                          e.preventDefault();
                          const target = document.getElementById(`drawer-telegram-country-${availableCodes[idx + 1]}`);
                          target?.focus();
                          target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                        }
                      }}
                      onClick={() => {
                        let updated: OriginCountryCode[];
                        if (isSelected) {
                          if (currentCountries.length === 1) return;
                          updated = currentCountries.filter(c => c !== code);
                        } else {
                          updated = [...currentCountries, code];
                        }
                        const existingMap = settings.telegramProviderCountries || {};
                        handleUpdate({
                          telegramProviderCountries: {
                            ...existingMap,
                            'telegram-msm32': updated
                          }
                        });
                      }}
                      className={`w-full p-3.5 rounded-xl border text-left transition-all tv-focus-target flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'bg-sky-950/40 border-sky-400 text-white shadow-sm'
                          : 'bg-black/30 border-hbo-border hover:border-gray-600 text-gray-400'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${
                          isSelected ? 'bg-sky-500 border-sky-400' : 'border-gray-600 bg-black/40'
                        }`}>
                          {isSelected && <Check className="w-3.5 h-3.5 text-black stroke-[3]" />}
                        </div>
                        <span className="font-bold text-xs text-white truncate">{ORIGIN_COUNTRY_LABELS[code]}</span>
                      </div>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-white/5 border border-white/10 text-gray-300 flex-shrink-0">
                        {code}
                      </span>
                    </button>
                  );
                });
              })()}
            </div>

            {/* Drawer Footer Hint */}
            <div className="p-4 border-t border-hbo-border/50 bg-black/40 flex items-center justify-center text-xs text-gray-400 select-none">
              <span>Press <strong className="text-white font-semibold">Back</strong> to return</span>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* Android TV Telegram Microservice Endpoint URL Right Drawer (Level 3)      */}
      {/* ========================================================================= */}
      {showTelegramUrlDrawer && (
        <div
          role="dialog"
          aria-modal="true"
          data-drawer-container="true"
          className="fixed inset-0 z-[9999] flex justify-end bg-black/80 backdrop-blur-md animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowTelegramUrlDrawer(false);
              setShowTelegramMsmDrawer(true);
            }
          }}
        >
          {/* Left Side Parent Path Context */}
          <div className="flex-1 hidden md:flex flex-col justify-center pl-16 pr-8 pointer-events-none select-none">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-400 tracking-wider uppercase mb-2">
              <span className="text-gray-400">Settings</span>
              <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-gray-400">Playback &amp; Streaming</span>
              <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-gray-400">Stream Engines</span>
              <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-gray-400">Telegram</span>
              <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-hbo-cyan font-semibold">MSM32bot</span>
            </div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight mb-2">Microservice Endpoint URL</h1>
            <p className="text-sm text-gray-400 max-w-md leading-relaxed">
              Select a quick preset or enter custom server address running Telegram MTProto client.
            </p>
          </div>

          <div className="w-full max-w-md h-full bg-hbo-card/95 border-l border-hbo-border/80 shadow-2xl flex flex-col justify-between animate-slide-in-right overflow-hidden">
            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4 font-sans">
              {(() => {
                const currentUrl = settings.msm32GetterUrl || 'http://julietmike.net:3033';
                const isJmSelected = currentUrl === 'http://julietmike.net:3033';
                const isRenderSelected = currentUrl === 'https://msm-getter.onrender.com';

                const applyUrl = (url: string) => {
                  const trimmed = url.trim().replace(/\/+$/, '');
                  const finalUrl = trimmed || 'http://julietmike.net:3033';
                  msm32Service.clearCache();
                  handleUpdate({ msm32GetterUrl: finalUrl });
                  setMsmUrlInput(finalUrl);
                  setTestingMsm32(true);
                  setMsm32TestResult(null);
                  msm32Service.testConnection(finalUrl)
                    .then((res) => setMsm32TestResult(res))
                    .catch((err: any) => setMsm32TestResult({ ok: false, error: err?.message || 'Connection failed' }))
                    .finally(() => setTestingMsm32(false));
                };

                return (
                  <>
                    <div className="space-y-1">
                      <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Server Presets</span>
                      <p className="text-[11px] text-gray-400 leading-snug">
                        Choose a pre-configured backend endpoint. Selecting immediately updates settings.
                      </p>
                    </div>

                    {/* Preset 1: julietmike.net (Default) */}
                    <button
                      id="drawer-msm-preset-julietmike"
                      data-telegram-url-drawer-item="true"
                      data-telegram-url-selected={isJmSelected ? 'true' : 'false'}
                      type="button"
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          const target = document.getElementById('drawer-msm-preset-render');
                          target?.focus();
                          target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                        }
                      }}
                      onClick={() => applyUrl('http://julietmike.net:3033')}
                      className={`w-full p-4 rounded-xl border text-left transition-all tv-focus-target flex items-center justify-between gap-3 ${
                        isJmSelected
                          ? 'bg-sky-950/40 border-sky-400 text-white shadow-hbo-glow ring-1 ring-sky-400/40'
                          : 'bg-black/30 border-hbo-border hover:border-gray-600 text-gray-400'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-sm text-white">julietmike.net</span>
                          <span className="text-[10px] text-sky-400 font-mono font-bold bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-400/20">
                            Default
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-400 font-mono truncate">http://julietmike.net:3033</p>
                        <p className="text-[10px] text-gray-500 mt-1">Direct streaming on port 3033. High performance.</p>
                      </div>
                      <div className={`w-6 h-6 rounded-full border flex items-center justify-center flex-shrink-0 ${
                        isJmSelected ? 'bg-sky-500 border-sky-400 text-black' : 'border-gray-600 bg-black/40 text-transparent'
                      }`}>
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </div>
                    </button>

                    {/* Preset 2: Render Cloud */}
                    <button
                      id="drawer-msm-preset-render"
                      data-telegram-url-drawer-item="true"
                      data-telegram-url-selected={isRenderSelected ? 'true' : 'false'}
                      type="button"
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          const target = document.getElementById('drawer-msm-preset-julietmike');
                          target?.focus();
                          target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                        } else if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          const target = document.getElementById('drawer-msm-url-input');
                          target?.focus();
                          target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                        }
                      }}
                      onClick={() => applyUrl('https://msm-getter.onrender.com')}
                      className={`w-full p-4 rounded-xl border text-left transition-all tv-focus-target flex items-center justify-between gap-3 ${
                        isRenderSelected
                          ? 'bg-sky-950/40 border-sky-400 text-white shadow-hbo-glow ring-1 ring-sky-400/40'
                          : 'bg-black/30 border-hbo-border hover:border-gray-600 text-gray-400'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-sm text-white">Render Cloud</span>
                          <span className="text-[10px] text-gray-400 font-mono font-bold bg-white/10 px-1.5 py-0.5 rounded border border-white/20">
                            Cloud
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-400 font-mono truncate">https://msm-getter.onrender.com</p>
                        <p className="text-[10px] text-gray-500 mt-1">Hosted on Render cloud. Auto spins down when idle.</p>
                      </div>
                      <div className={`w-6 h-6 rounded-full border flex items-center justify-center flex-shrink-0 ${
                        isRenderSelected ? 'bg-sky-500 border-sky-400 text-black' : 'border-gray-600 bg-black/40 text-transparent'
                      }`}>
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </div>
                    </button>

                    {/* Custom Address Input (Auto-saves on Enter or blur) */}
                    <div className="space-y-2 pt-2 border-t border-hbo-border/50">
                      <div>
                        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Custom Server Address</span>
                        <p className="text-[11px] text-gray-400 mt-0.5">Press Enter on remote keyboard to apply.</p>
                      </div>
                      <input
                        id="drawer-msm-url-input"
                        data-telegram-url-drawer-item="true"
                        type="text"
                        value={msmUrlInput}
                        onChange={(e) => setMsmUrlInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            const target = document.getElementById('drawer-msm-preset-render');
                            target?.focus();
                            target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                          } else if (e.key === 'Enter') {
                            e.preventDefault();
                            applyUrl(msmUrlInput);
                          }
                        }}
                        onBlur={() => {
                          const trimmed = msmUrlInput.trim().replace(/\/+$/, '');
                          if (trimmed && trimmed !== settings.msm32GetterUrl) {
                            applyUrl(trimmed);
                          }
                        }}
                        placeholder="http://julietmike.net:3033"
                        className="w-full bg-black/50 border border-white/15 rounded-xl px-4 py-3 text-xs text-white font-mono placeholder:text-gray-600 focus:outline-none focus:border-sky-400/80 transition-colors tv-focus-target"
                      />
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Drawer Footer Hint */}
            <div className="p-4 border-t border-hbo-border/50 bg-black/40 flex items-center justify-center text-xs text-gray-400 select-none">
              <span>Press <strong className="text-white font-semibold">Back</strong> to return</span>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* Android TV Telegram MSM32 Sub-Drawer (Level 3)                            */}
      {/* ========================================================================= */}
      {showTelegramMsmDrawer && (
        <div
          role="dialog"
          aria-modal="true"
          data-drawer-container="true"
          className="fixed inset-0 z-[9999] flex justify-end bg-black/80 backdrop-blur-md animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowTelegramMsmDrawer(false);
              setShowTelegramDrawer(true);
            }
          }}
        >
          {/* Left Side Parent Path Context */}
          <div className="flex-1 hidden md:flex flex-col justify-center pl-16 pr-8 pointer-events-none select-none">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-400 tracking-wider uppercase mb-2">
              <span className="text-gray-400">Settings</span>
              <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-gray-400">Stream Engines</span>
              <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-gray-400">Telegram</span>
              <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-sky-400 font-semibold">MSM32bot</span>
            </div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight mb-2">MovieSubMalay (@msm32bot)</h1>
            <p className="text-sm text-gray-400 max-w-md leading-relaxed">
              Configure MSM Getter microservice endpoint, connection test, and bot stream settings.
            </p>
          </div>

          <div className="w-full max-w-md h-full bg-hbo-card/95 border-l border-hbo-border/80 shadow-2xl flex flex-col justify-between animate-slide-in-right overflow-hidden">
            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4 font-sans">
              {(() => {
                const enabledTg = settings.enabledTelegramProviders || ['telegram-msm32'];
                const isMsmEnabled = enabledTg.includes('telegram-msm32');
                const currentUrl = settings.msm32GetterUrl || 'https://msm-getter.onrender.com';

                return (
                  <>
                    {/* Item 0: Enable / Disable @msm32bot Toggle */}
                    <button
                      id="drawer-msm-toggle"
                      data-telegram-msm-drawer-item="true"
                      type="button"
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          const target = document.getElementById('drawer-msm32-sub-url');
                          target?.focus();
                          target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                        }
                      }}
                      onClick={() => {
                        const updated = isMsmEnabled
                          ? enabledTg.filter(id => id !== 'telegram-msm32')
                          : [...enabledTg, 'telegram-msm32'];
                        handleUpdate({ enabledTelegramProviders: updated });
                      }}
                      className={`w-full p-4 rounded-xl border text-left transition-all tv-focus-target flex items-center justify-between ${
                        isMsmEnabled
                          ? 'bg-sky-950/40 border-sky-400 text-white shadow-hbo-glow ring-1 ring-sky-400/40'
                          : 'bg-black/30 border-hbo-border hover:border-gray-600 text-gray-400'
                      }`}
                    >
                      <div className="min-w-0 pr-3">
                        <div className="font-bold text-sm text-white mb-0.5 flex items-center gap-2">
                          <Send className="w-4 h-4 text-sky-400" />
                          <span>Enable @msm32bot</span>
                        </div>
                        <p className="text-[11px] text-gray-400">Probe and stream releases from MovieSubMalay bot.</p>
                      </div>
                      <div className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 ${
                        isMsmEnabled ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40' : 'bg-white/5 text-gray-400 border border-white/10'
                      }`}>
                        {isMsmEnabled ? <Check className="w-3.5 h-3.5 stroke-[2.5]" /> : <X className="w-3.5 h-3.5 stroke-[2.5]" />}
                        <span>{isMsmEnabled ? 'Active' : 'Disabled'}</span>
                      </div>
                    </button>

                    {/* Sub-Drawer Item: Microservice Endpoint URL */}
                    <div className="bg-black/40 border border-hbo-border rounded-xl p-3.5 flex items-center justify-between">
                      <div className="min-w-0 pr-2">
                        <div className="font-bold text-xs text-white flex items-center gap-1.5 mb-0.5">
                          <Server className="w-3.5 h-3.5 text-sky-400" />
                          <span>Microservice Endpoint URL</span>
                        </div>
                        <p className="text-[10px] text-gray-400">Backend server running Telegram MTProto client.</p>
                      </div>
                      <button
                        id="drawer-msm32-sub-url"
                        data-telegram-msm-drawer-item="true"
                        type="button"
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            const target = document.getElementById('drawer-msm-toggle');
                            target?.focus();
                            target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                          } else if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            const target = document.getElementById('drawer-btn-msm32-test');
                            target?.focus();
                            target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                          }
                        }}
                        onClick={() => {
                          setShowTelegramMsmDrawer(false);
                          setShowTelegramUrlDrawer(true);
                        }}
                        className="px-3 py-1.5 rounded-lg border text-xs font-bold transition-all tv-focus-target flex items-center gap-1.5 border-hbo-border bg-hbo-dark/80 hover:bg-hbo-hover text-white flex-shrink-0"
                      >
                        <span className="text-sky-400 font-mono">
                          {currentUrl.includes('localhost') ? 'Local PC' : 'Render Cloud'}
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                      </button>
                    </div>

                    {/* Microservice Health Test & Re-ping */}
                    <div className="bg-black/40 border border-hbo-border rounded-xl p-4 space-y-3">
                      <div>
                        <span className="text-xs font-bold text-white block mb-0.5">Test Microservice Connection</span>
                        <p className="text-[11px] text-gray-400">Verify server responsiveness and Telegram MTProto status.</p>
                      </div>

                      <button
                        id="drawer-btn-msm32-test"
                        data-telegram-msm-drawer-item="true"
                        type="button"
                        aria-busy={testingMsm32}
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            const target = document.getElementById('drawer-msm32-sub-url');
                            target?.focus();
                            target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                          } else if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            const target = document.getElementById('drawer-msm32-sub-quality');
                            target?.focus();
                            target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                          }
                        }}
                        onClick={async () => {
                          if (testingMsm32) return;
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
                        className={`w-full py-2.5 rounded-xl text-black font-bold text-xs flex items-center justify-center gap-2 transition-all tv-focus-target ${
                          testingMsm32 ? 'bg-sky-400/80 cursor-wait' : 'bg-sky-500 hover:bg-sky-400'
                        }`}
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${testingMsm32 ? 'animate-spin' : ''}`} />
                        <span>{testingMsm32 ? 'Pinging Server (Waking Up)...' : 'Re-ping Microservice Server'}</span>
                      </button>

                      {msm32TestResult ? (
                        <div className={`p-2.5 rounded-lg text-xs flex items-center gap-2 border ${
                          msm32TestResult.ok
                            ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/40'
                            : 'bg-rose-950/40 text-rose-300 border-rose-500/40'
                        }`}>
                          {msm32TestResult.ok ? (
                            <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                          )}
                          <span className="truncate">
                            {msm32TestResult.ok
                              ? `Online! Status: ${msm32TestResult.status || 'running'} • MTProto: ${msm32TestResult.isConnected ? 'Connected' : 'Standby'}`
                              : `Failed / Waking Up: ${msm32TestResult.error}`}
                          </span>
                        </div>
                      ) : testingMsm32 && (
                        <div className="p-2.5 rounded-lg text-xs flex items-center gap-2 border bg-sky-950/40 text-sky-300 border-sky-500/40">
                          <RefreshCw className="w-4 h-4 text-sky-400 flex-shrink-0 animate-spin" />
                          <span className="truncate">Pinging server... Please wait if waking up from sleep.</span>
                        </div>
                      )}
                    </div>

                    {/* View Server Logs in Browser Button */}
                    <button
                      id="drawer-btn-msm32-logs"
                      data-telegram-msm-drawer-item="true"
                      type="button"
                      onClick={() => {
                        const target = `${(settings.msm32GetterUrl || 'http://julietmike.net:3033').replace(/\/+$/, '')}/logs`;
                        window.open(target, '_blank');
                      }}
                      className="w-full py-2.5 px-3 rounded-xl border text-xs font-bold transition-all tv-focus-target flex items-center justify-between border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 text-sky-300"
                    >
                      <div className="flex items-center gap-2">
                        <Terminal className="w-4 h-4 text-sky-400" />
                        <span>View Live Server Logs &amp; Diagnostics</span>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-sky-400" />
                    </button>

                    {/* Sub-Drawer Item: Max Stream Resolution */}
                    <div className="bg-black/40 border border-hbo-border rounded-xl p-3.5 flex items-center justify-between">
                      <div className="min-w-0 pr-2">
                        <div className="font-bold text-xs text-white flex items-center gap-1.5 mb-0.5">
                          <Sliders className="w-3.5 h-3.5 text-sky-400" />
                          <span>Max Stream Resolution</span>
                        </div>
                        <p className="text-[10px] text-gray-400">Target video resolution for Telegram streams.</p>
                      </div>
                      <button
                        id="drawer-msm32-sub-quality"
                        data-telegram-msm-drawer-item="true"
                        type="button"
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            const target = document.getElementById('drawer-btn-msm32-test');
                            target?.focus();
                            target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                          } else if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            const target = document.getElementById('drawer-msm32-sub-chunk');
                            target?.focus();
                            target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                          }
                        }}
                        onClick={() => {
                          const currentQuality = settings.msm32MaxQuality || '1080';
                          handleUpdate({ msm32MaxQuality: currentQuality === '1080' ? '720' : '1080' });
                        }}
                        className="px-3 py-1.5 rounded-lg border text-xs font-bold transition-all tv-focus-target flex items-center gap-1.5 border-hbo-border bg-hbo-dark/80 hover:bg-hbo-hover text-white flex-shrink-0"
                      >
                        <span className="text-sky-400 font-mono">
                          {(settings.msm32MaxQuality || '1080') === '1080' ? '1080p (Full HD)' : '720p (HD)'}
                        </span>
                      </button>
                    </div>

                    {/* Sub-Drawer Item: Stream Chunk Slice Buffer */}
                    <div className="bg-black/40 border border-hbo-border rounded-xl p-3.5 flex items-center justify-between">
                      <div className="min-w-0 pr-2">
                        <div className="font-bold text-xs text-white flex items-center gap-1.5 mb-0.5">
                          <HardDrive className="w-3.5 h-3.5 text-sky-400" />
                          <span>Stream Pipeline Buffer</span>
                        </div>
                        <p className="text-[10px] text-gray-400">Configure prefetch concurrency and pipeline depth.</p>
                      </div>
                      <button
                        id="drawer-msm32-sub-chunk"
                        data-telegram-msm-drawer-item="true"
                        type="button"
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            const target = document.getElementById('drawer-msm32-sub-quality');
                            target?.focus();
                            target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                          } else if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            const target = document.getElementById('drawer-msm32-sub-country');
                            target?.focus();
                            target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                          }
                        }}
                        onClick={() => {
                          setShowTelegramMsmDrawer(false);
                          setShowTelegramChunkDrawer(true);
                        }}
                        className="px-3 py-1.5 rounded-lg border text-xs font-bold transition-all tv-focus-target flex items-center gap-1.5 border-hbo-border bg-hbo-dark/80 hover:bg-hbo-hover text-white flex-shrink-0"
                      >
                        <span className="text-sky-400 font-mono">
                          {((settings.msm32ChunkSize || 524288) / 1024).toFixed(0)} KB
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                      </button>
                    </div>

                    {/* Sub-Drawer Item: Active Country Origin Filters */}
                    <div className="bg-black/40 border border-hbo-border rounded-xl p-3.5 flex items-center justify-between">
                      <div className="min-w-0 pr-2">
                        <div className="font-bold text-xs text-white flex items-center gap-1.5 mb-0.5">
                          <Globe className="w-3.5 h-3.5 text-sky-400" />
                          <span>Country Origin Filters</span>
                        </div>
                        <p className="text-[10px] text-gray-400">Trigger provider based on title origin countries.</p>
                      </div>
                      <button
                        id="drawer-msm32-sub-country"
                        data-telegram-msm-drawer-item="true"
                        type="button"
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            const target = document.getElementById('drawer-msm32-sub-chunk');
                            target?.focus();
                            target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                          } else if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            const target = document.getElementById('drawer-msm32-btn-clear-cache');
                            target?.focus();
                            target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                          }
                        }}
                        onClick={() => {
                          setShowTelegramMsmDrawer(false);
                          setShowTelegramCountryDrawer(true);
                        }}
                        className="px-3 py-1.5 rounded-lg border text-xs font-bold transition-all tv-focus-target flex items-center gap-1.5 border-hbo-border bg-hbo-dark/80 hover:bg-hbo-hover text-white flex-shrink-0"
                      >
                        <span className="text-sky-400 font-mono">
                          {((settings.telegramProviderCountries && settings.telegramProviderCountries['telegram-msm32']) || ['MY', 'ID', 'SG']).length} active
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                      </button>
                    </div>

                  </>
                );
              })()}
            </div>

            {/* Drawer Footer Hint */}
            <div className="p-4 border-t border-hbo-border/50 bg-black/40 flex items-center justify-center text-xs text-gray-400 select-none">
              <span>Press <strong className="text-white font-semibold">Back</strong> to return to Telegram Provider</span>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* Android TV Embed Resolver Right Drawer (Level 2)                          */}
      {/* ========================================================================= */}
      {showEmbedResolverDrawer && (
        <div
          role="dialog"
          aria-modal="true"
          data-drawer-container="true"
          className="fixed inset-0 z-[9999] flex justify-end bg-black/80 backdrop-blur-md animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowEmbedResolverDrawer(false);
              setShowEnginesDrawer(true);
            }
          }}
        >
          {/* Left Side Parent Path Context */}
          <div className="flex-1 hidden md:flex flex-col justify-center pl-16 pr-8 pointer-events-none select-none">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-400 tracking-wider uppercase mb-2">
              <span className="text-gray-400">Settings</span>
              <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-gray-400">Playback &amp; Streaming</span>
              <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-hbo-cyan font-semibold">Stream Engines</span>
            </div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight mb-2">Embed Resolver</h1>
            <p className="text-sm text-gray-400 max-w-md leading-relaxed">
              Multi-mirror fallback embeds. Configure connection timeouts and priority servers.
            </p>
          </div>

          <div className="w-full max-w-md h-full bg-hbo-card/95 border-l border-hbo-border/80 shadow-2xl flex flex-col justify-between animate-slide-in-right overflow-hidden">
            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4 font-sans">
              {(() => {
                const currentEnabled = settings.enabledResolvers && settings.enabledResolvers.length > 0
                  ? settings.enabledResolvers
                  : ['embed'];
                const isEmbedEnabled = currentEnabled.includes('embed');

                return (
                  <>
                    {/* Item 0: Enable / Disable Embed Resolver Toggle */}
                    <button
                      id="drawer-embed-toggle"
                      data-embed-drawer-item="true"
                      type="button"
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          document.getElementById('drawer-embed-sub-timeout')?.focus();
                        }
                      }}
                      onClick={() => {
                        let updated: StreamResolverType[];
                        if (isEmbedEnabled) {
                          if (currentEnabled.length === 1) return; // Must have at least one resolver enabled
                          updated = currentEnabled.filter(r => r !== 'embed') as StreamResolverType[];
                        } else {
                          updated = [...currentEnabled, 'embed'] as StreamResolverType[];
                        }
                        handleUpdate({
                          enabledResolvers: updated,
                          streamResolver: updated[0] || 'embed'
                        });
                      }}
                      className={`w-full p-4 rounded-xl border text-left transition-all tv-focus-target flex items-center justify-between ${
                        isEmbedEnabled
                          ? 'bg-hbo-purple/30 border-hbo-cyan text-white shadow-hbo-glow ring-1 ring-hbo-cyan/40'
                          : 'bg-black/30 border-hbo-border hover:border-gray-600 text-gray-400'
                      }`}
                    >
                      <div className="min-w-0 pr-3">
                        <div className="font-bold text-sm text-white mb-0.5">Enable Embed Resolver</div>
                        <p className="text-[11px] text-gray-400">Stream via web player iframe embeds (VidLink, MoviesAPI, etc.).</p>
                      </div>
                      <div className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 ${
                        isEmbedEnabled ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-white/5 text-gray-400 border border-white/10'
                      }`}>
                        {isEmbedEnabled ? <Check className="w-3.5 h-3.5 stroke-[2.5]" /> : <X className="w-3.5 h-3.5 stroke-[2.5]" />}
                        <span>{isEmbedEnabled ? 'Enabled' : 'Disabled'}</span>
                      </div>
                    </button>

                    {/* Item 1: Stream Resolver Timeout Hub Button */}
                    <div className="bg-black/40 border border-hbo-border rounded-xl p-3.5 flex items-center justify-between">
                      <div className="min-w-0 pr-2">
                        <div className="font-bold text-xs text-white flex items-center gap-1.5 mb-0.5">
                          <Clock className="w-3.5 h-3.5 text-hbo-cyan" />
                          <span>Resolver Timeout</span>
                        </div>
                        <p className="text-[10px] text-gray-400">Max wait time before auto-failing over.</p>
                      </div>
                      <button
                        id="drawer-embed-sub-timeout"
                        data-embed-drawer-item="true"
                        type="button"
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            document.getElementById('drawer-embed-toggle')?.focus();
                          } else if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            const target = document.getElementById('drawer-embed-sub-retries');
                            target?.focus();
                            target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                          }
                        }}
                        onClick={() => {
                          setShowEmbedResolverDrawer(false);
                          setShowEmbedTimeoutDrawer(true);
                        }}
                        className="px-3 py-1.5 rounded-lg border text-xs font-bold transition-all tv-focus-target flex items-center gap-1.5 border-hbo-border bg-hbo-dark/80 hover:bg-hbo-hover text-white flex-shrink-0"
                      >
                        <span className="text-hbo-cyan">{(settings.streamResolverTimeout ?? 0) === 0 ? 'Unlimited' : `${settings.streamResolverTimeout} Seconds`}</span>
                        <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                      </button>
                    </div>

                    {/* Item 2: Stream Resolver Retries Hub Button */}
                    <div className="bg-black/40 border border-hbo-border rounded-xl p-3.5 flex items-center justify-between">
                      <div className="min-w-0 pr-2">
                        <div className="font-bold text-xs text-white flex items-center gap-1.5 mb-0.5">
                          <RefreshCw className="w-3.5 h-3.5 text-hbo-cyan" />
                          <span>Resolver Retries</span>
                        </div>
                        <p className="text-[10px] text-gray-400">Retry count on failure before failover (clears cache).</p>
                      </div>
                      <button
                        id="drawer-embed-sub-retries"
                        data-embed-drawer-item="true"
                        type="button"
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            const target = document.getElementById('drawer-embed-sub-timeout');
                            target?.focus();
                            target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                          } else if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            const target = document.getElementById('drawer-embed-priority-general');
                            target?.focus();
                            target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                          }
                        }}
                        onClick={() => {
                          setShowEmbedResolverDrawer(false);
                          setShowEmbedRetryDrawer(true);
                        }}
                        className="px-3 py-1.5 rounded-lg border text-xs font-bold transition-all tv-focus-target flex items-center gap-1.5 border-hbo-border bg-hbo-dark/80 hover:bg-hbo-hover text-white flex-shrink-0"
                      >
                        <span className="text-hbo-cyan">{(settings.streamResolverRetries ?? 1) === 0 ? 'No Retry' : `${settings.streamResolverRetries ?? 1}× Attempts`}</span>
                        <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                      </button>
                    </div>


                    {/* Item 3: Category Priority Submenu Items (General, Anime, Asean, Korean) */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between px-1">
                        <div>
                          <div className="font-bold text-xs text-white flex items-center gap-1.5 mb-0.5">
                            <Server className="w-3.5 h-3.5 text-hbo-cyan" />
                            <span>Category Server Priorities</span>
                          </div>
                          <p className="text-[10px] text-gray-400">Configure primary and failover mirror sequence per category.</p>
                        </div>
                        <span className="text-[9px] px-2 py-0.5 rounded bg-hbo-purple/30 text-hbo-cyan font-bold border border-hbo-purple/50">
                          {STREAM_PROVIDERS.length} Servers
                        </span>
                      </div>

                      {/* General Priority Submenu Button */}
                      {(() => {
                        const top = (settings.topProviders && settings.topProviders.length >= 3)
                          ? settings.topProviders
                          : ['vidlink', 'moviesapi', 'cinesrc'];
                        const p1 = STREAM_PROVIDERS.find(p => p.id === top[0])?.name || top[0];
                        const p2 = STREAM_PROVIDERS.find(p => p.id === top[1])?.name || top[1];
                        const p3 = STREAM_PROVIDERS.find(p => p.id === top[2])?.name || top[2];

                        return (
                          <button
                            id="drawer-embed-priority-general"
                            data-embed-drawer-item="true"
                            type="button"
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                document.getElementById('drawer-embed-sub-retries')?.focus();
                              } else if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                document.getElementById('drawer-embed-priority-anime')?.focus();
                              }
                            }}
                            onClick={() => {
                              setPriorityCategoryTab('general');
                              setShowEmbedResolverDrawer(false);
                              setActivePriorityDrawer('general');
                            }}
                            className="w-full p-3.5 rounded-2xl border text-left transition-all tv-focus-target flex items-center justify-between gap-3 bg-hbo-dark/60 border-hbo-border hover:bg-hbo-hover hover:border-white/20"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-bold text-xs text-white truncate">General Priority Servers</span>
                                <span className="text-[9px] px-2 py-0.5 rounded font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                                  Default
                                </span>
                              </div>
                              <p className="text-[11px] text-gray-400 leading-snug truncate">
                                1. <span className="text-white font-semibold">{p1}</span> • 2. {p2} • 3. {p3}
                              </p>
                            </div>
                            <ChevronRight className="w-5 h-5 text-gray-400 stroke-[2.2] flex-shrink-0" />
                          </button>
                        );
                      })()}

                      {/* Anime Priority Submenu Button */}
                      {(() => {
                        const top = (settings.topAnimeProviders && settings.topAnimeProviders.length >= 3)
                          ? settings.topAnimeProviders
                          : ['megaplay-anime', 'cinesrc', 'moviesapi'];
                        const p1 = STREAM_PROVIDERS.find(p => p.id === top[0])?.name || top[0];
                        const p2 = STREAM_PROVIDERS.find(p => p.id === top[1])?.name || top[1];
                        const p3 = STREAM_PROVIDERS.find(p => p.id === top[2])?.name || top[2];

                        return (
                          <button
                            id="drawer-embed-priority-anime"
                            data-embed-drawer-item="true"
                            type="button"
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                document.getElementById('drawer-embed-priority-general')?.focus();
                              } else if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                document.getElementById('drawer-embed-priority-asean')?.focus();
                              }
                            }}
                            onClick={() => {
                              setPriorityCategoryTab('anime');
                              setShowEmbedResolverDrawer(false);
                              setActivePriorityDrawer('anime');
                            }}
                            className="w-full p-3.5 rounded-2xl border text-left transition-all tv-focus-target flex items-center justify-between gap-3 bg-hbo-dark/60 border-hbo-border hover:bg-hbo-hover hover:border-white/20"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-bold text-xs text-white truncate">Anime Priority Servers</span>
                                <span className="text-[9px] px-2 py-0.5 rounded font-mono font-bold bg-pink-500/20 text-pink-300 border border-pink-500/40">
                                  Anime
                                </span>
                              </div>
                              <p className="text-[11px] text-gray-400 leading-snug truncate">
                                1. <span className="text-white font-semibold">{p1}</span> • 2. {p2} • 3. {p3}
                              </p>
                            </div>
                            <ChevronRight className="w-5 h-5 text-gray-400 stroke-[2.2] flex-shrink-0" />
                          </button>
                        );
                      })()}

                      {/* Asean Priority Submenu Button */}
                      {(() => {
                        const top = ((settings.topAseanProviders || (settings as any).topAsianProviders) && (settings.topAseanProviders || (settings as any).topAsianProviders).length >= 3)
                          ? (settings.topAseanProviders || (settings as any).topAsianProviders)
                          : ['pencurimovie-my', 'vidlink', '111movies'];
                        const p1 = STREAM_PROVIDERS.find(p => p.id === top[0])?.name || top[0];
                        const p2 = STREAM_PROVIDERS.find(p => p.id === top[1])?.name || top[1];
                        const p3 = STREAM_PROVIDERS.find(p => p.id === top[2])?.name || top[2];

                        return (
                          <button
                            id="drawer-embed-priority-asean"
                            data-embed-drawer-item="true"
                            type="button"
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                document.getElementById('drawer-embed-priority-anime')?.focus();
                              } else if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                document.getElementById('drawer-embed-priority-korean')?.focus();
                              }
                            }}
                            onClick={() => {
                              setPriorityCategoryTab('asean');
                              setShowEmbedResolverDrawer(false);
                              setActivePriorityDrawer('asean');
                            }}
                            className="w-full p-3.5 rounded-2xl border text-left transition-all tv-focus-target flex items-center justify-between gap-3 bg-hbo-dark/60 border-hbo-border hover:bg-hbo-hover hover:border-white/20"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-bold text-xs text-white truncate">Asean Priority Servers</span>
                                <span className="text-[9px] px-2 py-0.5 rounded font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                  Asean
                                </span>
                              </div>
                              <p className="text-[11px] text-gray-400 leading-snug truncate">
                                1. <span className="text-white font-semibold">{p1}</span> • 2. {p2} • 3. {p3}
                              </p>
                            </div>
                            <ChevronRight className="w-5 h-5 text-gray-400 stroke-[2.2] flex-shrink-0" />
                          </button>
                        );
                      })()}

                      {/* Korean Priority Submenu Button */}
                      {(() => {
                        const top = (settings.topKoreanProviders && settings.topKoreanProviders.length >= 3)
                          ? settings.topKoreanProviders
                          : ['kisskh-kdrama', 'cinesrc', 'moviesapi'];
                        const p1 = STREAM_PROVIDERS.find(p => p.id === top[0])?.name || top[0];
                        const p2 = STREAM_PROVIDERS.find(p => p.id === top[1])?.name || top[1];
                        const p3 = STREAM_PROVIDERS.find(p => p.id === top[2])?.name || top[2];

                        return (
                          <button
                            id="drawer-embed-priority-korean"
                            data-embed-drawer-item="true"
                            type="button"
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                document.getElementById('drawer-embed-priority-asean')?.focus();
                              }
                            }}
                            onClick={() => {
                              setPriorityCategoryTab('korean');
                              setShowEmbedResolverDrawer(false);
                              setActivePriorityDrawer('korean');
                            }}
                            className="w-full p-3.5 rounded-2xl border text-left transition-all tv-focus-target flex items-center justify-between gap-3 bg-hbo-dark/60 border-hbo-border hover:bg-hbo-hover hover:border-white/20"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-bold text-xs text-white truncate">Korean Priority Servers</span>
                                <span className="text-[9px] px-2 py-0.5 rounded font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                                  K-Drama
                                </span>
                              </div>
                              <p className="text-[11px] text-gray-400 leading-snug truncate">
                                1. <span className="text-white font-semibold">{p1}</span> • 2. {p2} • 3. {p3}
                              </p>
                            </div>
                            <ChevronRight className="w-5 h-5 text-gray-400 stroke-[2.2] flex-shrink-0" />
                          </button>
                        );
                      })()}
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Drawer Footer Hint */}
            <div className="p-4 border-t border-hbo-border/50 bg-black/40 flex items-center justify-center text-xs text-gray-400 select-none">
              <span>Press <strong className="text-white font-semibold">Back</strong> to return</span>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* Android TV Stream Resolver Timeout Right Drawer (Level 3)                 */}
      {/* ========================================================================= */}
      {showEmbedTimeoutDrawer && (
        <div
          role="dialog"
          aria-modal="true"
          data-drawer-container="true"
          className="fixed inset-0 z-[9999] flex justify-end bg-black/80 backdrop-blur-md animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowEmbedTimeoutDrawer(false);
              setShowEmbedResolverDrawer(true);
            }
          }}
        >
          {/* Left Side Parent Path Context */}
          <div className="flex-1 hidden md:flex flex-col justify-center pl-16 pr-8 pointer-events-none select-none">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-400 tracking-wider uppercase mb-2">
              <span className="text-gray-400">Settings</span>
              <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-gray-400">Playback &amp; Streaming</span>
              <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-gray-400">Stream Engines</span>
              <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-hbo-cyan font-semibold">Embed Resolver</span>
            </div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight mb-2">Resolver Timeout</h1>
            <p className="text-sm text-gray-400 max-w-md leading-relaxed">
              Max time allowed for primary embed providers before auto-failing over to the next backup server.
            </p>
          </div>

          <div className="w-full max-w-md h-full bg-hbo-card/95 border-l border-hbo-border/80 shadow-2xl flex flex-col justify-between animate-slide-in-right overflow-hidden">
            {/* Drawer Body: Single Column Options */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-2.5 font-sans">
              {(() => {
                const options = [
                  { seconds: 0, label: 'Unlimited (Default)', desc: 'Wait until stream resolves without timing out prematurely.' },
                  { seconds: 10, label: '10 Seconds', desc: 'Fast failover for high-speed fiber connections.' },
                  { seconds: 15, label: '15 Seconds', desc: 'Quick handshake for standard broadband.' },
                  { seconds: 20, label: '20 Seconds', desc: 'Balanced wait time for multi-step stream scrapers.' },
                  { seconds: 25, label: '25 Seconds', desc: 'Relaxed connection for slower networks & busy Wi-Fi.' },
                  { seconds: 30, label: '30 Seconds', desc: 'Maximum patience for high-latency mobile or VPN links.' },
                ];
                const currentVal = settings.streamResolverTimeout ?? 0;

                return options.map((opt, idx) => {
                  const isSelected = currentVal === opt.seconds;
                  return (
                    <button
                      key={opt.seconds}
                      id={`drawer-embed-timeout-${opt.seconds}`}
                      data-embed-timeout-drawer-item="true"
                      data-embed-timeout-selected={isSelected ? 'true' : 'false'}
                      type="button"
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowUp' && idx > 0) {
                          e.preventDefault();
                          document.getElementById(`drawer-embed-timeout-${options[idx - 1].seconds}`)?.focus();
                        } else if (e.key === 'ArrowDown' && idx < options.length - 1) {
                          e.preventDefault();
                          document.getElementById(`drawer-embed-timeout-${options[idx + 1].seconds}`)?.focus();
                        }
                      }}
                      onClick={() => {
                        handleUpdate({ streamResolverTimeout: opt.seconds });
                        setShowEmbedTimeoutDrawer(false);
                        setShowEmbedResolverDrawer(true);
                      }}
                      className={`w-full p-4 rounded-xl border text-left transition-all tv-focus-target flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'bg-hbo-purple/30 border-hbo-cyan text-white shadow-hbo-glow ring-1 ring-hbo-cyan/40'
                          : 'bg-black/30 border-hbo-border hover:border-gray-600 text-gray-300'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className={`font-bold text-xs sm:text-sm ${isSelected ? 'text-hbo-cyan' : 'text-white'}`}>
                            {opt.label}
                          </span>
                          {isSelected && (
                            <div className="flex items-center gap-1 text-[11px] font-bold text-hbo-cyan">
                              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                              <span>Selected</span>
                            </div>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-400 leading-snug">{opt.desc}</p>
                      </div>
                    </button>
                  );
                });
              })()}
            </div>

            {/* Drawer Footer Hint */}
            <div className="p-4 border-t border-hbo-border/50 bg-black/40 flex items-center justify-center text-xs text-gray-400 select-none">
              <span>Press <strong className="text-white font-semibold">Back</strong> to return</span>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* Android TV Stream Resolver Retry Right Drawer (Level 3)                   */}
      {/* ========================================================================= */}
      {showEmbedRetryDrawer && (
        <div
          role="dialog"
          aria-modal="true"
          data-drawer-container="true"
          className="fixed inset-0 z-[9999] flex justify-end bg-black/80 backdrop-blur-md animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowEmbedRetryDrawer(false);
              setShowEmbedResolverDrawer(true);
            }
          }}
        >
          {/* Left Side Parent Path Context */}
          <div className="flex-1 hidden md:flex flex-col justify-center pl-16 pr-8 pointer-events-none select-none">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-400 tracking-wider uppercase mb-2">
              <span className="text-gray-400">Settings</span>
              <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-gray-400">Playback &amp; Streaming</span>
              <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-gray-400">Stream Engines</span>
              <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-hbo-cyan font-semibold">Embed Resolver</span>
            </div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight mb-2">Resolver Retries</h1>
            <p className="text-sm text-gray-400 max-w-md leading-relaxed">
              How many times to retry a failed provider before failing over. Each retry clears cache before attempting fresh.
            </p>
          </div>

          <div className="w-full max-w-md h-full bg-hbo-card/95 border-l border-hbo-border/80 shadow-2xl flex flex-col justify-between animate-slide-in-right overflow-hidden">
            {/* Drawer Body: Single Column Options */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-2.5 font-sans">
              {(() => {
                const options = [
                  { retries: 0, label: '0× (No Retry)', desc: 'Fail over to backup provider immediately upon first failure.' },
                  { retries: 1, label: '1× Attempt (Default)', desc: 'Retry once after clearing cache before triggering failover.' },
                  { retries: 2, label: '2× Attempts (Moderate)', desc: 'Retry up to 2 times with cache reset for flaky network links.' },
                  { retries: 3, label: '3× Attempts (Aggressive)', desc: 'Maximum persistence before abandoning provider.' },
                ];
                const currentVal = settings.streamResolverRetries ?? 1;

                return options.map((opt, idx) => {
                  const isSelected = currentVal === opt.retries;
                  return (
                    <button
                      key={opt.retries}
                      id={`drawer-embed-retry-${opt.retries}`}
                      data-embed-retry-drawer-item="true"
                      data-embed-retry-selected={isSelected ? 'true' : 'false'}
                      type="button"
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowUp' && idx > 0) {
                          e.preventDefault();
                          document.getElementById(`drawer-embed-retry-${options[idx - 1].retries}`)?.focus();
                        } else if (e.key === 'ArrowDown' && idx < options.length - 1) {
                          e.preventDefault();
                          document.getElementById(`drawer-embed-retry-${options[idx + 1].retries}`)?.focus();
                        }
                      }}
                      onClick={() => {
                        handleUpdate({ streamResolverRetries: opt.retries });
                        setShowEmbedRetryDrawer(false);
                        setShowEmbedResolverDrawer(true);
                      }}
                      className={`w-full p-4 rounded-xl border text-left transition-all tv-focus-target flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'bg-hbo-purple/30 border-hbo-cyan text-white shadow-hbo-glow ring-1 ring-hbo-cyan/40'
                          : 'bg-black/30 border-hbo-border hover:border-gray-600 text-gray-300'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className={`font-bold text-xs sm:text-sm ${isSelected ? 'text-hbo-cyan' : 'text-white'}`}>
                            {opt.label}
                          </span>
                          {isSelected && (
                            <div className="flex items-center gap-1 text-[11px] font-bold text-hbo-cyan">
                              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                              <span>Selected</span>
                            </div>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-400 leading-snug">{opt.desc}</p>
                      </div>
                    </button>
                  );
                });
              })()}
            </div>

            {/* Drawer Footer Hint */}
            <div className="p-4 border-t border-hbo-border/50 bg-black/40 flex items-center justify-center text-xs text-gray-400 select-none">
              <span>Press <strong className="text-white font-semibold">Back</strong> to return</span>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* Android TV Category Priority Server Right Drawer (Level 3)                */}

      {/* ========================================================================= */}
      {activePriorityDrawer !== null && (
        <div
          role="dialog"
          aria-modal="true"
          data-drawer-container="true"
          className="fixed inset-0 z-[9999] flex justify-end bg-black/80 backdrop-blur-md animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              const cat = activePriorityDrawer;
              setActivePriorityDrawer(null);
              setShowEmbedResolverDrawer(true);
              setTimeout(() => {
                document.getElementById(`drawer-embed-priority-${cat}`)?.focus();
              }, 50);
            }
          }}
        >
          {/* Left Side Parent Path Context */}
          <div className="flex-1 hidden md:flex flex-col justify-center pl-16 pr-8 pointer-events-none select-none">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-400 tracking-wider uppercase mb-2">
              <span className="text-gray-400">Settings</span>
              <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-gray-400">Playback &amp; Streaming</span>
              <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-gray-400">Stream Engines</span>
              <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-hbo-cyan font-semibold">Embed Resolver</span>
            </div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight mb-2">
              {activePriorityDrawer === 'korean'
                ? 'Korean Priority Servers'
                : activePriorityDrawer === 'asean'
                ? 'Asean Priority Servers'
                : activePriorityDrawer === 'anime'
                ? 'Anime Priority Servers'
                : 'General Priority Servers'}
            </h1>
            <p className="text-sm text-gray-400 max-w-md leading-relaxed">
              {activePriorityDrawer === 'korean'
                ? 'Select primary and fallback stream resolvers optimized for Korean dramas & variety shows.'
                : activePriorityDrawer === 'asean'
                ? 'Select primary and fallback stream resolvers optimized for Southeast Asian & Chinese drama content.'
                : activePriorityDrawer === 'anime'
                ? 'Select primary and fallback stream resolvers dedicated to anime series and movies.'
                : 'Select primary and fallback stream resolvers for Hollywood, TV series, and general movies.'}
            </p>
          </div>

          <div className="w-full max-w-md h-full bg-hbo-card/95 border-l border-hbo-border/80 shadow-2xl flex flex-col justify-between animate-slide-in-right overflow-hidden">
            {/* Drawer Body: 3 Priority Server Slots */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-3 font-sans">
              <div className="flex items-center justify-between pb-1">
                <span className="text-xs font-bold text-gray-300">Server Priority Slots</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-hbo-purple/30 text-hbo-cyan font-bold border border-hbo-purple/50">
                  {STREAM_PROVIDERS.length} Servers Available
                </span>
              </div>

              {(() => {
                const isKoreanTab = activePriorityDrawer === 'korean';
                const isAseanTab = activePriorityDrawer === 'asean';
                const isAnimeTab = activePriorityDrawer === 'anime';
                const currentTop = isKoreanTab
                  ? (settings.topKoreanProviders && settings.topKoreanProviders.length >= 3
                      ? settings.topKoreanProviders
                      : ['kisskh-kdrama', 'cinesrc', 'moviesapi'])
                  : isAseanTab
                  ? ((settings.topAseanProviders || (settings as any).topAsianProviders) && (settings.topAseanProviders || (settings as any).topAsianProviders).length >= 3
                      ? (settings.topAseanProviders || (settings as any).topAsianProviders)
                      : ['pencurimovie-my', 'vidlink', '111movies'])
                  : isAnimeTab
                  ? (settings.topAnimeProviders && settings.topAnimeProviders.length >= 3
                      ? settings.topAnimeProviders
                      : ['megaplay-anime', 'cinesrc', 'moviesapi'])
                  : (settings.topProviders && settings.topProviders.length >= 3
                      ? settings.topProviders
                      : ['vidlink', 'moviesapi', 'cinesrc']);

                const slots = isKoreanTab
                  ? [
                      { index: 0, priorityLabel: '#1 Primary', badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40', defaultId: 'kisskh-kdrama', desc: 'First-choice server for Korean drama streams' },
                      { index: 1, priorityLabel: '#2 Failover 1', badgeClass: 'bg-hbo-purple/30 text-hbo-purple-light border-hbo-purple/40', defaultId: 'cinesrc', desc: 'First automatic fallback if #1 fails or times out' },
                      { index: 2, priorityLabel: '#3 Failover 2', badgeClass: 'bg-hbo-cyan/20 text-hbo-cyan border-hbo-cyan/40', defaultId: 'moviesapi', desc: 'Second fallback mirror' }
                    ]
                  : isAseanTab
                  ? [
                      { index: 0, priorityLabel: '#1 Primary', badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40', defaultId: 'pencurimovie-my', desc: 'First-choice server for Asean drama streams' },
                      { index: 1, priorityLabel: '#2 Failover 1', badgeClass: 'bg-hbo-purple/30 text-hbo-purple-light border-hbo-purple/40', defaultId: 'vidlink', desc: 'First automatic fallback if #1 fails or times out' },
                      { index: 2, priorityLabel: '#3 Failover 2', badgeClass: 'bg-hbo-cyan/20 text-hbo-cyan border-hbo-cyan/40', defaultId: '111movies', desc: 'Second fallback mirror' }
                    ]
                  : isAnimeTab
                  ? [
                      { index: 0, priorityLabel: '#1 Primary', badgeClass: 'bg-pink-500/20 text-pink-300 border-pink-500/40', defaultId: 'megaplay-anime', desc: 'First-choice server for Anime streaming' },
                      { index: 1, priorityLabel: '#2 Failover 1', badgeClass: 'bg-hbo-purple/30 text-hbo-purple-light border-hbo-purple/40', defaultId: 'cinesrc', desc: 'First automatic fallback if #1 fails or times out' },
                      { index: 2, priorityLabel: '#3 Failover 2', badgeClass: 'bg-hbo-cyan/20 text-hbo-cyan border-hbo-cyan/40', defaultId: 'moviesapi', desc: 'Second fallback mirror' }
                    ]
                  : [
                      { index: 0, priorityLabel: '#1 Primary', badgeClass: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40', defaultId: 'vidlink', desc: 'First-choice server for movies & TV series' },
                      { index: 1, priorityLabel: '#2 Failover 1', badgeClass: 'bg-hbo-purple/30 text-hbo-purple-light border-hbo-purple/40', defaultId: 'moviesapi', desc: 'First automatic fallback if #1 fails or times out' },
                      { index: 2, priorityLabel: '#3 Failover 2', badgeClass: 'bg-hbo-cyan/20 text-hbo-cyan border-hbo-cyan/40', defaultId: 'cinesrc', desc: 'Second fallback mirror' }
                    ];

                return slots.map(({ index, priorityLabel, badgeClass, defaultId, desc }) => {
                  const selectedId = currentTop[index] || defaultId;
                  const selectedProviderObj = STREAM_PROVIDERS.find(p => p.id === selectedId) || STREAM_PROVIDERS[0];

                  return (
                    <div
                      key={`${activePriorityDrawer}-${index}`}
                      className="bg-black/40 border border-hbo-border rounded-xl p-4 space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded border ${badgeClass} flex-shrink-0`}>
                          {priorityLabel}
                        </span>
                        <div className="flex items-center gap-1 flex-wrap justify-end">
                          {selectedProviderObj.categories.map((cat) => {
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
                      </div>
                      <p className="text-[11px] text-gray-400 leading-snug">{desc}</p>

                      <button
                        type="button"
                        id={`priority-server-btn-${index}`}
                        data-priority-server-item="true"
                        onClick={() => setPickerModalSlot(index)}
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowUp' && index > 0) {
                            e.preventDefault();
                            document.getElementById(`priority-server-btn-${index - 1}`)?.focus();
                          } else if (e.key === 'ArrowDown' && index < 2) {
                            e.preventDefault();
                            document.getElementById(`priority-server-btn-${index + 1}`)?.focus();
                          }
                        }}
                        className="w-full flex items-center justify-between bg-hbo-dark/90 border border-hbo-border hover:border-hbo-cyan text-white text-sm font-bold rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-hbo-cyan focus:ring-2 focus:ring-hbo-cyan transition-all tv-focus-target"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <Server className="w-4 h-4 text-hbo-cyan flex-shrink-0" />
                          <span className="truncate">{selectedProviderObj.name}</span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      </button>
                    </div>
                  );
                });
              })()}
            </div>

            {/* Drawer Footer Hint */}
            <div className="p-4 border-t border-hbo-border/50 bg-black/40 flex items-center justify-center text-xs text-gray-400 select-none">
              <span>Press <strong className="text-white font-semibold">Back</strong> to return</span>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* Android TV Watch Progress Update Interval Right Drawer (Level 1 Drawer)    */}
      {/* ========================================================================= */}
      {showTickerDrawer && (
        <div
          role="dialog"
          aria-modal="true"
          data-drawer-container="true"
          className="fixed inset-0 z-[9999] flex justify-end bg-black/80 backdrop-blur-md animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowTickerDrawer(false);
              setTimeout(() => {
                document.getElementById('playback-btn-ticker-hub')?.focus();
              }, 50);
            }
          }}
        >
          {/* Left Side Parent Path Context */}
          <div className="flex-1 hidden md:flex flex-col justify-center pl-16 pr-8 pointer-events-none select-none">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-400 tracking-wider uppercase mb-2">
              <span className="text-gray-400">Settings</span>
              <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-hbo-cyan font-semibold">Playback &amp; Streaming</span>
            </div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight mb-2">Watch Progress Update Interval</h1>
            <p className="text-sm text-gray-400 max-w-md leading-relaxed">
              Configure how frequently playback time and resume positions are synced to persistent local storage for web embed streams (e.g. KissKH, CineSRC).
            </p>
          </div>

          <div className="w-full max-w-md h-full bg-hbo-card/95 border-l border-hbo-border/80 shadow-2xl flex flex-col justify-between animate-slide-in-right overflow-hidden">
            {/* Drawer Body: Single Column Options */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-2.5 font-sans">
              {(() => {
                const options = [
                  { seconds: 1, label: '1 Second', desc: 'Realtime tracking with highest precision' },
                  { seconds: 2, label: '2 Seconds', desc: 'Fast tracking recommended for mobile devices' },
                  { seconds: 3, label: '3 Seconds', desc: 'Frequent tracking with low overhead' },
                  { seconds: 5, label: '5 Seconds (Default)', desc: 'Balanced interval recommended for Android TV' },
                  { seconds: 10, label: '10 Seconds', desc: 'Eco mode with minimum storage writes' },
                ];
                const currentVal = settings.watchProgressTickerInterval || 5;

                return options.map((opt, idx) => {
                  const isSelected = currentVal === opt.seconds;
                  return (
                    <button
                      key={opt.seconds}
                      id={`drawer-ticker-${opt.seconds}`}
                      data-ticker-drawer-item="true"
                      data-ticker-selected={isSelected ? 'true' : 'false'}
                      type="button"
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowUp' && idx > 0) {
                          e.preventDefault();
                          document.getElementById(`drawer-ticker-${options[idx - 1].seconds}`)?.focus();
                        } else if (e.key === 'ArrowDown' && idx < options.length - 1) {
                          e.preventDefault();
                          document.getElementById(`drawer-ticker-${options[idx + 1].seconds}`)?.focus();
                        }
                      }}
                      onClick={() => {
                        handleUpdate({ watchProgressTickerInterval: opt.seconds });
                        setShowTickerDrawer(false);
                        setTimeout(() => {
                          document.getElementById('playback-btn-ticker-hub')?.focus();
                        }, 50);
                      }}
                      className={`w-full p-4 rounded-xl border text-left transition-all tv-focus-target flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'bg-hbo-purple/30 border-hbo-cyan text-white shadow-hbo-glow ring-1 ring-hbo-cyan/40'
                          : 'bg-black/30 border-hbo-border hover:border-gray-600 text-gray-300'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className={`font-bold text-xs sm:text-sm ${isSelected ? 'text-hbo-cyan' : 'text-white'}`}>
                            {opt.label}
                          </span>
                          {isSelected && (
                            <div className="flex items-center gap-1 text-[11px] font-bold text-hbo-cyan">
                              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                              <span>Selected</span>
                            </div>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-400 leading-snug">{opt.desc}</p>
                      </div>
                    </button>
                  );
                });
              })()}
            </div>

            {/* Drawer Footer Hint */}
            <div className="p-4 border-t border-hbo-border/50 bg-black/40 flex items-center justify-center text-xs text-gray-400 select-none">
              <span>Press <strong className="text-white font-semibold">Back</strong> to return</span>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* Android TV Stream Header Auto-Hide Timeout Right Drawer (Level 1 Drawer)  */}
      {/* ========================================================================= */}
      {showHeaderTimeoutDrawer && (
        <div
          role="dialog"
          aria-modal="true"
          data-drawer-container="true"
          className="fixed inset-0 z-[9999] flex justify-end bg-black/80 backdrop-blur-md animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowHeaderTimeoutDrawer(false);
              setTimeout(() => {
                document.getElementById('display-btn-headertimeout-hub')?.focus();
              }, 50);
            }
          }}
        >
          {/* Left Side Parent Path Context */}
          <div className="flex-1 hidden md:flex flex-col justify-center pl-16 pr-8 pointer-events-none select-none">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-400 tracking-wider uppercase mb-2">
              <span className="text-gray-400">Settings</span>
              <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-hbo-cyan font-semibold">Display &amp; UI</span>
            </div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight mb-2">Stream Header Auto-Hide</h1>
            <p className="text-sm text-gray-400 max-w-md leading-relaxed">
              Choose how long the video playback top navigation bar stays on screen before automatically fading out for a distraction-free cinematic experience.
            </p>
          </div>

          <div className="w-full max-w-md h-full bg-hbo-card/95 border-l border-hbo-border/80 shadow-2xl flex flex-col justify-between animate-slide-in-right overflow-hidden">
            {/* Drawer Body: Single Column Options */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-2.5 font-sans">
              {(() => {
                const options = [
                  { seconds: 3, label: '3 Seconds', desc: 'Quick fade out for immediate viewing immersion' },
                  { seconds: 5, label: '5 Seconds (Default)', desc: 'Standard cinema mode duration' },
                  { seconds: 8, label: '8 Seconds', desc: 'Extended duration with plenty of time to view title details' },
                  { seconds: 0, label: 'Always Visible', desc: 'Do not auto-hide the top stream header during playback' }
                ];
                const currentVal = settings.streamHeaderTimeout ?? 5;

                return options.map((opt, idx) => {
                  const isSelected = currentVal === opt.seconds;
                  return (
                    <button
                      key={opt.seconds}
                      id={`drawer-headertimeout-${opt.seconds}`}
                      data-headertimeout-drawer-item="true"
                      data-headertimeout-selected={isSelected ? 'true' : 'false'}
                      type="button"
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowUp' && idx > 0) {
                          e.preventDefault();
                          document.getElementById(`drawer-headertimeout-${options[idx - 1].seconds}`)?.focus();
                        } else if (e.key === 'ArrowDown' && idx < options.length - 1) {
                          e.preventDefault();
                          document.getElementById(`drawer-headertimeout-${options[idx + 1].seconds}`)?.focus();
                        }
                      }}
                      onClick={() => {
                        handleUpdate({ streamHeaderTimeout: opt.seconds });
                        setShowHeaderTimeoutDrawer(false);
                        setTimeout(() => {
                          document.getElementById('display-btn-headertimeout-hub')?.focus();
                        }, 50);
                      }}
                      className={`w-full p-4 rounded-xl border text-left transition-all tv-focus-target flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'bg-hbo-purple/30 border-hbo-cyan text-white shadow-hbo-glow ring-1 ring-hbo-cyan/40'
                          : 'bg-black/30 border-hbo-border hover:border-gray-600 text-gray-300'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className={`font-bold text-xs sm:text-sm ${isSelected ? 'text-hbo-cyan' : 'text-white'}`}>
                            {opt.label}
                          </span>
                          {isSelected && (
                            <div className="flex items-center gap-1 text-[11px] font-bold text-hbo-cyan">
                              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                              <span>Selected</span>
                            </div>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-400 leading-snug">{opt.desc}</p>
                      </div>
                    </button>
                  );
                });
              })()}
            </div>

            {/* Drawer Footer Hint */}
            <div className="p-4 border-t border-hbo-border/50 bg-black/40 flex items-center justify-center text-xs text-gray-400 select-none">
              <span>Press <strong className="text-white font-semibold">Back</strong> to return</span>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* Android TV Performance HUD Right Drawer (Level 1 Drawer)                  */}
      {/* ========================================================================= */}
      {showPerfHudDrawer && (
        <div
          role="dialog"
          aria-modal="true"
          data-drawer-container="true"
          className="fixed inset-0 z-[9999] flex justify-end bg-black/80 backdrop-blur-md animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowPerfHudDrawer(false);
              setTimeout(() => {
                document.getElementById('display-btn-perfhud-hub')?.focus();
              }, 50);
            }
          }}
        >
          {/* Left Side Parent Path Context */}
          <div className="flex-1 hidden md:flex flex-col justify-center pl-16 pr-8 pointer-events-none select-none">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-400 tracking-wider uppercase mb-2">
              <span className="text-gray-400">Settings</span>
              <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-hbo-cyan font-semibold">Display &amp; UI</span>
            </div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight mb-2">Performance HUD</h1>
            <p className="text-sm text-gray-400 max-w-md leading-relaxed">
              Display live diagnostics overlay including CPU load %, GPU rendering status, memory usage, and dropped frame metrics.
            </p>
          </div>

          <div className="w-full max-w-md h-full bg-hbo-card/95 border-l border-hbo-border/80 shadow-2xl flex flex-col justify-between animate-slide-in-right overflow-hidden">
            {/* Drawer Body: Single Column Options */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-2.5 font-sans">
              {(() => {
                const options = [
                  { id: 'off', label: 'Disabled', desc: 'HUD is completely hidden and uses no background resources' },
                  { id: 'watch_only', label: 'Watch Page Only', desc: 'Only displays telemetry overlay during active video playback' },
                  { id: 'all_pages', label: 'All Pages (Always On)', desc: 'Displays telemetry overlay across all views and navigation' }
                ];
                const currentVal = settings.showPerformanceHud === true 
                  ? 'all_pages' 
                  : (settings.showPerformanceHud === 'watch_only' || settings.showPerformanceHud === 'all_pages' 
                      ? settings.showPerformanceHud 
                      : 'off');

                return options.map((opt, idx) => {
                  const isSelected = currentVal === opt.id;
                  return (
                    <button
                      key={opt.id}
                      id={`drawer-perfhud-${opt.id}`}
                      data-perfhud-drawer-item="true"
                      data-perfhud-selected={isSelected ? 'true' : 'false'}
                      type="button"
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowUp' && idx > 0) {
                          e.preventDefault();
                          document.getElementById(`drawer-perfhud-${options[idx - 1].id}`)?.focus();
                        } else if (e.key === 'ArrowDown' && idx < options.length - 1) {
                          e.preventDefault();
                          document.getElementById(`drawer-perfhud-${options[idx + 1].id}`)?.focus();
                        }
                      }}
                      onClick={() => {
                        handleUpdate({ showPerformanceHud: opt.id as any });
                        setShowPerfHudDrawer(false);
                        setTimeout(() => {
                          document.getElementById('display-btn-perfhud-hub')?.focus();
                        }, 50);
                      }}
                      className={`w-full p-4 rounded-xl border text-left transition-all tv-focus-target flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'bg-hbo-purple/30 border-hbo-cyan text-white shadow-hbo-glow ring-1 ring-hbo-cyan/40'
                          : 'bg-black/30 border-hbo-border hover:border-gray-600 text-gray-300'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className={`font-bold text-xs sm:text-sm ${isSelected ? 'text-hbo-cyan' : 'text-white'}`}>
                            {opt.label}
                          </span>
                          {isSelected && (
                            <div className="flex items-center gap-1 text-[11px] font-bold text-hbo-cyan">
                              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                              <span>Selected</span>
                            </div>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-400 leading-snug">{opt.desc}</p>
                      </div>
                    </button>
                  );
                });
              })()}
            </div>

            {/* Drawer Footer Hint */}
            <div className="p-4 border-t border-hbo-border/50 bg-black/40 flex items-center justify-center text-xs text-gray-400 select-none">
              <span>Press <strong className="text-white font-semibold">Back</strong> to return</span>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* Android TV Persistent Storage & Backup Right Drawer (Level 1 Drawer)      */}
      {/* ========================================================================= */}
      {showBackupDrawer && (
        <div
          role="dialog"
          aria-modal="true"
          data-drawer-container="true"
          className="fixed inset-0 z-[9999] flex justify-end bg-black/80 backdrop-blur-md animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowBackupDrawer(false);
              setTimeout(() => {
                document.getElementById('system-btn-backup-hub')?.focus();
              }, 50);
            }
          }}
        >
          {/* Left Side Parent Path Context */}
          <div className="flex-1 hidden md:flex flex-col justify-center pl-16 pr-8 pointer-events-none select-none">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-400 tracking-wider uppercase mb-2">
              <span className="text-gray-400">Settings</span>
              <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-hbo-cyan font-semibold">System &amp; Maintenance</span>
            </div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight mb-2">Persistent Storage &amp; Backup</h1>
            <p className="text-sm text-gray-400 max-w-md leading-relaxed">
              Preserve your watch history, bookmarked watchlist, likes, and custom user preferences across app upgrades and uninstalls.
            </p>
          </div>

          <div className="w-full max-w-md h-full bg-hbo-card/95 border-l border-hbo-border/80 shadow-2xl flex flex-col justify-between animate-slide-in-right overflow-hidden">
            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4 font-sans">
              {/* Status Header */}
              <div className="bg-black/40 border border-hbo-border rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-white">Storage Status</span>
                  {backupMeta.available ? (
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[10px] font-mono">
                      Auto-Protected
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full bg-gray-500/20 text-gray-400 border border-gray-500/40 text-[10px] font-mono">
                      Local Only
                    </span>
                  )}
                </div>
                {backupMeta.timestamp > 0 ? (
                  <p className="text-[11px] text-gray-400 font-mono">
                    Last backup: {new Date(backupMeta.timestamp).toLocaleString()}
                  </p>
                ) : (
                  <p className="text-[11px] text-gray-400">No external backup found yet.</p>
                )}
              </div>

              {/* Status Toast Message inside Drawer */}
              {backupStatusMsg && (
                <div className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                  backupStatusMsg.isError ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                }`}>
                  {backupStatusMsg.isError ? <AlertCircle className="w-4 h-4 flex-shrink-0" /> : <Check className="w-4 h-4 flex-shrink-0" />}
                  <span>{backupStatusMsg.text}</span>
                </div>
              )}

              {/* Action 1: Backup Now */}
              <button
                id="drawer-backup-btn-now"
                data-backup-drawer-item="true"
                type="button"
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    document.getElementById('drawer-backup-btn-restore')?.focus();
                  }
                }}
                onClick={handleBackupNow}
                className="w-full p-4 rounded-xl border text-left transition-all tv-focus-target flex items-center justify-between gap-3 bg-black/30 border-hbo-border hover:bg-hbo-hover hover:border-white/20 text-white"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <Save className="w-4 h-4 text-hbo-cyan flex-shrink-0" />
                    <span className="font-bold text-xs sm:text-sm text-white">Backup Now</span>
                  </div>
                  <p className="text-[11px] text-gray-400 leading-snug">
                    Save a full snapshot to persistent external app storage.
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 stroke-[2.2] flex-shrink-0" />
              </button>

              {/* Action 2: Restore */}
              <button
                id="drawer-backup-btn-restore"
                data-backup-drawer-item="true"
                type="button"
                onKeyDown={(e) => {
                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    document.getElementById('drawer-backup-btn-now')?.focus();
                  } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    document.getElementById('drawer-backup-btn-export')?.focus();
                  }
                }}
                onClick={handleRestoreNow}
                className="w-full p-4 rounded-xl border text-left transition-all tv-focus-target flex items-center justify-between gap-3 bg-black/30 border-hbo-border hover:bg-hbo-hover hover:border-white/20 text-white"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <RefreshCw className="w-4 h-4 text-amber-400 flex-shrink-0" />
                    <span className="font-bold text-xs sm:text-sm text-white">Restore from Storage</span>
                  </div>
                  <p className="text-[11px] text-gray-400 leading-snug">
                    Reload your latest persistent backup file into the active app database.
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 stroke-[2.2] flex-shrink-0" />
              </button>

              {/* Action 3: Export JSON */}
              <button
                id="drawer-backup-btn-export"
                data-backup-drawer-item="true"
                type="button"
                onKeyDown={(e) => {
                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    document.getElementById('drawer-backup-btn-restore')?.focus();
                  } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    document.getElementById('drawer-backup-btn-import')?.focus();
                  }
                }}
                onClick={handleExportJson}
                className="w-full p-4 rounded-xl border text-left transition-all tv-focus-target flex items-center justify-between gap-3 bg-black/30 border-hbo-border hover:bg-hbo-hover hover:border-white/20 text-white"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <Download className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span className="font-bold text-xs sm:text-sm text-white">Export JSON File</span>
                  </div>
                  <p className="text-[11px] text-gray-400 leading-snug">
                    Download a raw portable .json backup file for offline transfer.
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 stroke-[2.2] flex-shrink-0" />
              </button>

              {/* Action 4: Import JSON */}
              <button
                id="drawer-backup-btn-import"
                data-backup-drawer-item="true"
                type="button"
                onKeyDown={(e) => {
                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    document.getElementById('drawer-backup-btn-export')?.focus();
                  }
                }}
                onClick={() => fileInputRef.current?.click()}
                className="w-full p-4 rounded-xl border text-left transition-all tv-focus-target flex items-center justify-between gap-3 bg-black/30 border-hbo-border hover:bg-hbo-hover hover:border-white/20 text-white"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <Upload className="w-4 h-4 text-purple-400 flex-shrink-0" />
                    <span className="font-bold text-xs sm:text-sm text-white">Import JSON File</span>
                  </div>
                  <p className="text-[11px] text-gray-400 leading-snug">
                    Select a previously exported .json file to restore data.
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 stroke-[2.2] flex-shrink-0" />
              </button>
            </div>

            {/* Drawer Footer Hint */}
            <div className="p-4 border-t border-hbo-border/50 bg-black/40 flex items-center justify-center text-xs text-gray-400 select-none">
              <span>Press <strong className="text-white font-semibold">Back</strong> to return</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
