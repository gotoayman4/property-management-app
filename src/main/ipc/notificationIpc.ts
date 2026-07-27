/**
 * @file notificationIpc — Notification IPC handlers and template CRUD.
 * INTENT: Registers IPC channels for notifications list, mark-as-read, clear, and template management.
 */
import { ipcMain } from 'electron'
import { z } from 'zod'
import { db } from '../db/database'
import { evaluateNotifications } from '../services/notificationEvaluator'
import {
  DEFAULT_TEMPLATES,
  type TriggerType,
  type TemplateLanguage,
  type TemplateRow
} from '../services/notificationTemplates'
import { logger } from '../utils/logger'

export { evaluateNotifications }

export function registerNotificationIpcHandlers(): void {
  ipcMain.handle('notifications:list', async (_, filters?: { unread_only?: boolean }) => {
    try {
      let query = `
        SELECT n.*, t.phone as tenant_phone, t.country_code as tenant_country_code
        FROM notifications n
        LEFT JOIN contracts c ON n.entity_type = 'contract' AND n.entity_id = c.id
        LEFT JOIN tenants t ON c.tenant_id = t.id
        WHERE 1=1`
      const params: (string | number)[] = []
      if (filters?.unread_only) {
        query += ' AND is_read = ?'
        params.push(0)
      }
      query += ' ORDER BY created_at DESC LIMIT 50'
      return db.prepare(query).all(...params)
    } catch {
      throw new Error('FAILED_TO_LIST_NOTIFICATIONS')
    }
  })

  ipcMain.handle('notifications:markRead', async (_, data: unknown) => {
    try {
      const id = z.number().int().positive().parse(data)
      const res = db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(id)
      return { success: res.changes > 0 }
    } catch {
      throw new Error('FAILED_TO_MARK_NOTIFICATION_READ')
    }
  })

  ipcMain.handle('notifications:markAllRead', async () => {
    try {
      db.prepare('UPDATE notifications SET is_read = 1 WHERE is_read = 0').run()
      return { success: true }
    } catch {
      throw new Error('FAILED_TO_MARK_ALL_NOTIFICATIONS_READ')
    }
  })

  ipcMain.handle('notifications:clearAll', async () => {
    try {
      db.prepare('DELETE FROM notifications').run()
      return { success: true }
    } catch {
      throw new Error('FAILED_TO_CLEAR_NOTIFICATIONS')
    }
  })

  ipcMain.handle('notifications:evaluate', async () => {
    try {
      evaluateNotifications()
      return { success: true }
    } catch (err) {
      logger.error('evaluateNotifications failed', err)
      throw new Error('FAILED_TO_EVALUATE_NOTIFICATIONS')
    }
  })

  // --- Notification Templates CRUD (FR-SET-08) ---

  ipcMain.handle('templates:list', async () => {
    try {
      return db
        .prepare('SELECT * FROM notification_templates ORDER BY trigger_type ASC, language ASC')
        .all() as TemplateRow[]
    } catch {
      throw new Error('FAILED_TO_LIST_TEMPLATES')
    }
  })

  ipcMain.handle(
    'templates:get',
    async (_, triggerType: TriggerType, language: TemplateLanguage) => {
      try {
        const row = db
          .prepare(
            `SELECT * FROM notification_templates
           WHERE trigger_type = ? AND language = ?
           LIMIT 1`
          )
          .get(triggerType, language) as TemplateRow | undefined
        return row ?? null
      } catch {
        throw new Error('FAILED_TO_GET_TEMPLATE')
      }
    }
  )

  const updateTemplateSchema = z.object({
    trigger_type: z.enum([
      'rent_due',
      'overdue',
      'contract_expiring',
      'escalation_upcoming',
      'recurring_expense_due',
      'document_expiring',
      'backup_failed'
    ]),
    language: z.enum(['ar', 'tr', 'en']),
    message_body: z.string().min(1)
  })

  ipcMain.handle('templates:update', async (_, data: unknown) => {
    try {
      const { trigger_type, language, message_body } = updateTemplateSchema.parse(data)
      const res = db
        .prepare(
          `UPDATE notification_templates
           SET message_body = ?, updated_at = CURRENT_TIMESTAMP
           WHERE trigger_type = ? AND language = ?`
        )
        .run(message_body, trigger_type, language)

      if (res.changes === 0) {
        db.prepare(
          `INSERT INTO notification_templates (name, trigger_type, language, message_body)
           VALUES (?, ?, ?, ?)`
        ).run(trigger_type, trigger_type, language, message_body)
      }
      return { success: true }
    } catch {
      throw new Error('FAILED_TO_UPDATE_TEMPLATE')
    }
  })

  ipcMain.handle('templates:resetDefaults', async () => {
    try {
      const insertOrUpdate = db.prepare(`
        INSERT INTO notification_templates (name, trigger_type, language, message_body)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(trigger_type, language) DO UPDATE SET
          message_body = excluded.message_body,
          updated_at = CURRENT_TIMESTAMP
      `)

      db.transaction(() => {
        for (const [triggerType, langMap] of Object.entries(DEFAULT_TEMPLATES)) {
          for (const [lang, defaultBody] of Object.entries(langMap)) {
            insertOrUpdate.run(triggerType, triggerType, lang, defaultBody)
          }
        }
      })()

      return { success: true }
    } catch {
      throw new Error('FAILED_TO_RESET_TEMPLATES')
    }
  })
}
