/**
 * INTENT: Tests for documentIpc handlers covering the security-critical MIME magic-byte
 *         validation (AGENTS: file-type@16.5.4, whitelist jpeg/png/pdf) and the transactional
 *         upload/delete behaviour introduced in M3.
 * CONSTRAINT: Electron + db mocked. file-type is imported for real (works under node). Disk
 *             writes target a temp dir via mocked app.getPath.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { ipcMain } from 'electron'
import fs from 'fs'
import { makeRegistry, invoke, resetDb, type IpcRegistry } from './ipcTestUtils'

const { testDb, tmpDir } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required inside hoisted scope (ESM imports not yet initialized)
  const Database = require('better-sqlite3')
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required inside hoisted scope
  const fs = require('fs')
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required inside hoisted scope
  const os = require('os')
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required inside hoisted scope
  const path = require('path')
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  return { testDb: db, tmpDir: fs.mkdtempSync(path.join(os.tmpdir(), 'doc-ipc-')) }
})

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { isPackaged: false, getPath: () => tmpDir, getAppPath: () => process.cwd() }
}))

vi.mock('../../db/database', () => ({ db: testDb, initDatabase: () => undefined }))

import { registerDocumentIpcHandlers } from '../documentIpc'
import { runMigrations } from '../../db/migrations'

// Reset domain data after every test so cases don't leak rows.
afterEach((): void => resetDb(testDb))

// Minimal valid magic-byte buffers for the whitelist. file-type@16 needs enough bytes
// to read the signature, so we pad with trailing zeros (content is irrelevant for detection).
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 0)
])
const PDF = Buffer.concat([
  Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]),
  Buffer.alloc(64, 0)
])
const TXT = Buffer.concat([Buffer.from('hello world'), Buffer.alloc(64, 0)]) // no whitelisted magic bytes

describe('documentIpc', () => {
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
    registerDocumentIpcHandlers()
  })

  afterEach(() => {
    // Clean any files (and the documents/ subdir) written under tmpDir.
    fs.rmSync(tmpDir, { recursive: true, force: true })
    fs.mkdirSync(tmpDir, { recursive: true })
  })

  async function seedProperty(): Promise<number> {
    return testDb
      .prepare(
        `INSERT INTO properties (code, name, type, country, currency, status, monthly_rent_default)
         VALUES ('P-DOC', 'Test Property', 'apartment', 'JO', 'JOD', 'vacant', 0)`
      )
      .run().lastInsertRowid as number
  }

  it('rejects an upload with a non-whitelisted MIME type', async () => {
    const propertyId = await seedProperty()
    await expect(
      invoke(registry, 'documents:upload', {
        entity_type: 'property',
        entity_id: propertyId,
        file_name: 'notes.txt',
        file_buffer: TXT
      })
    ).rejects.toThrow('INVALID_MIME_TYPE')
  })

  it('accepts a valid PNG upload, writes the file and inserts metadata atomically', async () => {
    const propertyId = await seedProperty()
    const res = (await invoke(registry, 'documents:upload', {
      entity_type: 'property',
      entity_id: propertyId,
      file_name: 'scan.png',
      file_buffer: PNG
    })) as { id: number; mime_type: string }

    expect(res.id).toBeGreaterThan(0)

    const row = testDb
      .prepare('SELECT id, mime_type, entity_id, file_path FROM documents WHERE id = ?')
      .get(res.id) as { mime_type: string; entity_id: number; file_path: string }
    expect(row.mime_type).toBe('image/png')
    expect(row.entity_id).toBe(propertyId)
    expect(fs.existsSync(row.file_path)).toBe(true)
  })

  it('accepts a valid PDF upload', async () => {
    const propertyId = await seedProperty()
    const res = (await invoke(registry, 'documents:upload', {
      entity_type: 'property',
      entity_id: propertyId,
      file_name: 'contract.pdf',
      file_buffer: PDF
    })) as { id: number }
    expect(res.id).toBeGreaterThan(0)
    const count = testDb.prepare('SELECT COUNT(*) AS c FROM documents').get() as { c: number }
    expect(count.c).toBe(1)
  })

  it('rejects upload with missing entity_id before writing any file', async () => {
    await expect(
      invoke(registry, 'documents:upload', {
        entity_type: 'property',
        entity_id: undefined,
        file_name: 'scan.png',
        file_buffer: PNG
      })
    ).rejects.toThrow()
    // No orphan file should have been written because validation runs before disk write.
    expect(fs.readdirSync(tmpDir).length).toBe(0)
  })

  it('deletes a document: removes DB row then unlinks the file', async () => {
    const propertyId = await seedProperty()
    const up = (await invoke(registry, 'documents:upload', {
      entity_type: 'property',
      entity_id: propertyId,
      file_name: 'scan.png',
      file_buffer: PNG
    })) as { id: number }

    const del = (await invoke(registry, 'documents:delete', up.id)) as { success: boolean }
    expect(del.success).toBe(true)
    const row = testDb.prepare('SELECT id FROM documents WHERE id = ?').get(up.id)
    expect(row).toBeUndefined()
  })

  it('returns an error when deleting a non-existent document', async () => {
    await expect(invoke(registry, 'documents:delete', 9999)).rejects.toThrow('DOCUMENT_NOT_FOUND')
  })
})
