import { useState, useEffect } from 'react';
import { dbService } from '../services/db';

export function useDevice() {
  const [deviceMode, setDeviceModeState] = useState<'auto' | 'tv' | 'mobile' | 'tablet' | 'desktop'>('auto');
  const [isTV, setIsTV] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [isPhone, setIsPhone] = useState(false);

  useEffect(() => {
    // Load persisted setting
    dbService.getSettings().then(s => {
      setDeviceModeState((s.deviceMode as any) || 'auto');
    });

    const handleSettingsChanged = (e: Event) => {
      const customEvent = e as CustomEvent<any>;
      if (customEvent.detail && customEvent.detail.deviceMode) {
        setDeviceModeState(customEvent.detail.deviceMode);
      }
    };

    window.addEventListener('tmdb_settings_changed', handleSettingsChanged);

    const checkDevice = () => {
      const ua = navigator.userAgent.toLowerCase();
      const isTVUserAgent =
        ua.includes('smart-tv') ||
        ua.includes('smarttv') ||
        ua.includes('googletv') ||
        ua.includes('android tv') ||
        ua.includes('appletv') ||
        ua.includes('hbbtv') ||
        ua.includes('netcast') ||
        ua.includes('viera') ||
        ua.includes('tizen') ||
        ua.includes('webos') ||
        ua.includes('firetv') ||
        ua.includes('crkey') ||
        ua.includes('aft');

      const width = window.innerWidth;
      const height = window.innerHeight;
      const minDimension = Math.min(width, height);
      const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      
      // Native Android Bridge TV / Tablet query
      const isBridgeTV = typeof (window as any).AndroidBridge?.isTVDevice === 'function'
        ? (window as any).AndroidBridge.isTVDevice()
        : false;

      const isBridgeTablet = typeof (window as any).AndroidBridge?.isTabletDevice === 'function'
        ? (window as any).AndroidBridge.isTabletDevice()
        : false;

      const isTVDetected = isBridgeTV || isTVUserAgent || ua.includes('mibox') || ua.includes('mitv') || ua.includes('aft') || ua.includes('tv');

      // Tablet detection: Android without 'mobile', iPad/Macintosh with touch, or touch screen minDimension >= 600
      const isAndroidTablet = ua.includes('android') && !ua.includes('mobile');
      const isIPad = ua.includes('ipad') || (ua.includes('macintosh') && hasTouch && navigator.maxTouchPoints > 1);
      const isTouchTablet = hasTouch && minDimension >= 600 && minDimension < 1200;
      const isTabletDetected = !isTVDetected && (isBridgeTablet || isAndroidTablet || isIPad || isTouchTablet);

      // Phone detection
      const isPhoneUA = ua.includes('mobile') || ua.includes('iphone') || (ua.includes('android') && !isTabletDetected);
      const isPhoneDetected = !isTVDetected && !isTabletDetected && (isPhoneUA || (hasTouch && minDimension < 600));

      if (deviceMode === 'tv') {
        setIsTV(true);
        setIsTablet(false);
        setIsPhone(false);
      } else if (deviceMode === 'tablet') {
        setIsTV(false);
        setIsTablet(true);
        setIsPhone(false);
      } else if (deviceMode === 'mobile') {
        setIsTV(false);
        setIsTablet(false);
        setIsPhone(true);
      } else if (deviceMode === 'desktop') {
        setIsTV(false);
        setIsTablet(false);
        setIsPhone(false);
      } else {
        // Auto detection
        if (isTVDetected) {
          setIsTV(true);
          setIsTablet(false);
          setIsPhone(false);
        } else if (isTabletDetected) {
          setIsTV(false);
          setIsTablet(true);
          setIsPhone(false);
        } else if (isPhoneDetected) {
          setIsTV(false);
          setIsTablet(false);
          setIsPhone(true);
        } else {
          setIsTV(false);
          setIsTablet(false);
          setIsPhone(false);
        }
      }
    };

    checkDevice();
    window.addEventListener('resize', checkDevice);
    window.addEventListener('orientationchange', checkDevice);
    return () => {
      window.removeEventListener('resize', checkDevice);
      window.removeEventListener('orientationchange', checkDevice);
      window.removeEventListener('tmdb_settings_changed', handleSettingsChanged);
    };
  }, [deviceMode]);

  const setDeviceMode = async (mode: 'auto' | 'tv' | 'mobile' | 'tablet' | 'desktop') => {
    setDeviceModeState(mode);
    await dbService.updateSettings({ deviceMode: mode });
  };

  const detectedPlatform: 'tv' | 'tablet' | 'mobile' | 'desktop' = isTV
    ? 'tv'
    : isTablet
    ? 'tablet'
    : isPhone
    ? 'mobile'
    : 'desktop';

  const activeLayout: 'tv' | 'tablet' | 'mobile' | 'desktop' = deviceMode === 'auto' ? detectedPlatform : deviceMode;

  return {
    deviceMode,
    isTV,
    isTablet,
    isPhone,
    isMobile: isPhone || isTablet,
    isDesktop: !isPhone && !isTablet && !isTV,
    detectedPlatform,
    activeLayout,
    setDeviceMode
  };
}
