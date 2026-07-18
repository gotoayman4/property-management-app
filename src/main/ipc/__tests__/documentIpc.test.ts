/**
 * INTENT: Tests for documentIpc handlers covering the security-critical MIME magic-byte
 *         validation (AGENTS: file-type@16.5.4) and the transactional upload/soft-delete/
 *         replace behaviour. Whitelist covers PDF/JPG/PNG/DOCX/XLSX (FR-DOC-03).
 * CONSTRAINT: Electron + db mocked. file-type is imported for real (works under node). Disk
 *             writes target a temp dir via mocked app.getPath.
 */
import fs from 'fs'
import { ipcMain } from 'electron'
// eslint-disable-next-line import-x/order -- vitest vi.mock pattern forces structural separation
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
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

import { runMigrations } from '../../db/migrations'
import { registerDocumentIpcHandlers } from '../documentIpc'
import { makeRegistry, invoke, resetDb, type IpcRegistry } from './ipcTestUtils'

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

// Real DOCX/XLSX are ZIP-based OOXML. file-type@16 identifies them by an entry whose name
// starts with `word/` (DOCX) or `xl/` (XLSX), so the fixture ZIP must contain that entry.
function crc32(buf: Buffer): number {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}
function u16(n: number): Buffer {
  return Buffer.from([n & 0xff, (n >>> 8) & 0xff])
}
function u32(n: number): Buffer {
  return Buffer.from([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff])
}
function makeZip(entries: Array<[string, string]>): Buffer {
  const parts: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const [name, content] of entries) {
    const nameBuf = Buffer.from(name, 'utf8')
    const data = Buffer.from(content, 'utf8')
    const crc = crc32(data)
    const local = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(nameBuf.length),
      u16(0),
      nameBuf,
      data
    ])
    parts.push(local)
    central.push(
      Buffer.concat([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0x0800),
        u16(0),
        u16(0),
        u16(0),
        u32(crc),
        u32(data.length),
        u32(data.length),
        u16(nameBuf.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        nameBuf
      ])
    )
    offset += local.length
  }
  const centralBuf = Buffer.concat(central)
  const endRec = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralBuf.length),
    u32(parts.reduce((s, p) => s + p.length, 0)),
    u16(0)
  ])
  return Buffer.concat([...parts, centralBuf, endRec])
}
const DOCX = makeZip([
  ['[Content_Types].xml', '<x/>'],
  ['word/document.xml', '<x/>']
])
const XLSX = makeZip([
  ['[Content_Types].xml', '<x/>'],
  ['xl/workbook.xml', '<x/>']
])

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

  it('accepts DOCX uploads (FR-DOC-03 whitelist includes Word documents)', async () => {
    const propertyId = await seedProperty()
    const res = (await invoke(registry, 'documents:upload', {
      entity_type: 'property',
      entity_id: propertyId,
      file_name: 'lease.docx',
      file_buffer: DOCX,
      document_type: 'signed_contract'
    })) as { mime_type: string; id: number }
    expect(res.mime_type).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
    const row = testDb.prepare('SELECT document_type FROM documents WHERE id = ?').get(res.id) as {
      document_type: string
    }
    expect(row.document_type).toBe('signed_contract')
  })

  it('accepts XLSX uploads (FR-DOC-03 whitelist includes Excel spreadsheets)', async () => {
    const propertyId = await seedProperty()
    const res = (await invoke(registry, 'documents:upload', {
      entity_type: 'property',
      entity_id: propertyId,
      file_name: 'report.xlsx',
      file_buffer: XLSX
    })) as { mime_type: string }
    expect(res.mime_type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  })

  it('rejects uploads exceeding the 10 MB size cap (FR-DOC-03)', async () => {
    const propertyId = await seedProperty()
    const oversized = Buffer.alloc(10 * 1024 * 1024 + 1, 0) // 1 byte over 10 MB
    // Prepend a valid PNG header so the rejection is from the size check, not MIME.
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(oversized)
    await expect(
      invoke(registry, 'documents:upload', {
        entity_type: 'property',
        entity_id: propertyId,
        file_name: 'big.png',
        file_buffer: oversized
      })
    ).rejects.toThrow('FILE_TOO_LARGE')
    // No file should have been written because the size check runs before disk write.
    expect(fs.readdirSync(tmpDir).length).toBe(0)
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

  it('soft-deletes (archives) a document: row + file are retained (BR-27, FR-DOC-07)', async () => {
    const propertyId = await seedProperty()
    const up = (await invoke(registry, 'documents:upload', {
      entity_type: 'property',
      entity_id: propertyId,
      file_name: 'scan.png',
      file_buffer: PNG
    })) as { id: number }

    const del = (await invoke(registry, 'documents:delete', up.id)) as { success: boolean }
    expect(del.success).toBe(true)
    // BR-27: the row is retained with is_archived=1; only hidden from default lists.
    const row = testDb.prepare('SELECT id, is_archived FROM documents WHERE id = ?').get(up.id) as {
      is_archived: number
    }
    expect(row.is_archived).toBe(1)
    // The file remains on disk for recovery.
    const filePath = (
      testDb.prepare('SELECT file_path FROM documents WHERE id = ?').get(up.id) as {
        file_path: string
      }
    ).file_path
    expect(fs.existsSync(filePath)).toBe(true)
  })

  it('returns an error when deleting a non-existent document', async () => {
    await expect(invoke(registry, 'documents:delete', 9999)).rejects.toThrow('DOCUMENT_NOT_FOUND')
  })

  it('replaces a document: archives the old version + links it to the new one (FR-DOC-06)', async () => {
    const propertyId = await seedProperty()
    const original = (await invoke(registry, 'documents:upload', {
      entity_type: 'property',
      entity_id: propertyId,
      file_name: 'old.pdf',
      file_buffer: PDF
    })) as { id: number }

    const replacement = (await invoke(registry, 'documents:replace', {
      old_document_id: original.id,
      file_name: 'new.pdf',
      file_buffer: PDF
    })) as { id: number }

    const oldRow = testDb
      .prepare('SELECT is_archived, replaced_by FROM documents WHERE id = ?')
      .get(original.id) as { is_archived: number; replaced_by: number }
    expect(oldRow.is_archived).toBe(1)
    expect(oldRow.replaced_by).toBe(replacement.id)
    // The new version is active (not archived).
    const newRow = testDb
      .prepare('SELECT is_archived FROM documents WHERE id = ?')
      .get(replacement.id) as { is_archived: number }
    expect(newRow.is_archived).toBe(0)
  })
})
