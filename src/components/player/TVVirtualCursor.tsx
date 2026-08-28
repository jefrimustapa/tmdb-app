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
    name: 'HBO Cosmic Portal',
    badge: 'Max',
    color: '#00E5FF',
    desc: 'Futuristic cyan & violet cosmic portal reticle with neon center',
    renderSvg: (isClicking) => (
      <div className="relative">
        <svg className="w-8 h-8 drop-shadow-[0_0_12px_rgba(0,229,255,0.9)] filter" viewBox="0 0 32 32" fill="none">
          {/* Outer Violet Ring */}
          <circle cx="16" cy="16" r="13" stroke="#7928CA" strokeWidth="2" strokeDasharray="4 2" />
          {/* Inner Cyan Glowing Portal */}
          <circle cx="16" cy="16" r="8" fill="#050814" stroke="#00E5FF" strokeWidth="2.2" />
          {/* Crosshair Ticks */}
          <line x1="16" y1="1" x2="16" y2="6" stroke="#00E5FF" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="16" y1="26" x2="16" y2="31" stroke="#00E5FF" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="1" y1="16" x2="6" y2="16" stroke="#00E5FF" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="26" y1="16" x2="31" y2="16" stroke="#00E5FF" strokeWidth="2.5" strokeLinecap="round" />
          {/* Center Pointer Core */}
          <circle cx="16" cy="16" r="3" fill="#FFFFFF" />
        </svg>
        {isClicking && (
          <div className="absolute top-1/2 left-1/2 w-10 h-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#00E5FF] bg-[#00E5FF]/40 animate-ping" />
        )}
      </div>
    )
  },
  {
    id: 'netflix',
    name: 'Netflix 3D Ribbon',
    badge: 'Netflix',
    color: '#E50914',
    desc: 'Iconic 3D folding crimson ribbon dart with white crest',
    renderSvg: (isClicking) => (
      <div className="relative">
        <svg className="w-8 h-8 drop-shadow-[0_2px_12px_rgba(229,9,20,0.95)] filter" viewBox="0 0 32 32" fill="none">
          {/* Back Shadow Fold */}
          <path d="M6 4L26 24L16 25L13 30L6 4Z" fill="#990000" stroke="#000000" strokeWidth="1.5" strokeLinejoin="round" />
          {/* Front 3D Ribbon Blade */}
          <path d="M6 4L22 20L15 15L6 4Z" fill="#E50914" />
          {/* Center White Cinema Stripe */}
          <path d="M8 8L18 18" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
          <circle cx="6" cy="4" r="2" fill="#FFFFFF" />
        </svg>
        {isClicking && (
          <div className="absolute top-1 left-1 w-9 h-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#E50914] bg-[#E50914]/40 animate-ping" />
        )}
      </div>
    )
  },
  {
    id: 'apple_tv',
    name: 'Apple Glass Orb',
    badge: 'Apple TV+',
    color: '#FFFFFF',
    desc: 'Cupertino frosted glassmorphic orb with silver touch reticle',
    renderSvg: (isClicking) => (
      <div className="relative">
        <svg className="w-8 h-8 drop-shadow-[0_4px_14px_rgba(255,255,255,0.7)] filter" viewBox="0 0 32 32" fill="none">
          {/* Frosted Outer Lens */}
          <circle cx="16" cy="16" r="12" fill="rgba(255,255,255,0.25)" stroke="#FFFFFF" strokeWidth="1.8" />
          <circle cx="16" cy="16" r="14" stroke="rgba(255,255,255,0.4)" strokeWidth="1" strokeDasharray="3 3" />
          {/* Inner Metallic Core */}
          <circle cx="16" cy="16" r="4.5" fill="#FFFFFF" stroke="#1D1D1F" strokeWidth="1" />
          <circle cx="14" cy="14" r="1.5" fill="#E5E5EA" />
        </svg>
        {isClicking && (
          <div className="absolute top-1/2 left-1/2 w-10 h-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-white/50 animate-ping" />
        )}
      </div>
    )
  },
  {
    id: 'prime_video',
    name: 'Prime Smile Dart',
    badge: 'Prime',
    color: '#00A8E1',
    desc: 'Aerodynamic supersonic cyan jet with trailing gold smile curve',
    renderSvg: (isClicking) => (
      <div className="relative">
        <svg className="w-8 h-8 drop-shadow-[0_2px_12px_rgba(0,168,225,0.9)] filter" viewBox="0 0 32 32" fill="none">
          {/* Jet Body */}
          <path d="M5 5L27 18L17 19L13 28L5 5Z" fill="#00A8E1" stroke="#051923" strokeWidth="1.8" strokeLinejoin="round" />
          {/* Jet Wing Shadow */}
          <path d="M5 5L17 19L13 28L5 5Z" fill="#007EB9" />
          {/* Amazon Gold Smile Arc */}
          <path d="M8 20C12 25 19 24 23 19" stroke="#FF9900" strokeWidth="2.8" strokeLinecap="round" />
          <path d="M22 17L25 19L21 21" fill="#FF9900" />
        </svg>
        {isClicking && (
          <div className="absolute top-1 left-1 w-9 h-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#00A8E1] bg-[#FF9900]/40 animate-ping" />
        )}
      </div>
    )
  },
  {
    id: 'disney_plus',
    name: 'Disney Magic Star',
    badge: 'Disney+',
    color: '#00D2FF',
    desc: 'Shimmering 8-point fairy crystal star with sparkling starlight aura',
    renderSvg: (isClicking) => (
      <div className="relative">
        <svg className="w-8 h-8 drop-shadow-[0_0_14px_rgba(0,210,255,0.95)] filter" viewBox="0 0 32 32" fill="none">
          {/* Secondary 45-deg Star */}
          <path d="M16 6L18 14L26 16L18 18L16 26L14 18L6 16L14 14Z" fill="#113CCF" opacity="0.75" />
          {/* Primary 8-Point Ice Star */}
          <path d="M16 2L19.5 12.5L30 16L19.5 19.5L16 30L12.5 19.5L2 16L12.5 12.5Z" fill="#00D2FF" stroke="#FFFFFF" strokeWidth="1.2" />
          {/* Diamond Center Shimmer */}
          <circle cx="16" cy="16" r="3.5" fill="#FFFFFF" />
        </svg>
        {isClicking && (
          <div className="absolute top-1/2 left-1/2 w-10 h-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#00D2FF] bg-[#00D2FF]/40 animate-ping" />
        )}
      </div>
    )
  },
  {
    id: 'viu',
    name: 'Viu Lightning Bolt',
    badge: 'Viu',
    color: '#FFCC00',
    desc: 'High-voltage electric yellow lightning bolt pointer',
    renderSvg: (isClicking) => (
      <div className="relative">
        <svg className="w-8 h-8 drop-shadow-[0_2px_12px_rgba(255,204,0,0.95)] filter" viewBox="0 0 32 32" fill="none">
          {/* Bold Comic Lightning Stroke */}
          <path
            d="M17 2L5 17H15L11 30L27 13H16L21 2H17Z"
            fill="#FFCC00"
            stroke="#000000"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          {/* Center Electric Energy Line */}
          <path d="M16 6L10 16H18L14 26" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        {isClicking && (
          <div className="absolute top-1 left-4 w-9 h-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#FFCC00] bg-[#FFCC00]/40 animate-ping" />
        )}
      </div>
    )
  },
  {
    id: 'hulu',
    name: 'Hulu Cyber Hexagon',
    badge: 'Hulu',
    color: '#1CE783',
    desc: 'Futuristic neon green drone tracking reticle with radar nodes',
    renderSvg: (isClicking) => (
      <div className="relative">
        <svg className="w-8 h-8 drop-shadow-[0_0_12px_rgba(28,231,131,0.95)] filter" viewBox="0 0 32 32" fill="none">
          {/* Outer Cyber Hexagon */}
          <path d="M16 3L27 9.5V22.5L16 29L5 22.5V9.5L16 3Z" stroke="#1CE783" strokeWidth="2.2" fill="rgba(28,231,131,0.15)" />
          {/* Tactical Target Brackets */}
          <circle cx="16" cy="16" r="6" stroke="#FFFFFF" strokeWidth="1.5" strokeDasharray="3 3" />
          {/* Center Precision Target Node */}
          <circle cx="16" cy="16" r="2.8" fill="#1CE783" />
          <line x1="16" y1="7" x2="16" y2="10" stroke="#1CE783" strokeWidth="2" strokeLinecap="round" />
          <line x1="16" y1="22" x2="16" y2="25" stroke="#1CE783" strokeWidth="2" strokeLinecap="round" />
        </svg>
        {isClicking && (
          <div className="absolute top-1/2 left-1/2 w-10 h-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#1CE783] bg-[#1CE783]/40 animate-ping" />
        )}
      </div>
    )
  },
  {
    id: 'paramount',
    name: 'Paramount Star Mountain',
    badge: 'Paramount+',
    color: '#0064FF',
    desc: 'Mountain summit peak with orbiting constellation stars',
    renderSvg: (isClicking) => (
      <div className="relative">
        <svg className="w-8 h-8 drop-shadow-[0_2px_12px_rgba(0,100,255,0.9)] filter" viewBox="0 0 32 32" fill="none">
          {/* Mountain Peak Pointer */}
          <path d="M16 4L28 26H4L16 4Z" fill="#0064FF" stroke="#001F54" strokeWidth="2" strokeLinejoin="round" />
          {/* Snow Cap Tip */}
          <path d="M16 4L21 13L16 11L11 13L16 4Z" fill="#FFFFFF" />
          {/* Orbiting Star Constellation Arc */}
          <circle cx="8" cy="10" r="1.5" fill="#FFFFFF" />
          <circle cx="16" cy="2" r="2" fill="#FFE600" />
          <circle cx="24" cy="10" r="1.5" fill="#FFFFFF" />
          <circle cx="28" cy="18" r="1.2" fill="#FFFFFF" />
          <circle cx="4" cy="18" r="1.2" fill="#FFFFFF" />
        </svg>
        {isClicking && (
          <div className="absolute top-1/2 left-1/2 w-10 h-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#0064FF] bg-[#0064FF]/40 animate-ping" />
        )}
      </div>
    )
  },
  {
    id: 'crunchyroll',
    name: 'Crunchyroll Anime Flame',
    badge: 'Crunchyroll',
    color: '#FF6600',
    desc: 'Spiraling anime shonen flame dart with fiery orange aura',
    renderSvg: (isClicking) => (
      <div className="relative">
        <svg className="w-8 h-8 drop-shadow-[0_2px_14px_rgba(255,102,0,0.95)] filter" viewBox="0 0 32 32" fill="none">
          {/* Fiery Outer Flame */}
          <path
            d="M16 2C16 2 24 10 24 18C24 24 19 29 16 30C13 29 8 24 8 18C8 10 16 2 16 2Z"
            fill="#FF6600"
            stroke="#662200"
            strokeWidth="1.8"
          />
          {/* Inner Golden Core Flame */}
          <path
            d="M16 9C16 9 20 15 20 20C20 23 18 26 16 27C14 26 12 23 12 20C12 15 16 9 16 9Z"
            fill="#FFD600"
          />
          {/* Center White Heat Spark */}
          <circle cx="16" cy="19" r="2" fill="#FFFFFF" />
        </svg>
        {isClicking && (
          <div className="absolute top-1/2 left-1/2 w-10 h-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#FF6600] bg-[#FFD600]/40 animate-ping" />
        )}
      </div>
    )
  },
  {
    id: 'peacock',
    name: 'Peacock Aurora Fan',
    badge: 'Peacock',
    color: '#9D00FF',
    desc: 'Radiant 5-feather peacock plumage fan with multi-color gems',
    renderSvg: (isClicking) => (
      <div className="relative">
        <svg className="w-8 h-8 drop-shadow-[0_2px_12px_rgba(157,0,255,0.95)] filter" viewBox="0 0 32 32" fill="none">
          {/* Left Feather (Teal) */}
          <path d="M16 26C11 22 5 17 6 11C7 6 12 10 16 26Z" fill="#00E5FF" opacity="0.9" />
          {/* Center-Left Feather (Emerald) */}
          <path d="M16 26C13 19 9 11 11 6C13 2 16 8 16 26Z" fill="#00E676" opacity="0.9" />
          {/* Center Feather (Violet Pointer Tip) */}
          <path d="M16 2C18 7 19 16 16 28C13 16 14 7 16 2Z" fill="#9D00FF" stroke="#FFFFFF" strokeWidth="1.2" />
          {/* Center-Right Feather (Gold) */}
          <path d="M16 26C19 19 23 11 21 6C19 2 16 8 16 26Z" fill="#FFD600" opacity="0.9" />
          {/* Right Feather (Coral) */}
          <path d="M16 26C21 22 27 17 26 11C25 6 20 10 16 26Z" fill="#FF3366" opacity="0.9" />
          {/* Center Crest Bead */}
          <circle cx="16" cy="5" r="2" fill="#FFFFFF" />
        </svg>
        {isClicking && (
          <div className="absolute top-1/2 left-1/2 w-10 h-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#9D00FF] bg-[#00E5FF]/40 animate-ping" />
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
