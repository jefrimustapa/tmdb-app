import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { VirtualCursorStyle } from '../../types/db';

export interface CursorStyleOption {
  id: VirtualCursorStyle;
  name: string;
  badge: string;
  color: string;
  desc: string;
  renderSvg: (isClicking?: boolean) => React.ReactNode;
}

export const CURSOR_STYLES_LIST: CursorStyleOption[] = [
  {
    id: 'hbo_max',
    name: 'HBO Max',
    badge: 'Max',
    color: '#00E5FF',
    desc: 'Signature HBO neon cyan arrow with purple aura',
    renderSvg: (isClicking) => (
      <div className="relative">
        <svg className="w-7 h-7 drop-shadow-[0_2px_8px_rgba(0,229,255,0.85)] filter" viewBox="0 0 24 24" fill="none">
          <path d="M4 2L18.5 16.5L12 17.5L9.5 22L4 2Z" fill="#00E5FF" stroke="#5800FF" strokeWidth="1.5" strokeLinejoin="round" />
          <circle cx="10" cy="11" r="1.5" fill="#FFFFFF" />
        </svg>
        {isClicking && (
          <div className="absolute top-0 left-0 w-8 h-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#00E5FF] bg-[#00E5FF]/30 animate-ping" />
        )}
      </div>
    )
  },
  {
    id: 'netflix',
    name: 'Netflix',
    badge: 'Netflix',
    color: '#E50914',
    desc: 'Cinematic Netflix crimson red pointer with dark shadow',
    renderSvg: (isClicking) => (
      <div className="relative">
        <svg className="w-7 h-7 drop-shadow-[0_2px_10px_rgba(229,9,20,0.9)] filter" viewBox="0 0 24 24" fill="none">
          <path d="M4 2L18.5 16.5L12 17.5L9.5 22L4 2Z" fill="#E50914" stroke="#000000" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M6 5L14 14" stroke="#FFFFFF" strokeWidth="1.2" strokeLinecap="round" opacity="0.8" />
        </svg>
        {isClicking && (
          <div className="absolute top-0 left-0 w-8 h-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#E50914] bg-[#E50914]/30 animate-ping" />
        )}
      </div>
    )
  },
  {
    id: 'apple_tv',
    name: 'Apple TV+',
    badge: 'Apple TV+',
    color: '#FFFFFF',
    desc: 'Sleek Apple minimalist white pointer with silver glow',
    renderSvg: (isClicking) => (
      <div className="relative">
        <svg className="w-7 h-7 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] filter" viewBox="0 0 24 24" fill="none">
          <path d="M4 2L18.5 16.5L12 17.5L9.5 22L4 2Z" fill="#FFFFFF" stroke="#1D1D1F" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
        {isClicking && (
          <div className="absolute top-0 left-0 w-8 h-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-white/40 animate-ping" />
        )}
      </div>
    )
  },
  {
    id: 'prime_video',
    name: 'Prime Video',
    badge: 'Prime',
    color: '#00A8E1',
    desc: 'Amazon Prime electric blue arrow with gold smile accent',
    renderSvg: (isClicking) => (
      <div className="relative">
        <svg className="w-7 h-7 drop-shadow-[0_2px_10px_rgba(0,168,225,0.85)] filter" viewBox="0 0 24 24" fill="none">
          <path d="M4 2L18.5 16.5L12 17.5L9.5 22L4 2Z" fill="#00A8E1" stroke="#000000" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M6 14C8 16 11 16 13 14" stroke="#FF9900" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        {isClicking && (
          <div className="absolute top-0 left-0 w-8 h-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#00A8E1] bg-[#00A8E1]/30 animate-ping" />
        )}
      </div>
    )
  },
  {
    id: 'disney_plus',
    name: 'Disney+',
    badge: 'Disney+',
    color: '#00D2FF',
    desc: 'Disney magic ice blue pointer with star sparkle aura',
    renderSvg: (isClicking) => (
      <div className="relative">
        <svg className="w-7 h-7 drop-shadow-[0_2px_10px_rgba(0,210,255,0.9)] filter" viewBox="0 0 24 24" fill="none">
          <path d="M4 2L18.5 16.5L12 17.5L9.5 22L4 2Z" fill="#00D2FF" stroke="#0B0B45" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M9 6L10 8L12 9L10 10L9 12L8 10L6 9L8 8Z" fill="#FFFFFF" />
        </svg>
        {isClicking && (
          <div className="absolute top-0 left-0 w-8 h-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#00D2FF] bg-[#00D2FF]/30 animate-ping" />
        )}
      </div>
    )
  },
  {
    id: 'viu',
    name: 'Viu',
    badge: 'Viu',
    color: '#FFCC00',
    desc: 'High-visibility Viu electric yellow pointer with bold stroke',
    renderSvg: (isClicking) => (
      <div className="relative">
        <svg className="w-7 h-7 drop-shadow-[0_2px_10px_rgba(255,204,0,0.85)] filter" viewBox="0 0 24 24" fill="none">
          <path d="M4 2L18.5 16.5L12 17.5L9.5 22L4 2Z" fill="#FFCC00" stroke="#000000" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
        {isClicking && (
          <div className="absolute top-0 left-0 w-8 h-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#FFCC00] bg-[#FFCC00]/30 animate-ping" />
        )}
      </div>
    )
  },
  {
    id: 'hulu',
    name: 'Hulu',
    badge: 'Hulu',
    color: '#1CE783',
    desc: 'Futuristic Hulu vibrant neon green arrow',
    renderSvg: (isClicking) => (
      <div className="relative">
        <svg className="w-7 h-7 drop-shadow-[0_2px_10px_rgba(28,231,131,0.85)] filter" viewBox="0 0 24 24" fill="none">
          <path d="M4 2L18.5 16.5L12 17.5L9.5 22L4 2Z" fill="#1CE783" stroke="#000000" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
        {isClicking && (
          <div className="absolute top-0 left-0 w-8 h-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#1CE783] bg-[#1CE783]/30 animate-ping" />
        )}
      </div>
    )
  },
  {
    id: 'paramount',
    name: 'Paramount+',
    badge: 'Paramount+',
    color: '#0064FF',
    desc: 'Paramount mountain sky blue pointer with star emblem',
    renderSvg: (isClicking) => (
      <div className="relative">
        <svg className="w-7 h-7 drop-shadow-[0_2px_10px_rgba(0,100,255,0.85)] filter" viewBox="0 0 24 24" fill="none">
          <path d="M4 2L18.5 16.5L12 17.5L9.5 22L4 2Z" fill="#0064FF" stroke="#000000" strokeWidth="1.5" strokeLinejoin="round" />
          <circle cx="9.5" cy="10.5" r="2" fill="#FFFFFF" />
        </svg>
        {isClicking && (
          <div className="absolute top-0 left-0 w-8 h-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#0064FF] bg-[#0064FF]/30 animate-ping" />
        )}
      </div>
    )
  },
  {
    id: 'crunchyroll',
    name: 'Crunchyroll',
    badge: 'Crunchyroll',
    color: '#FF6600',
    desc: 'Bright Crunchyroll anime orange arrow with warm glow',
    renderSvg: (isClicking) => (
      <div className="relative">
        <svg className="w-7 h-7 drop-shadow-[0_2px_10px_rgba(255,102,0,0.85)] filter" viewBox="0 0 24 24" fill="none">
          <path d="M4 2L18.5 16.5L12 17.5L9.5 22L4 2Z" fill="#FF6600" stroke="#000000" strokeWidth="1.5" strokeLinejoin="round" />
          <circle cx="9" cy="9.5" r="1.8" fill="#FFFFFF" />
        </svg>
        {isClicking && (
          <div className="absolute top-0 left-0 w-8 h-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#FF6600] bg-[#FF6600]/30 animate-ping" />
        )}
      </div>
    )
  },
  {
    id: 'peacock',
    name: 'Peacock',
    badge: 'Peacock',
    color: '#9D00FF',
    desc: 'Peacock royal violet pointer with aurora feather glow',
    renderSvg: (isClicking) => (
      <div className="relative">
        <svg className="w-7 h-7 drop-shadow-[0_2px_10px_rgba(157,0,255,0.85)] filter" viewBox="0 0 24 24" fill="none">
          <path d="M4 2L18.5 16.5L12 17.5L9.5 22L4 2Z" fill="#9D00FF" stroke="#000000" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M6 7L13 14" stroke="#00E5FF" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {isClicking && (
          <div className="absolute top-0 left-0 w-8 h-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#9D00FF] bg-[#9D00FF]/30 animate-ping" />
        )}
      </div>
    )
  }
];

