import React, { useEffect, useMemo } from 'react'
import { createHashRouter, RouterProvider, Outlet } from 'react-router-dom'
import { CacheProvider } from '@emotion/react'
import { ThemeProvider, CssBaseline } from '@mui/material'
import { useTranslation } from 'react-i18next'
import { cacheLtr, cacheRtl } from './utils/emotionCache'
import { getTheme } from './theme/theme'
import Layout from './components/Layout'
import Dashboard from './pages/dashboard/Dashboard'
import PropertyList from './pages/properties/PropertyList'
import { TenantList } from './pages/tenants/TenantList'
import { ContractList } from './pages/contracts/ContractList'
import Settings from './pages/settings/Settings'
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
        path: '/tenants',
        element: <TenantList />
      },
      {
        path: '/contracts',
        element: <ContractList />
      },
      {
        path: '/settings',
        element: <Settings />
      }
    ]
  }
])

export default function App(): React.JSX.Element {
  const { i18n } = useTranslation()

  const direction = i18n.language === 'ar' ? 'rtl' : 'ltr'

  // Reconcile the persisted DB language preference on launch. This runs AFTER first paint
  // (i18n already initialized from localStorage 'app-dir' synchronously in i18n.ts), so the
  // UI renders immediately with the correct direction. The DB is the canonical source per
  // FR-SET-09; if it disagrees with localStorage we follow the DB and the languageChanged
  // listener re-persists 'app-dir' to keep them aligned.
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

  const theme = useMemo(() => getTheme(direction), [direction])
  const cache = direction === 'rtl' ? cacheRtl : cacheLtr

  return (
    <CacheProvider value={cache} key={direction}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <RouterProvider router={router} />
      </ThemeProvider>
    </CacheProvider>
  )
}
