import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Download, AlertCircle, X, Moon, ArrowRight } from 'lucide-react';
import { updateService, type UpdateInfo } from '../../services/updateService';
import { APP_VERSION_FULL } from '../../version';

interface UpdateModalProps {
  updateInfo: UpdateInfo;
  onClose: () => void;
}

const renderFormattedChangelog = (notes: string) => {
  if (!notes || !notes.trim()) {
    return <p className="text-gray-400 italic">Bug fixes, performance improvements, and media streaming updates.</p>;
  }

  const lines = notes.split('\n');
  return (
    <div className="space-y-1.5 text-xs text-gray-300 font-sans">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={idx} className="h-1" />;

        // Release Section Divider or Header
        if (trimmed.startsWith('📦') || trimmed.startsWith('###') || trimmed.startsWith('##')) {
          const headerText = trimmed.replace(/^#{1,3}\s*/, '');
          return (
            <div key={idx} className="pt-2 pb-1 border-b border-hbo-border/50 text-white font-bold text-xs flex items-center gap-1.5 text-hbo-cyan">
              <span>{headerText}</span>
            </div>
          );
        }

        if (trimmed.startsWith('━━━━━') || trimmed === '---') {
          return <hr key={idx} className="border-hbo-border/40 my-2" />;
        }

        // Bullet points
        const isBullet = trimmed.startsWith('* ') || trimmed.startsWith('- ') || trimmed.startsWith('• ');
        const cleanContent = isBullet ? trimmed.replace(/^[\*\-•]\s*/, '') : trimmed;

        // Detect conventional commit prefixes
        const featMatch = cleanContent.match(/^(feat|feature)(\([^\)]+\))?:\s*/i);
        const fixMatch = cleanContent.match(/^fix(\([^\)]+\))?:\s*/i);
        const perfMatch = cleanContent.match(/^perf(\([^\)]+\))?:\s*/i);
        const uiMatch = cleanContent.match(/^ui(\([^\)]+\))?:\s*/i);

        let badge = null;
        let displayContent = cleanContent;

        if (featMatch) {
          badge = <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 uppercase mr-1.5">🚀 FEAT</span>;
          displayContent = cleanContent.substring(featMatch[0].length);
        } else if (fixMatch) {
          badge = <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase mr-1.5">🐛 FIX</span>;
          displayContent = cleanContent.substring(fixMatch[0].length);
        } else if (perfMatch) {
          badge = <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 uppercase mr-1.5">⚡ PERF</span>;
          displayContent = cleanContent.substring(perfMatch[0].length);
        } else if (uiMatch) {
          badge = <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 uppercase mr-1.5">🎨 UI</span>;
          displayContent = cleanContent.substring(uiMatch[0].length);
        }

        return (
          <div key={idx} className={`flex items-start gap-2 ${isBullet ? 'pl-2' : ''}`}>
            {isBullet && <span className="w-1.5 h-1.5 rounded-full bg-hbo-cyan/60 mt-1.5 flex-shrink-0" />}
            <div className="leading-relaxed flex-1 break-words">
              {badge}
              <span>{displayContent}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const UpdateModal: React.FC<UpdateModalProps> = ({ updateInfo, onClose }) => {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const changelogRef = useRef<HTMLDivElement>(null);
  const installButtonRef = useRef<HTMLButtonElement>(null);
  const laterButtonRef = useRef<HTMLButtonElement>(null);

  const handleChangelogKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!changelogRef.current) return;
    const el = changelogRef.current;
    const step = 60;

    if (e.key === 'ArrowDown') {
      const isAtBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
      if (!isAtBottom) {
        e.preventDefault();
        e.stopPropagation();
        el.scrollBy({ top: step, behavior: 'smooth' });
      } else {
        // Transfer focus down to action buttons
        e.preventDefault();
        if (installButtonRef.current && !installButtonRef.current.hasAttribute('disabled')) {
          installButtonRef.current.focus();
        } else if (laterButtonRef.current) {
          laterButtonRef.current.focus();
        }
      }
    } else if (e.key === 'ArrowUp') {
      const isAtTop = el.scrollTop <= 8;
      if (!isAtTop) {
        e.preventDefault();
        e.stopPropagation();
        el.scrollBy({ top: -step, behavior: 'smooth' });
      } else {
        // Transfer focus up to close button
        e.preventDefault();
        if (closeButtonRef.current) {
          closeButtonRef.current.focus();
        }
      }
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      // Lock horizontal navigation inside changelog
      e.preventDefault();
      e.stopPropagation();
    }
  };

  useEffect(() => {
    // Focus install button by default for TV D-Pad navigation
    const timer = setTimeout(() => {
      if (installButtonRef.current) {
        installButtonRef.current.focus();
      }
    }, 150);

    // Listen to native download progress events from AndroidBridge
    const handleProgress = (e: any) => {
      const { percent, status } = e.detail || {};
      if (typeof percent === 'number') {
        setProgress(percent);
      }
      if (status) {
        setStatusText(status);
      }
      setErrorMessage(null);
    };

    const handleComplete = () => {
      setProgress(100);
      setStatusText('Launching installer...');
    };

    const handleError = (e: any) => {
      const err = e.detail?.error || 'Download failed. Please try again.';
      setErrorMessage(err);
      setDownloading(false);
      setStatusText('');
    };

    // Listen to Escape / remote Back keyboard event
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('tmdb_update_download_progress', handleProgress);
    window.addEventListener('tmdb_update_download_complete', handleComplete);
    window.addEventListener('tmdb_update_download_error', handleError);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('tmdb_update_download_progress', handleProgress);
      window.removeEventListener('tmdb_update_download_complete', handleComplete);
      window.removeEventListener('tmdb_update_download_error', handleError);
    };
  }, [onClose]);

  const handleInstall = () => {
    if (!updateInfo.apkUrl) {
      window.open(updateInfo.htmlUrl, '_blank');
      return;
    }

    setErrorMessage(null);
    setDownloading(true);
    setProgress(5);
    setStatusText('Connecting to update server...');
    updateService.installUpdate(updateInfo.apkUrl, updateInfo.apkName);
  };

  return (
    <div
      data-modal-container="true"
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-fade-in select-none"
    >
      <div className="bg-hbo-card border border-hbo-border rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl shadow-hbo-purple/40 relative flex flex-col max-h-[90vh]">
        {/* Close Button */}
        <button
          ref={closeButtonRef}
          data-modal-close="true"
          onClick={onClose}
          className="absolute top-5 right-5 p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-gray-400 hover:text-white transition-all tv-focus-target focus:outline-none focus:ring-2 focus:ring-hbo-cyan"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3.5 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-hbo-purple to-hbo-cyan flex items-center justify-center shadow-lg shadow-hbo-purple/50 flex-shrink-0">
            {updateInfo.isNightly ? (
              <Moon className="w-6 h-6 text-white" />
            ) : (
              <Sparkles className="w-6 h-6 text-white" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-bold font-display text-white">Software Update Available</h3>
              <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full font-bold border ${
                updateInfo.isNightly 
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' 
                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
              }`}>
                {updateInfo.isNightly ? 'Nightly' : 'Stable'}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              Released: {updateInfo.publishedAt || 'Recently'}
            </p>
          </div>
        </div>

        {/* Version Upgrade Comparison Banner (Full Untruncated Display) */}
        <div className="flex flex-col gap-2 p-3.5 bg-hbo-dark/90 border border-hbo-border rounded-2xl mb-4 font-mono text-xs shadow-inner">
          <div className="flex items-start justify-between gap-3 pb-2 border-b border-hbo-border/40">
            <span className="text-[10px] uppercase text-gray-400 font-sans font-bold flex-shrink-0 mt-0.5">Installed:</span>
            <span className="text-gray-200 font-bold break-all text-right font-mono text-xs">{APP_VERSION_FULL}</span>
          </div>
          <div className="flex items-start justify-between gap-3 pt-0.5">
            <span className="text-[10px] uppercase text-hbo-cyan/90 font-sans font-bold flex items-center gap-1.5 flex-shrink-0 mt-0.5">
              <Sparkles className="w-3 h-3 text-hbo-cyan" />
              Latest:
            </span>
            <div className="text-right">
              <span className="text-hbo-cyan font-bold break-all font-mono text-xs">{updateInfo.latestVersion}</span>
              {updateInfo.apkSizeFormatted && (
                <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-hbo-cyan/15 text-hbo-cyan font-mono border border-hbo-cyan/30">
                  {updateInfo.apkSizeFormatted}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Release Notes / Changelog (Latest First) */}
        <div
          ref={changelogRef}
          data-modal-scroll="true"
          tabIndex={0}
          onKeyDown={handleChangelogKeyDown}
          className="flex-1 overflow-y-auto pr-1 mb-5 space-y-2 border-t border-b border-hbo-border/60 py-3 scrollbar-thin scrollbar-thumb-hbo-purple tv-focus-target focus:outline-none focus:ring-2 focus:ring-hbo-cyan/60 rounded-xl px-2 transition-all"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-gray-300 uppercase tracking-wider">What's New in this Build:</p>
            <span className="text-[10px] text-gray-400 font-mono italic">(D-Pad Up/Down to scroll)</span>
          </div>
          <div className="bg-black/40 p-3.5 rounded-xl border border-white/5 font-sans max-h-56 overflow-y-auto">
            {renderFormattedChangelog(updateInfo.releaseNotes)}
          </div>
        </div>

        {/* Error Banner */}
        {errorMessage && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/20 border border-red-500/40 text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" />
            <span className="truncate">{errorMessage}</span>
          </div>
        )}

        {/* Download Progress Bar (when active) */}
        {downloading && (
          <div className="mb-5 space-y-2">
            <div className="flex justify-between text-xs text-gray-300 font-bold">
              <span>{statusText || 'Downloading update APK...'}</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full h-3 bg-gray-800 rounded-full overflow-hidden p-0.5 border border-hbo-border">
              <div
                className="h-full bg-gradient-to-r from-hbo-purple to-hbo-cyan rounded-full transition-all duration-300"
                style={{ width: `${Math.max(5, progress)}%` }}
              />
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <button
            ref={installButtonRef}
            data-modal-install="true"
            onClick={handleInstall}
            disabled={downloading}
            className={`flex-1 py-3 px-5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all tv-focus-target ${
              downloading
                ? 'bg-hbo-purple/50 text-gray-300 cursor-not-allowed'
                : 'bg-gradient-to-r from-hbo-purple to-hbo-cyan text-white hover:opacity-90 active:scale-95 shadow-lg shadow-hbo-purple/40 focus:ring-4 focus:ring-hbo-cyan/60'
            }`}
          >
            <Download className="w-4 h-4" />
            <span>{downloading ? 'Downloading...' : 'Download & Install'}</span>
            {!downloading && updateInfo.apkSizeFormatted && (
              <span className="text-xs opacity-80 font-normal">({updateInfo.apkSizeFormatted})</span>
            )}
          </button>

          <button
            ref={laterButtonRef}
            data-modal-later="true"
            data-modal-close="true"
            onClick={onClose}
            disabled={downloading}
            className="px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white text-sm font-bold transition-all tv-focus-target focus:ring-2 focus:ring-gray-400"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
};
