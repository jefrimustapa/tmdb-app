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

  const cleanKey = apiKey.trim();

  // 1. Try resolving through TorBox Debrid Stream Bridge
  try {
    const id = imdbId || `tmdb:${tmdbId}`;
    const streamEndpoint = mediaType === 'tv' && season && episode
      ? `https://torrentio.strem.fun/torbox=${cleanKey}/stream/series/${id}:${season}:${episode}.json`
      : `https://torrentio.strem.fun/torbox=${cleanKey}/stream/movie/${id}.json`;

    const res = await fetch(streamEndpoint, { signal: AbortSignal.timeout(7000) });
    if (res.ok) {
      const data = await res.json();
      if (data && data.streams && data.streams.length > 0) {
        // Filter out Torrentio error videos (e.g. failed_access_v3.mp4)
        const validStreams = data.streams.filter((s: any) => 
          s.url && !s.url.includes('failed_access') && !s.url.includes('invalid_token')
        );

        if (validStreams.length > 0) {
          const topStream = validStreams[0];
          const streamUrl = topStream.url;

          return {
            provider: 'TorBox 4K Cloud',
            sources: [
              {
                url: streamUrl,
                quality: topStream.name?.includes('4k') || topStream.title?.includes('2160p') ? '4K Ultra HD' : '1080p Full HD',
                isM3U8: streamUrl.includes('.m3u8')
              }
            ],
            title: topStream.title?.split('\n')[0] || 'TorBox Direct Stream'
          };
        } else {
          console.warn('[TorBox] TorBox returned invalid/unauthorized stream token. Please check your API key on torbox.app/settings.');
        }
      }
    }
  } catch (err) {
    console.warn('[TorBox] Error resolving stream:', err);
  }

  return null;
}
