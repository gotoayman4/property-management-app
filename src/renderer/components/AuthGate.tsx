/**
 * INTENT: Top-level auth gate. Shows Login page when no session exists in memory,
 *         renders children (the full app) when authenticated.
 * CONSTRAINT (NFR-SEC-01): no data access before authentication.
 */
import React from 'react'
import { useAuth } from '../contexts/AuthContext'
import Login from '../pages/auth/Login'

interface AuthGateProps {
  children: React.ReactNode
}

export default function AuthGate({ children }: AuthGateProps): React.JSX.Element {
  const { user } = useAuth()
  return user ? <>{children}</> : <Login />
}
