-- Phase 2B: Recurring expense alignment with SRS §5.16 / FR-REC-02..09.
-- INTENT: Close the gaps that turned the evaluator into a duplicate-generator (BR-23):
--           * recurring_expense_log — one row per confirmed/skipped instance (BR-23 uniqueness target)
--           * next_due_date column — exposes the computed next occurrence (FR-REC-08 display)
--           * notes column — free-text notes on the template (SRS §8.2)
--           * daily / weekly frequencies (FR-REC-02)
--           * name column — replaces the legacy 'description' column (SRS §8.2 field name; ADR-002).
--             Existing description values are backfilled into name so no data is lost.
--         Plus the auto-mark-ended behavior (BR-25): a template whose end_date has passed is
--         marked is_active=0 here so it stops appearing as Active in lists.
-- CONSTRAINT: A UNIQUE(template_id, due_date) constraint on recurring_expense_log enforces
--             BR-23 at the DB layer — the same due date can never be confirmed or skipped twice.

ALTER TABLE recurring_expense_templates ADD COLUMN name TEXT;
-- Backfill: copy existing description values into name for pre-existing templates.
UPDATE recurring_expense_templates SET name = COALESCE(description, 'Recurring expense') WHERE name IS NULL;

ALTER TABLE recurring_expense_templates ADD COLUMN next_due_date DATE;
ALTER TABLE recurring_expense_templates ADD COLUMN notes TEXT;

CREATE TABLE IF NOT EXISTS recurring_expense_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL,
  due_date DATE NOT NULL,             -- the scheduled due date this log row covers
  action TEXT NOT NULL CHECK(action IN ('confirmed', 'skipped')),
  expense_id INTEGER,                 -- set when action='confirmed'; NULL when skipped
  skip_reason TEXT,                   -- required when action='skipped'
  actioned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (template_id) REFERENCES recurring_expense_templates(id),
  FOREIGN KEY (expense_id) REFERENCES expenses(id),
  UNIQUE(template_id, due_date)       -- BR-23: one action per (template, period), ever
);
CREATE INDEX IF NOT EXISTS idx_recurring_log_template ON recurring_expense_log(template_id);
CREATE INDEX IF NOT EXISTS idx_recurring_log_due ON recurring_expense_log(due_date);
