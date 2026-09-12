import React, { useState, useRef, useEffect, useCallback } from 'react';

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
  
  const posRef = useRef<{ x: number; y: number }>(position);
  const cursorNodeRef = useRef<HTMLDivElement>(null);

  // Keep coordinate reference perfectly centered
  const applyPosition = useCallback((x: number, y: number) => {
    posRef.current = { x, y };
    if (cursorNodeRef.current) {
      cursorNodeRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    }
  }, []);

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

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const prevActiveRef = useRef(false);

  // Reset inactivity auto-hide timer
  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    if (timeoutSeconds > 0 && active) {
      inactivityTimerRef.current = setTimeout(() => {
        onCloseRef.current();
      }, timeoutSeconds * 1000);
    }
  }, [active, timeoutSeconds]);

  // Find any clickable or interactive element within the cursor's perimeter
  const findClickableWithinPerimeter = useCallback((centerX: number, centerY: number, radius = 14) => {
    // Check center first, then 8 perimeter sample points around the circle
    const samplePoints: [number, number][] = [
      [centerX, centerY],
      [centerX, centerY - radius],
      [centerX + radius, centerY],
      [centerX, centerY + radius],
      [centerX - radius, centerY],
      [centerX + radius * 0.7, centerY - radius * 0.7],
      [centerX + radius * 0.7, centerY + radius * 0.7],
      [centerX - radius * 0.7, centerY + radius * 0.7],
      [centerX - radius * 0.7, centerY - radius * 0.7],
    ];

    const isInteractive = (el: Element | null): HTMLElement | null => {
      let curr = el as HTMLElement | null;
      while (curr && curr !== document.body && curr !== document.documentElement) {
        const tag = curr.tagName.toLowerCase();
        const role = curr.getAttribute('role');
        const style = window.getComputedStyle(curr);
        if (
          tag === 'button' ||
          tag === 'a' ||
          tag === 'input' ||
          tag === 'select' ||
          tag === 'textarea' ||
          tag === 'video' ||
          role === 'button' ||
          role === 'link' ||
          role === 'checkbox' ||
          curr.onclick != null ||
          curr.getAttribute('onclick') != null ||
          style.cursor === 'pointer' ||
          curr.classList.contains('cursor-pointer') ||
          curr.classList.contains('tv-focus-target')
        ) {
          return curr;
        }
        curr = curr.parentElement;
      }
      return null;
    };

    for (const [px, py] of samplePoints) {
      const elements = document.elementsFromPoint(px, py);
      for (const el of elements) {
        // Skip our own cursor container
        if (cursorNodeRef.current && (cursorNodeRef.current === el || cursorNodeRef.current.contains(el))) {
          continue;
        }
        const match = isInteractive(el);
        if (match) {
          return { target: match, clickX: px, clickY: py };
        }
      }
    }

    return null;
  }, []);

  const performClick = useCallback(() => {
    const curX = posRef.current.x;
    const curY = posRef.current.y;

    // Visual click feedback
    setIsClicking(true);
    if (clickAnimationTimerRef.current) clearTimeout(clickAnimationTimerRef.current);
    clickAnimationTimerRef.current = setTimeout(() => setIsClicking(false), 200);

    // Look for any interactive element in the circle's perimeter
    const match = findClickableWithinPerimeter(curX, curY, 14);

    let targetX = curX;
    let targetY = curY;

    if (match) {
      // If found in DOM, dispatch synthetic click directly to ensure it activates
      try {
        match.target.focus?.();
        match.target.click();
      } catch (err) {
        console.warn('[VirtualCursor] Error triggering element click:', err);
      }
      targetX = match.clickX;
      targetY = match.clickY;
    }

    // Always dispatch native touch simulation at the target coordinates (reaches iframes and webview layers)
    try {
      if ((window as any).AndroidBridge && typeof (window as any).AndroidBridge.simulateTouchAt === 'function') {
        (window as any).AndroidBridge.simulateTouchAt(targetX, targetY);
      }
    } catch (err) {
      console.error('[VirtualCursor] Error simulating touch:', err);
    }
  }, [findClickableWithinPerimeter]);

  // Sync window global flag for native Android bridge
  useEffect(() => {
    (window as any).__tmdbVirtualCursorActive = active;
    try {
      (window as any).AndroidBridge?.setVirtualCursorActive?.(active);
    } catch {}

    const wasActive = prevActiveRef.current;
    prevActiveRef.current = active;

    if (active) {
      // ONLY center when first opening/activating, never when re-rendering while already active!
      if (!wasActive) {
        const initX = Math.max(50, Math.min(window.innerWidth - 50, window.innerWidth / 2));
        const initY = Math.max(50, Math.min(window.innerHeight - 50, window.innerHeight / 2));
        applyPosition(initX, initY);
        setShowToast(true);
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => setShowToast(false), 3500);
      }
      resetInactivityTimer();
    } else {
      setShowToast(false);
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    }

    return () => {
      (window as any).__tmdbVirtualCursorActive = false;
      try {
        (window as any).AndroidBridge?.setVirtualCursorActive?.(false);
      } catch {}
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (clickAnimationTimerRef.current) clearTimeout(clickAnimationTimerRef.current);
    };
  }, [active, resetInactivityTimer, applyPosition]);

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
        performClick();
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
        const nextX = Math.max(16, Math.min(window.innerWidth - 16, posRef.current.x + dx));
        const nextY = Math.max(16, Math.min(window.innerHeight - 16, posRef.current.y + dy));
        applyPosition(nextX, nextY);
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
        const nextX = Math.max(16, Math.min(window.innerWidth - 16, posRef.current.x + dx));
        const nextY = Math.max(16, Math.min(window.innerHeight - 16, posRef.current.y + dy));
        applyPosition(nextX, nextY);
      }
    };

    const handleCustomClick = () => {
      resetInactivityTimer();
      performClick();
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
  }, [active, getStepSize, resetInactivityTimer, onClose, applyPosition, performClick]);

  if (!active) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden select-none">
      {/* Toast Notification on Activation */}
      <div
        className={`absolute top-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-black/95 border border-hbo-cyan/70 text-white text-xs font-semibold tracking-wide shadow-lg transition-opacity duration-200 flex items-center gap-2 ${
          showToast ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <span className="w-2 h-2 rounded-full bg-hbo-cyan inline-block" />
        <span>Virtual Cursor Active • Use D-Pad to move, OK to click</span>
      </div>

      {/* Virtual Cursor Pointer: Positioned at (x, y) with -translate-x-1/2 -translate-y-1/2 for perfect center alignment */}
      <div
        ref={cursorNodeRef}
        className="absolute top-0 left-0"
        style={{
          transform: `translate3d(${posRef.current.x}px, ${posRef.current.y}px, 0)`
        }}
      >
        <div className="relative w-8 h-8 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none">
          <svg className="w-8 h-8" viewBox="0 0 32 32" fill="none">
            {/* Outer Violet Ring */}
            <circle cx="16" cy="16" r="13" stroke="#7928CA" strokeWidth="2" strokeDasharray="4 2" />
            {/* Inner Cyan Glowing Portal */}
            <circle cx="16" cy="16" r="8" fill="#050814" stroke="#00E5FF" strokeWidth="2.2" />
            {/* Crosshair Ticks */}
            <line x1="16" y1="1" x2="16" y2="6" stroke="#00E5FF" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="16" y1="26" x2="16" y2="31" stroke="#00E5FF" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="1" y1="16" x2="6" y2="16" stroke="#00E5FF" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="26" y1="16" x2="31" y2="16" stroke="#00E5FF" strokeWidth="2.5" strokeLinecap="round" />
            {/* Center Pointer Core Hotspot */}
            <circle cx="16" cy="16" r="3" fill="#FFFFFF" stroke="#000000" strokeWidth="0.8" />
          </svg>
          {isClicking && (
            <div className="absolute inset-0 rounded-full border-2 border-[#00E5FF] bg-[#00E5FF]/40 animate-ping" />
          )}
        </div>
      </div>
    </div>
  );
};
