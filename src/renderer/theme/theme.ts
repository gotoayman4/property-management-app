import { createTheme, Theme } from '@mui/material/styles'

// Primary design tokens for property management app (premium, elegant theme)
const primaryColor = '#1e3a8a' // Deep Blue
const secondaryColor = '#b45309' // Warm Amber
const successColor = '#0f766e' // Teal
const errorColor = '#be123c' // Rose/Crimson

export const getTheme = (direction: 'ltr' | 'rtl'): Theme => {
  const isRtl = direction === 'rtl'

  return createTheme({
    direction,
    palette: {
      mode: 'light',
      primary: {
        main: primaryColor,
        light: '#3b82f6',
        dark: '#172554'
      },
      secondary: {
        main: secondaryColor,
        light: '#f59e0b',
        dark: '#78350f'
      },
      success: {
        main: successColor,
        light: '#14b8a6',
        dark: '#115e59'
      },
      error: {
        main: errorColor,
        light: '#f43f5e',
        dark: '#881337'
      },
      background: {
        default: '#f8fafc', // Slate 50
        paper: '#ffffff'
      },
      text: {
        primary: '#0f172a', // Slate 900
        secondary: '#475569' // Slate 600
      }
    },
    typography: {
      fontFamily: isRtl
        ? '"Cairo", "Tajawal", "Roboto", "Helvetica", "Arial", sans-serif'
        : '"Outfit", "Inter", "Roboto", "Helvetica", "Arial", sans-serif',
      h1: { fontSize: '2.25rem', fontWeight: 700 },
      h2: { fontSize: '1.875rem', fontWeight: 700 },
      h3: { fontSize: '1.5rem', fontWeight: 600 },
      h4: { fontSize: '1.25rem', fontWeight: 600 },
      h5: { fontSize: '1rem', fontWeight: 600 },
      h6: { fontSize: '0.875rem', fontWeight: 600 },
      body1: { fontSize: '1rem', lineHeight: isRtl ? 1.75 : 1.5 },
      body2: { fontSize: '0.875rem', lineHeight: isRtl ? 1.7 : 1.43 },
      button: { fontWeight: 600, textTransform: 'none' }
    },
    shape: {
      borderRadius: 12
    },
    shadows: [
      'none',
      '0px 2px 4px rgba(15, 23, 42, 0.05)',
      '0px 4px 8px rgba(15, 23, 42, 0.06)',
      '0px 8px 16px rgba(15, 23, 42, 0.08)',
      // rest default shadows
      ...Array(21)
        .fill('none')
        .map((_, i) => `0px ${i}px ${i * 2}px rgba(15, 23, 42, 0.04)`)
    ] as unknown as Theme['shadows'],
    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            padding: '8px 16px',
            fontSize: '0.875rem',
            boxShadow: 'none',
            '&:hover': {
              boxShadow: '0px 2px 4px rgba(15, 23, 42, 0.08)'
            }
          }
        }
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 16,
            boxShadow: '0px 4px 8px rgba(15, 23, 42, 0.05)',
            border: '1px solid #e2e8f0'
          }
        }
      },
      MuiTextField: {
        defaultProps: {
          variant: 'outlined',
          size: 'small'
        }
      }
    }
  })
}
