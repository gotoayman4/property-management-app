-- Migration 032: Contract auto-renewal (opt-in) + new notification types.
-- INTENT:
--   * contracts.auto_renew — per-contract opt-in flag (0/1). When 1, the launch-time
--     autoRenewalService renews the contract in place once end_date passes.
--   * contracts.auto_renew_increase_percent — optional fixed yearly increase applied on each
--     auto-renewal (NULL => rent carries over unchanged). Flat-mode contracts only.
--   * notifications / notification_templates — add two types so auto-renewal is never silent:
--       - 'auto_renew_upcoming'   : expiring contract that WILL auto-renew (evaluator).
--       - 'contract_auto_renewed' : a contract that was just auto-renewed (service).
-- CONSTRAINT: SQLite cannot ALTER a CHECK constraint in place, so the notifications and
--             notification_templates tables are rebuilt via the 12-step table-rebuild pattern
--             (sqlite.org/lang_altertable#otheralter), preserving all data + indexes. Runs with
--             foreign_keys OFF inside a transaction (see migrations.ts).

-- 1. contracts: two new columns (simple ALTER — no CHECK change needed).
ALTER TABLE contracts ADD COLUMN auto_renew INTEGER NOT NULL DEFAULT 0;
ALTER TABLE contracts ADD COLUMN auto_renew_increase_percent REAL;

-- 2. notifications: widen the notification_type enum with the two auto-renew types.
CREATE TABLE IF NOT EXISTS notifications_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  notification_type TEXT NOT NULL CHECK(notification_type IN (
    'rent_due', 'overdue', 'contract_expiry', 'escalation_upcoming',
    'document_expiry', 'recurring_expense_due', 'backup_failed',
    'auto_renew_upcoming', 'contract_auto_renewed'
  )),
  entity_type TEXT NOT NULL CHECK(entity_type IN ('property', 'tenant', 'contract', 'document', 'recurring_expense', 'backup')),
  entity_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  message_key TEXT,
  message_vars TEXT,
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
  id, notification_type, entity_type, entity_id, title, message, message_key, message_vars,
  due_date, status, is_read, read_at, created_at
FROM notifications;

DROP TABLE notifications;
ALTER TABLE notifications_new RENAME TO notifications;

-- Re-create all notification indexes dropped with the old table (migrations 015, 019, 026).
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(is_read, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(notification_type);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedup
  ON notifications(notification_type, entity_type, entity_id, COALESCE(due_date, ''));

-- 3. notification_templates: widen the trigger_type enum with the two auto-renew types.
CREATE TABLE IF NOT EXISTS notification_templates_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL CHECK(trigger_type IN (
    'rent_due', 'overdue', 'contract_expiring', 'escalation_upcoming',
    'recurring_expense_due', 'document_expiring', 'backup_failed',
    'auto_renew_upcoming', 'contract_auto_renewed'
  )),
  language TEXT NOT NULL CHECK(language IN ('ar', 'tr', 'en')),
  message_body TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(trigger_type, language)
);

INSERT INTO notification_templates_new (id, name, trigger_type, language, message_body, created_at)
SELECT id, name, trigger_type, language, message_body, created_at
FROM notification_templates;

DROP TABLE notification_templates;
ALTER TABLE notification_templates_new RENAME TO notification_templates;

-- 4. Seed default templates for the two new trigger types (ar / en / tr). FR-NOT-06.
--    Placeholders: {tenant_name} {property_name} {due_date} {rent}.
INSERT OR IGNORE INTO notification_templates (name, trigger_type, language, message_body) VALUES
('Auto-renew Upcoming', 'auto_renew_upcoming', 'ar', 'عقد إيجار العقار "{property_name}" ({tenant_name}) سيتم تجديده تلقائياً في {due_date}.'),
('Auto-renew Upcoming', 'auto_renew_upcoming', 'en', 'The lease for "{property_name}" ({tenant_name}) will auto-renew on {due_date}.'),
('Auto-renew Upcoming', 'auto_renew_upcoming', 'tr', '"{property_name}" ({tenant_name}) adresindeki kira sözleşmesi {due_date} tarihinde otomatik olarak yenilenecektir.'),
('Contract Auto-renewed', 'contract_auto_renewed', 'ar', 'تم تجديد عقد إيجار العقار "{property_name}" ({tenant_name}) تلقائياً حتى {due_date} بقيمة {rent}.'),
('Contract Auto-renewed', 'contract_auto_renewed', 'en', 'The lease for "{property_name}" ({tenant_name}) was auto-renewed to {due_date} at {rent}.'),
('Contract Auto-renewed', 'contract_auto_renewed', 'tr', '"{property_name}" ({tenant_name}) adresindeki kira sözleşmesi {rent} tutarıyla {due_date} tarihine kadar otomatik olarak yenilendi.');
