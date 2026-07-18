import { createTheme, Theme } from '@mui/material/styles'

// Primary design tokens for property management app (premium, elegant theme)
const primaryColor = '#1e3a8a' // Deep Blue
const secondaryColor = '#b45309' // Warm Amber
const successColor = '#0f766e' // Teal
const errorColor = '#be123c' // Rose/Crimson

// FR-SET-04/05: Font size scale factors (applied to base typography sizes).
const FONT_SCALE: Record<string, number> = {
  small: 0.85,
  medium: 1.0,
  large: 1.15
}

export const getTheme = (
  direction: 'ltr' | 'rtl',
  mode: 'light' | 'dark' = 'light',
  fontSize: 'small' | 'medium' | 'large' = 'medium'
): Theme => {
  const isRtl = direction === 'rtl'
  const fn = (n: number): number => Math.round(n * (FONT_SCALE[fontSize] || 1))

  return createTheme({
    direction,
    palette: {
      mode,
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
        default: mode === 'dark' ? '#0f172a' : '#f8fafc',
        paper: mode === 'dark' ? '#1e293b' : '#ffffff'
      },
      text: {
        primary: mode === 'dark' ? '#f1f5f9' : '#0f172a',
        secondary: mode === 'dark' ? '#94a3b8' : '#475569'
      }
    },
    typography: {
      fontFamily: isRtl
        ? '"Cairo", "Tajawal", "Roboto", "Helvetica", "Arial", sans-serif'
        : '"Outfit", "Inter", "Roboto", "Helvetica", "Arial", sans-serif',
      h1: { fontSize: fn(2.25 * 16), fontWeight: 700 },
      h2: { fontSize: fn(1.875 * 16), fontWeight: 700 },
      h3: { fontSize: fn(1.5 * 16), fontWeight: 600 },
      h4: { fontSize: fn(1.25 * 16), fontWeight: 600 },
      h5: { fontSize: fn(1 * 16), fontWeight: 600 },
      h6: { fontSize: fn(0.875 * 16), fontWeight: 600 },
      body1: { fontSize: fn(16), lineHeight: isRtl ? 1.75 : 1.5 },
      body2: { fontSize: fn(14), lineHeight: isRtl ? 1.7 : 1.43 },
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
      MuiFormLabel: {
        styleOverrides: {
          asterisk: {
            color: errorColor
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