interface TVVirtualCursorProps {
  active: boolean;
  onClose: () => void;
  speed?: 'slow' | 'normal' | 'fast';
  timeoutSeconds?: number;
  cursorStyle?: VirtualCursorStyle;
}

export const TVVirtualCursor: React.FC<TVVirtualCursorProps> = ({
  active,
  onClose,
  speed = 'normal',
  timeoutSeconds = 10,
  cursorStyle = 'hbo_max'
}) => {
  const [position, setPosition] = useState<{ x: number; y: number }>(() => ({
    x: typeof window !== 'undefined' ? window.innerWidth / 2 : 960,
    y: typeof window !== 'undefined' ? window.innerHeight / 2 : 540
  }));
  const [isClicking, setIsClicking] = useState(false);
  const [showToast, setShowToast] = useState(false);
  
  const posRef = useRef(position);
  posRef.current = position;

  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);
  const clickAnimationTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Speed configuration (step pixels per keypress)
  const getStepSize = useCallback(() => {
    switch (speed) {
      case 'slow':
        return 16;
      case 'fast':
        return 48;
      case 'normal':
      default:
        return 28;
    }
  }, [speed]);

  // Reset inactivity auto-hide timer
  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    if (timeoutSeconds > 0 && active) {
      inactivityTimerRef.current = setTimeout(() => {
        onClose();
      }, timeoutSeconds * 1000);
    }
  }, [active, timeoutSeconds, onClose]);

  // Sync window global flag for native Android bridge
  useEffect(() => {
    (window as any).__tmdbVirtualCursorActive = active;
    if (active) {
      // Re-center on activation if off-screen
      setPosition({
        x: Math.max(50, Math.min(window.innerWidth - 50, window.innerWidth / 2)),
        y: Math.max(50, Math.min(window.innerHeight - 50, window.innerHeight / 2))
      });
      setShowToast(true);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setShowToast(false), 3500);
      resetInactivityTimer();
    } else {
      setShowToast(false);
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    }

    return () => {
      (window as any).__tmdbVirtualCursorActive = false;
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (clickAnimationTimerRef.current) clearTimeout(clickAnimationTimerRef.current);
    };
  }, [active, resetInactivityTimer]);

  // Handle D-Pad and OK interactions while cursor is active
  useEffect(() => {
    if (!active) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      resetInactivityTimer();

      let dx = 0;
      let dy = 0;
      const step = getStepSize();

      if (e.key === 'ArrowUp') {
        dy = -step;
      } else if (e.key === 'ArrowDown') {
        dy = step;
      } else if (e.key === 'ArrowLeft') {
        dx = -step;
      } else if (e.key === 'ArrowRight') {
        dx = step;
      } else if (e.key === 'Enter' || e.key === 'Select') {
        e.preventDefault();
        e.stopPropagation();

        const curX = posRef.current.x;
        const curY = posRef.current.y;

        // Visual click feedback
        setIsClicking(true);
        if (clickAnimationTimerRef.current) clearTimeout(clickAnimationTimerRef.current);
        clickAnimationTimerRef.current = setTimeout(() => setIsClicking(false), 250);

        // Native touch simulation dispatch
        try {
          if ((window as any).AndroidBridge && typeof (window as any).AndroidBridge.simulateTouchAt === 'function') {
            (window as any).AndroidBridge.simulateTouchAt(curX, curY);
          }
        } catch (err) {
          console.error('[VirtualCursor] Error simulating touch:', err);
        }
        return;
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }

      if (dx !== 0 || dy !== 0) {
        e.preventDefault();
        e.stopPropagation();
        setPosition((prev) => {
          const nextX = Math.max(12, Math.min(window.innerWidth - 12, prev.x + dx));
          const nextY = Math.max(12, Math.min(window.innerHeight - 12, prev.y + dy));
          return { x: nextX, y: nextY };
        });
      }
    };

    const handleCustomMove = (e: any) => {
      resetInactivityTimer();
      const dir = e.detail?.direction;
      const step = getStepSize();
      let dx = 0;
      let dy = 0;
      if (dir === 'Up') dy = -step;
      else if (dir === 'Down') dy = step;
      else if (dir === 'Left') dx = -step;
      else if (dir === 'Right') dx = step;

      if (dx !== 0 || dy !== 0) {
        setPosition((prev) => {
          const nextX = Math.max(12, Math.min(window.innerWidth - 12, prev.x + dx));
          const nextY = Math.max(12, Math.min(window.innerHeight - 12, prev.y + dy));
          return { x: nextX, y: nextY };
        });
      }
    };

    const handleCustomClick = () => {
      resetInactivityTimer();
      const curX = posRef.current.x;
      const curY = posRef.current.y;

      setIsClicking(true);
      if (clickAnimationTimerRef.current) clearTimeout(clickAnimationTimerRef.current);
      clickAnimationTimerRef.current = setTimeout(() => setIsClicking(false), 250);

      try {
        if ((window as any).AndroidBridge && typeof (window as any).AndroidBridge.simulateTouchAt === 'function') {
          (window as any).AndroidBridge.simulateTouchAt(curX, curY);
        }
      } catch (err) {
        console.error('[VirtualCursor] Error simulating touch:', err);
      }
    };

    const handleCloseEvent = () => {
      onClose();
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('tmdb_cursor_move', handleCustomMove);
    window.addEventListener('tmdb_cursor_click', handleCustomClick);
    window.addEventListener('tmdb_close_cursor', handleCloseEvent);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('tmdb_cursor_move', handleCustomMove);
      window.removeEventListener('tmdb_cursor_click', handleCustomClick);
      window.removeEventListener('tmdb_close_cursor', handleCloseEvent);
    };
  }, [active, getStepSize, resetInactivityTimer, onClose]);

  if (!active) return null;

  const currentOption = CURSOR_STYLES_LIST.find((c) => c.id === cursorStyle) || CURSOR_STYLES_LIST[0];

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden select-none">
      {/* Toast Notification on Activation */}
      <div
        className={`absolute top-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-black/85 border border-hbo-cyan/60 text-white text-xs font-semibold tracking-wide shadow-2xl backdrop-blur-md transition-all duration-300 flex items-center gap-2 ${
          showToast ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'
        }`}
      >
        <span className="w-2.5 h-2.5 rounded-full bg-hbo-cyan animate-ping inline-block" />
        <span>Virtual Cursor Active • Use D-Pad to move, OK to click</span>
      </div>

      {/* Virtual Cursor Pointer */}
      <div
        className="absolute transition-transform duration-75 ease-out"
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          transform: 'translate(-3px, -3px)'
        }}
      >
        {currentOption.renderSvg(isClicking)}
      </div>
    </div>
  );
};
