import type { StreamProvider, StreamProviderCategory, StreamEngineType, OriginCountryCode } from '../types/stream';

export const CATEGORY_BADGE_CONFIG: Record<
  StreamProviderCategory,
  { label: string; className: string }
> = {
  anime: { label: 'Anime', className: 'bg-pink-500/20 text-pink-300 border-pink-500/40' },
  korean: { label: 'K-Drama', className: 'bg-rose-500/20 text-rose-300 border-rose-500/40' },
  asean: { label: 'Asean', className: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
  malaysian: { label: 'Malay', className: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
  hollywood: { label: 'Hollywood', className: 'bg-blue-500/20 text-blue-300 border-blue-500/40' },
  general: { label: 'General', className: 'bg-white/10 text-gray-300 border-white/15' },
};

export const STREAM_PROVIDERS: StreamProvider[] = [
  {
    id: 'vidlink',
    name: 'VidLink (Primary)',
    tagline: 'Fast 1080p stream with subtitle support & fast CDN',
    categories: ['hollywood', 'general'],
    getMovieUrl: (tmdbId: number) => `https://vidlink.pro/movie/${tmdbId}?autoplay=true&autostart=true&primaryColor=673ab7&secondaryColor=9055ff&iconColor=00d2ff&nextbutton=true`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://vidlink.pro/tv/${tmdbId}/${s}/${e}?autoplay=true&autostart=true&primaryColor=673ab7&secondaryColor=9055ff&iconColor=00d2ff&nextbutton=true`
  },
  {
    id: 'moviesapi',
    name: 'MoviesAPI (No Ads)',
    tagline: 'Direct cloud server with fast responsive playback',
    categories: ['hollywood', 'general'],
    getMovieUrl: (tmdbId: number) => `https://moviesapi.to/movie/${tmdbId}?autoplay=1`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://moviesapi.to/tv/${tmdbId}-${s}-${e}?autoplay=1`
  },
  {
    id: 'cinesrc',
    name: 'CineSrc (No Ads)',
    tagline: 'High speed fast streaming server without popups',
    categories: ['hollywood', 'general'],
    getMovieUrl: (tmdbId: number) => `https://cinesrc.st/embed/movie/${tmdbId}`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://cinesrc.st/embed/tv/${tmdbId}?s=${s}&e=${e}`
  },
  {
    id: 'cinezo',
    name: 'Cinezo (No Ads)',
    tagline: 'Clean player with multiple streaming mirrors',
    categories: ['hollywood', 'general'],
    getMovieUrl: (tmdbId: number) => `https://player.cinezo.live/embed/movie/${tmdbId}`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://player.cinezo.live/embed/tv/${tmdbId}/${s}/${e}`
  },
  {
    id: 'peestream',
    name: 'PeeStream (No Ads)',
    tagline: 'Fast bufferless CDN stream with auto quality',
    categories: ['hollywood', 'general'],
    getMovieUrl: (tmdbId: number) => `https://peestream.in/embed/?tmdbId=${tmdbId}&type=movie`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://peestream.in/embed/?tmdbId=${tmdbId}&type=show&season=${s}&episode=${e}`
  },
  {
    id: 'flaxmovies',
    name: 'FlaxMovies (No Ads)',
    tagline: 'Streamlined server with seamless episode navigation',
    categories: ['hollywood', 'general'],
    getMovieUrl: (tmdbId: number) => `https://flaxmovies.xyz/embed/movie/${tmdbId}`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://flaxmovies.xyz/embed/tv/${tmdbId}/${s}/${e}`
  },
  {
    id: 'videasy',
    name: 'VidEasy',
    tagline: 'High definition multi-audio stream player',
    categories: ['hollywood', 'general'],
    getMovieUrl: (tmdbId: number) => `https://player.videasy.net/movie/${tmdbId}`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://player.videasy.net/tv/${tmdbId}/${s}/${e}`
  },
  {
    id: '111movies',
    name: '111Movies',
    tagline: 'Fast responsive playback with minimal buffer',
    categories: ['hollywood', 'general'],
    getMovieUrl: (tmdbId: number) => `https://111movies.com/movie/${tmdbId}`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://111movies.com/tv/${tmdbId}/${s}/${e}`
  },
  {
    id: 'vidzee',
    name: 'VidZee',
    tagline: 'Optimized player with instant stream start',
    categories: ['hollywood', 'general'],
    getMovieUrl: (tmdbId: number) => `https://player.vidzee.wtf/embed/movie/${tmdbId}`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://player.vidzee.wtf/embed/tv/${tmdbId}/${s}/${e}`
  },
  {
    id: 'vidsrc-to',
    name: 'VidSrc TO',
    tagline: 'Direct cloud server with quick loading',
    categories: ['hollywood', 'general'],
    getMovieUrl: (tmdbId: number) => `https://vidsrc.to/embed/movie/${tmdbId}?autoplay=1`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://vidsrc.to/embed/tv/${tmdbId}/${s}/${e}?autoplay=1`
  },
  {
    id: '2embed',
    name: '2Embed CC',
    tagline: 'Global distributed stream network',
    categories: ['hollywood', 'general'],
    getMovieUrl: (tmdbId: number) => `https://www.2embed.cc/embed/${tmdbId}?autoplay=1`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://www.2embed.cc/embedtv/${tmdbId}&s=${s}&e=${e}&autoplay=1`
  },
  {
    id: 'mapple',
    name: 'Mapple',
    tagline: 'High-bandwidth mirror with fast response',
    categories: ['hollywood', 'general'],
    getMovieUrl: (tmdbId: number) => `https://mapple.uk/watch/movie/${tmdbId}`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://mapple.uk/watch/tv/${tmdbId}-${s}-${e}`
  },
  {
    id: 'superembed',
    name: 'SuperEmbed',
    tagline: 'High stability server for international titles',
    categories: ['hollywood', 'general'],
    getMovieUrl: (tmdbId: number) => `https://multiembed.mov/directstream.php?video_id=${tmdbId}&tmdb=1&autoplay=1`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://multiembed.mov/directstream.php?video_id=${tmdbId}&tmdb=1&s=${s}&e=${e}&autoplay=1`
  },
  {
    id: 'autoembed',
    name: 'AutoEmbed',
    tagline: 'Automated failover mirror with smart source switching',
    categories: ['hollywood', 'general'],
    getMovieUrl: (tmdbId: number) => `https://player.autoembed.cc/embed/movie/${tmdbId}`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://player.autoembed.cc/embed/tv/${tmdbId}/${s}/${e}`
  },
  {
    id: 'vixsrc',
    name: 'VixSrc',
    tagline: 'Fast and secure video server for new releases',
    categories: ['hollywood', 'general'],
    getMovieUrl: (tmdbId: number) => `https://vixsrc.to/movie/${tmdbId}`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://vixsrc.to/tv/${tmdbId}/${s}/${e}`
  },
  {
    id: 'vidlove',
    name: 'VidLove',
    tagline: 'Clean embed player with high quality audio',
    categories: ['hollywood', 'general'],
    getMovieUrl: (tmdbId: number) => `https://player.vidlove.cc/embed/movie/${tmdbId}`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://player.vidlove.cc/embed/tv/${tmdbId}/${s}/${e}`
  },
  {
    id: 'vidfast',
    name: 'VidFast',
    tagline: 'Ultra-low latency streaming with fast seek support',
    categories: ['hollywood', 'general'],
    getMovieUrl: (tmdbId: number) => `https://vidfast.vc/movie/${tmdbId}`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://vidfast.vc/tv/${tmdbId}/${s}/${e}`
  },
  {
    id: 'filmu',
    name: 'Filmu',
    tagline: 'Global cloud streaming cluster for movies & series',
    categories: ['hollywood', 'general'],
    getMovieUrl: (tmdbId: number) => `https://embed.filmu.in/movie/${tmdbId}`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://embed.filmu.in/tv/${tmdbId}/${s}/${e}`
  },
  {
    id: 'vidcore',
    name: 'VidCore',
    tagline: 'Modern stream player with fast CDN buffers',
    categories: ['hollywood', 'general'],
    getMovieUrl: (tmdbId: number) => `https://vidcore.net/movie/${tmdbId}?theme=%239055ff`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://vidcore.net/tv/${tmdbId}/${s}/${e}?theme=%239055ff`
  },
  {
    id: 'vaplayer',
    name: 'VAPlayer',
    tagline: 'High performance video stream with multi-subtitle tracks',
    categories: ['hollywood', 'general'],
    getMovieUrl: (tmdbId: number) => `https://vaplayer.ru/embed/movie/${tmdbId}?color=9055ff`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://vaplayer.ru/embed/tv/${tmdbId}/${s}/${e}?color=9055ff`
  },
  {
    id: 'vares',
    name: 'Vares',
    tagline: 'Lightning fast playback engine for popular titles',
    categories: ['hollywood', 'general'],
    getMovieUrl: (tmdbId: number) => `https://vares.app/movie/${tmdbId}`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://vares.app/tv/${tmdbId}/${s}/${e}`
  },
  {
    id: 'vidking',
    name: 'VidKing',
    tagline: 'Direct mirror with high bitrate video quality',
    categories: ['hollywood', 'general'],
    getMovieUrl: (tmdbId: number) => `https://www.vidking.net/embed/movie/${tmdbId}`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://www.vidking.net/embed/tv/${tmdbId}/${s}/${e}`
  },
  {
    id: 'vidbolt',
    name: 'VidBolt',
    tagline: 'High speed CDN playback with fast start time',
    categories: ['hollywood', 'general'],
    getMovieUrl: (tmdbId: number) => `https://vidbolt.xyz/movie/${tmdbId}`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://vidbolt.xyz/tv/${tmdbId}/${s}/${e}`
  },
  {
    id: 'vidnest',
    name: 'VidNest',
    tagline: 'Reliable secondary stream mirror with wide library',
    categories: ['hollywood', 'general'],
    getMovieUrl: (tmdbId: number) => `https://vidnest.fun/movie/${tmdbId}`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://vidnest.fun/tv/${tmdbId}/${s}/${e}`
  },
  {
    id: 'vidsrcsu',
    name: 'VidSrc SU',
    tagline: 'Dedicated redundant VidSrc cluster with auto-sync',
    categories: ['hollywood', 'general'],
    getMovieUrl: (tmdbId: number) => `https://vidsrc.su/movie/${tmdbId}?autoplay=true&colour=9055ff`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://vidsrc.su/tv/${tmdbId}/${s}/${e}?autoplay=true&colour=9055ff`
  },
  {
    id: 'vidgod',
    name: 'VidGod',
    tagline: 'Decentralized streaming cloud with smooth seeking',
    categories: ['hollywood', 'general'],
    getMovieUrl: (tmdbId: number) => `https://vidgod.net/movie/${tmdbId}`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://vidgod.net/tv/${tmdbId}/${s}/${e}`
  },
  {
    id: 'vidsrcme',
    name: 'VidSrc ME',
    tagline: 'Original VidSrc engine with comprehensive catalog coverage',
    categories: ['hollywood', 'general'],
    getMovieUrl: (tmdbId: number) => `https://vidsrc.me/embed/movie?tmdb=${tmdbId}`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://vidsrc.me/embed/tv?tmdb=${tmdbId}&season=${s}&episode=${e}`
  },
  {
    id: '1embed',
    name: '1Embed',
    tagline: 'Simple clean stream embed for quick access',
    categories: ['hollywood', 'general'],
    getMovieUrl: (tmdbId: number) => `https://1embed.cc/embed/movie/${tmdbId}`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://1embed.cc/embed/tv/${tmdbId}/${s}/${e}`
  },
  {
    id: 'smashystream',
    name: 'SmashyStream',
    tagline: 'Multi-player streaming server with fast load times',
    categories: ['hollywood', 'general'],
    getMovieUrl: (tmdbId: number) => `https://embed.smashystream.com/playere.php?tmdb=${tmdbId}&autoplay=1`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://embed.smashystream.com/playere.php?tmdb=${tmdbId}&season=${s}&episode=${e}&autoplay=1`
  },
  {
    id: 'megaplay-anime',
    name: 'MegaPlay (Anime)',
    tagline: 'Dedicated HiAnime library with MAL & AniList catalog mapping',
    categories: ['anime'],
    getMovieUrl: () => '',
    getTVUrl: () => '',
    getAnimeUrl: (malId: number, _season?: number, episode = 1, type: 'sub' | 'dub' = 'sub') => {
      return `https://megaplay.buzz/stream/mal/${malId}/${episode || 1}/${type}`;
    }
  },
  {
    id: 'lari21-asian',
    name: 'LARI21 (Asean)',
    tagline: 'Southeast Asian & Indonesian movies with Indo subtitles via LayarIcon21 TurboVIP',
    categories: ['asean'],
    getMovieUrl: () => '',
    getTVUrl: () => ''
  },
  {
    id: 'pencurimovie-my',
    name: 'PencuriMovie (Abyss)',
    tagline: 'Southeast Asian & Malay series and movies via Abyss server',
    categories: ['malaysian', 'asean'],
    getMovieUrl: () => '',
    getTVUrl: () => ''
  },
  {
    id: 'kisskh-kdrama',
    name: 'KissKH (K-Drama)',
    tagline: 'Dedicated Korean & Asian drama catalog with multi-language subtitles',
    categories: ['korean', 'asean'],
    getMovieUrl: () => '',
    getTVUrl: () => ''
  },
  {
    id: 'vidsrc-kdrama',
    name: 'VidSrc (K-Drama)',
    tagline: 'High-speed Korean & Asian drama streaming with multi-subtitles via VidSrc SU',
    categories: ['korean'],
    getMovieUrl: (tmdbId: number) => `https://vidsrc.su/embed/movie/${tmdbId}`,
    getTVUrl: (tmdbId: number, s: number, e: number) => `https://vidsrc.su/embed/tv/${tmdbId}/${s}/${e}`
  },
  {
    id: 'dramacool-kdrama',
    name: 'Dramacool (K-Drama)',
    tagline: 'Extensive Korean & Asian drama catalog with English subtitles via Dramacool MY',
    engine: 'embed',
    countries: ['KR', 'CN', 'JP', 'GLOBAL'],
    categories: ['korean', 'asean'],
    getMovieUrl: () => '',
    getTVUrl: () => ''
  },
  {
    id: 'telegram-msm32',
    name: 'MovieSubMalay (MSM32)',
    tagline: 'Direct Telegram stream resolver for Malay & Southeast Asian cinema',
    engine: 'telegram',
    countries: ['MY', 'ID', 'SG'],
    categories: ['malaysian', 'asean'],
    getMovieUrl: () => '',
    getTVUrl: () => ''
  }
];

export const ORIGIN_COUNTRY_LABELS: Record<OriginCountryCode, string> = {
  MY: 'Malaysia 🇲🇾',
  ID: 'Indonesia 🇮🇩',
  KR: 'South Korea 🇰🇷',
  JP: 'Japan 🇯🇵',
  US: 'United States 🇺🇸',
  GB: 'United Kingdom 🇬🇧',
  TH: 'Thailand 🇹🇭',
  PH: 'Philippines 🇵🇭',
  SG: 'Singapore 🇸🇬',
  CN: 'China 🇨🇳',
  GLOBAL: 'Global / Other 🌐',
};

export function getProviderById(id: string): StreamProvider {
  return STREAM_PROVIDERS.find(p => p.id === id) || STREAM_PROVIDERS[0];
}

export function getProvidersByEngine(
  engine: StreamEngineType = 'embed',
  providers: StreamProvider[] = STREAM_PROVIDERS
): StreamProvider[] {
  return providers.filter(p => (p.engine || 'embed') === engine);
}

export function getEffectiveCountries(
  provider: StreamProvider,
  customCountries?: Record<string, OriginCountryCode[]>
): OriginCountryCode[] {
  if (customCountries && customCountries[provider.id]) {
    return customCountries[provider.id];
  }
  return provider.countries || ['GLOBAL'];
}

export function isProviderMatchingOrigin(
  provider: StreamProvider,
  originCountry?: string,
  customCountries?: Record<string, OriginCountryCode[]>
): boolean {
  if (!originCountry) return true;
  const effective = getEffectiveCountries(provider, customCountries);
  if (effective.includes('GLOBAL')) return true;
  return effective.includes(originCountry.toUpperCase() as OriginCountryCode);
}


export function getOrderedProviders(
  topProviders?: string[],
  isAnime = false,
  isAsean = false,
  isKorean = false,
  isMalay = false
): StreamProvider[] {
  let baseList = [...STREAM_PROVIDERS];

  // Prioritize based on content context
  if (isAnime) {
    baseList.sort((a, b) => (b.categories.includes('anime') ? 1 : 0) - (a.categories.includes('anime') ? 1 : 0));
  } else if (isKorean) {
    baseList.sort((a, b) => (b.categories.includes('korean') ? 1 : 0) - (a.categories.includes('korean') ? 1 : 0));
  } else if (isMalay) {
    baseList.sort((a, b) => (b.categories.includes('malaysian') ? 1 : 0) - (a.categories.includes('malaysian') ? 1 : 0));
  } else if (isAsean) {
    baseList.sort((a, b) => (b.categories.includes('asean') ? 1 : 0) - (a.categories.includes('asean') ? 1 : 0));
  }

  if (!topProviders || topProviders.length === 0) return baseList;

  const topList = topProviders
    .map(id => STREAM_PROVIDERS.find(p => p.id === id))
    .filter((p): p is StreamProvider => Boolean(p));
  const restList = baseList.filter(p => !topProviders.includes(p.id));
  return [...topList, ...restList];
}
