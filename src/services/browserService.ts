/**
 * Cross-platform helper to reliably open an external URL.
 * In native Android (Capacitor), uses the AndroidBridge.openBrowser native Intent.
 * In web browsers, falls back to window.open with security attributes.
 */
export const openExternalUrl = (url: string) => {
  if (!url) return;
  const targetUrl = url.trim();

  try {
    if (
      typeof window !== 'undefined' &&
      (window as any).AndroidBridge &&
      typeof (window as any).AndroidBridge.openBrowser === 'function'
    ) {
      (window as any).AndroidBridge.openBrowser(targetUrl);
      return;
    }
  } catch (err) {
    console.warn('[browserService] Error calling AndroidBridge.openBrowser:', err);
  }

  // Fallback for standard browsers
  try {
    const newWindow = window.open(targetUrl, '_blank', 'noopener,noreferrer');
    if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
      window.location.href = targetUrl;
    }
  } catch (e) {
    console.error('[browserService] Failed to open URL in browser:', e);
    window.location.href = targetUrl;
  }
};
