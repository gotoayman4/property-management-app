/**
 * INTENT: Document IPC — upload (magic-byte MIME validated), list, read, replace,
 *         soft-delete, and hard-purge. Files live on disk; only metadata is in the DB.
 * CONSTRAINT (AGENTS.md / NFR-SEC-04 / BR-26): file-type@16.5.4 inspects the buffer's
 *             magic bytes. The client-supplied Content-Type / file extension is NEVER trusted.
 * CONSTRAINT (FR-DOC-03): allowed MIME types are PDF, JPG, PNG, DOCX, XLSX. Max 10 MB.
 * CONSTRAINT (BR-27 / FR-DOC-06/07): delete is a soft-delete (is_archived=1) — the file
 *             remains on disk and the row is retained for recovery. Replace archives the
 *             old version and links it to the new one via replaced_by.
 * CONSTRAINT (AGENTS.md): all DB queries parameterized; multi-step writes atomic.
 */
import { existsSync, mkdirSync, writeFileSync, unlinkSync, readFileSync } from 'fs'
import { join, basename } from 'path'
import { ipcMain, app } from 'electron'
import { fromBuffer } from 'file-type'
import { z } from 'zod'
import { db } from '../db/database'

// FR-DOC-03 / SRS §9.11: PDF, JPG, PNG, DOCX, XLSX.
// file-type@16.5.4 returns the long OOXML MIME types for Office files.
const ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' // .xlsx
])

// SRS §9.11 validation: 10 MB hard cap per uploaded file.
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024

// SRS §8.2 / FR-DOC-02 document_type values (used by property documents; other entity
// types may pass 'other' or any of these).
const DOCUMENT_TYPES = [
  'deed',
  'insurance_policy',
  'utility_contract',
  'maintenance_record',
  'municipal_permit',
  'id_copy',
  'signed_contract',
  'addendum',
  'image',
  'other'
] as const

const uploadSchema = z.object({
  entity_type: z.enum(['property', 'tenant', 'contract', 'expense']),
  entity_id: z.number().int().positive(),
  file_name: z.string().min(1).max(255),
  file_buffer: z.instanceof(Uint8Array),
  description: z.string().max(500).optional(),
  document_type: z.enum(DOCUMENT_TYPES).default('other'),
  issue_date: z.string().optional(),
  expiry_date: z.string().optional()
})

const listSchema = z.object({
  entity_type: z.enum(['property', 'tenant', 'contract', 'expense']),
  entity_id: z.number().int().positive(),
  include_archived: z.boolean().default(false)
})

const idSchema = z.number().int().positive()

const replaceSchema = z.object({
  old_document_id: z.number().int().positive(),
  file_name: z.string().min(1).max(255),
  file_buffer: z.instanceof(Uint8Array),
  description: z.string().max(500).optional(),
  document_type: z.enum(DOCUMENT_TYPES).default('other'),
  issue_date: z.string().optional(),
  expiry_date: z.string().optional()
})

