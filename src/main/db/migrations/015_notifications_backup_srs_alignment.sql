-- Phase 2B: Notification templates + backup log + notifications.status (SRS §8.2, FR-NOT-06, FR-BAK-07).
-- INTENT:
--   * notification_templates — per-language, per-trigger message bodies with {tenant_name},
--     {amount}, {due_date}, {property_name}, {document_type} placeholders (FR-NOT-06).
--     Seeded with sensible Arabic + English defaults so notifications are never raw English
--     literals again (NFR-I18N-02, BR-29).
--   * notifications.status — SRS requires pending/sent/dismissed; we add it as a nullable
--     column (NULL behaves like the historical 'pending' default) and add 'overdue' +
--     'recurring_expense_due' + 'backup_failed' notification types (FR-NOT-02/04/08).
--   * backup_log — record of every manual + automatic backup (FR-BAK-07).
-- CONSTRAINT: All new columns nullable/defaulted so existing rows stay valid.

-- 1. notification_templates
CREATE TABLE IF NOT EXISTS notification_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL CHECK(trigger_type IN (
    'rent_due', 'overdue', 'contract_expiring', 'escalation_upcoming',
    'recurring_expense_due', 'document_expiring', 'backup_failed'
  )),
  language TEXT NOT NULL CHECK(language IN ('ar', 'tr', 'en')),
  message_body TEXT NOT NULL,           -- contains {tenant_name} {amount} {due_date} {property_name} {document_type}
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(trigger_type, language)
);

-- 2. notifications: widen the type enum + add a status column.
--    SQLite CHECK on a column cannot be altered in place, so rebuild the table.
CREATE TABLE IF NOT EXISTS notifications_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  notification_type TEXT NOT NULL CHECK(notification_type IN (
    'rent_due', 'overdue', 'contract_expiry', 'escalation_upcoming',
    'document_expiry', 'recurring_expense_due', 'backup_failed'
  )),
  entity_type TEXT NOT NULL CHECK(entity_type IN ('property', 'tenant', 'contract', 'document', 'recurring_expense', 'backup')),
  entity_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  message_key TEXT,                      -- i18n key (BR-29): the human-readable body is resolved at display time
  message_vars TEXT,                     -- JSON object of placeholder values for the i18n key
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'sent', 'dismissed')),
  is_read INTEGER NOT NULL DEFAULT 0,
  read_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO notifications_new (
  id, notification_type, entity_type, entity_id, title, message, message_key, message_vars,
  due_date, status, is_read, read_at, created_at
)
SELECT
  id, notification_type, entity_type, entity_id, title, message, NULL, NULL,
  due_date, 'pending', is_read, read_at, created_at
FROM notifications;

DROP TABLE notifications;
ALTER TABLE notifications_new RENAME TO notifications;

CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(is_read, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(notification_type);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);

-- 3. backup_log
CREATE TABLE IF NOT EXISTS backup_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  backup_file_path TEXT NOT NULL,
  backup_type TEXT NOT NULL CHECK(backup_type IN ('manual', 'automatic', 'pre_restore')),
  file_size_kb INTEGER,
  checksum TEXT,                          -- SHA-256 hex digest (FR-BAK-06)
  is_verified INTEGER NOT NULL DEFAULT 0, -- set to 1 after restore integrity check passes
  status TEXT NOT NULL DEFAULT 'success' CHECK(status IN ('success', 'failed')),
  error_message TEXT,                     -- populated when status='failed'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_backup_log_created ON backup_log(created_at);

-- 4. Seed default notification templates (Arabic + English). FR-NOT-06.
--    Placeholders: {tenant_name} {amount} {due_date} {property_name} {document_type}.
INSERT OR IGNORE INTO notification_templates (name, trigger_type, language, message_body) VALUES
('Rent Due', 'rent_due', 'ar', 'مرحباً {tenant_name}، نذكّرك بأن إيجار العقار "{property_name}" بقيمة {amount} مستحق في {due_date}. شكراً لك.'),
('Rent Due', 'rent_due', 'en', 'Hello {tenant_name}, this is a reminder that rent of {amount} for "{property_name}" is due on {due_date}. Thank you.'),
('Overdue', 'overdue', 'ar', 'مرحباً {tenant_name}، إيجار العقار "{property_name}" بقيمة {amount} كان مستحقاً في {due_date}. يرجى السداد في أقرب وقت.'),
('Overdue', 'overdue', 'en', 'Hello {tenant_name}, the rent of {amount} for "{property_name}" was due on {due_date}. Please pay as soon as possible.'),
('Contract Expiring', 'contract_expiring', 'ar', 'عقد إيجار العقار "{property_name}" للعميل {tenant_name} سينتهي في {due_date}.'),
('Contract Expiring', 'contract_expiring', 'en', 'The lease contract for "{property_name}" ({tenant_name}) expires on {due_date}.'),
('Escalation Upcoming', 'escalation_upcoming', 'ar', 'سيتم تطبيق زيادة الإيجار الجديدة للعقد على العقار "{property_name}" ({tenant_name}) اعتباراً من {due_date}.'),
('Escalation Upcoming', 'escalation_upcoming', 'en', 'The next scheduled rent change for the contract on "{property_name}" ({tenant_name}) takes effect on {due_date}.'),
('Recurring Expense Due', 'recurring_expense_due', 'ar', 'المصروف المتكرر "{property_name}" المستحق في {due_date}.'),
('Recurring Expense Due', 'recurring_expense_due', 'en', 'The recurring expense "{property_name}" is due on {due_date}.'),
('Document Expiring', 'document_expiring', 'ar', 'المستند "{document_type}" للعقار "{property_name}" سينتهي في {due_date}.'),
('Document Expiring', 'document_expiring', 'en', 'The document "{document_type}" for "{property_name}" expires on {due_date}.'),
('Backup Failed', 'backup_failed', 'ar', 'فشل النسخ الاحتياطي في {due_date}. يرجى مراجعة إعدادات النسخ الاحتياطي.'),
('Backup Failed', 'backup_failed', 'en', 'Backup failed on {due_date}. Please review your backup settings.');
