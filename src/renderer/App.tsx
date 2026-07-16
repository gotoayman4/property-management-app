import React, { useEffect, useState, useMemo } from 'react'
import { createHashRouter, RouterProvider, Outlet } from 'react-router-dom'
import { CacheProvider } from '@emotion/react'
import { ThemeProvider, CssBaseline } from '@mui/material'
import { useTranslation } from 'react-i18next'
import { cacheLtr, cacheRtl } from './utils/emotionCache'
import { getTheme } from './theme/theme'
import Layout from './components/Layout'
import Dashboard from './pages/dashboard/Dashboard'
import PropertyList from './pages/properties/PropertyList'
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
        path: '/settings',
        element: <Settings />
      }
    ]
  }
])

export default function App(): React.JSX.Element {
  const { i18n } = useTranslation()
  const [loading, setLoading] = useState(true)

  const direction = i18n.language === 'ar' ? 'rtl' : 'ltr'

  // Fetch initial language setting from local SQLite database
  useEffect(() => {
    async function loadSettings(): Promise<void> {
      try {
        const settings = await window.api.settings.get()
        if (settings && settings.app_language) {
          await i18n.changeLanguage(settings.app_language)
        }
      } catch (err) {
        console.error('Failed to load initial settings from database:', err)
      } finally {
        setLoading(false)
      }
    }
    loadSettings()
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

  if (loading) {
    return (
      <div
        style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}
      >
        Loading Application...
      </div>
    )
  }

  return (
    <CacheProvider value={cache} key={direction}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <RouterProvider router={router} />
      </ThemeProvider>
    </CacheProvider>
  )
}
