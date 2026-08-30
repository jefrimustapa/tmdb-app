import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Home, Film, Tv, Search, Bookmark, Settings, Tv2, Smartphone, Tablet, Monitor } from 'lucide-react';
import { Logo } from '../common/Logo';
import { useDevice } from '../../hooks/useDevice';

export const Sidebar: React.FC = () => {
  const { deviceMode, activeLayout } = useDevice();
  const navigate = useNavigate();

  const links = [
    { label: 'Home', path: '/', icon: Home },
    { label: 'Movies', path: '/movies', icon: Film },
    { label: 'TV Shows', path: '/tv', icon: Tv },
    { label: 'Search', path: '/search', icon: Search },
    { label: 'My Library', path: '/library', icon: Bookmark },
    { label: 'Settings', path: '/settings', icon: Settings },
  ];

  const getModeIcon = () => {
    if (activeLayout === 'tv') return <Tv2 className="w-4 h-4 text-hbo-cyan" />;
    if (activeLayout === 'tablet') return <Tablet className="w-4 h-4 text-hbo-cyan" />;
    if (activeLayout === 'mobile') return <Smartphone className="w-4 h-4 text-hbo-cyan" />;
    return <Monitor className="w-4 h-4 text-gray-300" />;
  };

  const getModeLabel = () => {
    const name = activeLayout === 'tv' ? 'TV' : activeLayout === 'tablet' ? 'Tablet' : activeLayout === 'mobile' ? 'Mobile' : 'Desktop';
    return deviceMode === 'auto' ? `${name} (Auto)` : `${name} (Manual)`;
  };

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-20 lg:w-64 bg-hbo-dark/95 border-r border-hbo-border/60 z-40 flex flex-col justify-between p-3 lg:p-4 backdrop-blur-xl">
      <div>
        <div className="mb-6 lg:mb-8 px-1 lg:px-2">
          <Logo size="md" showText={true} className="hidden lg:flex" />
          <Logo size="md" showText={false} className="lg:hidden flex justify-center" />
        </div>

        <nav className="space-y-1.5 relative">
          {links.map((link) => {
            const Icon = link.icon;
            return (
              <NavLink
                key={link.path}
                to={link.path}
                data-tv-nav="true"
                onClick={(e) => {
                  e.preventDefault();
                  navigate(link.path);
                }}
                className={({ isActive }) =>
                  `group relative flex items-center justify-center lg:justify-start gap-3.5 px-3 py-3 rounded-xl font-semibold text-sm transition-all tv-focus-target ${
                    isActive
                      ? 'text-white'
                      : 'text-gray-400 hover:text-white'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {/* Active Page Indicator Bar (HBO Purple) */}
                    {isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-r-full bg-hbo-purple-light shadow-[0_0_8px_rgba(144,85,255,0.9)] pointer-events-none" />
                    )}
                    <Icon className={`w-5 h-5 flex-shrink-0 transition-all duration-150 tv-nav-icon ${
                      isActive ? 'text-white' : 'text-gray-400 group-hover:text-white'
                    }`} />
                    <span className={`hidden lg:inline transition-colors duration-150 tv-nav-label ${
                      isActive ? 'text-white font-bold' : 'text-gray-400 group-hover:text-white'
                    }`}>
                      {link.label}
                    </span>
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>
      </div>

      <div className="pt-3 border-t border-hbo-border/40 space-y-2">
        {/* Device Mode Indicator (View Only, Non-clickable, Non-focusable) */}
        <div
          className="w-full flex items-center justify-center lg:justify-start gap-2.5 p-2 rounded-xl bg-white/5 border border-white/10 text-xs font-semibold text-gray-300 pointer-events-none select-none"
          title={`Platform: ${getModeLabel()}`}
        >
          {getModeIcon()}
          <span className="hidden lg:inline text-xs font-medium text-gray-400">
            {getModeLabel()}
          </span>
        </div>

        <div className="hidden lg:block text-[10px] text-gray-500 text-center">
          Powered by TMDB
        </div>
      </div>
    </aside>
  );
};
