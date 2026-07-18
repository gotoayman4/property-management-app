-- Phase 2A: Document expiry and issue dates (FR-DOC-07, FR-NOT-04).
-- INTENT: Add expiry_date and issue_date to documents so the notification system can
--         evaluate approaching expirations and generate alerts.
-- DECISION: expiry_date is nullable — only passport/ID/Iqama documents typically have one.
--           issue_date is nullable for backward compatibility with existing uploads.

ALTER TABLE documents ADD COLUMN expiry_date TEXT;
ALTER TABLE documents ADD COLUMN issue_date TEXT;

CREATE INDEX IF NOT EXISTS idx_documents_expiry ON documents(expiry_date)
  WHERE expiry_date IS NOT NULL;
