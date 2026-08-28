import React, { useState, useEffect, useRef, useCallback } from 'react';

interface TVVirtualCursorProps {
  active: boolean;
  onClose: () => void;
  speed?: 'slow' | 'normal' | 'fast';
  timeoutSeconds?: number;
}

export const TVVirtualCursor: React.FC<TVVirtualCursorProps> = ({
  active,
  onClose,
  speed = 'normal',
  timeoutSeconds = 10
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

  console.log('[TMDB Streamer] TVVirtualCursor render active:', active, 'pos:', position);
  if (!active) return null;

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
        {/* Pointer Arrow */}
        <svg
          className="w-7 h-7 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] filter"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M4 2L18.5 16.5L12 17.5L9.5 22L4 2Z"
            fill="#00E5FF"
            stroke="#000000"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>

        {/* Pulse Ripple on Click */}
        {isClicking && (
          <div className="absolute top-0 left-0 w-8 h-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-hbo-cyan bg-hbo-cyan/30 animate-ping" />
        )}
      </div>
    </div>
  );
};
