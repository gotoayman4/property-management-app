/**
 * INTENT: Tests for authIpc handlers (register / login / changePassword / hasUsers).
 *         Auth is high-risk (AGENTS: 100% human review + tests required). Covers happy paths,
 *         bcrypt verification, single-user enforcement, and invalid-credential rejection.
 * CONSTRAINT: Electron is mocked; the db is an in-memory migrated instance.
 */
import { ipcMain } from 'electron'
// eslint-disable-next-line import-x/order -- vitest vi.mock pattern forces structural separation
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
const { testDb } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required inside hoisted scope (ESM imports not yet initialized)
  const Database = require('better-sqlite3')
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  return { testDb: db }
})

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn()
  },
  app: { isPackaged: false, getAppPath: () => process.cwd() }
}))

vi.mock('../../db/database', () => ({
  db: testDb,
  initDatabase: () => undefined
}))

import { runMigrations } from '../../db/migrations'
import { registerAuthIpcHandlers } from '../authIpc'
import { makeRegistry, invoke, resetDb, type IpcRegistry } from './ipcTestUtils'

// Reset domain data after every test so cases don't leak rows.
afterEach((): void => resetDb(testDb))

describe('authIpc', () => {
  let registry: IpcRegistry

  beforeEach(() => {
    runMigrations(testDb)
    resetDb(testDb)
    registry = makeRegistry()
    // Capture handlers into our registry instead of the real ipcMain.
    vi.mocked(
      ipcMain.handle as unknown as (channel: string, fn: (...args: unknown[]) => unknown) => void
    ).mockImplementation((channel: string, fn: (...args: unknown[]) => unknown) => {
      registry[channel] = fn
    })
    registerAuthIpcHandlers()
  })

  it('reports no users on a fresh database', async () => {
    const res = (await invoke(registry, 'auth:hasUsers')) as { hasUsers: boolean }
    expect(res.hasUsers).toBe(false)
  })

  it('registers the first admin and then reports users exist', async () => {
    const res = (await invoke(registry, 'auth:register', {
      username: 'admin',
      password: 'secret123',
      display_name: 'Admin User'
    })) as { id: number; username: string }

    expect(res.id).toBeGreaterThan(0)
    expect(res.username).toBe('admin')

    const has = (await invoke(registry, 'auth:hasUsers')) as { hasUsers: boolean }
    expect(has.hasUsers).toBe(true)
  })

  it('rejects a second registration (single-user enforcement)', async () => {
    await invoke(registry, 'auth:register', { username: 'admin', password: 'secret123' })
    await expect(
      invoke(registry, 'auth:register', { username: 'admin2', password: 'secret123' })
    ).rejects.toThrow('REGISTRATION_DISABLED')
  })

  it('logs in with correct credentials and returns the user', async () => {
    await invoke(registry, 'auth:register', { username: 'admin', password: 'secret123' })
    const res = (await invoke(registry, 'auth:login', {
      username: 'admin',
      password: 'secret123'
    })) as { username: string }
    expect(res.username).toBe('admin')
  })

  it('rejects login with wrong password', async () => {
    await invoke(registry, 'auth:register', { username: 'admin', password: 'secret123' })
    await expect(
      invoke(registry, 'auth:login', { username: 'admin', password: 'wrong' })
    ).rejects.toThrow('INVALID_CREDENTIALS')
  })

  it('rejects login for a disabled account', async () => {
    const reg = (await invoke(registry, 'auth:register', {
      username: 'admin',
      password: 'secret123'
    })) as { id: number }
    testDb.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(reg.id)
    await expect(
      invoke(registry, 'auth:login', { username: 'admin', password: 'secret123' })
    ).rejects.toThrow('ACCOUNT_DISABLED')
  })

  it('changes password when the current password is correct', async () => {
    const reg = (await invoke(registry, 'auth:register', {
      username: 'admin',
      password: 'secret123'
    })) as { id: number }
    const res = (await invoke(registry, 'auth:changePassword', {
      userId: reg.id,
      currentPassword: 'secret123',
      newPassword: 'newsecret1'
    })) as { success: boolean }
    expect(res.success).toBe(true)

    // Old password no longer works; new one does.
    await expect(
      invoke(registry, 'auth:login', { username: 'admin', password: 'secret123' })
    ).rejects.toThrow('INVALID_CREDENTIALS')
    const ok = (await invoke(registry, 'auth:login', {
      username: 'admin',
      password: 'newsecret1'
    })) as { username: string }
    expect(ok.username).toBe('admin')
  })

  it('rejects password change with wrong current password', async () => {
    const reg = (await invoke(registry, 'auth:register', {
      username: 'admin',
      password: 'secret123'
    })) as { id: number }
    await expect(
      invoke(registry, 'auth:changePassword', {
        userId: reg.id,
        currentPassword: 'wrong',
        newPassword: 'newsecret1'
      })
    ).rejects.toThrow('INVALID_CREDENTIALS')
  })
})
