import React from 'react';
import { Logo } from '../common/Logo';

export const Footer: React.FC = () => {
  return (
    <footer className="mt-16 border-t border-hbo-border/60 bg-hbo-card/60 py-10 px-4 sm:px-8 pb-24 md:pb-10">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex flex-col items-center md:items-start gap-2">
          <Logo size="sm" />
          <p className="text-xs text-gray-400 text-center md:text-left max-w-md">
            TMDB Streamer is a client-side media aggregator. All streaming sources are powered by external third-party video resolvers.
          </p>
        </div>

        <div className="flex items-center gap-4 text-xs text-gray-400">
          <a
            href="https://www.themoviedb.org/"
            target="_blank"
            rel="noreferrer"
            className="hover:text-hbo-cyan transition underline"
          >
            TMDB API Documentation
          </a>
          <span>•</span>
          <span>Ad-Shield Enabled</span>
          <span>•</span>
          <span>Android TV Ready</span>
        </div>
      </div>
    </footer>
  );
};
