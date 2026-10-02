import { createTheme } from '@mui/material';

export const theme = createTheme({
  palette: {
    primary: { main: '#6020ee', dark: '#4714ba' },
    secondary: { main: '#1762ef' },
    background: { default: '#f5f6fa', paper: '#ffffff' },
    text: { primary: '#172039', secondary: '#626d83' },
    divider: '#e7ebf3',
    success: { main: '#147d58' },
    warning: { main: '#976000' },
  },
  shape: { borderRadius: 14 },
  typography: {
    fontFamily: '"Segoe UI", Arial, sans-serif',
    h4: { fontSize: '1.75rem', fontWeight: 750, letterSpacing: '-0.04em' },
    h5: { fontSize: '1.2rem', fontWeight: 700, letterSpacing: '-0.02em' },
    h6: { fontSize: '1.05rem', fontWeight: 700 },
    button: { textTransform: 'none', fontWeight: 650, fontSize: '0.9375rem' },
    caption: { fontSize: '0.8125rem' },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { margin: 0 },
        '*': { boxSizing: 'border-box' },
        ':focus-visible': { outline: '3px solid #1762ef', outlineOffset: 3 },
        html: { scrollPaddingTop: 90 },
        '@media (prefers-reduced-motion: reduce)': {
          '*': { scrollBehavior: 'auto !important', transition: 'none !important' },
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { minHeight: 44, borderRadius: 12, paddingInline: 18 },
        contained: { paddingBlock: 11 },
        sizeLarge: { minHeight: 52 },
      },
    },
    MuiIconButton: { styleOverrides: { root: { minWidth: 44, minHeight: 44 } } },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: { outlined: { borderColor: '#e7ebf3' } },
    },
    MuiOutlinedInput: { styleOverrides: { root: { backgroundColor: '#fff', borderRadius: 10 } } },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 650 },
        colorSuccess: { backgroundColor: '#def6ec', color: '#116747' },
        colorInfo: { backgroundColor: '#eaf1ff', color: '#1751be' },
        colorWarning: { backgroundColor: '#fff3dc', color: '#865500' },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: { backgroundColor: '#f7f8fc', color: '#626d83', fontWeight: 650 },
        root: { borderColor: '#edf0f6' },
      },
    },
    MuiAlert: { styleOverrides: { root: { borderRadius: 12 } } },
    MuiTabs: { defaultProps: { variant: 'scrollable', scrollButtons: 'auto' } },
  },
});
