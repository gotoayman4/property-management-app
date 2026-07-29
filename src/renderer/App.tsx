import { CacheProvider, Global } from '@emotion/react'
import { ThemeProvider, CssBaseline } from '@mui/material'
import React, { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { createHashRouter, RouterProvider, Outlet, Navigate } from 'react-router-dom'
import AuthGate from './components/AuthGate'
import Layout from './components/Layout'
import { AuthProvider } from './contexts/AuthContext'
import ContractDetail from './pages/contracts/ContractDetail'
import { ContractList } from './pages/contracts/ContractList'
import ExchangeRateManager from './pages/currency/ExchangeRateManager'
import Dashboard from './pages/dashboard/Dashboard'
import { DuesList } from './pages/dues/DuesList'
import { ExpenseList } from './pages/expenses/ExpenseList'
import { RecurringExpenseList } from './pages/expenses/RecurringExpenseList'
import Ledger from './pages/ledger/Ledger'
import NotificationCenter from './pages/notifications/NotificationCenter'
import { PaymentList } from './pages/payments/PaymentList'
import PropertyDetail from './pages/properties/PropertyDetail'
import PropertyList from './pages/properties/PropertyList'
import Reports from './pages/reports/Reports'
import Settings from './pages/settings/Settings'
import TenantDetail from './pages/tenants/TenantDetail'
import { TenantList } from './pages/tenants/TenantList'
import { useUiPreferences } from './stores/uiPreferencesStore'
import { getTheme } from './theme/theme'
import { cacheLtr, cacheRtl } from './utils/emotionCache'
import './i18n'

// Layout wrapper for routing
function AppLayout(): React.JSX.Element {
  return (
    <Layout>
      <Outlet />
    </Layout>
  )
}

// Router configuration using React Router 7 Data Router API (HashRouter for Electron offline loading)
const router = createHashRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      {
        path: '/',
        element: <Dashboard />
      },
      {
        path: '/properties',
        element: <PropertyList />
      },
      {
        path: '/properties/:id',
        element: <PropertyDetail />
      },
      {
        path: '/tenants',
        element: <TenantList />
      },
      {
        path: '/tenants/:id',
        element: <TenantDetail />
      },
      {
        path: '/contracts',
        element: <ContractList />
      },
      {
        path: '/contracts/:id',
        element: <ContractDetail />
      },
      {
        path: '/payments',
        element: <PaymentList />
      },
      {
        path: '/dues',
        element: <DuesList />
      },
      {
        path: '/expenses',
        element: <ExpenseList />
      },
      {
        path: '/recurring-expenses',
        element: <RecurringExpenseList />
      },
      {
        path: '/ledger',
        element: <Ledger />
      },
      {
        path: '/reports',
        element: <Reports />
      },
      {
        path: '/settings',
        element: <Settings />
      },
      {
        path: '/currency',
        element: <ExchangeRateManager />
      },
      {
        path: '/notifications',
        element: <NotificationCenter />
      },
      {
        path: '/backup',
        element: <Navigate to="/settings?section=backup" replace />
      }
    ]
  }
])

export default function App(): React.JSX.Element {
  const { i18n } = useTranslation()
  const themeMode = useUiPreferences((s) => s.theme)
  const fontSize = useUiPreferences((s) => s.fontSize)
  const refreshPrefs = useUiPreferences((s) => s.refresh)

  const direction = i18n.language === 'ar' ? 'rtl' : 'ltr'

  // Bootstrap: pull persisted theme/font_size/language from DB via Zustand on mount.
  // The store stays reactive — Settings.tsx calls refresh() after any save, and the
  // subscribed selectors re-render App.tsx with the new values immediately.
  useEffect(() => {
    refreshPrefs()
  }, [refreshPrefs])

  // Reconcile the persisted DB language preference on launch.
  useEffect(() => {
    async function reconcileLanguage(): Promise<void> {
      try {
        const settings = (await window.api.settings.get()) as { app_language?: string }
        if (settings?.app_language && settings.app_language !== i18n.language) {
          await i18n.changeLanguage(settings.app_language)
        }
      } catch (err) {
        console.error('Failed to load initial settings from database:', err)
      }
    }
    reconcileLanguage()
  }, [i18n])

  // Update layout direction whenever language changes
  useEffect(() => {
    const currentLang = i18n.language || 'ar'
    const nextDir = currentLang === 'ar' ? 'rtl' : 'ltr'
    document.documentElement.dir = nextDir
    document.documentElement.lang = currentLang
  }, [i18n.language])

  const theme = useMemo(
    () => getTheme(direction, themeMode, fontSize),
    [direction, themeMode, fontSize]
  )
  const cache = direction === 'rtl' ? cacheRtl : cacheLtr

  return (
    <CacheProvider value={cache} key={direction}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Global
          // @ts-expect-error Emotion CSS type too narrow for `direction: ltr !important` needed to override RTL plugin
          styles={{
            'input[type="email"], input[type="password"], input[type="tel"], input[type="number"], input[inputmode="decimal"], input[inputmode="numeric"], input[inputmode="tel"], input[inputmode="email"]':
              {
                direction: 'ltr !important',
                textAlign: 'start'
              }
          }}
        />
        <AuthProvider>
          <AuthGate>
            <RouterProvider router={router} />
          </AuthGate>
        </AuthProvider>
      </ThemeProvider>
    </CacheProvider>
  )
}
