import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { App as CapApp, type URLOpenListenerEvent } from '@capacitor/app';

/**
 * Parses and routes custom URI scheme deep links:
 * - tmdbstream://details/movie/550
 * - tmdbstream://details/tv/1399
 * - tmdbstream://movie/550
 * - tmdbstream://tv/1399
 * - tmdbstream://watch/movie/550
 * - tmdbstream://watch/tv/1399?s=1&e=1
 */
export function parseDeepLink(urlStr: string): string | null {
  if (!urlStr || typeof urlStr !== 'string') return null;
  const trimmed = urlStr.trim();

  try {
    // 1. Check custom scheme tmdbstream://
    if (trimmed.toLowerCase().startsWith('tmdbstream://')) {
      const withoutScheme = trimmed.replace(/^tmdbstream:\/\//i, '');
      const [pathPart, queryPart] = withoutScheme.split('?');
      const segments = pathPart.split('/').filter(Boolean);

      if (segments.length === 0) return null;

      // Pattern 1: tmdbstream://details/{type}/{id}
      if (segments[0].toLowerCase() === 'details' && segments.length >= 3) {
        const type = segments[1].toLowerCase() === 'tv' ? 'tv' : 'movie';
        const id = parseInt(segments[2], 10);
        if (id > 0) return `/details/${type}/${id}`;
      }

      // Pattern 2: tmdbstream://{type}/{id} where type is movie or tv
      if ((segments[0].toLowerCase() === 'movie' || segments[0].toLowerCase() === 'tv') && segments.length >= 2) {
        const type = segments[0].toLowerCase() === 'tv' ? 'tv' : 'movie';
        const id = parseInt(segments[1], 10);
        if (id > 0) return `/details/${type}/${id}`;
      }

      // Pattern 3: tmdbstream://watch/{type}/{id}
      if (segments[0].toLowerCase() === 'watch' && segments.length >= 3) {
        const type = segments[1].toLowerCase() === 'tv' ? 'tv' : 'movie';
        const id = parseInt(segments[2], 10);
        if (id > 0) return `/watch/${type}/${id}${queryPart ? `?${queryPart}` : ''}`;
      }
    }

    // 2. Check themoviedb.org web links:
    // e.g. https://www.themoviedb.org/movie/550 or https://www.themoviedb.org/tv/1399-game-of-thrones
    if (trimmed.includes('themoviedb.org/')) {
      const urlObj = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
      const segments = urlObj.pathname.split('/').filter(Boolean);
      if (segments.length >= 2) {
        const mediaType = segments[0].toLowerCase();
        if (mediaType === 'movie' || mediaType === 'tv') {
          // ID might contain slug: e.g. 1399-game-of-thrones
          const rawId = segments[1];
          const id = parseInt(rawId.split('-')[0], 10);
          if (id > 0) {
            return `/details/${mediaType}/${id}`;
          }
        }
      }
    }

    return null;
  } catch (e) {
    console.warn('[DeepLink] Failed to parse deep link:', urlStr, e);
    return null;
  }
}

export const useDeepLink = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const handleUrl = (rawUrl: string) => {
      console.log('[DeepLink] Processing incoming deep link:', rawUrl);
      const targetRoute = parseDeepLink(rawUrl);
      if (targetRoute) {
        console.log('[DeepLink] Navigating to:', targetRoute);
        navigate(targetRoute);
      }
    };

    // 1. Capacitor native appUrlOpen listener
    const appUrlListener = CapApp.addListener('appUrlOpen', (event: URLOpenListenerEvent) => {
      if (event && event.url) {
        handleUrl(event.url);
      }
    });

    // 2. Custom window event from AndroidBridge / MainActivity
    const handleCustomDeepLink = (e: Event) => {
      const customEvent = e as CustomEvent<{ url?: string }>;
      if (customEvent.detail && customEvent.detail.url) {
        handleUrl(customEvent.detail.url);
      }
    };

    window.addEventListener('tmdb_deep_link', handleCustomDeepLink);

    return () => {
      appUrlListener.then(handler => handler.remove()).catch(() => {});
      window.removeEventListener('tmdb_deep_link', handleCustomDeepLink);
    };
  }, [navigate]);
};
