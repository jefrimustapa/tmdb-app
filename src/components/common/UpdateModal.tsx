import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Download, CheckCircle2, AlertCircle, X, ExternalLink, Moon, ArrowRight } from 'lucide-react';
import { updateService, type UpdateInfo } from '../../services/updateService';
import { APP_VERSION_FULL } from '../../version';

interface UpdateModalProps {
  updateInfo: UpdateInfo;
  onClose: () => void;
}

export const UpdateModal: React.FC<UpdateModalProps> = ({ updateInfo, onClose }) => {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const changelogRef = useRef<HTMLDivElement>(null);
  const installButtonRef = useRef<HTMLButtonElement>(null);

  const handleChangelogKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!changelogRef.current) return;
    const el = changelogRef.current;
    const step = 60;

    if (e.key === 'ArrowDown') {
      const isAtBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 5;
      if (!isAtBottom) {
        e.preventDefault();
        e.stopPropagation();
        el.scrollBy({ top: step, behavior: 'smooth' });
      }
    } else if (e.key === 'ArrowUp') {
      const isAtTop = el.scrollTop <= 5;
      if (!isAtTop) {
        e.preventDefault();
        e.stopPropagation();
        el.scrollBy({ top: -step, behavior: 'smooth' });
      }
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
    };

    window.addEventListener('tmdb_update_download_progress', handleProgress);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('tmdb_update_download_progress', handleProgress);
    };
  }, []);

  const handleInstall = () => {
    if (!updateInfo.apkUrl) {
      window.open(updateInfo.htmlUrl, '_blank');
      return;
    }

    setDownloading(true);
    setProgress(5);
    setStatusText('Initiating download...');
    updateService.installUpdate(updateInfo.apkUrl, updateInfo.apkName);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-fade-in select-none">
      <div className="bg-hbo-card border border-hbo-border rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl shadow-hbo-purple/40 relative flex flex-col max-h-[90vh]">
        {/* Close Button */}
        <button
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

        {/* Version Upgrade Comparison Banner */}
        <div className="flex items-center justify-between p-3.5 bg-hbo-dark/80 border border-hbo-border rounded-2xl mb-4 font-mono text-xs">
          <div className="text-gray-400 truncate max-w-[42%]">
            <p className="text-[10px] uppercase text-gray-500 font-sans font-bold">Installed</p>
            <p className="text-gray-300 font-bold truncate">v{APP_VERSION_FULL}</p>
          </div>
          <ArrowRight className="w-4 h-4 text-hbo-cyan flex-shrink-0" />
          <div className="text-hbo-cyan text-right truncate max-w-[42%]">
            <p className="text-[10px] uppercase text-hbo-cyan/70 font-sans font-bold">Latest</p>
            <p className="font-bold truncate">v{updateInfo.latestVersion}</p>
          </div>
        </div>

        {/* Release Notes / Changelog */}
        <div
          ref={changelogRef}
          tabIndex={0}
          onKeyDown={handleChangelogKeyDown}
          className="flex-1 overflow-y-auto pr-1 mb-5 space-y-2 border-t border-b border-hbo-border/60 py-3 scrollbar-thin scrollbar-thumb-hbo-purple tv-focus-target focus:outline-none focus:ring-2 focus:ring-hbo-cyan/60 rounded-xl px-2 transition-all"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-gray-300 uppercase tracking-wider">What's New in this Build:</p>
            <span className="text-[10px] text-gray-400 font-mono italic">(D-Pad Up/Down to scroll)</span>
          </div>
          <div className="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed bg-black/30 p-3 rounded-xl border border-white/5 font-sans">
            {updateInfo.releaseNotes || 'Bug fixes, performance improvements, and media streaming updates.'}
          </div>
        </div>

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
          </button>

          <button
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
