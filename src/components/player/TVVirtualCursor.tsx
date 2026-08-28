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
    id: 'cyan_glow',
    name: 'HBO Cyan Glow',
    badge: 'Default',
    color: '#00E5FF',
    desc: 'High-contrast cyan arrow with signature neon glow',
    renderSvg: (isClicking) => (
      <div className="relative">
        <svg className="w-7 h-7 drop-shadow-[0_2px_8px_rgba(0,229,255,0.8)] filter" viewBox="0 0 24 24" fill="none">
          <path d="M4 2L18.5 16.5L12 17.5L9.5 22L4 2Z" fill="#00E5FF" stroke="#000000" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
        {isClicking && (
          <div className="absolute top-0 left-0 w-8 h-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#00E5FF] bg-[#00E5FF]/30 animate-ping" />
        )}
      </div>
    )
  },
  {
    id: 'classic_white',
    name: 'Classic White Arrow',
    badge: 'Classic',
    color: '#FFFFFF',
    desc: 'Iconic clean white mouse pointer with crisp dark border',
    renderSvg: (isClicking) => (
      <div className="relative">
        <svg className="w-7 h-7 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] filter" viewBox="0 0 24 24" fill="none">
          <path d="M4 2L18.5 16.5L12 17.5L9.5 22L4 2Z" fill="#FFFFFF" stroke="#000000" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
        {isClicking && (
          <div className="absolute top-0 left-0 w-8 h-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-white/40 animate-ping" />
        )}
      </div>
    )
  },
  {
    id: 'neon_yellow',
    name: 'Neon Yellow Precision',
    badge: 'Hi-Vis',
    color: '#FFE600',
    desc: 'Maximum visibility electric yellow for dark cinema scenes',
    renderSvg: (isClicking) => (
      <div className="relative">
        <svg className="w-7 h-7 drop-shadow-[0_2px_10px_rgba(255,230,0,0.85)] filter" viewBox="0 0 24 24" fill="none">
          <path d="M4 2L18.5 16.5L12 17.5L9.5 22L4 2Z" fill="#FFE600" stroke="#000000" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
        {isClicking && (
          <div className="absolute top-0 left-0 w-8 h-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#FFE600] bg-[#FFE600]/30 animate-ping" />
        )}
      </div>
    )
  },
  {
    id: 'laser_red',
    name: 'Laser Red Pointer',
    badge: 'Vibrant',
    color: '#FF1744',
    desc: 'Sharp laser crimson pointer with intense edge illumination',
    renderSvg: (isClicking) => (
      <div className="relative">
        <svg className="w-7 h-7 drop-shadow-[0_2px_10px_rgba(255,23,68,0.9)] filter" viewBox="0 0 24 24" fill="none">
          <path d="M4 2L18.5 16.5L12 17.5L9.5 22L4 2Z" fill="#FF1744" stroke="#000000" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
        {isClicking && (
          <div className="absolute top-0 left-0 w-8 h-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#FF1744] bg-[#FF1744]/30 animate-ping" />
        )}
      </div>
    )
  },
  {
    id: 'emerald_green',
    name: 'Emerald Green Sci-Fi',
    badge: 'Sci-Fi',
    color: '#00E676',
    desc: 'Futuristic geometric diamond pointer with emerald aura',
    renderSvg: (isClicking) => (
      <div className="relative">
        <svg className="w-7 h-7 drop-shadow-[0_2px_10px_rgba(0,230,118,0.85)] filter" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L20 12L12 22L4 12Z" fill="#00E676" stroke="#000000" strokeWidth="1.5" strokeLinejoin="round" />
          <circle cx="12" cy="12" r="2.5" fill="#000000" />
        </svg>
        {isClicking && (
          <div className="absolute top-1/2 left-1/2 w-8 h-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#00E676] bg-[#00E676]/30 animate-ping" />
        )}
      </div>
    )
  },
  {
    id: 'magenta_pulse',
    name: 'Cyberpunk Magenta',
    badge: 'Cyberpunk',
    color: '#F50057',
    desc: 'Vivid magenta neon arrow with ultraviolet aura',
    renderSvg: (isClicking) => (
      <div className="relative">
        <svg className="w-7 h-7 drop-shadow-[0_2px_10px_rgba(245,0,87,0.9)] filter" viewBox="0 0 24 24" fill="none">
          <path d="M4 2L18.5 16.5L12 17.5L9.5 22L4 2Z" fill="#F50057" stroke="#000000" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
        {isClicking && (
          <div className="absolute top-0 left-0 w-8 h-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#F50057] bg-[#F50057]/30 animate-ping" />
        )}
      </div>
    )
  },
  {
    id: 'amber_gold',
    name: 'Amber Gold Arrow',
    badge: 'Warm',
    color: '#FFB300',
    desc: 'Warm sunset amber gold pointer with golden backlight',
    renderSvg: (isClicking) => (
      <div className="relative">
        <svg className="w-7 h-7 drop-shadow-[0_2px_10px_rgba(255,179,0,0.85)] filter" viewBox="0 0 24 24" fill="none">
          <path d="M4 2L18.5 16.5L12 17.5L9.5 22L4 2Z" fill="#FFB300" stroke="#000000" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
        {isClicking && (
          <div className="absolute top-0 left-0 w-8 h-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#FFB300] bg-[#FFB300]/30 animate-ping" />
        )}
      </div>
    )
  },
  {
    id: 'crosshair_target',
    name: 'Tactical Crosshair',
    badge: 'Tactical',
    color: '#00E5FF',
    desc: 'Precision target crosshair with center reticle for small icons',
    renderSvg: (isClicking) => (
      <div className="relative">
        <svg className="w-7 h-7 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] filter" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="8" stroke="#00E5FF" strokeWidth="1.5" strokeDasharray="3 2" />
          <path d="M12 2V6M12 18V22M2 12H6M18 12H22" stroke="#00E5FF" strokeWidth="2" strokeLinecap="round" />
          <circle cx="12" cy="12" r="2" fill="#FFFFFF" stroke="#000000" strokeWidth="0.8" />
        </svg>
        {isClicking && (
          <div className="absolute top-1/2 left-1/2 w-9 h-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#00E5FF] bg-[#00E5FF]/40 animate-ping" />
        )}
      </div>
    )
  },
  {
    id: 'minimal_dot',
    name: 'Minimal Ring & Dot',
    badge: 'Minimal',
    color: '#FFFFFF',
    desc: 'Unobtrusive glowing outer ring with solid white center dot',
    renderSvg: (isClicking) => (
      <div className="relative">
        <svg className="w-6 h-6 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] filter" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="#00E5FF" strokeWidth="1.8" />
          <circle cx="12" cy="12" r="3.5" fill="#FFFFFF" stroke="#000000" strokeWidth="1" />
        </svg>
        {isClicking && (
          <div className="absolute top-1/2 left-1/2 w-8 h-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-white/40 animate-ping" />
        )}
      </div>
    )
  },
  {
    id: 'classic_hand',
    name: 'Interactive Hand',
    badge: 'Touch',
    color: '#FFFFFF',
    desc: 'Classic pointing index finger with cyan cuff highlight',
    renderSvg: (isClicking) => (
      <div className="relative">
        <svg className="w-7 h-7 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] filter" viewBox="0 0 24 24" fill="none">
          <path
            d="M9 11V4.5C9 3.67 9.67 3 10.5 3C11.33 3 12 3.67 12 4.5V10.5M12 8.5C12 7.67 12.67 7 13.5 7C14.33 7 15 7.67 15 8.5V11M15 9.5C15 8.67 15.67 8 16.5 8C17.33 8 18 8.67 18 9.5V13C18 16.87 14.87 20 11 20H10C7.24 20 5 17.76 5 15V13.5C5 12.67 5.67 12 6.5 12C7.33 12 8 12.67 8 13.5V14"
            fill="#FFFFFF"
            stroke="#000000"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M8 20H14" stroke="#00E5FF" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
        {isClicking && (
          <div className="absolute top-1 left-2.5 w-6 h-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#00E5FF] bg-[#00E5FF]/40 animate-ping" />
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
  cursorStyle = 'cyan_glow'
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
