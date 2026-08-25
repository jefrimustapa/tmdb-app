import React from 'react';
import { Link } from 'react-router-dom';

export interface PlatformItem {
  id: string;
  name: string;
  providerId: string;
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
    name: 'Apple TV',
    providerId: '350',
    region: 'US',
    bgGradient: 'from-[#1f1f23] to-[#0d0d0f]',
    borderColor: 'border-white/20 group-hover:border-white/60',
    glowColor: 'group-hover:shadow-[0_0_20px_rgba(255,255,255,0.25)]'
  },
  {
    id: 'hbo',
    name: 'HBO Max',
    providerId: '1899',
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
    region: 'US',
    bgGradient: 'from-[#042054] via-[#09143c] to-[#040817]',
    borderColor: 'border-blue-500/40 group-hover:border-blue-400',
    glowColor: 'group-hover:shadow-[0_0_20px_rgba(59,130,246,0.4)]'
  },
  {
    id: 'netflix',
    name: 'Netflix',
    providerId: '8',
    region: 'US',
    bgGradient: 'from-[#38090d] via-[#1c0406] to-[#0a0203]',
    borderColor: 'border-red-600/40 group-hover:border-red-500',
    glowColor: 'group-hover:shadow-[0_0_20px_rgba(229,9,20,0.4)]'
  },
  {
    id: 'prime',
    name: 'Prime Video',
    providerId: '9',
    region: 'US',
    bgGradient: 'from-[#002f4e] via-[#001726] to-[#000d17]',
    borderColor: 'border-sky-500/40 group-hover:border-sky-400',
    glowColor: 'group-hover:shadow-[0_0_20px_rgba(14,165,233,0.4)]'
  },
  {
    id: 'viu',
    name: 'Viu',
    providerId: '158',
    region: 'MY',
    bgGradient: 'from-[#3a2800] via-[#1f1500] to-[#0f0a00]',
    borderColor: 'border-amber-500/40 group-hover:border-amber-400',
    glowColor: 'group-hover:shadow-[0_0_20px_rgba(245,158,11,0.4)]'
  },
  {
    id: 'netflix-kids',
    name: 'Netflix Kids',
    providerId: '8',
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
            className={`group relative flex flex-col items-center justify-center aspect-square p-2 sm:p-3 rounded-full bg-gradient-to-b ${platform.bgGradient} border ${platform.borderColor} ${platform.glowColor} transition-all duration-300 hover:scale-105 active:scale-95 shadow-lg tv-focus-target overflow-hidden`}
          >
            {/* Glossy Reflection highlight */}
            <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/10 to-transparent pointer-events-none rounded-t-full" />

            {/* Platform Custom Badges / Logos */}
            <div className="w-full h-full flex flex-col items-center justify-center text-center">
              {platform.id === 'apple' && (
                <div className="flex flex-col items-center justify-center">
                  <svg className="w-8 h-8 sm:w-10 sm:h-10 text-white fill-current drop-shadow" viewBox="0 0 170 170">
                    <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.7-3.04-7.7-7.83-12-14.37-6.2-9.46-11.08-20.2-14.65-32.22-3.57-12.02-5.35-23.48-5.35-34.38 0-16.08 4.2-29.35 12.61-39.81 8.41-10.46 18.73-15.79 30.96-16 4.35 0 9.49 1.14 15.42 3.42 5.93 2.28 9.78 3.48 11.55 3.6 2.17 0 6.13-1.22 11.88-3.66 5.75-2.44 10.66-3.6 14.73-3.48 11.08.65 20.3 4.54 27.67 11.68 7.37 7.14 12.18 16.08 14.43 26.83-9.78 5.87-14.62 14.13-14.52 24.78.11 8.26 3.26 15.22 9.46 20.87 6.2 5.65 13.59 9.02 22.18 10.11-2.17 6.52-4.67 12.82-7.5 18.91zM119.22 33.72c0-7.39 2.66-14.24 7.98-20.54 5.33-6.3 11.85-10.33 19.57-12.08 1.09 7.39-.76 14.46-5.54 21.2-4.78 6.74-11.41 10.87-19.89 12.39-.43-.32-1.19-.64-2.12-.97z" />
                  </svg>
                  <span className="text-[10px] sm:text-xs font-black tracking-widest text-white mt-1 uppercase">TV+</span>
                </div>
              )}

              {platform.id === 'hbo' && (
                <div className="flex flex-col items-center justify-center">
                  <span className="font-display font-black text-xl sm:text-2xl tracking-tighter text-white bg-clip-text text-transparent bg-gradient-to-r from-purple-200 via-white to-purple-300">
                    MAX
                  </span>
                  <span className="text-[9px] sm:text-[10px] font-bold text-purple-300 tracking-wider">HBO</span>
                </div>
              )}

              {platform.id === 'disney' && (
                <div className="flex flex-col items-center justify-center">
                  <span className="font-serif italic font-black text-lg sm:text-xl text-white tracking-tight">
                    Disney<span className="font-sans not-italic text-blue-400 font-extrabold ml-0.5">+</span>
                  </span>
                  <span className="text-[8px] sm:text-[9px] font-semibold text-blue-200 tracking-widest uppercase">STREAM</span>
                </div>
              )}

              {platform.id === 'netflix' && (
                <div className="flex flex-col items-center justify-center">
                  <span className="font-display font-black text-2xl sm:text-3xl text-red-600 tracking-tighter drop-shadow-[0_0_8px_rgba(229,9,20,0.8)]">
                    N
                  </span>
                  <span className="text-[9px] sm:text-[10px] font-black text-gray-200 tracking-widest uppercase">NETFLIX</span>
                </div>
              )}

              {platform.id === 'prime' && (
                <div className="flex flex-col items-center justify-center">
                  <span className="font-display font-black text-base sm:text-lg text-white tracking-tight">
                    prime
                  </span>
                  <svg className="w-8 sm:w-10 h-2.5 text-cyan-400 fill-current -mt-0.5" viewBox="0 0 100 24">
                    <path d="M 5 10 Q 50 25 95 6 Q 70 14 5 10 Z" />
                    <polygon points="90,4 98,6 94,14" />
                  </svg>
                  <span className="text-[8px] sm:text-[9px] font-bold text-sky-300 tracking-widest uppercase mt-0.5">VIDEO</span>
                </div>
              )}

              {platform.id === 'viu' && (
                <div className="flex flex-col items-center justify-center">
                  <span className="font-display font-black text-xl sm:text-2xl text-amber-400 tracking-wider drop-shadow">
                    viu
                  </span>
                  <span className="text-[8px] sm:text-[9px] font-bold text-amber-200/80 tracking-widest uppercase">ASIAN HITS</span>
                </div>
              )}

              {platform.id === 'netflix-kids' && (
                <div className="flex flex-col items-center justify-center">
                  <span className="font-display font-black text-sm sm:text-base text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-pink-400 to-emerald-300 tracking-tight">
                    KIDS
                  </span>
                  <span className="text-[8px] sm:text-[9px] font-extrabold text-emerald-300 tracking-widest uppercase">FAMILY</span>
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};