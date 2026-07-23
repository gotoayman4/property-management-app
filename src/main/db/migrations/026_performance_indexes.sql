-- Migration 026: Add composite performance indexes for frequent query patterns.
-- INTENT: Accelerate list queries, filtering by property/tenant date ranges, and unread notification lookups.

CREATE INDEX IF NOT EXISTS idx_contracts_tenant_status ON contracts(tenant_id, status) WHERE is_archived = 0;
CREATE INDEX IF NOT EXISTS idx_payments_property_date ON payments(property_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_expenses_property_date ON expenses(property_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_ledger_property_date ON ledger_entries(property_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(is_read, created_at);
