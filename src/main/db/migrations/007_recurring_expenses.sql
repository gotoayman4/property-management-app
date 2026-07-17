-- Phase 6: Recurring Expenses (SRS §5.7, FR-REC-01 to FR-REC-06).
-- INTENT: Templates that generate expense entries on a schedule. Evaluation happens
--         in the main process on app startup; generated expenses link back to the
--         template via expenses.recurring_template_id.
-- CONSTRAINT: A template is inactive (is_active=0) when terminated. Generated expenses
--             are ordinary expense rows — no special treatment in the ledger.

CREATE TABLE IF NOT EXISTS recurring_expense_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER,              -- NULL for general (not property-linked) recurring expenses
  category_id INTEGER NOT NULL,
  description TEXT NOT NULL,         -- e.g. "Monthly maintenance — Building A"
  amount REAL NOT NULL,
  currency TEXT NOT NULL,            -- linked property's currency, or user-chosen for general
  frequency TEXT NOT NULL CHECK(frequency IN ('monthly', 'quarterly', 'semi_annual', 'annual')),
  day_of_month INTEGER NOT NULL DEFAULT 1,  -- day when the expense is due (1-28)
  start_date DATE NOT NULL,
  end_date DATE,                     -- NULL = no end (runs indefinitely until manually stopped)
  vendor_name TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_generated_date DATE,          -- last date an expense was generated from this template
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (property_id) REFERENCES properties(id),
  FOREIGN KEY (category_id) REFERENCES expense_categories(id)
);
CREATE INDEX IF NOT EXISTS idx_recurring_property ON recurring_expense_templates(property_id);
CREATE INDEX IF NOT EXISTS idx_recurring_active ON recurring_expense_templates(is_active);
