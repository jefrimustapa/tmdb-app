import React from 'react';
import { Star } from 'lucide-react';

interface RatingBadgeProps {
  score: number;
  size?: 'sm' | 'md';
}

export const RatingBadge: React.FC<RatingBadgeProps> = ({ score, size = 'sm' }) => {
  const formatted = score ? score.toFixed(1) : 'NR';
  const isHigh = score >= 7.5;
  
  return (
    <div className={`inline-flex items-center gap-1 font-semibold rounded-md backdrop-blur-md px-1.5 py-0.5 ${
      size === 'sm' ? 'text-xs' : 'text-sm px-2 py-1'
    } ${
      isHigh
        ? 'bg-purple-950/80 text-hbo-cyan border border-hbo-cyan/30'
        : 'bg-black/70 text-gray-200 border border-white/10'
    }`}>
      <Star className={`${size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} fill-current text-yellow-400`} />
      <span>{formatted}</span>
    </div>
  );
};
