import React from 'react';
import { Link } from 'react-router-dom';
import { tmdbImages } from '../../services/tmdb';

export interface PlatformItem {
  id: string;
  name: string;
  providerId: string;
  logoPath: string;
  region?: string;
  networks?: string;
  genres?: string;
  bgGradient: string;
  borderColor: string;
  glowColor: string;
}

export const PLATFORMS: PlatformItem[] = [
  {
    id: 'apple',
    name: 'Apple TV+',
    providerId: '350',
    logoPath: '/mcbz1LgtErU9p4UdbZ0rG6RTWHX.jpg',
    region: 'US',
    bgGradient: 'from-[#1f1f23] to-[#0d0d0f]',
    borderColor: 'border-white/20 group-hover:border-white/60',
    glowColor: 'group-hover:shadow-[0_0_20px_rgba(255,255,255,0.25)]'
  },
  {
    id: 'hbo',
    name: 'Max',
    providerId: '1899',
    logoPath: '/jbe4gVSfRlbPTdESXhEKpornsfu.jpg',
    region: 'US',
    networks: '49,3186',
    bgGradient: 'from-[#2e0854] via-[#1a0b2e] to-[#090314]',
    borderColor: 'border-purple-500/40 group-hover:border-purple-400',
    glowColor: 'group-hover:shadow-[0_0_20px_rgba(147,51,234,0.4)]'
  },
  {
    id: 'disney',
    name: 'Disney+',
    providerId: '337',
    logoPath: '/97yvRBw1GzX7fXprcF80er19ot.jpg',
    region: 'US',
    bgGradient: 'from-[#042054] via-[#09143c] to-[#040817]',
    borderColor: 'border-blue-500/40 group-hover:border-blue-400',
    glowColor: 'group-hover:shadow-[0_0_20px_rgba(59,130,246,0.4)]'
  },
  {
    id: 'netflix',
    name: 'Netflix',
    providerId: '8',
    logoPath: '/pbpMk2JmcoNnQwx5JGpXngfoWtp.jpg',
    region: 'US',
    bgGradient: 'from-[#38090d] via-[#1c0406] to-[#0a0203]',
    borderColor: 'border-red-600/40 group-hover:border-red-500',
    glowColor: 'group-hover:shadow-[0_0_20px_rgba(229,9,20,0.4)]'
  },
  {
    id: 'prime',
    name: 'Prime Video',
    providerId: '9',
    logoPath: '/pvske1MyAoymrs5bguRfVqYiM9a.jpg',
    region: 'US',
    bgGradient: 'from-[#002f4e] via-[#001726] to-[#000d17]',
    borderColor: 'border-sky-500/40 group-hover:border-sky-400',
    glowColor: 'group-hover:shadow-[0_0_20px_rgba(14,165,233,0.4)]'
  },
  {
    id: 'viu',
    name: 'Viu',
    providerId: '158',
    logoPath: '/o7WsYI2r1llIf9h6JTGVX9yTHPx.jpg',
    region: 'MY',
    bgGradient: 'from-[#3a2800] via-[#1f1500] to-[#0f0a00]',
    borderColor: 'border-amber-500/40 group-hover:border-amber-400',
    glowColor: 'group-hover:shadow-[0_0_20px_rgba(245,158,11,0.4)]'
  },
  {
    id: 'netflix-kids',
    name: 'Kids & Family',
    providerId: '8',
    logoPath: '/pbpMk2JmcoNnQwx5JGpXngfoWtp.jpg',
    genres: '10751,16',
    region: 'US',
    bgGradient: 'from-[#063b2c] via-[#041d16] to-[#020d0a]',
    borderColor: 'border-emerald-500/40 group-hover:border-emerald-400',
    glowColor: 'group-hover:shadow-[0_0_20px_rgba(16,185,129,0.4)]'
  }
];

export const PlatformHubs: React.FC = () => {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 -mt-6 sm:-mt-10 relative z-20">
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-3.5 sm:gap-5 md:gap-6">
        {PLATFORMS.map((platform) => (
          <Link
            key={platform.id}
            to={`/movies?provider=${platform.id}`}
            className={`group relative flex flex-col items-center justify-between p-2.5 sm:p-3.5 md:p-4 rounded-2xl sm:rounded-3xl bg-gradient-to-b ${platform.bgGradient} border ${platform.borderColor} shadow-lg overflow-hidden transition-all duration-300 hover:scale-105 active:scale-95 tv-focus-target cursor-pointer focus:outline-none`}
          >
            {/* Glossy Reflection highlight */}
            <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/15 to-transparent pointer-events-none rounded-t-2xl sm:rounded-t-3xl" />

            {/* Official Platform Logo */}
            <div className="flex-1 flex items-center justify-center py-1 sm:py-2">
              <img
                src={tmdbImages.poster(platform.logoPath, 'w185')}
                alt={platform.name}
                loading="lazy"
                decoding="async"
                className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-2xl object-cover shadow-md transition-transform duration-300 group-hover:scale-110"
              />
            </div>

            {/* Platform Title Text inside the card */}
            <span className="text-[11px] sm:text-xs font-bold text-gray-200 text-center mt-1 sm:mt-2 px-1 tracking-tight line-clamp-1 group-hover:text-white transition-colors">
              {platform.name}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
};