// Single source for the default TGStrm server. Override at build time with VITE_TGSTRM_DEFAULT_URL.
export const DEFAULT_TGSTRM_URL: string = (
  (import.meta.env?.VITE_TGSTRM_DEFAULT_URL as string | undefined)?.trim() || 'https://tgstrm.julietmike.net'
).replace(/\/+$/, '');

export const DEFAULT_TGSTRM_HOST: string = (() => {
  try {
    return new URL(DEFAULT_TGSTRM_URL).hostname;
  } catch {
    return DEFAULT_TGSTRM_URL;
  }
})();

/**
 * Detects legacy direct router port 3033 or root domain URLs that must be upgraded to tgstrm.julietmike.net
 */
export function isLegacyTgStrmUrl(url?: string): boolean {
  if (typeof url !== 'string' || !url.trim()) return false;
  const clean = url.trim().toLowerCase();
  return (
    clean.includes(':3033') ||
    clean.includes('www.julietmike.net') ||
    clean.includes('julietmike.net:3033') ||
    clean === 'https://julietmike.net' ||
    clean === 'http://julietmike.net' ||
    clean === 'julietmike.net'
  );
}

/**
 * Normalizes TGStrm microservice endpoint URL, strictly enforcing canonical HTTPS domain over legacy router URLs.
 */
export function normalizeTgStrmUrl(url?: string): string {
  if (!url || typeof url !== 'string' || !url.trim() || isLegacyTgStrmUrl(url)) {
    return DEFAULT_TGSTRM_URL;
  }
  return url.trim().replace(/\/+$/, '');
}
