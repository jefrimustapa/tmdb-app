import React, { useState, useEffect } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Button from '@mui/material/Button';
import { getTheme } from './theme';
import Layout from './components/Layout';
import DashboardPage from './pages/DashboardPage';
import StreamsPage from './pages/StreamsPage';
import SettingsPage from './pages/SettingsPage';
import LogsPage from './pages/LogsPage';
import AuthPage from './pages/AuthPage';
import { api, getBasePath } from './api/client';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[TGSTRM DASHBOARD] Uncaught component error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Box sx={{ p: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '40vh', textAlign: 'center' }}>
          <Alert severity="error" sx={{ maxWidth: 640, width: '100%', mb: 3, textAlign: 'left' }}>
            <AlertTitle sx={{ fontWeight: 700 }}>Dashboard Component Error</AlertTitle>
            {this.state.error?.message || 'An unexpected rendering error occurred in this view.'}
          </Alert>
          <Button variant="contained" color="primary" onClick={() => window.location.reload()}>
            Reload Dashboard
          </Button>
        </Box>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [themeMode, setThemeMode] = useState(() => {
    try {
      return localStorage.getItem('tgstrm_theme_mode') || 'dark';
    } catch {
      return 'dark';
    }
  });
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [authInfo, setAuthInfo] = useState({ isConnected: undefined, bot: '' });

  const handleToggleTheme = () => {
    setThemeMode((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem('tgstrm_theme_mode', next);
      } catch (e) {
        console.warn('Could not save theme preference:', e);
      }
      return next;
    });
  };

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
    const p = currentPath.toLowerCase().replace(/\/+$/, '') || '/';
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
    <ThemeProvider theme={getTheme(themeMode)}>
      <CssBaseline />
      <Layout
        currentPath={currentPath}
        onNavigate={handleNavigate}
        targetBot={authInfo.bot}
        isConnected={authInfo.isConnected}
        themeMode={themeMode}
        onToggleTheme={handleToggleTheme}
      >
        <ErrorBoundary>
          {renderActivePage()}
        </ErrorBoundary>
      </Layout>
    </ThemeProvider>
  );
}
