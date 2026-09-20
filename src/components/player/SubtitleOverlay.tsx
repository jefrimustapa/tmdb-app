import React, { useMemo } from 'react';
import { SubtitleCue } from '../../services/subtitleService';

interface SubtitleOverlayProps {
  cues: SubtitleCue[];
  currentTime: number;
  offsetSeconds?: number;
  enabled?: boolean;
  fontSize?: number;
}

export const SubtitleOverlay: React.FC<SubtitleOverlayProps> = ({
  cues,
  currentTime,
  offsetSeconds = 0,
  enabled = true,
  fontSize = 100
}) => {
  if (!enabled || !cues || cues.length === 0) {
    return null;
  }

  const effectiveTime = Math.max(0, currentTime + offsetSeconds);

  // Find active cue matching current playback time
  const activeCue = useMemo(() => {
    // Fast linear scan or binary search for small cue lists
    for (let i = 0; i < cues.length; i++) {
      const cue = cues[i];
      if (effectiveTime >= cue.start && effectiveTime <= cue.end) {
        return cue;
      }
      // Since cues are sorted by start time, if start > effectiveTime, stop searching
      if (cue.start > effectiveTime + 2) {
        break;
      }
    }
    return null;
  }, [cues, effectiveTime]);

  if (!activeCue || !activeCue.text) {
    return null;
  }

  const scaleFactor = Math.max(0.6, Math.min(2.2, (fontSize || 100) / 100));

  return (
    <div
      className="absolute bottom-10 sm:bottom-14 md:bottom-16 left-0 right-0 z-30 pointer-events-none flex justify-center items-end px-4 sm:px-8 select-none transition-opacity duration-150"
      aria-live="off"
    >
      <div className="max-w-[92vw] sm:max-w-[80vw] md:max-w-[70vw] text-center text-xs sm:text-sm md:text-base lg:text-lg">
        <span
          className="inline-block text-white font-semibold px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-md tracking-wide leading-relaxed"
          style={{
            fontSize: `${scaleFactor}em`,
            backgroundColor: 'rgba(50, 50, 50, 0.2)',
            textShadow: '0 1px 2px rgba(0, 0, 0, 0.9)',
            wordBreak: 'break-word',
            whiteSpace: 'pre-line'
          }}
        >
          {activeCue.text}
        </span>
      </div>
    </div>
  );
};
