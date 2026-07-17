/**
 * INTENT: In-memory auth session state. Holds the currently authenticated user
 *         for the lifetime of the app window. No JWT, no persisted token —
 *         the user must log in each time the app starts.
 * CONSTRAINT (NFR-SEC-01): app requires authentication before any data access.
 * CONSTRAINT (AGENTS.md): session state in React context, no server-side tokens.
 */
/* eslint-disable react-refresh/only-export-components -- Context files export both provider and hook by design. */
import React, { createContext, useContext, useState, useCallback } from 'react'

export interface AuthUser {
  id: number
  username: string
  display_name: string | null
}

interface AuthContextValue {
  user: AuthUser | null
  login: (user: AuthUser) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [user, setUser] = useState<AuthUser | null>(null)

  const login = useCallback((u: AuthUser) => setUser(u), [])
  const logout = useCallback(() => setUser(null), [])

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
