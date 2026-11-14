import React, { useState } from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  Box,
  Button,
  Chip,
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Container,
  Fab,
  Zoom,
  useScrollTrigger,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import DashboardIcon from '@mui/icons-material/Dashboard';
import StorageIcon from '@mui/icons-material/Storage';
import SettingsIcon from '@mui/icons-material/Settings';
import ArticleIcon from '@mui/icons-material/Article';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import { getBasePath } from '../api/client';

const navItems = [
  { label: 'Dashboard', path: '/', icon: <DashboardIcon sx={{ fontSize: 18 }} /> },
  { label: 'Streams', path: '/streams', icon: <StorageIcon sx={{ fontSize: 18 }} /> },
  { label: 'Settings', path: '/settings', icon: <SettingsIcon sx={{ fontSize: 18 }} /> },
  { label: 'Logs', path: '/logs', icon: <ArticleIcon sx={{ fontSize: 18 }} /> },
  { label: 'Auth', path: '/auth', icon: <VpnKeyIcon sx={{ fontSize: 18 }} /> },
];

function ScrollTop({ children }) {
  const trigger = useScrollTrigger({
    disableHysteresis: true,
    threshold: 200,
  });

  const handleClick = (event) => {
    const anchor = (event.target.ownerDocument || document).querySelector('#root');
    if (anchor) {
      anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <Zoom in={trigger}>
      <Box
        onClick={handleClick}
        role="presentation"
        sx={{ position: 'fixed', bottom: 24, right: 24, zIndex: 1200 }}
      >
        {children}
      </Box>
    </Zoom>
  );
}

export default function Layout({ currentPath, onNavigate, targetBot, isConnected, children }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const basePath = getBasePath();

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleNavClick = (path) => {
    setMobileOpen(false);
    onNavigate(path);
  };

  const isCurrentActive = (path) => {
    const p = currentPath.toLowerCase();
    if (path === '/') {
      return (
        p === '/' ||
        p === '/dashboard' ||
        p === '/tg' ||
        p === '/tg/' ||
        p === '/tg/dashboard' ||
        p === '/msm' ||
        p === '/msm/' ||
        p === '/msm/dashboard'
      );
    }
    return p === path || p.endsWith(path);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          bgcolor: 'rgba(15, 23, 42, 0.8)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(148, 163, 184, 0.12)',
        }}
      >
        <Container maxWidth="xl">
          <Toolbar disableGutters sx={{ justifyContent: 'space-between', py: 1, minHeight: 64 }}>
            {/* Left: Brand & Target Bot Badge */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <IconButton
                color="inherit"
                aria-label="open drawer"
                edge="start"
                onClick={handleDrawerToggle}
                sx={{ mr: 1, display: { md: 'none' } }}
              >
                <MenuIcon />
              </IconButton>
              <Typography
                variant="h6"
                noWrap
                component="div"
                sx={{
                  fontWeight: 800,
                  letterSpacing: '-0.025em',
                  background: 'linear-gradient(135deg, #38BDF8 0%, #818CF8 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
                onClick={() => handleNavClick('/')}
              >
                🎬 TGStrm
              </Typography>
              {targetBot && (
                <Chip
                  label={`@${targetBot}`}
                  size="small"
                  sx={{
                    fontFamily: '"JetBrains Mono", monospace',
                    fontWeight: 600,
                    fontSize: '0.75rem',
                    bgcolor: 'rgba(56, 189, 248, 0.08)',
                    color: '#38BDF8',
                    border: '1px solid rgba(56, 189, 248, 0.25)',
                    display: { xs: 'none', sm: 'inline-flex' },
                  }}
                />
              )}
              {isConnected !== undefined && (
                <Box
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.75,
                    px: 1.25,
                    py: 0.4,
                    borderRadius: '16px',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    fontFamily: '"JetBrains Mono", monospace',
                    bgcolor: isConnected ? 'rgba(52, 211, 153, 0.1)' : 'rgba(244, 63, 94, 0.1)',
                    color: isConnected ? '#34D399' : '#F43F5E',
                    border: `1px solid ${isConnected ? 'rgba(52, 211, 153, 0.25)' : 'rgba(244, 63, 94, 0.25)'}`,
                  }}
                >
                  <Box
                    sx={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      bgcolor: isConnected ? '#34D399' : '#F43F5E',
                      boxShadow: isConnected ? '0 0 8px #34D399' : 'none',
                    }}
                  />
                  {isConnected ? 'LIVE' : 'OFFLINE'}
                </Box>
              )}
            </Box>

            {/* Desktop Navigation Links (Pill Style) */}
            <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 1 }}>
              {navItems.map((item) => {
                const active = isCurrentActive(item.path);
                return (
                  <Button
                    key={item.label}
                    onClick={() => handleNavClick(item.path)}
                    startIcon={item.icon}
                    sx={{
                      px: 2,
                      py: 0.75,
                      borderRadius: '20px',
                      fontSize: '0.825rem',
                      fontWeight: active ? 700 : 500,
                      color: active ? '#38BDF8' : '#94A3B8',
                      bgcolor: active ? 'rgba(56, 189, 248, 0.1)' : 'transparent',
                      border: active ? '1px solid rgba(56, 189, 248, 0.25)' : '1px solid transparent',
                      transition: 'all 0.15s ease-in-out',
                      '&:hover': {
                        color: active ? '#38BDF8' : '#F8FAFC',
                        bgcolor: active ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                        borderColor: active ? 'rgba(56, 189, 248, 0.35)' : 'rgba(148, 163, 184, 0.15)',
                      },
                    }}
                  >
                    {item.label}
                  </Button>
                );
              })}
            </Box>
          </Toolbar>
        </Container>
      </AppBar>

      {/* Mobile Navigation Drawer */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={handleDrawerToggle}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': {
            boxSizing: 'border-box',
            width: 270,
            bgcolor: '#0F172A',
            borderRight: '1px solid rgba(148, 163, 184, 0.12)',
            backgroundImage: 'none',
          },
        }}
      >
        <Box sx={{ p: 2.5 }}>
          <Typography
            variant="h6"
            sx={{
              fontWeight: 800,
              background: 'linear-gradient(135deg, #38BDF8 0%, #818CF8 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              mb: 2.5,
            }}
          >
            TGStrm Gateway
          </Typography>
          <List sx={{ p: 0 }}>
            {navItems.map((item) => {
              const active = isCurrentActive(item.path);
              return (
                <ListItem key={item.label} disablePadding sx={{ mb: 0.75 }}>
                  <ListItemButton
                    selected={active}
                    onClick={() => handleNavClick(item.path)}
                    sx={{
                      borderRadius: '10px',
                      py: 1,
                      px: 1.5,
                      border: active ? '1px solid rgba(56, 189, 248, 0.25)' : '1px solid transparent',
                      bgcolor: active ? 'rgba(56, 189, 248, 0.1)' : 'transparent',
                      '&.Mui-selected': {
                        bgcolor: 'rgba(56, 189, 248, 0.1)',
                        color: '#38BDF8',
                      },
                      '&:hover': {
                        bgcolor: 'rgba(255, 255, 255, 0.05)',
                      },
                    }}
                  >
                    <ListItemIcon sx={{ color: active ? '#38BDF8' : '#94A3B8', minWidth: 36 }}>
                      {item.icon}
                    </ListItemIcon>
                    <ListItemText
                      primary={item.label}
                      primaryTypographyProps={{
                        fontSize: '0.875rem',
                        fontWeight: active ? 700 : 500,
                        color: active ? '#38BDF8' : '#F8FAFC',
                      }}
                    />
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
        </Box>
      </Drawer>

      {/* Main Content Area */}
      <Container maxWidth="xl" component="main" sx={{ py: 3.5, flex: 1, display: 'flex', flexDirection: 'column' }}>
        {children}
      </Container>

      {/* Scroll to Top Button */}
      <ScrollTop>
        <Fab
          size="small"
          aria-label="scroll back to top"
          sx={{
            background: 'linear-gradient(135deg, #38BDF8 0%, #818CF8 100%)',
            color: '#090D16',
            boxShadow: '0 4px 14px rgba(56, 189, 248, 0.3)',
            '&:hover': {
              background: 'linear-gradient(135deg, #7DD3FC 0%, #A5B4FC 100%)',
            },
          }}
        >
          <KeyboardArrowUpIcon />
        </Fab>
      </ScrollTop>
    </Box>
  );
}
