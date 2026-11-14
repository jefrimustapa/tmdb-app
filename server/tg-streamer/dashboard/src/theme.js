import { createTheme } from '@mui/material/styles';

export const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#38BDF8', // Electric Cyan
      light: '#7DD3FC',
      dark: '#0284C7',
      contrastText: '#090D16',
    },
    secondary: {
      main: '#818CF8', // Vibrant Indigo
      light: '#A5B4FC',
      dark: '#6366F1',
      contrastText: '#090D16',
    },
    background: {
      default: '#090D16', // Deep Midnight Blue-Black Canvas
      paper: '#0F172A',   // Surface Level 1 (Navy Slate)
    },
    text: {
      primary: '#F8FAFC',
      secondary: '#94A3B8',
    },
    divider: 'rgba(148, 163, 184, 0.12)',
    error: {
      main: '#F43F5E', // Rose
      light: '#FB7185',
      dark: '#E11D48',
    },
    warning: {
      main: '#FBBF24', // Amber
      light: '#FCD34D',
      dark: '#D97706',
    },
    info: {
      main: '#38BDF8', // Sky Cyan
      light: '#7DD3FC',
      dark: '#0284C7',
    },
    success: {
      main: '#34D399', // Emerald
      light: '#6EE7B7',
      dark: '#059669',
    },
  },
  typography: {
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    h1: { fontWeight: 800, letterSpacing: '-0.025em' },
    h2: { fontWeight: 800, letterSpacing: '-0.025em' },
    h3: { fontWeight: 800, letterSpacing: '-0.02em' },
    h4: { fontWeight: 700, letterSpacing: '-0.02em' },
    h5: { fontWeight: 700, letterSpacing: '-0.02em' },
    h6: { fontWeight: 700, letterSpacing: '-0.015em' },
    subtitle1: { fontWeight: 600, letterSpacing: '-0.01em' },
    subtitle2: { fontWeight: 600 },
    button: { fontWeight: 600, letterSpacing: '-0.01em' },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: '#090D16',
          color: '#F8FAFC',
          scrollbarColor: '#1E293B #090D16',
          '&::-webkit-scrollbar, & *::-webkit-scrollbar': {
            width: 8,
            height: 8,
            backgroundColor: '#090D16',
          },
          '&::-webkit-scrollbar-thumb, & *::-webkit-scrollbar-thumb': {
            borderRadius: 4,
            backgroundColor: '#1E293B',
          },
          '&::-webkit-scrollbar-thumb:hover, & *::-webkit-scrollbar-thumb:hover': {
            backgroundColor: '#334155',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: '#0F172A',
          borderColor: 'rgba(148, 163, 184, 0.12)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: 8,
          boxShadow: 'none',
          '&:hover': {
            boxShadow: 'none',
          },
        },
        containedPrimary: {
          background: 'linear-gradient(135deg, #38BDF8 0%, #818CF8 100%)',
          color: '#090D16',
          fontWeight: 700,
          '&:hover': {
            background: 'linear-gradient(135deg, #7DD3FC 0%, #A5B4FC 100%)',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: '#0F172A',
          border: '1px solid rgba(148, 163, 184, 0.12)',
          boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.5)',
          borderRadius: 12,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          fontWeight: 600,
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderColor: 'rgba(148, 163, 184, 0.08)',
        },
        head: {
          backgroundColor: '#1E293B',
          color: '#94A3B8',
          fontWeight: 700,
          fontSize: '0.75rem',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundColor: '#1E293B',
          backgroundImage: 'none',
          border: '1px solid rgba(148, 163, 184, 0.2)',
          boxShadow: '0 20px 40px -8px rgba(0, 0, 0, 0.8)',
        },
      },
    },
  },
});
