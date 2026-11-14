import { createTheme } from '@mui/material/styles';

export const sneatTokens = {
  primary: {
    main: '#696CFF',
    light: '#8587FF',
    dark: '#5F61E6',
    contrastText: '#FFFFFF',
    soft: 'rgba(105, 108, 255, 0.16)',
  },
  secondary: {
    main: '#8592A3',
    light: '#A1ACB8',
    dark: '#6E7A8A',
    contrastText: '#FFFFFF',
    soft: 'rgba(133, 146, 163, 0.16)',
  },
  success: {
    main: '#71DD37',
    light: '#8DE45D',
    dark: '#56B922',
    contrastText: '#FFFFFF',
    soft: 'rgba(113, 221, 55, 0.16)',
  },
  warning: {
    main: '#FFAB00',
    light: '#FFBE33',
    dark: '#CC8900',
    contrastText: '#FFFFFF',
    soft: 'rgba(255, 171, 0, 0.16)',
  },
  error: {
    main: '#FF3E1D',
    light: '#FF644A',
    dark: '#CC3117',
    contrastText: '#FFFFFF',
    soft: 'rgba(255, 62, 29, 0.16)',
  },
  info: {
    main: '#03C3EC',
    light: '#35CFF0',
    dark: '#029CBD',
    contrastText: '#FFFFFF',
    soft: 'rgba(3, 195, 236, 0.16)',
  },
};

export const getTheme = (mode = 'dark') => {
  const isDark = mode === 'dark';

  return createTheme({
    palette: {
      mode,
      primary: sneatTokens.primary,
      secondary: sneatTokens.secondary,
      success: sneatTokens.success,
      warning: sneatTokens.warning,
      error: sneatTokens.error,
      info: sneatTokens.info,
      background: {
        default: isDark ? '#232333' : '#F5F5F9',
        paper: isDark ? '#2B2C40' : '#FFFFFF',
        elevated: isDark ? '#323249' : '#FFFFFF',
      },
      text: {
        primary: isDark ? 'rgba(231, 231, 255, 0.90)' : '#566A7F',
        secondary: isDark ? 'rgba(231, 231, 255, 0.60)' : '#8592A3',
      },
      divider: isDark ? 'rgba(231, 231, 255, 0.08)' : 'rgba(67, 89, 113, 0.12)',
    },
    typography: {
      fontFamily: '"Public Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      h1: { fontWeight: 700, letterSpacing: '-0.025em' },
      h2: { fontWeight: 700, letterSpacing: '-0.025em' },
      h3: { fontWeight: 700, letterSpacing: '-0.02em' },
      h4: { fontWeight: 700, letterSpacing: '-0.02em' },
      h5: { fontWeight: 600, letterSpacing: '-0.015em' },
      h6: { fontWeight: 600, letterSpacing: '-0.015em' },
      subtitle1: { fontWeight: 500, letterSpacing: '-0.01em' },
      subtitle2: { fontWeight: 500 },
      body1: { fontWeight: 400 },
      body2: { fontWeight: 400 },
      button: { fontWeight: 600, textTransform: 'none' },
    },
    shape: {
      borderRadius: 10,
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundColor: isDark ? '#232333' : '#F5F5F9',
            color: isDark ? 'rgba(231, 231, 255, 0.90)' : '#566A7F',
            scrollbarColor: isDark ? '#323249 #232333' : '#D0D4DC #F5F5F9',
            '&::-webkit-scrollbar, & *::-webkit-scrollbar': {
              width: 8,
              height: 8,
              backgroundColor: isDark ? '#232333' : '#F5F5F9',
            },
            '&::-webkit-scrollbar-thumb, & *::-webkit-scrollbar-thumb': {
              borderRadius: 4,
              backgroundColor: isDark ? '#323249' : '#D0D4DC',
            },
            '&::-webkit-scrollbar-thumb:hover, & *::-webkit-scrollbar-thumb:hover': {
              backgroundColor: isDark ? '#434360' : '#BAC0CB',
            },
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            backgroundColor: isDark ? '#2B2C40' : '#FFFFFF',
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            backgroundColor: isDark ? '#2B2C40' : '#FFFFFF',
            border: isDark ? '1px solid rgba(231, 231, 255, 0.08)' : '1px solid rgba(67, 89, 113, 0.08)',
            boxShadow: isDark
              ? '0 2px 14px 0 rgba(0, 0, 0, 0.24)'
              : '0 2px 10px 0 rgba(67, 89, 113, 0.08)',
            borderRadius: 10,
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
            backgroundColor: '#696CFF',
            color: '#FFFFFF',
            boxShadow: '0 2px 6px 0 rgba(105, 108, 255, 0.4)',
            '&:hover': {
              backgroundColor: '#5F61E6',
              boxShadow: '0 4px 12px 0 rgba(105, 108, 255, 0.5)',
            },
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
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 8,
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            borderColor: isDark ? 'rgba(231, 231, 255, 0.08)' : 'rgba(67, 89, 113, 0.08)',
          },
          head: {
            backgroundColor: isDark ? '#2B2C40' : '#F5F5F9',
            color: isDark ? 'rgba(231, 231, 255, 0.7)' : '#566A7F',
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
            backgroundColor: isDark ? '#2B2C40' : '#FFFFFF',
            backgroundImage: 'none',
            border: isDark ? '1px solid rgba(231, 231, 255, 0.12)' : '1px solid rgba(67, 89, 113, 0.12)',
            boxShadow: '0 12px 32px -4px rgba(0, 0, 0, 0.35)',
            borderRadius: 10,
          },
        },
      },
      MuiSwitch: {
        styleOverrides: {
          switchBase: {
            '&.Mui-checked': {
              color: '#696CFF',
              '& + .MuiSwitch-track': {
                backgroundColor: '#696CFF',
              },
            },
          },
        },
      },
    },
  });
};

export const darkTheme = getTheme('dark');
export const lightTheme = getTheme('light');
export const sneatDarkTheme = darkTheme;
export const sneatLightTheme = lightTheme;
