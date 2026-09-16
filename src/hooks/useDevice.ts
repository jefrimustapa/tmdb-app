import { useState, useEffect } from 'react';

export function useDevice() {
  const [isTV, setIsTV] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [isPhone, setIsPhone] = useState(false);

  useEffect(() => {
    const checkDevice = () => {
      const ua = navigator.userAgent.toLowerCase();

      // 1. TV Detection (Highest Priority)
      const isBridgeTV = typeof (window as any).AndroidBridge?.isTVDevice === 'function'
        ? (window as any).AndroidBridge.isTVDevice()
        : false;

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
        ua.includes('aft') ||
        ua.includes('mibox') ||
        ua.includes('mitv');

      const isTVDetected = isBridgeTV || isTVUserAgent;

      if (isTVDetected) {
        setIsTV(true);
        setIsTablet(false);
        setIsPhone(false);
        return;
      }

      // 2. Hardware capabilities & pointer precision
      const hasFinePointer = typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(pointer: fine)').matches
        : false;
      const hasCoarsePointer = typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(pointer: coarse)').matches
        : false;
      const hasTouch = 'ontouchstart' in window || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);

      // Dedicated Desktop OS detection (Windows, Linux desktop, macOS, ChromeOS)
      const isWindows = ua.includes('windows') || ua.includes('win32') || ua.includes('win64');
      const isLinuxDesktop = ua.includes('linux') && !ua.includes('android');
      const isChromeOS = ua.includes('cros');

      // iPad / iPadOS detection:
      // Modern iPads report "Macintosh", but Apple has never made a touch Mac, so maxTouchPoints > 1 is definitively iPad.
      const isIPad = ua.includes('ipad') || (ua.includes('macintosh') && hasTouch && navigator.maxTouchPoints > 1);
      const isMacDesktop = ua.includes('macintosh') && !isIPad;
      const isDesktopOS = isWindows || isLinuxDesktop || isMacDesktop || isChromeOS;

      // 3. Desktop / Web Evaluation
      // If running on a desktop OS with a fine pointer (mouse/trackpad), it is definitively Desktop Web,
      // even if the laptop/monitor has secondary touchscreen capabilities.
      if (isDesktopOS && hasFinePointer) {
        setIsTV(false);
        setIsTablet(false);
        setIsPhone(false);
        return;
      }

      // 4. Tablet Detection
      const isBridgeTablet = typeof (window as any).AndroidBridge?.isTabletDevice === 'function'
        ? (window as any).AndroidBridge.isTabletDevice()
        : false;

      // Android Tablet: Android OS without 'mobile' token in UA
      const isAndroidTablet = ua.includes('android') && !ua.includes('mobile');

      // Physical screen dimensions (use window.screen so resizing a browser window does not flip hardware classification)
      const screenMin = typeof window !== 'undefined' && window.screen
        ? Math.min(window.screen.width, window.screen.height)
        : Math.min(window.innerWidth, window.innerHeight);

      // Touch Tablet: touch-first device without fine pointer, non-desktop OS, and screen min dimension >= 600
      const isTouchTablet = !isDesktopOS && hasTouch && hasCoarsePointer && !hasFinePointer && screenMin >= 600;

      const isTabletDetected = isBridgeTablet || isAndroidTablet || isIPad || isTouchTablet;

      if (isTabletDetected) {
        setIsTV(false);
        setIsTablet(true);
        setIsPhone(false);
        return;
      }

      // 5. Phone Detection
      const isPhoneUA = ua.includes('mobile') || ua.includes('iphone') || (ua.includes('android') && !isTabletDetected);
      const isPhoneDetected = isPhoneUA || (!isDesktopOS && hasTouch && screenMin < 600);

      if (isPhoneDetected) {
        setIsTV(false);
        setIsTablet(false);
        setIsPhone(true);
        return;
      }

      // Default Fallback: Desktop Web
      setIsTV(false);
      setIsTablet(false);
      setIsPhone(false);
    };

    checkDevice();
    window.addEventListener('resize', checkDevice);
    window.addEventListener('orientationchange', checkDevice);
    return () => {
      window.removeEventListener('resize', checkDevice);
      window.removeEventListener('orientationchange', checkDevice);
    };
  }, []);

  const detectedPlatform: 'tv' | 'tablet' | 'mobile' | 'desktop' = isTV
    ? 'tv'
    : isTablet
    ? 'tablet'
    : isPhone
    ? 'mobile'
    : 'desktop';

  const activeLayout: 'tv' | 'tablet' | 'mobile' | 'desktop' = detectedPlatform;

  return {
    deviceMode: 'auto' as const,
    isTV,
    isTablet,
    isPhone,
    isMobile: isPhone || isTablet,
    isDesktop: !isPhone && !isTablet && !isTV,
    detectedPlatform,
    activeLayout
  };
}
