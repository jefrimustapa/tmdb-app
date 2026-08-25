import React from 'react';
import { Link } from 'react-router-dom';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({ size = 'md', showText = true, className = '' }) => {
  const iconSizes = {
    sm: 'w-7 h-7',
    md: 'w-9 h-9',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16'
  };

  const textSizes = {
    sm: 'text-lg',
    md: 'text-xl',
    lg: 'text-2xl',
    xl: 'text-4xl'
  };

  return (
    <div className={`inline-flex items-center gap-2.5 select-none pointer-events-none ${className}`} aria-hidden="true">
      {/* HBO-styled TMDB vector icon */}
      <div className={`relative ${iconSizes[size]}`}>
        <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-[0_0_12px_rgba(144,85,255,0.6)]">
          <defs>
            <linearGradient id="logoHboGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#673ab7" />
              <stop offset="50%" stopColor="#9055ff" />
              <stop offset="100%" stopColor="#00d2ff" />
            </linearGradient>
            <radialGradient id="logoBullseye" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#00d2ff" />
              <stop offset="100%" stopColor="#9055ff" />
            </radialGradient>
          </defs>
          {/* Outer Circle Container */}
          <circle cx="50" cy="50" r="48" fill="#0d0d17" stroke="#23233a" strokeWidth="3" />
          <circle cx="50" cy="50" r="43" fill="none" stroke="url(#logoHboGrad)" strokeWidth="3.5" opacity="0.9" />
          
          {/* 'T' Character */}
          <path d="M 18 34 L 36 34 M 27 34 L 27 66" stroke="#ffffff" strokeWidth="7" strokeLinecap="round" />
          
          {/* 'M' Character */}
          <path d="M 42 34 L 42 66 L 50 48 L 58 66 L 58 34" fill="none" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          
          {/* 'O'/'D' HBO Target Bullseye Emblem */}
          <circle cx="76" cy="50" r="14" fill="none" stroke="url(#logoHboGrad)" strokeWidth="5" />
          <circle cx="76" cy="50" r="5.5" fill="url(#logoBullseye)" />
        </svg>
      </div>

      {showText && (
        <div className="flex flex-col leading-none">
          <div className={`font-display font-black tracking-tighter ${textSizes[size]} text-white flex items-center`}>
            <span>TMDB</span>
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-hbo-purple-light to-hbo-cyan ml-1">
              STREAMER
            </span>
          </div>
          <span className="text-[10px] font-semibold tracking-widest text-gray-400 uppercase">
            ENTERTAINMENT
          </span>
        </div>
      )}
    </div>
  );
};
