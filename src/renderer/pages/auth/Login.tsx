/**
 * INTENT: Login / first-launch registration page. Shown before any data is accessible.
 *         First launch: "Create Admin Account" form. Subsequent: username/password login.
 * CONSTRAINT (NFR-SEC-01): authentication required before data access.
 * CONSTRAINT (AGENTS.md): i18n keys only, React Hook Form, Zod validation, logical CSS.
 */
import { zodResolver } from '@hookform/resolvers/zod'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import Visibility from '@mui/icons-material/Visibility'
import VisibilityOff from '@mui/icons-material/VisibilityOff'
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  InputAdornment,
  IconButton,
  Checkbox,
  FormControlLabel
} from '@mui/material'
import React, { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { useAuth } from '../../contexts/AuthContext'

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
})

const registerSchema = z
  .object({
    username: z
      .string()
      .min(3)
      .max(50)
      .regex(/^[a-zA-Z0-9_-]+$/),
    displayName: z.string().min(1).max(100).optional().or(z.literal('')),
    password: z.string().min(6).max(128),
    confirmPassword: z.string()
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword']
  })

type LoginForm = z.infer<typeof loginSchema>
type RegisterForm = z.infer<typeof registerSchema>

export default function Login(): React.JSX.Element {
  const { t } = useTranslation()
  const { login: authLogin } = useAuth()
  const [mode, setMode] = useState<'loading' | 'login' | 'register'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)

  const loginForm = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' }
  })

  const registerForm = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { username: '', displayName: '', password: '', confirmPassword: '' }
  })

  useEffect(() => {
    async function init(): Promise<void> {
      try {
        const result = await window.api.auth.hasUsers()
        if (result.hasUsers) {
          setMode('login')
          const saved = await window.api.auth.getSavedCredentials()
          if (saved.credentials) {
            loginForm.setValue('username', saved.credentials.username)
            loginForm.setValue('password', saved.credentials.password)
            setRememberMe(true)
          }
        } else {
          setMode('register')
        }
      } catch {
        setError(t('common.error'))
        setMode('login')
      }
    }
    init()
  }, [t, loginForm])

  const handleLogin = async (data: LoginForm): Promise<void> => {
    setError(null)
    try {
      const user = await window.api.auth.login(data)
      if (rememberMe) {
        await window.api.auth.saveCredentials({ username: data.username, password: data.password })
      } else {
        await window.api.auth.clearSavedCredentials()
      }
      authLogin(user)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'UNKNOWN'
      if (msg === 'INVALID_CREDENTIALS') {
        setError(t('auth.invalidCredentials'))
      } else if (msg === 'ACCOUNT_DISABLED') {
        setError(t('auth.accountDisabled'))
      } else {
        setError(t('common.error'))
      }
    }
  }

  const handleRegister = async (data: RegisterForm): Promise<void> => {
    setError(null)
    try {
      const user = await window.api.auth.register({
        username: data.username,
        password: data.password,
        display_name: data.displayName || undefined
      })
      authLogin(user)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'UNKNOWN'
      if (msg === 'REGISTRATION_DISABLED') {
        setMode('login')
        setError(t('auth.registrationDisabled'))
      } else if (msg === 'INVALID_INPUT') {
        setError(t('auth.invalidInput'))
      } else {
        setError(t('common.error'))
      }
    }
  }

  if (mode === 'loading') {
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

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        bgcolor: 'background.default',
        p: 2
      }}
    >
      <Card
        elevation={2}
        sx={{
          width: '100%',
          maxWidth: 420,
          borderRadius: 3
        }}
      >
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 3 }}>
            <Box
              sx={{
                p: 1.5,
                borderRadius: 2,
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                mb: 2
              }}
            >
              <LockOutlinedIcon fontSize="large" />
            </Box>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>
              {mode === 'register' ? t('auth.createAccount') : t('auth.login')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {mode === 'register' ? t('auth.firstLaunchDescription') : t('auth.loginDescription')}
            </Typography>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          {mode === 'register' ? (
            <Box component="form" onSubmit={registerForm.handleSubmit(handleRegister)} noValidate>
              <TextField
                fullWidth
                label={t('auth.username')}
                margin="normal"
                {...registerForm.register('username')}
                error={!!registerForm.formState.errors.username}
                helperText={registerForm.formState.errors.username?.message}
                autoComplete="username"
                autoFocus
              />
              <TextField
                fullWidth
                label={t('auth.displayName')}
                margin="normal"
                {...registerForm.register('displayName')}
                error={!!registerForm.formState.errors.displayName}
                helperText={registerForm.formState.errors.displayName?.message}
              />
              <TextField
                fullWidth
                label={t('auth.password')}
                type={showPassword ? 'text' : 'password'}
                margin="normal"
                {...registerForm.register('password')}
                error={!!registerForm.formState.errors.password}
                helperText={registerForm.formState.errors.password?.message}
                autoComplete="new-password"
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => setShowPassword(!showPassword)}
                          edge="end"
                          aria-label={
                            showPassword ? t('auth.hidePassword') : t('auth.showPassword')
                          }
                        >
                          {showPassword ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    )
                  }
                }}
              />
              <TextField
                fullWidth
                label={t('auth.confirmPassword')}
                type={showPassword ? 'text' : 'password'}
                margin="normal"
                {...registerForm.register('confirmPassword')}
                error={!!registerForm.formState.errors.confirmPassword}
                helperText={registerForm.formState.errors.confirmPassword?.message}
                autoComplete="new-password"
              />
              <Button
                fullWidth
                type="submit"
                variant="contained"
                size="large"
                disabled={registerForm.formState.isSubmitting}
                sx={{ mt: 3, py: 1.5 }}
              >
                {registerForm.formState.isSubmitting
                  ? t('common.loading')
                  : t('auth.createAccount')}
              </Button>
            </Box>
          ) : (
            <Box component="form" onSubmit={loginForm.handleSubmit(handleLogin)} noValidate>
              <TextField
                fullWidth
                label={t('auth.username')}
                margin="normal"
                {...loginForm.register('username')}
                error={!!loginForm.formState.errors.username}
                helperText={loginForm.formState.errors.username?.message}
                autoComplete="username"
                autoFocus
              />
              <TextField
                fullWidth
                label={t('auth.password')}
                type={showPassword ? 'text' : 'password'}
                margin="normal"
                {...loginForm.register('password')}
                error={!!loginForm.formState.errors.password}
                helperText={loginForm.formState.errors.password?.message}
                autoComplete="current-password"
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => setShowPassword(!showPassword)}
                          edge="end"
                          aria-label={
                            showPassword ? t('auth.hidePassword') : t('auth.showPassword')
                          }
                        >
                          {showPassword ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    )
                  }
                }}
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    color="primary"
                  />
                }
                label={t('auth.rememberMe')}
                sx={{ mt: 1, justifyContent: 'start' }}
              />
              <Button
                fullWidth
                type="submit"
                variant="contained"
                size="large"
                disabled={loginForm.formState.isSubmitting}
                sx={{ mt: 3, py: 1.5 }}
              >
                {loginForm.formState.isSubmitting ? t('common.loading') : t('auth.login')}
              </Button>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  )
}
