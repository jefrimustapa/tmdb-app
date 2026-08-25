import type { StreamProvider } from '../types/stream';

export const STREAM_PROVIDERS: StreamProvider[] = [
  {
    id: 'vidlink',
    name: 'VidLink (Primary)',
    tagline: 'Fast 1080p stream with subtitle support & fast CDN',
    badge: 'Recommended',
    getMovieUrl: (tmdbId: number) => `https://vidlink.pro/movie/${tmdbId}?autoplay=true&autostart=true&primaryColor=673ab7&secondaryColor=9055ff&iconColor=00d2ff&nextbutton=true`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://vidlink.pro/tv/${tmdbId}/${s}/${e}?autoplay=true&autostart=true&primaryColor=673ab7&secondaryColor=9055ff&iconColor=00d2ff&nextbutton=true`
  },
  {
    id: 'vidsrc-to',
    name: 'VidSrc TO',
    tagline: 'Direct cloud server with quick loading',
    badge: 'HD',
    getMovieUrl: (tmdbId: number) => `https://vidsrc.to/embed/movie/${tmdbId}?autoplay=1`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://vidsrc.to/embed/tv/${tmdbId}/${s}/${e}?autoplay=1`
  },
  {
    id: '2embed',
    name: '2Embed CC',
    tagline: 'Global distributed stream network',
    badge: 'Stable',
    getMovieUrl: (tmdbId: number) => `https://www.2embed.cc/embed/${tmdbId}?autoplay=1`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://www.2embed.cc/embedtv/${tmdbId}&s=${s}&e=${e}&autoplay=1`
  },
  {
    id: 'superembed',
    name: 'SuperEmbed',
    tagline: 'High stability server for international titles',
    badge: 'Direct',
    getMovieUrl: (tmdbId: number) => `https://multiembed.mov/directstream.php?video_id=${tmdbId}&tmdb=1&autoplay=1`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://multiembed.mov/directstream.php?video_id=${tmdbId}&tmdb=1&s=${s}&e=${e}&autoplay=1`
  },
  {
    id: 'smashystream',
    name: 'SmashyStream',
    tagline: 'Multi-player streaming server with fast load times',
    badge: 'Reliable',
    getMovieUrl: (tmdbId: number) => `https://embed.smashystream.com/playere.php?tmdb=${tmdbId}&autoplay=1`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://embed.smashystream.com/playere.php?tmdb=${tmdbId}&season=${s}&episode=${e}&autoplay=1`
  },
  {
    id: 'moviesapi',
    name: 'MoviesAPI',
    tagline: 'Direct cloud server with quick loading',
    badge: 'Cloud',
    getMovieUrl: (tmdbId: number) => `https://moviesapi.to/movie/${tmdbId}?autoplay=1`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://moviesapi.to/tv/${tmdbId}-${s}-${e}?autoplay=1`
  }
];

export function getProviderById(id: string): StreamProvider {
  return STREAM_PROVIDERS.find(p => p.id === id) || STREAM_PROVIDERS[0];
}
