/**
 * INTENT: Document IPC — upload (with magic-byte MIME validation), list, download, delete.
 *         Files are stored on disk; only the metadata path is in the database.
 * CONSTRAINT (AGENTS.md): file-type@16.5.4 for MIME validation. Only image/jpeg, image/png,
 *                         application/pdf allowed. Content-Type header is never trusted.
 * CONSTRAINT (AGENTS.md): all DB queries parameterized, no console.log in prod.
 */
import { ipcMain } from 'electron'
import { db } from '../db/database'
import { z } from 'zod'
import { join } from 'path'
import { existsSync, mkdirSync, writeFileSync, unlinkSync, readFileSync } from 'fs'
import { fromBuffer } from 'file-type'
import { app } from 'electron'

const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'application/pdf'])

const uploadSchema = z.object({
  entity_type: z.enum(['property', 'tenant', 'contract', 'expense']),
  entity_id: z.number().int().positive(),
  file_name: z.string().min(1).max(255),
  file_buffer: z.instanceof(Uint8Array),
  description: z.string().max(500).optional()
})

const listSchema = z.object({
  entity_type: z.enum(['property', 'tenant', 'contract', 'expense']),
  entity_id: z.number().int().positive()
})

function getDocumentsDir(): string {
  const dir = join(app.getPath('userData'), 'documents')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

export function registerDocumentIpcHandlers(): void {
  // Upload a document with MIME validation
  ipcMain.handle('documents:upload', async (_, data: unknown) => {
    try {
      const parsed = uploadSchema.parse(data)

      // AGENTS.md: validate MIME via magic bytes, never trust Content-Type header
      const detected = await fromBuffer(Buffer.from(parsed.file_buffer))
      if (!detected || !ALLOWED_MIMES.has(detected.mime)) {
        throw new Error('INVALID_MIME_TYPE')
      }

      const docsDir = getDocumentsDir()
      const timestamp = Date.now()
      const safeName = parsed.file_name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const filePath = join(docsDir, `${timestamp}_${safeName}`)

      // Write the file to disk first, then persist metadata in a single transaction.
      // AGENTS.md: multi-step writes must stay consistent — if the DB insert fails after the
      // file is written, remove the orphaned file so disk and DB never diverge.
      writeFileSync(filePath, Buffer.from(parsed.file_buffer))

      try {
        const insertRow = db.transaction(() => {
          return db
            .prepare(
              `INSERT INTO documents (entity_type, entity_id, file_name, file_path, mime_type, file_size, description)
               VALUES (?, ?, ?, ?, ?, ?, ?)`
            )
            .run(
              parsed.entity_type,
              parsed.entity_id,
              parsed.file_name,
              filePath,
              detected.mime,
              parsed.file_buffer.byteLength,
              parsed.description ?? null
            )
        })
        const result = insertRow()
        return { id: result.lastInsertRowid, mime_type: detected.mime }
      } catch (dbError: unknown) {
        // Roll back the on-disk file so we don't leave an orphan.
        if (existsSync(filePath)) unlinkSync(filePath)
        throw dbError
      }
    } catch (error: unknown) {
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      if (error instanceof Error && error.message === 'INVALID_MIME_TYPE') throw error
      throw new Error('FAILED_TO_UPLOAD_DOCUMENT')
    }
  })

  // List documents for an entity
  ipcMain.handle('documents:list', async (_, data: unknown) => {
    try {
      const parsed = listSchema.parse(data)
      return db
        .prepare(
          `SELECT id, entity_type, entity_id, file_name, mime_type, file_size, description, uploaded_at
           FROM documents WHERE entity_type = ? AND entity_id = ?
           ORDER BY uploaded_at DESC`
        )
        .all(parsed.entity_type, parsed.entity_id)
    } catch (error: unknown) {
      if (error instanceof z.ZodError) throw new Error('INVALID_INPUT')
      throw new Error('FAILED_TO_LIST_DOCUMENTS')
    }
  })

  // Get a single document metadata
  ipcMain.handle('documents:get', async (_, id: number) => {
    try {
      return db.prepare('SELECT * FROM documents WHERE id = ?').get(id)
    } catch {
      throw new Error('FAILED_TO_GET_DOCUMENT')
    }
  })

  // Read file contents (returns base64 for renderer display)
  ipcMain.handle('documents:read', async (_, id: number) => {
    try {
      const doc = db.prepare('SELECT file_path, mime_type FROM documents WHERE id = ?').get(id) as
        { file_path: string; mime_type: string } | undefined

      if (!doc || !existsSync(doc.file_path)) {
        throw new Error('FILE_NOT_FOUND')
      }

      const buffer = readFileSync(doc.file_path)
      return {
        data: buffer.toString('base64'),
        mime_type: doc.mime_type
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'FILE_NOT_FOUND') throw error
      throw new Error('FAILED_TO_READ_DOCUMENT')
    }
  })

  // Delete a document (both DB record and file)
  ipcMain.handle('documents:delete', async (_, id: number) => {
    try {
      const doc = db.prepare('SELECT file_path FROM documents WHERE id = ?').get(id) as
        { file_path: string } | undefined

      if (!doc) {
        throw new Error('DOCUMENT_NOT_FOUND')
      }

      // Remove the DB row first in a transaction; only then delete the on-disk file so a
      // crash mid-delete never leaves a dangling DB reference to a missing file.
      db.transaction(() => {
        db.prepare('DELETE FROM documents WHERE id = ?').run(id)
      })()

      if (existsSync(doc.file_path)) {
        unlinkSync(doc.file_path)
      }
      return { success: true }
    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'DOCUMENT_NOT_FOUND') throw error
      throw new Error('FAILED_TO_DELETE_DOCUMENT')
    }
  })
}
