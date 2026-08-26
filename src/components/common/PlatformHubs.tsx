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

            {/* Platform Official Brand Logos */}
            <div className="w-full h-full flex flex-col items-center justify-center text-center p-1">
              {platform.id === 'apple' && (
                <div className="flex flex-col items-center justify-center">
                  <svg className="w-9 h-9 sm:w-11 sm:h-11 text-white fill-current drop-shadow-md" viewBox="0 0 170 170">
                    <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.7-3.04-7.7-7.83-12-14.37-6.2-9.46-11.08-20.2-14.65-32.22-3.57-12.02-5.35-23.48-5.35-34.38 0-16.08 4.2-29.35 12.61-39.81 8.41-10.46 18.73-15.79 30.96-16 4.35 0 9.49 1.14 15.42 3.42 5.93 2.28 9.78 3.48 11.55 3.6 2.17 0 6.13-1.22 11.88-3.66 5.75-2.44 10.66-3.6 14.73-3.48 11.08.65 20.3 4.54 27.67 11.68 7.37 7.14 12.18 16.08 14.43 26.83-9.78 5.87-14.62 14.13-14.52 24.78.11 8.26 3.26 15.22 9.46 20.87 6.2 5.65 13.59 9.02 22.18 10.11-2.17 6.52-4.67 12.82-7.5 18.91zM119.22 33.72c0-7.39 2.66-14.24 7.98-20.54 5.33-6.3 11.85-10.33 19.57-12.08 1.09 7.39-.76 14.46-5.54 21.2-4.78 6.74-11.41 10.87-19.89 12.39-.43-.32-1.19-.64-2.12-.97z" />
                  </svg>
                  <span className="text-[10px] sm:text-xs font-black tracking-wider text-white mt-0.5 uppercase">tv+</span>
                </div>
              )}

              {platform.id === 'hbo' && (
                <div className="flex flex-col items-center justify-center">
                  <svg className="w-14 sm:w-16 h-6 sm:h-7" viewBox="0 0 120 40">
                    <defs>
                      <linearGradient id="maxGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#c084fc" />
                        <stop offset="50%" stopColor="#ffffff" />
                        <stop offset="100%" stopColor="#a855f7" />
                      </linearGradient>
                    </defs>
                    <text x="50%" y="28" textAnchor="middle" fill="url(#maxGrad)" fontSize="30" fontWeight="900" fontFamily="sans-serif" letterSpacing="-1.5">
                      MAX
                    </text>
                  </svg>
                  <span className="text-[8px] sm:text-[9px] font-bold text-purple-300 tracking-widest uppercase -mt-0.5">HBO</span>
                </div>
              )}

              {platform.id === 'disney' && (
                <div className="flex flex-col items-center justify-center">
                  <svg className="w-14 sm:w-16 h-8 sm:h-9" viewBox="0 0 140 60">
                    {/* Magical Disney Arc */}
                    <path d="M 15 50 C 35 15, 105 15, 125 50" fill="none" stroke="#60a5fa" strokeWidth="2.5" strokeDasharray="140" strokeLinecap="round" opacity="0.85" />
                    <text x="56" y="42" textAnchor="middle" fill="#ffffff" fontSize="28" fontWeight="bold" fontFamily="Georgia, serif" fontStyle="italic" letterSpacing="-0.5">
                      Disney
                    </text>
                    <text x="110" y="40" textAnchor="middle" fill="#38bdf8" fontSize="26" fontWeight="900" fontFamily="sans-serif">
                      +
                    </text>
                  </svg>
                </div>
              )}

              {platform.id === 'netflix' && (
                <div className="flex flex-col items-center justify-center">
                  {/* Official Netflix N Ribbon Vector */}
                  <svg className="w-7 h-9 sm:w-9 sm:h-11 drop-shadow-[0_0_12px_rgba(229,9,20,0.7)]" viewBox="0 0 40 60">
                    {/* Left vertical bar */}
                    <path d="M 4 2 L 14 2 L 14 58 L 4 58 Z" fill="#b81d24" />
                    {/* Right vertical bar */}
                    <path d="M 26 2 L 36 2 L 36 58 L 26 58 Z" fill="#b81d24" />
                    {/* Diagonal ribbon on top with shadow */}
                    <path d="M 4 2 L 14 2 L 36 58 L 26 58 Z" fill="#e50914" />
                  </svg>
                </div>
              )}

              {platform.id === 'prime' && (
                <div className="flex flex-col items-center justify-center">
                  <span className="font-display font-black text-sm sm:text-base text-white tracking-tight leading-none">
                    prime
                  </span>
                  <svg className="w-9 sm:w-11 h-3 text-cyan-400 fill-current mt-0.5" viewBox="0 0 100 24">
                    <path d="M 5 8 Q 50 25 92 6 Q 65 15 5 8 Z" fill="#00A8E1" />
                    <polygon points="86,3 96,6 91,14" fill="#00A8E1" />
                  </svg>
                  <span className="text-[7px] sm:text-[8px] font-extrabold text-sky-200 tracking-widest uppercase mt-0.5">video</span>
                </div>
              )}

              {platform.id === 'viu' && (
                <div className="flex flex-col items-center justify-center">
                  <div className="bg-amber-400 text-black px-2.5 py-1 rounded-xl shadow-md flex items-center justify-center gap-1 font-black">
                    <span className="font-sans text-xs sm:text-sm tracking-tight leading-none">viu</span>
                  </div>
                  <span className="text-[7px] sm:text-[8px] font-bold text-amber-300 tracking-widest uppercase mt-1">ASIAN</span>
                </div>
              )}

              {platform.id === 'netflix-kids' && (
                <div className="flex flex-col items-center justify-center">
                  <div className="flex items-center gap-0.5 font-black font-display text-sm sm:text-base tracking-tighter">
                    <span className="text-yellow-400 drop-shadow">K</span>
                    <span className="text-pink-500 drop-shadow">I</span>
                    <span className="text-cyan-400 drop-shadow">D</span>
                    <span className="text-emerald-400 drop-shadow">S</span>
                  </div>
                  <span className="text-[7px] sm:text-[8px] font-extrabold text-emerald-300 tracking-widest uppercase mt-0.5">FAMILY</span>
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};