import React, { useState } from 'react';
import {
  Box,
  Typography,
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
  Tooltip,
  Paper,
  Divider,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import DashboardIcon from '@mui/icons-material/Dashboard';
import StorageIcon from '@mui/icons-material/Storage';
import SettingsIcon from '@mui/icons-material/Settings';
import ArticleIcon from '@mui/icons-material/Article';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import LiveTvIcon from '@mui/icons-material/LiveTv';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import { getBasePath } from '../api/client';

const SIDEBAR_WIDTH = 260;

const navItems = [
  { label: 'Dashboard', path: '/', subtitle: 'Analytics & Overview', icon: <DashboardIcon sx={{ fontSize: 20 }} /> },
  { label: 'Streams', path: '/streams', subtitle: 'Live Channels & Cache', icon: <StorageIcon sx={{ fontSize: 20 }} /> },
  { label: 'Settings', path: '/settings', subtitle: 'Gateway Configuration', icon: <SettingsIcon sx={{ fontSize: 20 }} /> },
  { label: 'Logs', path: '/logs', subtitle: 'Real-Time Console', icon: <ArticleIcon sx={{ fontSize: 20 }} /> },
  { label: 'Auth', path: '/auth', subtitle: 'Bot & Session Login', icon: <VpnKeyIcon sx={{ fontSize: 20 }} /> },
];

function ScrollTop({ children }) {
  const trigger = useScrollTrigger({
    disableHysteresis: true,
    threshold: 200,
  });

  const handleClick = (event) => {
    const anchor = (event.target.ownerDocument || document).querySelector('#content-root');
    if (anchor) {
      anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
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

export default function Layout({
  currentPath,
  onNavigate,
  targetBot,
  isConnected,
  themeMode,
  onToggleTheme,
  children,
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleNavClick = (path) => {
    setMobileOpen(false);
    onNavigate(path);
  };

  const isCurrentActive = (path) => {
    const p = currentPath.toLowerCase().replace(/\/+$/, '') || '/';
    if (path === '/') {
      return (
        p === '/' ||
        p === '/dashboard' ||
        p === '/tg' ||
        p === '/tg/dashboard' ||
        p === '/msm' ||
        p === '/msm/dashboard'
      );
    }
    return p === path || p.endsWith(path);
  };

  const activeItem = navItems.find((item) => isCurrentActive(item.path)) || navItems[0];

  const sidebarContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: 'background.paper' }}>
      {/* Brand Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          px: 3,
          py: 2.75,
          cursor: 'pointer',
        }}
        onClick={() => handleNavClick('/')}
      >
        <Box
          sx={{
            width: 38,
            height: 38,
            borderRadius: '10px',
            bgcolor: 'primary.main',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 3px 8px 0 rgba(105, 108, 255, 0.4)',
          }}
        >
          <LiveTvIcon sx={{ fontSize: 22 }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="h6"
            sx={{
              fontWeight: 700,
              fontSize: '1.15rem',
              letterSpacing: '0.04em',
              lineHeight: 1.2,
              color: 'text.primary',
            }}
          >
            TGSTRM
          </Typography>
          <Typography
            variant="caption"
            sx={{
              fontSize: '0.72rem',
              color: 'text.secondary',
              display: 'block',
              fontWeight: 500,
            }}
          >
            Streaming Gateway
          </Typography>
        </Box>
        <Chip
          label="v1.4"
          size="small"
          sx={{
            height: 20,
            fontSize: '0.68rem',
            fontWeight: 700,
            bgcolor: 'rgba(105, 108, 255, 0.16)',
            color: 'primary.main',
            borderRadius: '4px',
          }}
        />
      </Box>

      <Divider sx={{ mx: 2, mb: 2, opacity: 0.6 }} />

      {/* Navigation Menu */}
      <Box sx={{ flex: 1, px: 2 }}>
        <Typography
          variant="caption"
          sx={{
            px: 1.5,
            mb: 1,
            display: 'block',
            fontWeight: 700,
            fontSize: '0.7rem',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'text.secondary',
            opacity: 0.8,
          }}
        >
          Menu
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
                    borderRadius: '8px',
                    py: 1.1,
                    px: 1.75,
                    bgcolor: active ? 'primary.main !important' : 'transparent',
                    color: active ? '#FFFFFF' : 'text.secondary',
                    boxShadow: active ? '0 2px 8px 0 rgba(105, 108, 255, 0.4)' : 'none',
                    transition: 'all 0.18s ease-in-out',
                    '&.Mui-selected, &.Mui-selected:hover': {
                      bgcolor: 'primary.main',
                      color: '#FFFFFF',
                      '& .MuiListItemIcon-root, & .MuiListItemText-primary': {
                        color: '#FFFFFF',
                      },
                    },
                    '&.Mui-selected:hover': {
                      bgcolor: 'primary.dark',
                    },
                    '&:hover': {
                      bgcolor: active ? 'primary.dark !important' : 'rgba(105, 108, 255, 0.08)',
                      color: active ? '#FFFFFF' : 'primary.main',
                      '& .MuiListItemIcon-root': {
                        color: active ? '#FFFFFF' : 'primary.main',
                      },
                    },
                  }}
                >
                  <ListItemIcon
                    sx={{
                      minWidth: 36,
                      color: active ? '#FFFFFF' : 'inherit',
                      transition: 'color 0.18s ease-in-out',
                    }}
                  >
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText
                    primary={item.label}
                    primaryTypographyProps={{
                      fontSize: '0.875rem',
                      fontWeight: active ? 600 : 500,
                      color: active ? '#FFFFFF' : 'inherit',
                    }}
                  />
                </ListItemButton>
              </ListItem>
            );
          })}
        </List>
      </Box>

      {/* Sidebar Footer Info Card */}
      <Box sx={{ p: 2, m: 2, borderRadius: '8px', bgcolor: 'rgba(105, 108, 255, 0.08)', border: '1px solid rgba(105, 108, 255, 0.16)' }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.78rem', color: 'primary.main', mb: 0.5 }}>
          Sneat Analytics Theme
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.72rem', display: 'block', lineHeight: 1.4 }}>
          TGStrm Custom Material UI v6 Dashboard
        </Typography>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Desktop Permanent Sidebar */}
      <Box
        component="nav"
        sx={{
          width: { md: SIDEBAR_WIDTH },
          flexShrink: { md: 0 },
          display: { xs: 'none', md: 'block' },
        }}
      >
        <Box
          sx={{
            width: SIDEBAR_WIDTH,
            height: '100vh',
            position: 'fixed',
            top: 0,
            left: 0,
            borderRight: '1px solid',
            borderColor: 'divider',
            zIndex: 1100,
          }}
        >
          {sidebarContent}
        </Box>
      </Box>

      {/* Mobile Drawer */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={handleDrawerToggle}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': {
            boxSizing: 'border-box',
            width: SIDEBAR_WIDTH,
            borderRight: '1px solid',
            borderColor: 'divider',
            backgroundImage: 'none',
          },
        }}
      >
        {sidebarContent}
      </Drawer>

      {/* Main Content Area */}
      <Box
        component="main"
        id="content-root"
        sx={{
          flexGrow: 1,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          width: { xs: '100%', md: `calc(100% - ${SIDEBAR_WIDTH}px)` },
        }}
      >
        {/* Straight Top Header Bar */}
        <Box
          component="header"
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: { xs: 2, sm: 3, md: 4 },
            py: { xs: 1.25, sm: 1.75 },
            minHeight: 64,
            width: '100%',
            bgcolor: 'background.paper',
            borderBottom: '1px solid',
            borderColor: 'divider',
            position: 'sticky',
            top: 0,
            zIndex: 1000,
          }}
        >
          {/* Left: Mobile Toggle & Page Title */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
            <IconButton
              color="inherit"
              aria-label="open drawer"
              edge="start"
              onClick={handleDrawerToggle}
              sx={{ display: { md: 'none' }, color: 'text.secondary', p: 0.75 }}
            >
              <MenuIcon />
            </IconButton>
            <Box sx={{ minWidth: 0 }}>
              <Typography
                variant="h6"
                noWrap
                sx={{
                  fontWeight: 700,
                  fontSize: { xs: '0.95rem', sm: '1.15rem' },
                  color: 'text.primary',
                  lineHeight: 1.2,
                }}
              >
                {activeItem.label}
              </Typography>
              <Typography
                variant="caption"
                noWrap
                sx={{
                  color: 'text.secondary',
                  display: { xs: 'none', sm: 'block' },
                  fontWeight: 500,
                  fontSize: '0.75rem',
                }}
              >
                {activeItem.subtitle}
              </Typography>
            </Box>
          </Box>

          {/* Right: Bot info, Live status, Theme Toggle */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 1.5 }, flexShrink: 0 }}>
            {targetBot && (
              <Chip
                icon={<SmartToyIcon sx={{ fontSize: '15px !important' }} />}
                label={`@${targetBot}`}
                size="small"
                sx={{
                  fontFamily: '"JetBrains Mono", monospace',
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  bgcolor: 'rgba(105, 108, 255, 0.16)',
                  color: 'primary.main',
                  borderRadius: '6px',
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
                  borderRadius: '6px',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  fontFamily: '"JetBrains Mono", monospace',
                  bgcolor: isConnected ? 'rgba(113, 221, 55, 0.16)' : 'rgba(255, 62, 29, 0.16)',
                  color: isConnected ? '#71DD37' : '#FF3E1D',
                }}
              >
                <Box
                  sx={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    bgcolor: isConnected ? '#71DD37' : '#FF3E1D',
                    boxShadow: isConnected ? '0 0 8px #71DD37' : 'none',
                  }}
                />
                {isConnected ? 'LIVE' : 'OFFLINE'}
              </Box>
            )}

            {/* Dark / Light Mode Switcher */}
            <Tooltip title={`Switch to ${themeMode === 'dark' ? 'Light' : 'Dark'} Mode`}>
              <IconButton
                onClick={onToggleTheme}
                sx={{
                  color: 'text.secondary',
                  bgcolor: 'rgba(105, 108, 255, 0.08)',
                  borderRadius: '8px',
                  p: 1,
                  '&:hover': {
                    bgcolor: 'rgba(105, 108, 255, 0.16)',
                    color: 'primary.main',
                  },
                }}
              >
                {themeMode === 'dark' ? (
                  <LightModeOutlinedIcon sx={{ fontSize: 20 }} />
                ) : (
                  <DarkModeOutlinedIcon sx={{ fontSize: 20 }} />
                )}
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {/* Dynamic Page Views */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: { xs: 2, sm: 3, md: 4 } }}>
          <Container maxWidth="xl" disableGutters sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {children}
          </Container>
        </Box>

        {/* Scroll to Top Button */}
        <ScrollTop>
          <Fab
            size="small"
            aria-label="scroll back to top"
            sx={{
              bgcolor: 'primary.main',
              color: '#FFFFFF',
              boxShadow: '0 3px 10px 0 rgba(105, 108, 255, 0.5)',
              '&:hover': {
                bgcolor: 'primary.dark',
              },
            }}
          >
            <KeyboardArrowUpIcon />
          </Fab>
        </ScrollTop>
      </Box>
    </Box>
  );
}
