import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { App as CapApp } from '@capacitor/app';

export const useAndroidBackButton = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const lastBackPressTime = useRef<number>(0);
  const lastBackExecutionTime = useRef<number>(0);
  const [showExitToast, setShowExitToast] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (showExitToast) {
      timer = setTimeout(() => {
        setShowExitToast(false);
      }, 2000);
    }
    return () => clearTimeout(timer);
  }, [showExitToast]);

  useEffect(() => {
    const handleBackButton = async () => {
      const now = Date.now();
      if (now - lastBackExecutionTime.current < 350) {
        return;
      }
      lastBackExecutionTime.current = now;

      // 1. Check if an active popover dropdown menu is open and dismiss it
      const activePopover = document.querySelector('[data-popover-menu="true"]');
      if (activePopover) {
        window.dispatchEvent(new CustomEvent('tmdb_close_dropdowns'));
        return;
      }

      // 2. Check if an active modal is open and dismiss it
      const activeModal = document.querySelector('[role="dialog"], [data-modal="true"], .fixed.inset-0');
      if (activeModal) {
        const modalCloseBtn = activeModal.querySelector('[data-modal-close]') as HTMLButtonElement | null;
        if (modalCloseBtn) {
          modalCloseBtn.click();
          return;
        }
      }

      // 3. If not on home page, navigate back to Home directly
      if (location.pathname !== '/') {
        (window as any).__tmdbFocusSidebarOnHome = true;
        navigate('/');
        return;
      }

      // 4. On home root page on TV: if focus is in main content, move focus to TV navbar Home icon first
      const active = document.activeElement;
      const isFocusedInNavbar = active && (active.closest('aside') !== null || active.getAttribute('data-tv-nav') === 'true');
      if (!isFocusedInNavbar) {
        const homeNav = document.querySelector<HTMLElement>('aside a[data-nav-path="/"]') ||
                        document.querySelector<HTMLElement>('aside .tv-focus-target');
        if (homeNav) {
          homeNav.focus({ preventScroll: true });
          window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
          return;
        }
      }

      // 5. On home root page while already on navbar: require double press to exit
      if (now - lastBackPressTime.current < 2000) {
        CapApp.exitApp();
      } else {
        lastBackPressTime.current = now;
        setShowExitToast(true);
      }
    };

    const backListener = CapApp.addListener('backButton', handleBackButton);

    // Fast-path for Android TV native KEYCODE_BACK ACTION_DOWN event
    const handleRemoteBack = () => {
      console.log('[RemoteBack] Event tmdb_remote_back received! Path:', location.pathname);
      handleBackButton();
    };
    window.addEventListener('tmdb_remote_back', handleRemoteBack);

    return () => {
      backListener.then((handler) => handler.remove());
      window.removeEventListener('tmdb_remote_back', handleRemoteBack);
    };
  }, [navigate, location.pathname]);

  return { showExitToast };
};
