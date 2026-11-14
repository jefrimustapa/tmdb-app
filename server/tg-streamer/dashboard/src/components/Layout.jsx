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
import { getBasePath } from '../api/client';

const navItems = [
  { label: 'Dashboard', path: '/', icon: <DashboardIcon /> },
  { label: 'Streams', path: '/streams', icon: <StorageIcon /> },
  { label: 'Settings', path: '/settings', icon: <SettingsIcon /> },
  { label: 'Logs', path: '/logs', icon: <ArticleIcon /> },
  { label: 'Auth', path: '/auth', icon: <VpnKeyIcon /> },
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
    if (path === '/') {
      return currentPath === '/' || currentPath === '/dashboard';
    }
    return currentPath === path || currentPath.endsWith(path);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          bgcolor: 'background.paper',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Container maxWidth="xl">
          <Toolbar disableGutters sx={{ justifyContent: 'space-between', py: 1 }}>
            {/* Left: Brand & Target Bot Badge */}
            <Box sx={{ display: 'flex', items: 'center', alignItems: 'center', gap: 1.5 }}>
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
                  letterSpacing: '-0.5px',
                  background: 'linear-gradient(45deg, #38bdf8, #818cf8)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  cursor: 'pointer',
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
                    fontFamily: 'monospace',
                    fontSize: '0.75rem',
                    bgcolor: 'rgba(56, 189, 248, 0.1)',
                    color: 'primary.main',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    display: { xs: 'none', sm: 'inline-flex' },
                  }}
                />
              )}
              {isConnected !== undefined && (
                <Chip
                  label={isConnected ? 'Connected' : 'Offline'}
                  size="small"
                  color={isConnected ? 'success' : 'error'}
                  variant="outlined"
                  sx={{ fontSize: '0.7rem', height: 22 }}
                />
              )}
            </Box>

            {/* Desktop Navigation Links */}
            <Box sx={{ display: { xs: 'none', md: 'flex' }, gap: 1 }}>
              {navItems.map((item) => {
                const active = isCurrentActive(item.path);
                return (
                  <Button
                    key={item.label}
                    onClick={() => handleNavClick(item.path)}
                    startIcon={item.icon}
                    variant={active ? 'contained' : 'text'}
                    color={active ? 'primary' : 'inherit'}
                    sx={{
                      px: 2,
                      py: 0.8,
                      fontSize: '0.85rem',
                      color: active ? 'primary.contrastText' : 'text.secondary',
                      '&:hover': {
                        color: active ? 'primary.contrastText' : 'text.primary',
                        bgcolor: active ? 'primary.light' : 'rgba(255, 255, 255, 0.05)',
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
          '& .MuiDrawer-paper': { boxSizing: 'border-box', width: 260, bgcolor: 'background.paper' },
        }}
      >
        <Box sx={{ p: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 800, color: 'primary.main', mb: 2 }}>
            TGStrm Gateway
          </Typography>
          <List>
            {navItems.map((item) => {
              const active = isCurrentActive(item.path);
              return (
                <ListItem key={item.label} disablePadding sx={{ mb: 0.5 }}>
                  <ListItemButton
                    selected={active}
                    onClick={() => handleNavClick(item.path)}
                    sx={{
                      borderRadius: 1,
                      '&.Mui-selected': { bgcolor: 'rgba(56, 189, 248, 0.15)', color: 'primary.main' },
                    }}
                  >
                    <ListItemIcon sx={{ color: active ? 'primary.main' : 'text.secondary', minWidth: 40 }}>
                      {item.icon}
                    </ListItemIcon>
                    <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: '0.9rem', fontWeight: active ? 700 : 500 }} />
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
        </Box>
      </Drawer>

      {/* Main Content Area */}
      <Container maxWidth="xl" component="main" sx={{ py: 3, flex: 1, display: 'flex', flexDirection: 'column' }}>
        {children}
      </Container>

      {/* Scroll to Top Button */}
      <ScrollTop>
        <Fab color="primary" size="small" aria-label="scroll back to top">
          <KeyboardArrowUpIcon />
        </Fab>
      </ScrollTop>
    </Box>
  );
}
