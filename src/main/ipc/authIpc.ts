/**
 * INTENT: Authentication IPC handlers — register, login, verify, remember-me.
 *         Single-user offline desktop app: one admin account, bcrypt hashing,
 *         session held in renderer memory only (no JWT, no persisted token).
 *         Optional "remember me" uses Electron safeStorage (OS keychain) to
 *         encrypt + persist credentials so the user can skip re-entry on launch.
 * CONSTRAINT (NFR-SEC-01): app requires authentication before any data access.
 * CONSTRAINT (AGENTS.md): all DB queries use parameterized statements, no console.log in prod.
 */
import fs from 'fs'
import path from 'path'
import bcrypt from 'bcrypt'
import { ipcMain, safeStorage, app } from 'electron'
import { z } from 'zod'
import { db } from '../db/database'

const BCRYPT_ROUNDS = 10

const registerSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-zA-Z0-9_-]+$/),
  password: z.string().min(6).max(128),
  display_name: z.string().min(1).max(100).optional()
})

const loginSchema = z.object({
  username: z.string().min(1).max(50),
  password: z.string().min(1).max(128)
})

export function registerAuthIpcHandlers(): void {
  // Check if any user exists — determines first-launch vs login flow
  ipcMain.handle('auth:hasUsers', async () => {
    try {
      const row = db.prepare('SELECT 1 FROM users LIMIT 1').get()
      return { hasUsers: !!row }
    } catch {
      throw new Error('FAILED_TO_CHECK_USERS')
    }
  })

  // Register the first admin account (first-launch only)
  ipcMain.handle('auth:register', async (_, data: unknown) => {
    try {
      const parsed = registerSchema.parse(data)

      // Only allow registration when no users exist
      const existing = db.prepare('SELECT 1 FROM users LIMIT 1').get()
      if (existing) {
        throw new Error('REGISTRATION_DISABLED')
      }

      const passwordHash = bcrypt.hashSync(parsed.password, BCRYPT_ROUNDS)

      const stmt = db.prepare(
        'INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)'
      )
      const result = stmt.run(parsed.username, passwordHash, parsed.display_name ?? null)

      return {
        id: result.lastInsertRowid,
        username: parsed.username,
        display_name: parsed.display_name ?? null
      }
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        throw new Error('INVALID_INPUT')
      }
      if (error instanceof Error && error.message === 'REGISTRATION_DISABLED') {
        throw error
      }
      throw new Error('FAILED_TO_REGISTER')
    }
  })

  // Login — verify credentials, update last_login_at
  ipcMain.handle('auth:login', async (_, data: unknown) => {
    try {
      const parsed = loginSchema.parse(data)

      const user = db
        .prepare(
          'SELECT id, username, password_hash, display_name, is_active FROM users WHERE username = ?'
        )
        .get(parsed.username) as
        | {
            id: number
            username: string
            password_hash: string
            display_name: string | null
            is_active: number
          }
        | undefined

      if (!user) {
        throw new Error('INVALID_CREDENTIALS')
      }

      if (!user.is_active) {
        throw new Error('ACCOUNT_DISABLED')
      }

      const passwordValid = bcrypt.compareSync(parsed.password, user.password_hash)
      if (!passwordValid) {
        throw new Error('INVALID_CREDENTIALS')
      }

      db.prepare('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?').run(user.id)

      return {
        id: user.id,
        username: user.username,
        display_name: user.display_name
      }
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        throw new Error('INVALID_INPUT')
      }
      if (
        error instanceof Error &&
        (error.message === 'INVALID_CREDENTIALS' || error.message === 'ACCOUNT_DISABLED')
      ) {
        throw error
      }
      throw new Error('FAILED_TO_LOGIN')
    }
  })

  // Change password (requires current password)
  ipcMain.handle(
    'auth:changePassword',
    async (_, data: { userId: number; currentPassword: string; newPassword: string }) => {
      try {
        const user = db
          .prepare('SELECT id, password_hash FROM users WHERE id = ? AND is_active = 1')
          .get(data.userId) as { id: number; password_hash: string } | undefined

        if (!user) {
          throw new Error('USER_NOT_FOUND')
        }

        const valid = bcrypt.compareSync(data.currentPassword, user.password_hash)
        if (!valid) {
          throw new Error('INVALID_CREDENTIALS')
        }

        if (data.newPassword.length < 6 || data.newPassword.length > 128) {
          throw new Error('INVALID_INPUT')
        }

        const newHash = bcrypt.hashSync(data.newPassword, BCRYPT_ROUNDS)
        db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, data.userId)

        return { success: true }
      } catch (error: unknown) {
        if (error instanceof Error) {
          throw error
        }
        throw new Error('FAILED_TO_CHANGE_PASSWORD')
      }
    }
  )

  // --- Remember-me: encrypted credential persistence via OS keychain ---

  ipcMain.handle('auth:getSavedCredentials', async () => {
    try {
      const filePath = getCredentialsFilePath()
      if (!fs.existsSync(filePath)) {
        return { credentials: null }
      }
      const raw = fs.readFileSync(filePath)
      const encrypted = JSON.parse(raw.toString('utf-8')) as {
        username: string
        password: string
      }
      const username = safeStorage.decryptString(Buffer.from(encrypted.username, 'base64'))
      const password = safeStorage.decryptString(Buffer.from(encrypted.password, 'base64'))
      return { credentials: { username, password } }
    } catch {
      return { credentials: null }
    }
  })

  ipcMain.handle(
    'auth:saveCredentials',
    async (_, data: { username: string; password: string }) => {
      try {
        const filePath = getCredentialsFilePath()
        const payload = {
          username: safeStorage.encryptString(data.username).toString('base64'),
          password: safeStorage.encryptString(data.password).toString('base64')
        }
        fs.writeFileSync(filePath, JSON.stringify(payload), 'utf-8')
        return { success: true }
      } catch {
        throw new Error('FAILED_TO_SAVE_CREDENTIALS')
      }
    }
  )

  ipcMain.handle('auth:clearSavedCredentials', async () => {
    try {
      const filePath = getCredentialsFilePath()
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }
      return { success: true }
    } catch {
      throw new Error('FAILED_TO_CLEAR_CREDENTIALS')
    }
  })
}

function getCredentialsFilePath(): string {
  return path.join(app.getPath('userData'), 'saved-credentials.json')
}
