export interface StreamSource {
  url: string;
  quality?: string;
  isM3U8?: boolean;
}

export interface StreamSubtitle {
  url: string;
  lang: string;
}

export interface DirectStreamResult {
  provider: string;
  sources: StreamSource[];
  subtitles?: StreamSubtitle[];
  headers?: Record<string, string>;
}

export const DEFAULT_DIRECT_STREAM_API = 'https://tmdb-api-yfbu.onrender.com';

/**
 * Attempt to extract direct video stream sources from the configured Consumet backend
 */
export async function fetchDirectStream(
  tmdbId: number,
  title: string,
  mediaType: 'movie' | 'tv',
  season?: number,
  episode?: number,
  customApiUrl?: string
): Promise<DirectStreamResult | null> {
  const baseUrl = (customApiUrl || DEFAULT_DIRECT_STREAM_API).replace(/\/+$/, '');

  // 1. Try Direct TMDB Bridge Endpoint
  try {
    const tmdbUrl = mediaType === 'tv' && season && episode
      ? `${baseUrl}/api/tmdb/watch?id=${tmdbId}&s=${season}&e=${episode}`
      : `${baseUrl}/api/tmdb/watch?id=${tmdbId}`;

    const res = await fetch(tmdbUrl, { signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      const data = await res.json();
      if (data && data.sources && data.sources.length > 0) {
        return {
          provider: 'TMDB Direct Resolver',
          sources: data.sources.map((s: any) => ({
            url: s.url,
            quality: s.quality || 'auto',
            isM3U8: s.isM3U8 ?? s.url.includes('.m3u8')
          })),
          subtitles: data.subtitles?.map((sub: any) => ({
            url: sub.url,
            lang: sub.lang || sub.language || 'English'
          })),
          headers: data.headers
        };
      }
    }
  } catch (err) {
    console.warn('[DirectStream] TMDB bridge query failed:', err);
  }

  // 2. Try FlixHQ Search & Extract for Movies/Shows
  try {
    const searchUrl = `${baseUrl}/api/movies/flixhq/search?q=${encodeURIComponent(title)}`;
    const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(6000) });
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (searchData.results && searchData.results.length > 0) {
        const topResult = searchData.results[0];
        // Fetch info to get episodeId
        const infoUrl = `${baseUrl}/api/movies/flixhq/info?id=${encodeURIComponent(topResult.id)}`;
        const infoRes = await fetch(infoUrl, { signal: AbortSignal.timeout(6000) });
        if (infoRes.ok) {
          const infoData = await infoRes.json();
          let targetEpisodeId = infoData.episodes?.[0]?.id;

          if (mediaType === 'tv' && season && episode && infoData.episodes) {
            const match = infoData.episodes.find((ep: any) => ep.season === season && ep.number === episode);
            if (match) targetEpisodeId = match.id;
          }

          if (targetEpisodeId) {
            const watchUrl = `${baseUrl}/api/movies/flixhq/watch?episodeId=${encodeURIComponent(targetEpisodeId)}&mediaId=${encodeURIComponent(topResult.id)}`;
            const watchRes = await fetch(watchUrl, { signal: AbortSignal.timeout(8000) });
            if (watchRes.ok) {
              const watchData = await watchRes.json();
              if (watchData.sources && watchData.sources.length > 0) {
                return {
                  provider: 'FlixHQ Direct',
                  sources: watchData.sources.map((s: any) => ({
                    url: s.url,
                    quality: s.quality || '1080p',
                    isM3U8: s.isM3U8 ?? s.url.includes('.m3u8')
                  })),
                  subtitles: watchData.subtitles?.map((sub: any) => ({
                    url: sub.url,
                    lang: sub.lang || sub.language || 'English'
                  })),
                  headers: watchData.headers
                };
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('[DirectStream] FlixHQ extraction failed:', err);
  }

  // 3. Try DramaCool for Asian / Drama Titles
  try {
    const dramaSearchUrl = `${baseUrl}/api/dramas/dramacool/search?q=${encodeURIComponent(title)}`;
    const dramaSearchRes = await fetch(dramaSearchUrl, { signal: AbortSignal.timeout(6000) });
    if (dramaSearchRes.ok) {
      const dramaData = await dramaSearchRes.json();
      if (dramaData.results && dramaData.results.length > 0) {
        const topDrama = dramaData.results[0];
        const dramaInfoUrl = `${baseUrl}/api/dramas/dramacool/info?id=${encodeURIComponent(topDrama.id)}`;
        const dramaInfoRes = await fetch(dramaInfoUrl, { signal: AbortSignal.timeout(6000) });
        if (dramaInfoRes.ok) {
          const info = await dramaInfoRes.json();
          let targetEp = info.episodes?.[0];
          if (episode && info.episodes) {
            const match = info.episodes.find((ep: any) => ep.number === episode);
            if (match) targetEp = match;
          }

          if (targetEp?.id) {
            const watchUrl = `${baseUrl}/api/dramas/dramacool/watch?episodeId=${encodeURIComponent(targetEp.id)}&mediaId=${encodeURIComponent(topDrama.id)}`;
            const watchRes = await fetch(watchUrl, { signal: AbortSignal.timeout(8000) });
            if (watchRes.ok) {
              const streamData = await watchRes.json();
              if (streamData.sources && streamData.sources.length > 0) {
                return {
                  provider: 'DramaCool Direct',
                  sources: streamData.sources.map((s: any) => ({
                    url: s.url,
                    quality: s.quality || 'HD',
                    isM3U8: s.isM3U8 ?? s.url.includes('.m3u8')
                  })),
                  subtitles: streamData.subtitles?.map((sub: any) => ({
                    url: sub.url,
                    lang: sub.lang || 'English'
                  }))
                };
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('[DirectStream] DramaCool extraction failed:', err);
  }

  return null;
}
