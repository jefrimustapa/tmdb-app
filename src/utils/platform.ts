/**
 * True inside the native Android app, where the host injects `window.AndroidBridge`.
 * On the web (and in tests / SSR) there is no bridge.
 */
export function hasAndroidBridge(): boolean {
  return typeof window !== 'undefined' && !!(window as any).AndroidBridge;
}

/** Cast / screen-mirror is only available through the Android bridge, so hide it on web. */
export function canCast(): boolean {
  return hasAndroidBridge();
}
