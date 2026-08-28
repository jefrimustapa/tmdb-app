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
    id: 'moviesapi',
    name: 'MoviesAPI (No Ads)',
    tagline: 'Direct cloud server with fast responsive playback',
    badge: 'Cloud',
    getMovieUrl: (tmdbId: number) => `https://moviesapi.to/movie/${tmdbId}?autoplay=1`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://moviesapi.to/tv/${tmdbId}-${s}-${e}?autoplay=1`
  },
  {
    id: 'cinesrc',
    name: 'CineSrc (No Ads)',
    tagline: 'High speed fast streaming server without popups',
    badge: 'Fast',
    getMovieUrl: (tmdbId: number) => `https://cinesrc.st/embed/movie/${tmdbId}`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://cinesrc.st/embed/tv/${tmdbId}?s=${s}&e=${e}`
  },
  {
    id: 'cinezo',
    name: 'Cinezo (No Ads)',
    tagline: 'Clean player with multiple streaming mirrors',
    badge: 'HD',
    getMovieUrl: (tmdbId: number) => `https://player.cinezo.live/embed/movie/${tmdbId}`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://player.cinezo.live/embed/tv/${tmdbId}/${s}/${e}`
  },
  {
    id: 'peestream',
    name: 'PeeStream (No Ads)',
    tagline: 'Fast bufferless CDN stream with auto quality',
    badge: 'Direct',
    getMovieUrl: (tmdbId: number) => `https://peestream.in/embed/?tmdbId=${tmdbId}&type=movie`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://peestream.in/embed/?tmdbId=${tmdbId}&type=show&season=${s}&episode=${e}`
  },
  {
    id: 'flaxmovies',
    name: 'FlaxMovies (No Ads)',
    tagline: 'Streamlined server with seamless episode navigation',
    badge: 'HD',
    getMovieUrl: (tmdbId: number) => `https://flaxmovies.xyz/embed/movie/${tmdbId}`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://flaxmovies.xyz/embed/tv/${tmdbId}/${s}/${e}`
  },
  {
    id: 'videasy',
    name: 'VidEasy',
    tagline: 'High definition multi-audio stream player',
    badge: '1080p',
    getMovieUrl: (tmdbId: number) => `https://player.videasy.net/movie/${tmdbId}`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://player.videasy.net/tv/${tmdbId}/${s}/${e}`
  },
  {
    id: '111movies',
    name: '111Movies',
    tagline: 'Fast responsive playback with minimal buffer',
    badge: 'HD',
    getMovieUrl: (tmdbId: number) => `https://111movies.com/movie/${tmdbId}`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://111movies.com/tv/${tmdbId}/${s}/${e}`
  },
  {
    id: 'vidzee',
    name: 'VidZee',
    tagline: 'Optimized player with instant stream start',
    badge: 'Cloud',
    getMovieUrl: (tmdbId: number) => `https://player.vidzee.wtf/embed/movie/${tmdbId}`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://player.vidzee.wtf/embed/tv/${tmdbId}/${s}/${e}`
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
    id: 'mapple',
    name: 'Mapple',
    tagline: 'High-bandwidth mirror with fast response',
    badge: 'Fast',
    getMovieUrl: (tmdbId: number) => `https://mapple.uk/watch/movie/${tmdbId}`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://mapple.uk/watch/tv/${tmdbId}-${s}-${e}`
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
    id: 'autoembed',
    name: 'AutoEmbed',
    tagline: 'Automated failover mirror with smart source switching',
    badge: 'Auto',
    getMovieUrl: (tmdbId: number) => `https://player.autoembed.cc/embed/movie/${tmdbId}`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://player.autoembed.cc/embed/tv/${tmdbId}/${s}/${e}`
  },
  {
    id: 'vixsrc',
    name: 'VixSrc',
    tagline: 'Fast and secure video server for new releases',
    badge: 'HD',
    getMovieUrl: (tmdbId: number) => `https://vixsrc.to/movie/${tmdbId}`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://vixsrc.to/tv/${tmdbId}/${s}/${e}`
  },
  {
    id: 'vidlove',
    name: 'VidLove',
    tagline: 'Clean embed player with high quality audio',
    badge: 'Direct',
    getMovieUrl: (tmdbId: number) => `https://player.vidlove.cc/embed/movie/${tmdbId}`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://player.vidlove.cc/embed/tv/${tmdbId}/${s}/${e}`
  },
  {
    id: 'vidfast',
    name: 'VidFast',
    tagline: 'Ultra-low latency streaming with fast seek support',
    badge: 'Fast',
    getMovieUrl: (tmdbId: number) => `https://vidfast.vc/movie/${tmdbId}`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://vidfast.vc/tv/${tmdbId}/${s}/${e}`
  },
  {
    id: 'filmu',
    name: 'Filmu',
    tagline: 'Global cloud streaming cluster for movies & series',
    badge: 'HD',
    getMovieUrl: (tmdbId: number) => `https://embed.filmu.in/movie/${tmdbId}`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://embed.filmu.in/tv/${tmdbId}/${s}/${e}`
  },
  {
    id: 'vidcore',
    name: 'VidCore',
    tagline: 'Modern stream player with fast CDN buffers',
    badge: 'Cloud',
    getMovieUrl: (tmdbId: number) => `https://vidcore.net/movie/${tmdbId}?theme=%239055ff`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://vidcore.net/tv/${tmdbId}/${s}/${e}?theme=%239055ff`
  },
  {
    id: 'vaplayer',
    name: 'VAPlayer',
    tagline: 'High performance video stream with multi-subtitle tracks',
    badge: '1080p',
    getMovieUrl: (tmdbId: number) => `https://vaplayer.ru/embed/movie/${tmdbId}?color=9055ff`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://vaplayer.ru/embed/tv/${tmdbId}/${s}/${e}?color=9055ff`
  },
  {
    id: 'vares',
    name: 'Vares',
    tagline: 'Lightning fast playback engine for popular titles',
    badge: 'Fast',
    getMovieUrl: (tmdbId: number) => `https://vares.app/movie/${tmdbId}`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://vares.app/tv/${tmdbId}/${s}/${e}`
  },
  {
    id: 'vidking',
    name: 'VidKing',
    tagline: 'Direct mirror with high bitrate video quality',
    badge: 'Direct',
    getMovieUrl: (tmdbId: number) => `https://www.vidking.net/embed/movie/${tmdbId}`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://www.vidking.net/embed/tv/${tmdbId}/${s}/${e}`
  },
  {
    id: 'vidbolt',
    name: 'VidBolt',
    tagline: 'High speed CDN playback with fast start time',
    badge: 'Fast',
    getMovieUrl: (tmdbId: number) => `https://vidbolt.xyz/movie/${tmdbId}`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://vidbolt.xyz/tv/${tmdbId}/${s}/${e}`
  },
  {
    id: 'vidnest',
    name: 'VidNest',
    tagline: 'Reliable secondary stream mirror with wide library',
    badge: 'HD',
    getMovieUrl: (tmdbId: number) => `https://vidnest.fun/movie/${tmdbId}`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://vidnest.fun/tv/${tmdbId}/${s}/${e}`
  },
  {
    id: 'vidsrcsu',
    name: 'VidSrc SU',
    tagline: 'Dedicated redundant VidSrc cluster with auto-sync',
    badge: 'Stable',
    getMovieUrl: (tmdbId: number) => `https://vidsrc.su/movie/${tmdbId}?autoplay=true&colour=9055ff`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://vidsrc.su/tv/${tmdbId}/${s}/${e}?autoplay=true&colour=9055ff`
  },
  {
    id: 'vidgod',
    name: 'VidGod',
    tagline: 'Decentralized streaming cloud with smooth seeking',
    badge: 'Cloud',
    getMovieUrl: (tmdbId: number) => `https://vidgod.net/movie/${tmdbId}`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://vidgod.net/tv/${tmdbId}/${s}/${e}`
  },
  {
    id: 'vidsrcme',
    name: 'VidSrc ME',
    tagline: 'Original VidSrc engine with comprehensive catalog coverage',
    badge: 'Classic',
    getMovieUrl: (tmdbId: number) => `https://vidsrc.me/embed/movie?tmdb=${tmdbId}`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://vidsrc.me/embed/tv?tmdb=${tmdbId}&season=${s}&episode=${e}`
  },
  {
    id: '1embed',
    name: '1Embed',
    tagline: 'Simple clean stream embed for quick access',
    badge: 'Direct',
    getMovieUrl: (tmdbId: number) => `https://1embed.cc/embed/movie/${tmdbId}`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://1embed.cc/embed/tv/${tmdbId}/${s}/${e}`
  },
  {
    id: 'smashystream',
    name: 'SmashyStream',
    tagline: 'Multi-player streaming server with fast load times',
    badge: 'Reliable',
    getMovieUrl: (tmdbId: number) => `https://embed.smashystream.com/playere.php?tmdb=${tmdbId}&autoplay=1`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://embed.smashystream.com/playere.php?tmdb=${tmdbId}&season=${s}&episode=${e}&autoplay=1`
  }
];

export function getProviderById(id: string): StreamProvider {
  return STREAM_PROVIDERS.find(p => p.id === id) || STREAM_PROVIDERS[0];
}

export function getOrderedProviders(topProviders?: string[]): StreamProvider[] {
  if (!topProviders || topProviders.length === 0) return STREAM_PROVIDERS;
  const topList = topProviders
    .map(id => STREAM_PROVIDERS.find(p => p.id === id))
    .filter((p): p is StreamProvider => Boolean(p));
  const restList = STREAM_PROVIDERS.filter(p => !topProviders.includes(p.id));
  return [...topList, ...restList];
}
