/**
 * @file tenantIpc.test — regression tests for tenant create/update IPC handlers.
 *
 * INTENT: Verify blank national_id values are normalized to NULL (not stored as ''),
 *         so the UNIQUE constraint on tenants.national_id never fires for tenants
 *         saved without a national ID (bug: "UNIQUE constraint failed: tenants.national_id").
 * CONSTRAINT: Electron and the database module are mocked; tests run against an in-memory DB.
 */
import { ipcMain } from 'electron'
// eslint-disable-next-line import-x/order -- vitest mock pattern requires split imports
import { describe, it, expect, beforeEach, vi } from 'vitest'

const { testDb } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require('better-sqlite3')
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  return { testDb: db }
})

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() }
}))

vi.mock('../../db/database', () => ({ db: testDb, initDatabase: () => undefined }))

import { runMigrations } from '../../db/migrations'
import { registerTenantIpcHandlers } from '../tenantIpc'
import { makeRegistry, invoke, resetDb, type IpcRegistry } from './ipcTestUtils'

/** Minimal valid create payload matching the renderer form shape; national_id is set per test case. */
function tenantPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    code: `T-${Math.random().toString(36).slice(2, 8)}`,
    fullname: 'Test Tenant',
    phone: '791234567',
    country_code: '962',
    email: '',
    company_reg_no: null,
    representative_name: null,
    emergency_contact_name: null,
    emergency_contact_phone: null,
    address: null,
    notes: null,
    ...overrides
  }
}

describe('tenantIpc', () => {
  let registry: IpcRegistry

  beforeEach(() => {
    runMigrations(testDb)
    resetDb(testDb)
    registry = makeRegistry()
    vi.mocked(
      ipcMain.handle as unknown as (channel: string, fn: (...args: unknown[]) => unknown) => void
    ).mockImplementation((channel: string, fn: (...args: unknown[]) => unknown) => {
      registry[channel] = fn
    })
    registerTenantIpcHandlers()
  })

  describe('tenants:create — blank national_id normalization (regression)', () => {
    it('creates two tenants with empty-string national_id without UNIQUE failure', async () => {
      await invoke(registry, 'tenants:create', tenantPayload({ national_id: '' }))
      // Before the fix, this second insert threw "UNIQUE constraint failed: tenants.national_id".
      await expect(
        invoke(registry, 'tenants:create', tenantPayload({ national_id: '' }))
      ).resolves.toBeTruthy()
    })

    it('stores blank national_id as NULL, not empty string', async () => {
      const created = (await invoke(
        registry,
        'tenants:create',
        tenantPayload({ national_id: '   ' })
      )) as { id: number }
      const row = testDb
        .prepare('SELECT national_id FROM tenants WHERE id = ?')
        .get(created.id) as { national_id: string | null }
      expect(row.national_id).toBeNull()
    })

    it('succeeds even when a legacy row already holds an empty-string national_id', async () => {
      // Simulate a database written before the fix/migration.
      testDb
        .prepare(`INSERT INTO tenants (code, fullname, phone, national_id) VALUES (?, ?, ?, '')`)
        .run('T-LEGACY', 'Legacy Tenant', '790000000')
      await expect(
        invoke(registry, 'tenants:create', tenantPayload({ national_id: '' }))
      ).resolves.toBeTruthy()
    })

    it('trims and stores a real national_id, still rejecting duplicates', async () => {
      await invoke(registry, 'tenants:create', tenantPayload({ national_id: ' 999-123 ' }))
      await expect(
        invoke(registry, 'tenants:create', tenantPayload({ national_id: '999-123' }))
      ).rejects.toThrow('NATIONAL_ID_DUPLICATE')
    })
  })

  describe('tenants:update — blank national_id normalization', () => {
    it('clears a national_id back to NULL when the field is emptied', async () => {
      const created = (await invoke(
        registry,
        'tenants:create',
        tenantPayload({ code: 'T-UPD', national_id: '111-222' })
      )) as { id: number }
      await invoke(registry, 'tenants:update', {
        id: created.id,
        ...tenantPayload({ code: 'T-UPD', national_id: '' })
      })
      const row = testDb
        .prepare('SELECT national_id FROM tenants WHERE id = ?')
        .get(created.id) as { national_id: string | null }
      expect(row.national_id).toBeNull()
    })
  })

  describe('migration 031 — legacy empty-string backfill', () => {
    it('is recorded as applied (blank national_id rows are normalized to NULL)', () => {
      const applied = testDb
        .prepare(`SELECT 1 FROM migrations WHERE name = '031_tenant_national_id_null.sql'`)
        .get()
      expect(applied).toBeTruthy()
    })
  })
})
