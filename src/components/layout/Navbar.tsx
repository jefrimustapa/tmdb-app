import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Search, Film, Tv, Compass, Bookmark, Settings, Tv2, Smartphone, Tablet, Monitor } from 'lucide-react';
import { Logo } from '../common/Logo';
import { useDevice } from '../../hooks/useDevice';

export const Navbar: React.FC = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const location = useLocation();
  const navigate = useNavigate();
  const { isTV, isMobile, isTablet, deviceMode, activeLayout, detectedPlatform } = useDevice();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const navLinks = [
    { label: 'Home', path: '/' },
    { label: 'Movies', path: '/movies' },
    { label: 'Series', path: '/tv' },
    { label: 'My Space', path: '/library' },
  ];

  const getModeIcon = () => {
    if (activeLayout === 'tv') return <Tv2 className="w-3.5 h-3.5 text-hbo-cyan" />;
    if (activeLayout === 'tablet') return <Tablet className="w-3.5 h-3.5 text-hbo-cyan" />;
    if (activeLayout === 'mobile') return <Smartphone className="w-3.5 h-3.5 text-hbo-cyan" />;
    return <Monitor className="w-3.5 h-3.5 text-gray-300" />;
  };

  const getModeLabel = () => {
    return activeLayout === 'tv' ? 'TV' : activeLayout === 'tablet' ? 'Tablet' : activeLayout === 'mobile' ? 'Mobile' : 'Desktop';
  };

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${
        isScrolled
          ? 'bg-hbo-dark/95 backdrop-blur-xl border-b border-hbo-border/60 pt-[max(0.75rem,env(safe-area-inset-top,20px))] pb-3 shadow-2xl'
          : 'bg-gradient-to-b from-black/95 via-black/50 to-transparent pt-[max(1rem,env(safe-area-inset-top,24px))] pb-4 sm:pb-5'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-8 flex items-center justify-between gap-4">
        {/* Left: Logo & Navigation Links */}
        <div className="flex items-center gap-6 sm:gap-8">
          <Logo size={isMobile ? 'sm' : 'md'} />

          {/* Desktop/TV Navigation Links */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => {
              const isActive = location.pathname === link.path;
              return (
                <Link
                  key={link.path}
                  to={link.path}
                  className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-all duration-200 tv-focus-target ${
                    isActive
                      ? 'text-white bg-white/10 font-bold border border-hbo-purple-light/40 shadow-sm'
                      : 'text-gray-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right: Search & Actions */}
        <div className="flex items-center gap-3">
          {/* Search Bar */}
          <form onSubmit={handleSearchSubmit} className="relative hidden sm:block w-48 lg:w-64">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search movies, shows..."
              className="w-full pl-9 pr-3.5 py-1.5 bg-hbo-card/80 border border-hbo-border/70 rounded-full text-xs sm:text-sm text-white placeholder-gray-400 focus:outline-none focus:border-hbo-purple focus:ring-1 focus:ring-hbo-purple transition-all tv-focus-target"
            />
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </form>

          {/* Mobile Search Icon */}
          <Link
            to="/search"
            className="sm:hidden p-2 rounded-full bg-white/10 text-gray-200 hover:text-white tv-focus-target"
            aria-label="Search"
          >
            <Search className="w-5 h-5" />
          </Link>

          {/* Device Mode Indicator (View Only, Non-clickable, Non-focusable) */}
          <div
            className="p-2 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-gray-300 pointer-events-none select-none"
            title={`Platform: ${getModeLabel()}`}
            aria-label={`Platform: ${getModeLabel()}`}
          >
            {getModeIcon()}
          </div>

          {/* Settings Link */}
          <Link
            to="/settings"
            className="p-2 rounded-full bg-white/5 hover:bg-white/15 border border-white/10 text-gray-300 hover:text-white transition tv-focus-target"
            title="Settings"
          >
            <Settings className="w-4 h-4 sm:w-5 sm:h-5" />
          </Link>
        </div>
      </div>
    </header>
  );
};
