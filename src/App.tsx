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
import { dbService } from './services/db';
import { updateService, type UpdateInfo } from './services/updateService';
import { UpdateModal } from './components/common/UpdateModal';

const AppContent: React.FC = () => {
  const { isTV, isMobile } = useDevice();
  useTVNavigation(isTV);
  const { showExitToast } = useAndroidBackButton();
  const location = useLocation();
  const [startupUpdateInfo, setStartupUpdateInfo] = React.useState<UpdateInfo | null>(null);

  // Synchronize Performance Mode attribute on document root (data-perf-mode="true")
  React.useEffect(() => {
    const syncPerfMode = (perfMode?: boolean) => {
      if (typeof document === 'undefined') return;
      if (perfMode) {
        document.documentElement.setAttribute('data-perf-mode', 'true');
      } else {
        document.documentElement.removeAttribute('data-perf-mode');
      }
    };

    dbService.getSettings().then(s => syncPerfMode(s.performanceMode));

    const handleSettingsChanged = (e: Event) => {
      const customEvent = e as CustomEvent<any>;
      if (customEvent.detail && typeof customEvent.detail.performanceMode === 'boolean') {
        syncPerfMode(customEvent.detail.performanceMode);
      }
    };

    window.addEventListener('tmdb_settings_changed', handleSettingsChanged);
    return () => window.removeEventListener('tmdb_settings_changed', handleSettingsChanged);
  }, []);

  // Graceful auto-check for software updates on app startup (if enabled in settings)
  React.useEffect(() => {
    let isMounted = true;
    const timer = setTimeout(async () => {
      try {
        const settings = await dbService.getSettings();
        if (settings.autoUpdateCheck !== false) {
          const info = await updateService.checkForUpdates(settings.includeNightlyUpdates ?? false);
          if (isMounted && info && info.hasUpdate) {
            setStartupUpdateInfo(info);
          }
        }
      } catch (err) {
        console.warn('[AutoUpdate] Startup check skipped or offline:', err);
      }
    }, 2500);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, []);

  const isWatchPage = location.pathname.startsWith('/watch');

  return (
    <div className="min-h-screen bg-hbo-dark text-white flex flex-col relative overflow-x-clip w-full max-w-[100vw]">
      {/* Top Navbar (Hidden on TV mode where Sidebar is used, and on watch page) */}
      {!isTV && !isWatchPage && <Navbar />}

      {/* TV / Desktop Left Sidebar if in TV mode (Hidden on watch page) */}
      {isTV && !isWatchPage && <Sidebar />}

      {/* Main Content Viewport */}
      <main className={`flex-1 overflow-x-clip w-full max-w-full ${isWatchPage ? 'p-0 pb-0 m-0' : `pb-24 md:pb-0 ${isTV ? 'pl-20 lg:pl-64' : ''}`}`}>
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

      {/* Automatic Startup Software Update Modal */}
      {startupUpdateInfo && (
        <UpdateModal
          updateInfo={startupUpdateInfo}
          onClose={() => setStartupUpdateInfo(null)}
        />
      )}

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
