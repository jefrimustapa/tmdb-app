import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, Film, Tv, Search, Bookmark } from 'lucide-react';

export const MobileBottomNav: React.FC = () => {
  const [isFullscreen, setIsFullscreen] = React.useState(false);

  React.useEffect(() => {
    const handleFs = (e: any) => {
      if (typeof e.detail?.fullscreen === 'boolean') {
        setIsFullscreen(e.detail.fullscreen);
      } else {
        setIsFullscreen(!!document.fullscreenElement);
      }
    };
    window.addEventListener('tmdb_fullscreen_changed', handleFs);
    document.addEventListener('fullscreenchange', handleFs);
    return () => {
      window.removeEventListener('tmdb_fullscreen_changed', handleFs);
      document.removeEventListener('fullscreenchange', handleFs);
    };
  }, []);

  if (isFullscreen) {
    return null;
  }

  const tabs = [
    { label: 'Home', path: '/', icon: Home },
    { label: 'Movies', path: '/movies', icon: Film },
    { label: 'Series', path: '/tv', icon: Tv },
    { label: 'Search', path: '/search', icon: Search },
    { label: 'My Space', path: '/library', icon: Bookmark },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-hbo-dark/95 backdrop-blur-xl border-t border-hbo-border/60 pt-2 px-3 pb-[max(1rem,env(safe-area-inset-bottom,20px))] md:hidden">
      <div className="flex items-center justify-around">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <NavLink
              key={tab.path}
              to={tab.path}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 py-1 px-3 rounded-lg text-xs font-medium transition-colors ${
                  isActive
                    ? 'text-hbo-cyan font-bold scale-105'
                    : 'text-gray-400 hover:text-gray-200'
                }`
              }
            >
              <Icon className="w-5 h-5" />
              <span>{tab.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};

