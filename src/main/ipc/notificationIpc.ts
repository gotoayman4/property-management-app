/**
 * INTENT: Notification IPC — evaluate on startup (check rent due, contract expiry,
 *         document expiry, recurring expense due), list unread, mark read.
 * CONSTRAINT (AGENTS.md): all DB queries parameterized. No push notifications (offline-only).
 * CONSTRAINT: reminder thresholds come from settings table (FR-NOT-05).
 */
import { ipcMain } from 'electron'
import { db } from '../db/database'

export function evaluateNotifications(): void {
  const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() as {
    reminder_days_before_due: number
    reminder_days_before_contract_end: number
    reminder_days_before_document_expiry: number
    reminder_days_before_recurring_expense: number
  }

  const today = new Date()
  const fmt = (d: Date): string => d.toISOString().split('T')[0]
  const addDays = (d: Date, n: number): Date => {
    const r = new Date(d)
    r.setDate(r.getDate() + n)
    return r
  }

  const insert = db.prepare(
    `INSERT OR IGNORE INTO notifications (notification_type, entity_type, entity_id, title, message, due_date)
     VALUES (?, ?, ?, ?, ?, ?)`
  )

  const todayStr = fmt(today)

  // 1. Rent due — active contracts with rent due within reminder window
  const rentDueContracts = db
    .prepare(
      `SELECT c.id, c.end_date, p.name as property_name, t.fullname as tenant_name, c.rent_amount, c.currency
       FROM contracts c
       JOIN properties p ON c.property_id = p.id
       JOIN tenants t ON c.tenant_id = t.id
       WHERE c.status = 'active'`
    )
    .all() as Array<{
    id: number
    end_date: string
    property_name: string
    tenant_name: string
    rent_amount: number
    currency: string
  }>

  for (const contract of rentDueContracts) {
    // Generate a rent-due notification for the 1st of each month within the reminder window
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1)
    const rentDueDate = fmt(nextMonth)
    const reminderDate = addDays(nextMonth, -settings.reminder_days_before_due)

    if (todayStr >= fmt(reminderDate) && todayStr <= rentDueDate) {
      insert.run(
        'rent_due',
        'contract',
        contract.id,
        'rent_due_title',
        `Rent of ${contract.rent_amount} ${contract.currency} due for ${contract.property_name} (${contract.tenant_name})`,
        rentDueDate
      )
    }
  }

  // 2. Contract expiry
  const activeContracts = db
    .prepare(
      `SELECT c.id, c.end_date, p.name as property_name, t.fullname as tenant_name
       FROM contracts c
       JOIN properties p ON c.property_id = p.id
       JOIN tenants t ON c.tenant_id = t.id
       WHERE c.status = 'active' AND c.end_date IS NOT NULL`
    )
    .all() as Array<{
    id: number
    end_date: string
    property_name: string
    tenant_name: string
  }>

  for (const contract of activeContracts) {
    const expiryDate = new Date(contract.end_date)
    const reminderStart = addDays(expiryDate, -settings.reminder_days_before_contract_end)
    if (todayStr >= fmt(reminderStart) && todayStr <= contract.end_date) {
      insert.run(
        'contract_expiry',
        'contract',
        contract.id,
        'contract_expiry_title',
        `Contract for ${contract.property_name} (${contract.tenant_name}) expires on ${contract.end_date}`,
        contract.end_date
      )
    }
  }

  // 3. Document expiry (documents linked to entities — check if any entity has docs expiring)
  // Documents table doesn't have expiry dates in this schema; skip if no expiry column.
  // This evaluator will be extended when document expiry dates are added.

  // 4. Recurring expense due
  const activeTemplates = db
    .prepare(
      `SELECT id, description, amount, currency, day_of_month, frequency, last_generated_date
       FROM recurring_expense_templates WHERE is_active = 1`
    )
    .all() as Array<{
    id: number
    description: string
    amount: number
    currency: string
    day_of_month: number
    frequency: string
    last_generated_date: string | null
  }>

  for (const template of activeTemplates) {
    const nextDue = new Date(today.getFullYear(), today.getMonth(), template.day_of_month)
    if (nextDue < today) {
      nextDue.setMonth(nextDue.getMonth() + 1)
    }
    const reminderStart = addDays(nextDue, -settings.reminder_days_before_recurring_expense)
    if (todayStr >= fmt(reminderStart) && todayStr <= fmt(nextDue)) {
      insert.run(
        'recurring_expense_due',
        'recurring_expense',
        template.id,
        'recurring_expense_due_title',
        `Recurring expense "${template.description}" (${template.amount} ${template.currency}) due on ${fmt(nextDue)}`,
        fmt(nextDue)
      )
    }
  }
}

export function registerNotificationIpcHandlers(): void {
  // List all notifications (optionally unread only)
  ipcMain.handle('notifications:list', async (_, filters?: { unread_only?: boolean }) => {
    try {
      let query = 'SELECT * FROM notifications'
      if (filters?.unread_only) {
        query += ' WHERE is_read = 0'
      }
      query += ' ORDER BY created_at DESC LIMIT 50'
      return db.prepare(query).all()
    } catch {
      throw new Error('FAILED_TO_LIST_NOTIFICATIONS')
    }
  })

  // Get unread count for badge
  ipcMain.handle('notifications:unreadCount', async () => {
    try {
      const row = db
        .prepare('SELECT COUNT(*) as cnt FROM notifications WHERE is_read = 0')
        .get() as { cnt: number }
      return { count: row.cnt }
    } catch {
      throw new Error('FAILED_TO_COUNT_NOTIFICATIONS')
    }
  })

  // Mark a notification as read
  ipcMain.handle('notifications:markRead', async (_, id: number) => {
    try {
      db.prepare(
        'UPDATE notifications SET is_read = 1, read_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).run(id)
      return { success: true }
    } catch {
      throw new Error('FAILED_TO_MARK_READ')
    }
  })

  // Mark all as read
  ipcMain.handle('notifications:markAllRead', async () => {
    try {
      db.prepare(
        'UPDATE notifications SET is_read = 1, read_at = CURRENT_TIMESTAMP WHERE is_read = 0'
      ).run()
      return { success: true }
    } catch {
      throw new Error('FAILED_TO_MARK_ALL_READ')
    }
  })
}
