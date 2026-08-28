export interface TorboxStreamResult {
  provider: string;
  sources: Array<{
    url: string;
    quality?: string;
    isM3U8?: boolean;
  }>;
  title?: string;
}

/**
 * Resolve direct high-speed HTTPS stream via TorBox Cloud Debrid
 */
export async function fetchTorboxStream(
  tmdbId: number,
  imdbId?: string,
  mediaType: 'movie' | 'tv' = 'movie',
  season?: number,
  episode?: number,
  apiKey?: string
): Promise<TorboxStreamResult | null> {
  if (!apiKey || !apiKey.trim()) {
    console.log('[TorBox] No TorBox API key configured in Settings.');
    return null;
  }

  try {
    const id = imdbId || `tmdb:${tmdbId}`;
    const streamEndpoint = mediaType === 'tv' && season && episode
      ? `https://torrentio.strem.fun/torbox=${apiKey.trim()}/stream/series/${id}:${season}:${episode}.json`
      : `https://torrentio.strem.fun/torbox=${apiKey.trim()}/stream/movie/${id}.json`;

    const res = await fetch(streamEndpoint, { signal: AbortSignal.timeout(7000) });
    if (!res.ok) return null;

    const data = await res.json();
    if (data && data.streams && data.streams.length > 0) {
      const topStream = data.streams[0];
      const streamUrl = topStream.url;

      if (streamUrl) {
        return {
          provider: 'TorBox Debrid',
          sources: [
            {
              url: streamUrl,
              quality: topStream.name?.includes('4k') ? '4K UHD' : '1080p HD',
              isM3U8: streamUrl.includes('.m3u8')
            }
          ],
          title: topStream.title?.split('\n')[0] || 'Direct TorBox Stream'
        };
      }
    }
  } catch (err) {
    console.warn('[TorBox] Error resolving stream:', err);
  }

  return null;
}
