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
