import React, { useState, useEffect } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { darkTheme } from './theme';
import Layout from './components/Layout';
import DashboardPage from './pages/DashboardPage';
import StreamsPage from './pages/StreamsPage';
import SettingsPage from './pages/SettingsPage';
import LogsPage from './pages/LogsPage';
import AuthPage from './pages/AuthPage';
import { api, getBasePath } from './api/client';

export default function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [authInfo, setAuthInfo] = useState({ isConnected: undefined, bot: '' });

  // Handle browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Fetch initial bot and connection status
  useEffect(() => {
    const fetchAuth = async () => {
      try {
        const res = await api.get('/auth/status');
        if (res.ok && res.data) {
          setAuthInfo({
            isConnected: res.data.isConnected,
            bot: res.data.targetBot || res.data.bot || '',
          });
        }
      } catch (err) {
        console.error('Failed to get auth status:', err);
      }
    };
    fetchAuth();
  }, []);

  const handleNavigate = (path) => {
    const base = getBasePath();
    const targetUrl = `${base}${path === '/' ? '' : path}` || '/';
    window.history.pushState({}, '', targetUrl);
    setCurrentPath(targetUrl);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const renderActivePage = () => {
    const p = currentPath.toLowerCase();
    if (p.endsWith('/streams') || p.endsWith('/cache')) {
      return <StreamsPage />;
    }
    if (p.endsWith('/settings') || p.endsWith('/setting')) {
      return <SettingsPage />;
    }
    if (p.endsWith('/logs')) {
      return <LogsPage />;
    }
    if (p.endsWith('/auth')) {
      return (
        <AuthPage
          onStatusUpdate={(data) => {
            setAuthInfo({
              isConnected: data.isConnected,
              bot: data.targetBot || data.bot || authInfo.bot,
            });
          }}
        />
      );
    }
    return <DashboardPage onNavigate={handleNavigate} />;
  };

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Layout
        currentPath={currentPath}
        onNavigate={handleNavigate}
        targetBot={authInfo.bot}
        isConnected={authInfo.isConnected}
      >
        {renderActivePage()}
      </Layout>
    </ThemeProvider>
  );
}
