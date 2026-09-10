import React from 'react';
import { isExplicitAdultCertification } from '../../services/tmdb';

interface CertBadgeProps {
  certification?: string | null;
  size?: 'xs' | 'sm';
}

export const CertBadge: React.FC<CertBadgeProps> = ({ certification, size = 'xs' }) => {
  if (!certification || certification.trim().length === 0) return null;

  const cleanCert = certification.trim().toUpperCase();
  const isExplicit = isExplicitAdultCertification(cleanCert);

  return (
    <span
      className={`inline-flex items-center justify-center font-black rounded tracking-wider uppercase backdrop-blur-md animate-fade-in ${
        size === 'xs' ? 'text-[9px] px-1.5 py-0.5' : 'text-[10px] px-2 py-0.5'
      } ${
        isExplicit
          ? 'bg-rose-950/85 text-rose-300 border border-rose-500/70 shadow-sm shadow-rose-950'
          : 'bg-black/75 text-gray-200 border border-white/20'
      }`}
    >
      {cleanCert}
    </span>
  );
};
