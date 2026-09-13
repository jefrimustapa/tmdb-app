import React, { useState } from 'react';
import { Subtitles, Check, X, Clock, Plus, Minus, RotateCcw, AlertCircle, Loader2 } from 'lucide-react';
import { SubtitleTrack } from '../../services/subtitleService';

interface SubtitlePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  tracks: SubtitleTrack[];
  activeTrackId: string | null;
  onSelectTrack: (track: SubtitleTrack | null) => void;
  syncOffset: number;
  onAdjustSync: (offset: number) => void;
  isLoading?: boolean;
}

export const SubtitlePickerModal: React.FC<SubtitlePickerModalProps> = ({
  isOpen,
  onClose,
  tracks,
  activeTrackId,
  onSelectTrack,
  syncOffset,
  onAdjustSync,
  isLoading = false
}) => {
  const [filterLang, setFilterLang] = useState<'all' | 'ms' | 'en'>('all');

  if (!isOpen) return null;

  const malayTracks = tracks.filter((t) => t.language === 'ms' || t.language === 'id');
  const englishTracks = tracks.filter((t) => t.language === 'en');

  const visibleTracks =
    filterLang === 'ms' ? malayTracks : filterLang === 'en' ? englishTracks : tracks;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Subtitles & Audio Settings"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-lg bg-hbo-card/95 border border-white/15 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] text-white">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-hbo-purple/30 border border-hbo-purple/40 text-hbo-cyan">
              <Subtitles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold font-display text-white tracking-wide">
                Subtitles & Audio
              </h2>
              <p className="text-xs text-gray-400">
                Powered by Multi-Source Subtitle Service
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-full bg-white/5 hover:bg-white/15 text-gray-300 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sync Offset Quick Adjuster */}
        {activeTrackId && (
          <div className="px-5 py-2.5 bg-black/40 border-b border-white/10 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-gray-300 font-medium">
              <Clock className="w-3.5 h-3.5 text-hbo-cyan" />
              <span>Timing Sync:</span>
              <span className={`font-mono font-bold ${syncOffset === 0 ? 'text-gray-400' : 'text-hbo-cyan'}`}>
                {syncOffset > 0 ? `+${syncOffset.toFixed(1)}s` : `${syncOffset.toFixed(1)}s`}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onAdjustSync(Math.round((syncOffset - 0.5) * 10) / 10)}
                title="Delay subtitle by 0.5s"
                className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 text-white font-medium flex items-center gap-1 transition"
              >
                <Minus className="w-3 h-3" />
                <span>0.5s</span>
              </button>
              {syncOffset !== 0 && (
                <button
                  type="button"
                  onClick={() => onAdjustSync(0)}
                  title="Reset subtitle offset to 0"
                  className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 text-hbo-cyan transition"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              )}
              <button
                type="button"
                onClick={() => onAdjustSync(Math.round((syncOffset + 0.5) * 10) / 10)}
                title="Advance subtitle by 0.5s"
                className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 text-white font-medium flex items-center gap-1 transition"
              >
                <Plus className="w-3 h-3" />
                <span>0.5s</span>
              </button>
            </div>
          </div>
        )}

        {/* Language Tabs */}
        <div className="flex items-center gap-2 px-5 py-2.5 border-b border-white/10 bg-black/20 text-xs">
          <button
            type="button"
            onClick={() => setFilterLang('all')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition ${
              filterLang === 'all'
                ? 'bg-hbo-cyan/20 text-hbo-cyan border border-hbo-cyan/40'
                : 'bg-white/5 text-gray-400 hover:text-white'
            }`}
          >
            All ({tracks.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterLang('ms')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition ${
              filterLang === 'ms'
                ? 'bg-hbo-cyan/20 text-hbo-cyan border border-hbo-cyan/40'
                : 'bg-white/5 text-gray-400 hover:text-white'
            }`}
          >
            Melayu / Indo ({malayTracks.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterLang('en')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition ${
              filterLang === 'en'
                ? 'bg-hbo-cyan/20 text-hbo-cyan border border-hbo-cyan/40'
                : 'bg-white/5 text-gray-400 hover:text-white'
            }`}
          >
            English ({englishTracks.length})
          </button>
        </div>

        {/* Subtitle Track List */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2 overscroll-contain">
          {/* Option: Off / Disable */}
          <button
            type="button"
            onClick={() => {
              onSelectTrack(null);
              onClose();
            }}
            className={`w-full flex items-center justify-between p-3 rounded-xl text-left border transition cursor-pointer ${
              activeTrackId === null
                ? 'bg-hbo-purple/25 border-hbo-cyan/50 text-white shadow-hbo-glow'
                : 'bg-white/5 hover:bg-white/10 border-white/5 text-gray-300'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold">Off (No Subtitles)</span>
            </div>
            {activeTrackId === null && <Check className="w-4 h-4 text-hbo-cyan" />}
          </button>

          {isLoading && (
            <div className="flex flex-col items-center justify-center py-10 text-gray-400 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-hbo-cyan" />
              <span className="text-xs font-medium">Searching available subtitles...</span>
            </div>
          )}

          {!isLoading && visibleTracks.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-gray-400 gap-2 text-center px-4">
              <AlertCircle className="w-7 h-7 text-amber-400/80" />
              <span className="text-sm font-semibold text-gray-300">
                No subtitles found for this title
              </span>
              <p className="text-xs text-gray-500 max-w-xs">
                Subtitles may not yet be available for this specific episode in the public repository.
              </p>
            </div>
          )}

          {!isLoading &&
            visibleTracks.map((track) => {
              const isSelected = activeTrackId === track.id;
              const isMalay = track.language === 'ms' || track.language === 'id';

              return (
                <button
                  key={track.id}
                  type="button"
                  onClick={() => {
                    onSelectTrack(track);
                    onClose();
                  }}
                  className={`w-full flex items-center justify-between p-3 rounded-xl text-left border transition cursor-pointer group ${
                    isSelected
                      ? 'bg-hbo-purple/25 border-hbo-cyan/50 text-white shadow-hbo-glow'
                      : 'bg-white/5 hover:bg-white/10 border-white/5 text-gray-300'
                  }`}
                >
                  <div className="flex-1 min-w-0 pr-3">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-bold text-white group-hover:text-hbo-cyan transition">
                        {track.display}
                      </span>
                      <span
                        className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded ${
                          isMalay
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                        }`}
                      >
                        {isMalay ? 'Melayu' : 'EN'}
                      </span>
                      {track.source && (
                        <span className="text-[10px] font-medium text-gray-500 bg-white/5 px-1.5 py-0.5 rounded">
                          {track.source}
                        </span>
                      )}
                    </div>
                    {track.release && (
                      <p className="text-xs text-gray-400 font-mono truncate">
                        {track.release}
                      </p>
                    )}
                  </div>
                  {isSelected && (
                    <div className="flex-shrink-0">
                      <Check className="w-4 h-4 text-hbo-cyan" />
                    </div>
                  )}
                </button>
              );
            })}
        </div>
      </div>
    </div>
  );
};
