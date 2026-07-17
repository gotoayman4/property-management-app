-- Phase 8: Notifications (SRS §5.11, FR-NOT-01 to FR-NOT-05).
-- INTENT: In-app notification system for rent due, contract expiry, document expiry,
--         and recurring expense generation reminders. Generated on app startup by
--         the evaluator; shown as a badge on the bell icon.
-- CONSTRAINT: Notifications are never pushed outside the app (offline-only, no network).
-- CONSTRAINT: read_at is NULL for unread notifications.

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  notification_type TEXT NOT NULL CHECK(notification_type IN (
    'rent_due', 'contract_expiry', 'document_expiry', 'recurring_expense_due'
  )),
  entity_type TEXT NOT NULL CHECK(entity_type IN ('property', 'tenant', 'contract', 'document', 'recurring_expense')),
  entity_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  due_date DATE,                   -- the date the notification refers to
  is_read INTEGER NOT NULL DEFAULT 0,
  read_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(is_read, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(notification_type);
