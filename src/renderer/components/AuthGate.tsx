/**
 * INTENT: Top-level auth gate. Reads the require_auth setting on mount.
 *         If auth is disabled (default), auto-sets a system user in context
 *         so the app renders immediately without login.
 *         If auth is enabled, shows the Login page until the user authenticates.
 * CONSTRAINT (NFR-SEC-01): auth bypass only when setting is explicitly off.
 */
import React, { useState, useEffect } from 'react'
import { Box, CircularProgress } from '@mui/material'
import { useAuth } from '../contexts/AuthContext'
import Login from '../pages/auth/Login'

interface AuthGateProps {
  children: React.ReactNode
}

const SYSTEM_USER = { id: 0, username: 'system', display_name: null } as const

export default function AuthGate({ children }: AuthGateProps): React.JSX.Element {
  const { user, login } = useAuth()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function checkAuthRequirement(): Promise<void> {
      try {
        const settings = (await window.api.settings.get()) as { require_auth?: number }
        if (!settings.require_auth) {
          login(SYSTEM_USER)
        }
      } catch {
        // Settings fetch failed — fall through to normal auth flow
      }
      setLoading(false)
    }
    checkAuthRequirement()
  }, [login])

  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          bgcolor: 'background.default'
        }}
      >
        <CircularProgress />
      </Box>
    )
  }

  return user ? <>{children}</> : <Login />
}
