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
      {/* New Circular TMDB Icon */}
      <div className={`relative ${iconSizes[size]} flex-shrink-0 flex items-center justify-center`}>
        <img
          src="/icon.png"
          alt="TMDB Streamer"
          className="w-full h-full object-contain rounded-full drop-shadow-[0_0_12px_rgba(144,85,255,0.6)]"
          loading="eager"
          decoding="async"
        />
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
