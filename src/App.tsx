import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Navbar } from './components/layout/Navbar';
import { Sidebar } from './components/layout/Sidebar';
import { MobileBottomNav } from './components/layout/MobileBottomNav';
import { PlatformRoute } from './components/common/PlatformRoute';
import { HomeTV, HomeMobile } from './pages/Home';
import { MoviesTV, MoviesMobile } from './pages/Movies';
import { SeriesTV, SeriesMobile } from './pages/Series';
import { DetailsTV, DetailsMobile } from './pages/Details';
import { WatchTV, WatchMobile } from './pages/Watch';
import { SearchTV, SearchMobile } from './pages/Search';
import { LibraryTV, LibraryMobile } from './pages/Library';
import { SettingsTV, SettingsMobile } from './pages/Settings';
import { useDevice } from './hooks/useDevice';
import { useTVNavigation } from './hooks/useTVNavigation';
import { useAndroidBackButton } from './hooks/useAndroidBackButton';

import { useLocation } from 'react-router-dom';

const AppContent: React.FC = () => {
  const { isTV, isMobile } = useDevice();
  useTVNavigation(isTV);
  const { showExitToast } = useAndroidBackButton();
  const location = useLocation();

  const isWatchPage = location.pathname.startsWith('/watch');

  return (
    <div className="min-h-screen bg-hbo-dark text-white flex flex-col relative">
      {/* Top Navbar (Hidden on TV mode where Sidebar is used, and on watch page) */}
      {!isTV && !isWatchPage && <Navbar />}

      {/* TV / Desktop Left Sidebar if in TV mode (Hidden on watch page) */}
      {isTV && !isWatchPage && <Sidebar />}

      {/* Main Content Viewport */}
      <main className={`flex-1 ${isWatchPage ? 'p-0 pb-0 m-0' : `pb-24 md:pb-0 ${isTV ? 'pl-20 lg:pl-64' : ''}`}`}>
        <Routes>
          <Route path="/" element={<PlatformRoute tv={HomeTV} mobile={HomeMobile} />} />
          <Route path="/movies" element={<PlatformRoute tv={MoviesTV} mobile={MoviesMobile} />} />
          <Route path="/tv" element={<PlatformRoute tv={SeriesTV} mobile={SeriesMobile} />} />
          <Route path="/details/:type/:id" element={<PlatformRoute tv={DetailsTV} mobile={DetailsMobile} />} />
          <Route path="/movie/:id" element={<PlatformRoute tv={DetailsTV} mobile={DetailsMobile} />} />
          <Route path="/tv/:id" element={<PlatformRoute tv={DetailsTV} mobile={DetailsMobile} />} />
          <Route path="/watch/:type/:id" element={<PlatformRoute tv={WatchTV} mobile={WatchMobile} />} />
          <Route path="/search" element={<PlatformRoute tv={SearchTV} mobile={SearchMobile} />} />
          <Route path="/library" element={<PlatformRoute tv={LibraryTV} mobile={LibraryMobile} />} />
          <Route path="/settings" element={<PlatformRoute tv={SettingsTV} mobile={SettingsMobile} />} />
          <Route path="*" element={<PlatformRoute tv={HomeTV} mobile={HomeMobile} />} />
        </Routes>
      </main>

      {/* Bottom Navigation for Mobile (Hidden on watch page) */}
      {!isWatchPage && <MobileBottomNav />}

      {/* Android Back Exit Toast */}
      {showExitToast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-hbo-card/95 backdrop-blur-md border border-hbo-cyan/50 text-white rounded-full text-xs font-bold shadow-2xl shadow-hbo-purple/50 animate-bounce">
          Press back again to exit
        </div>
      )}
    </div>
  );
};

const getRouterBasename = () => {
  const base = import.meta.env.BASE_URL;
  if (!base || base === './' || base === '/./' || base === '.' || base === '/') {
    return undefined;
  }
  return base;
};

export const App: React.FC = () => {
  return (
    <Router basename={getRouterBasename()}>
      <AppContent />
    </Router>
  );
};
