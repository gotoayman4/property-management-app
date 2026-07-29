-- Migration 033: Rent Dues Schedule Engine (receivables model).
-- INTENT:
--   Materialize the *expected* rent obligations of every contract as one row per billing
--   period (rent_dues), so the app can track arrears (what is owed vs. what was collected)
--   independently of the cash-basis ledger. This powers accurate overdue tracking, the
--   outstanding-balances report, and the migration workflow for users who adopt the app while
--   already carrying pre-existing contracts and accumulated debt.
--
-- CONSTRAINTS:
--   * Dues are RECEIVABLES, not cash events. Creating/settling/waiving a due NEVER writes a
--     ledger_entries row. The immutable cash-basis ledger (BR-20/21) stays untouched — only
--     real payments (payments + ledger, in one transaction) move money.
--   * rent_dues rows are mutable working documents (status + amount_paid change as payments
--     arrive), but are never hard-deleted: status transitions carry an audit note.
--   * due_payment_allocations records exactly how much of each payment was applied to each due
--     row, so a payment void can reverse its allocations precisely instead of guessing.
--
-- CAVEAT: 'settled_before_app' marks periods the owner collected on paper before adopting the
--         app (no ledger impact); 'waived' marks forgiven periods. Neither is real income.

-- 1. rent_dues — one expected obligation per contract per billing period.
CREATE TABLE IF NOT EXISTS rent_dues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL,
  property_id INTEGER NOT NULL,
  tenant_id INTEGER,                 -- denormalized (mirrors payments) for fast per-tenant arrears
  due_type TEXT NOT NULL CHECK(due_type IN ('rent', 'opening_balance')) DEFAULT 'rent',
  period_key TEXT NOT NULL,          -- YYYY-MM of the period start (or 'opening' for lump-sum)
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  due_date DATE NOT NULL,            -- when the period's rent becomes payable (= period_start)
  amount_due REAL NOT NULL,
  amount_paid REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL,            -- always the contract/property currency (BR-13)
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending', 'partial', 'paid', 'settled_before_app', 'waived')),
  status_reason TEXT,                -- required audit note for settle/waive transitions
  status_changed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (contract_id) REFERENCES contracts(id),
  FOREIGN KEY (property_id) REFERENCES properties(id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  UNIQUE(contract_id, due_type, period_key)
);
CREATE INDEX IF NOT EXISTS idx_rent_dues_contract ON rent_dues(contract_id);
CREATE INDEX IF NOT EXISTS idx_rent_dues_status_due ON rent_dues(status, due_date);
CREATE INDEX IF NOT EXISTS idx_rent_dues_tenant ON rent_dues(tenant_id);

-- 2. due_payment_allocations — how much of a payment was applied to a specific due row.
--    Enables exact reversal on payment void (subtract the recorded amounts, recompute status).
CREATE TABLE IF NOT EXISTS due_payment_allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  due_id INTEGER NOT NULL,
  payment_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (due_id) REFERENCES rent_dues(id),
  FOREIGN KEY (payment_id) REFERENCES payments(id)
);
CREATE INDEX IF NOT EXISTS idx_due_alloc_due ON due_payment_allocations(due_id);
CREATE INDEX IF NOT EXISTS idx_due_alloc_payment ON due_payment_allocations(payment_id);

-- 3. Widen notifications.notification_type + notification_templates.trigger_type enums with the
--    'arrears_summary' type (periodic aggregate arrears reminder for migrated pre-app debt).
--    SQLite cannot ALTER a CHECK in place, so both tables are rebuilt (12-step pattern, mirrors
--    migration 032), preserving all rows + indexes. Runs with foreign_keys OFF (migrations.ts).
CREATE TABLE IF NOT EXISTS notifications_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  notification_type TEXT NOT NULL CHECK(notification_type IN (
    'rent_due', 'overdue', 'arrears_summary', 'contract_expiry', 'escalation_upcoming',
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

CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(is_read, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(notification_type);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedup
  ON notifications(notification_type, entity_type, entity_id, COALESCE(due_date, ''));

CREATE TABLE IF NOT EXISTS notification_templates_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL CHECK(trigger_type IN (
    'rent_due', 'overdue', 'arrears_summary', 'contract_expiring', 'escalation_upcoming',
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

-- Seed default arrears_summary templates (ar / en / tr). FR-NOT-06.
-- Placeholders: {tenant_name} {property_name} {months_overdue} {total_outstanding}.
INSERT OR IGNORE INTO notification_templates (name, trigger_type, language, message_body) VALUES
('Arrears Summary', 'arrears_summary', 'ar', 'مرحباً {tenant_name}، لديك {months_overdue} فترة إيجار غير مسددة للعقار "{property_name}" بإجمالي {total_outstanding}. يرجى التواصل لتسوية المتأخرات.'),
('Arrears Summary', 'arrears_summary', 'en', 'Hello {tenant_name}, you have {months_overdue} unpaid rent periods for "{property_name}" totaling {total_outstanding}. Please get in touch to settle the arrears.'),
('Arrears Summary', 'arrears_summary', 'tr', 'Merhaba {tenant_name}, "{property_name}" için toplam {total_outstanding} tutarında {months_overdue} ödenmemiş kira döneminiz bulunmaktadır. Lütfen gecikmeleri kapatmak için iletişime geçin.');
