import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { App as CapApp } from '@capacitor/app';

export const useAndroidBackButton = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const lastBackPressTime = useRef<number>(0);
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
      // 1. Check if an active modal is open and dismiss it
      const modalCloseBtn = document.querySelector('[data-modal-close]') as HTMLButtonElement | null;
      if (modalCloseBtn) {
        modalCloseBtn.click();
        return;
      }

      // 2. If not on home page, navigate back
      if (location.pathname !== '/') {
        const currentPath = location.pathname;
        if (window.history.state && typeof window.history.state.idx === 'number' && window.history.state.idx > 0) {
          navigate(-1);
          setTimeout(() => {
            if (window.location.pathname === currentPath) {
              navigate('/');
            }
          }, 150);
        } else {
          navigate('/');
        }
        return;
      }

      // 3. On home root page, require double press to exit
      const now = Date.now();
      if (now - lastBackPressTime.current < 2000) {
        CapApp.exitApp();
      } else {
        lastBackPressTime.current = now;
        setShowExitToast(true);
      }
    };

    const backListener = CapApp.addListener('backButton', handleBackButton);

    return () => {
      backListener.then((handler) => handler.remove());
    };
  }, [navigate, location.pathname]);

  return { showExitToast };
};