function getDocumentsDir(): string {
  const dir = join(app.getPath('userData'), 'documents')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

/**
 * Resolves file_path, falling back to userData/documents if the original path doesn't exist.
 */
export function resolveFilePath(filePath: string): string {
  if (filePath && existsSync(filePath)) {
    return filePath
  }
  const fallback = join(getDocumentsDir(), basename(filePath))
  if (existsSync(fallback)) {
    return fallback
  }
  return filePath
}

/** Throws a typed Error with a machine-readable code (NFR-SEC-07) when validation fails. */
async function assertAcceptedFile(buffer: Uint8Array): Promise<{ mime: string; size: number }> {
  if (buffer.byteLength === 0) {
    throw new Error('FILE_EMPTY')
  }
  if (buffer.byteLength > MAX_FILE_SIZE_BYTES) {
    throw new Error('FILE_TOO_LARGE')
  }
  // file-type@16.5.4 fromBuffer returns a Promise (it streams the buffer through a tokenizer).
  const detected = await fromBuffer(Buffer.from(buffer))
  if (!detected || !ALLOWED_MIMES.has(detected.mime)) {
    throw new Error('INVALID_MIME_TYPE')
  }
  return { mime: detected.mime, size: buffer.byteLength }
}

function persistDocumentRow(row: {
  entity_type: string
  entity_id: number
  file_name: string
  file_path: string
  mime_type: string
  file_size: number
  description: string | null
  document_type: string
  issue_date: string | null
  expiry_date: string | null
}): number {
  const result = db
    .prepare(
      `INSERT INTO documents
       (entity_type, entity_id, file_name, file_path, mime_type, file_size, description,
        document_type, issue_date, expiry_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      row.entity_type,
      row.entity_id,
      row.file_name,
      row.file_path,
      row.mime_type,
      row.file_size,
      row.description,
      row.document_type,
      row.issue_date,
      row.expiry_date
    )
  return Number(result.lastInsertRowid)
}

export function registerDocumentIpcHandlers(): void {
  // Upload a new document (FR-DOC-02/03). Validates MIME by magic bytes + size cap.
  ipcMain.handle('documents:upload', async (_, data: unknown) => {
    try {
      const parsed = uploadSchema.parse(data)
      const { mime, size } = await assertAcceptedFile(parsed.file_buffer)

      const docsDir = getDocumentsDir()
      const timestamp = Date.now()
      const safeName = parsed.file_name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const filePath = join(docsDir, `${timestamp}_${safeName}`)

      // Write file to disk first; persist metadata in a transaction. If the DB insert
      // fails, remove the orphaned file so disk and DB never diverge (AGENTS atomicity).
      writeFileSync(filePath, Buffer.from(parsed.file_buffer))
      try {
        const id = db.transaction(() =>
          persistDocumentRow({
            entity_type: parsed.entity_type,
            entity_id: parsed.entity_id,
            file_name: parsed.file_name,
            file_path: filePath,
            mime_type: mime,
            file_size: size,
            description: parsed.description ?? null,
            document_type: parsed.document_type,
            issue_date: parsed.issue_date ?? null,
            expiry_date: parsed.expiry_date ?? null
          })
        )()
        return { id, mime_type: mime }
      } catch (dbError) {
        if (existsSync(filePath)) unlinkSync(filePath)
        throw dbError
      }
    } catch (error: unknown) {
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      if (
        error instanceof Error &&
        ['INVALID_MIME_TYPE', 'FILE_TOO_LARGE', 'FILE_EMPTY'].includes(error.message)
      ) {
        throw error
      }
      throw new Error('FAILED_TO_UPLOAD_DOCUMENT')
    }
  })

  // Replace a document with a new version (FR-DOC-06). Old version is archived
  // (is_archived=1, file kept on disk) and points at the new one via replaced_by.
  ipcMain.handle('documents:replace', async (_, data: unknown) => {
    try {
      const parsed = replaceSchema.parse(data)
      const { mime, size } = await assertAcceptedFile(parsed.file_buffer)

      const oldDoc = db
        .prepare('SELECT entity_type, entity_id FROM documents WHERE id = ?')
        .get(parsed.old_document_id) as { entity_type: string; entity_id: number } | undefined
      if (!oldDoc) throw new Error('DOCUMENT_NOT_FOUND')

      const docsDir = getDocumentsDir()
      const timestamp = Date.now()
      const safeName = parsed.file_name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const filePath = join(docsDir, `${timestamp}_${safeName}`)

      writeFileSync(filePath, Buffer.from(parsed.file_buffer))
      try {
        // Atomic: insert the new version, then archive + link the old one. If either
        // step fails, both roll back and the orphaned file is removed.
        const newId = db.transaction(() => {
          const id = persistDocumentRow({
            entity_type: oldDoc.entity_type,
            entity_id: oldDoc.entity_id,
            file_name: parsed.file_name,
            file_path: filePath,
            mime_type: mime,
            file_size: size,
            description: parsed.description ?? null,
            document_type: parsed.document_type,
            issue_date: parsed.issue_date ?? null,
            expiry_date: parsed.expiry_date ?? null
          })
          db.prepare(`UPDATE documents SET is_archived = 1, replaced_by = ? WHERE id = ?`).run(
            id,
            parsed.old_document_id
          )
          return id
        })()
        return { id: newId, mime_type: mime }
      } catch (dbError) {
        if (existsSync(filePath)) unlinkSync(filePath)
        throw dbError
      }
    } catch (error: unknown) {
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      if (
        error instanceof Error &&
        ['INVALID_MIME_TYPE', 'FILE_TOO_LARGE', 'FILE_EMPTY', 'DOCUMENT_NOT_FOUND'].includes(
          error.message
        )
      ) {
        throw error
      }
      throw new Error('FAILED_TO_REPLACE_DOCUMENT')
    }
  })

  // List documents for an entity (FR-DOC-01). Archived versions hidden by default.
  ipcMain.handle('documents:list', async (_, data: unknown) => {
    try {
      const parsed = listSchema.parse(data)
      const archivedClause = parsed.include_archived ? '' : 'AND is_archived = 0'
      return db
        .prepare(
          `SELECT id, entity_type, entity_id, file_name, mime_type, file_size,
                  description, document_type, issue_date, expiry_date, is_archived,
                  replaced_by, uploaded_at
           FROM documents
           WHERE entity_type = ? AND entity_id = ? ${archivedClause}
           ORDER BY uploaded_at DESC`
        )
        .all(parsed.entity_type, parsed.entity_id)
    } catch (error: unknown) {
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      throw new Error('FAILED_TO_LIST_DOCUMENTS')
    }
  })

  // Get a single document's metadata.
  ipcMain.handle('documents:get', async (_, data: unknown) => {
    try {
      const id = idSchema.parse(data)
      return db.prepare('SELECT * FROM documents WHERE id = ?').get(id)
    } catch (error: unknown) {
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      throw new Error('FAILED_TO_GET_DOCUMENT')
    }
  })

  // Read file contents as base64 for in-app preview (FR-DOC-04).
  ipcMain.handle('documents:read', async (_, data: unknown) => {
    try {
      const id = idSchema.parse(data)
      const doc = db.prepare('SELECT file_path, mime_type FROM documents WHERE id = ?').get(id) as
        { file_path: string; mime_type: string } | undefined

      if (!doc) {
        throw new Error('FILE_NOT_FOUND')
      }
      const actualPath = resolveFilePath(doc.file_path)
      if (!existsSync(actualPath)) {
        throw new Error('FILE_NOT_FOUND')
      }
      const buffer = readFileSync(actualPath)
      return { data: buffer.toString('base64'), mime_type: doc.mime_type }
    } catch (error: unknown) {
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      if (error instanceof Error && error.message === 'FILE_NOT_FOUND') throw error
      throw new Error('FAILED_TO_READ_DOCUMENT')
    }
  })

  // Soft-delete (archive) a document (FR-DOC-07, BR-27). The file stays on disk.
  ipcMain.handle('documents:delete', async (_, data: unknown) => {
    try {
      const id = idSchema.parse(data)
      const result = db
        .prepare('UPDATE documents SET is_archived = 1 WHERE id = ? AND is_archived = 0')
        .run(id)
      if (result.changes === 0) {
        // Either the row doesn't exist or it's already archived.
        const existing = db.prepare('SELECT 1 FROM documents WHERE id = ?').get(id)
        if (!existing) throw new Error('DOCUMENT_NOT_FOUND')
      }
      return { success: true }
    } catch (error: unknown) {
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      if (error instanceof Error && error.message === 'DOCUMENT_NOT_FOUND') throw error
      throw new Error('FAILED_TO_DELETE_DOCUMENT')
    }
  })

  // Admin-only hard purge: physically remove an archived document's file + row.
  // Not exposed in the standard UI; intended for an admin/data-management action.
  ipcMain.handle('documents:purge', async (_, data: unknown) => {
    try {
      const id = idSchema.parse(data)
      const doc = db
        .prepare('SELECT file_path, is_archived FROM documents WHERE id = ?')
        .get(id) as { file_path: string; is_archived: number } | undefined
      if (!doc) throw new Error('DOCUMENT_NOT_FOUND')
      if (!doc.is_archived) {
        // Guardrail: never hard-purge an active (non-archived) document.
        throw new Error('DOCUMENT_NOT_ARCHIVED')
      }

      const actualPath = resolveFilePath(doc.file_path)
      db.transaction(() => {
        db.prepare('DELETE FROM documents WHERE id = ?').run(id)
      })()
      if (existsSync(actualPath)) unlinkSync(actualPath)
      return { success: true }
    } catch (error: unknown) {
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      if (
        error instanceof Error &&
        ['DOCUMENT_NOT_FOUND', 'DOCUMENT_NOT_ARCHIVED'].includes(error.message)
      ) {
        throw error
      }
      throw new Error('FAILED_TO_PURGE_DOCUMENT')
    }
  })
}
