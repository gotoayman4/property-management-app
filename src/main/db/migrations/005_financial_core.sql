-- Phase 4: Financial Core (SRS §5.5 Income, §5.6 Expenses, §5.15 Financial Ledger, §8.2 schema).
-- INTENT: Create the income/expense/ledger tables that make every monetary event
--         reconstructable from first principles. This migration is append-only and never
--         mutates any prior table.
-- CONSTRAINT (BR-20): ledger_entries is an immutable journal — no UPDATE/DELETE path exists
--             in application code; corrections use reversal/manual-adjustment rows only.
-- CONSTRAINT (BR-21): a payments/expenses row and its ledger row are written in ONE transaction.
-- CONSTRAINT (BR-13): every payment/expense records its linked property's currency at entry.

-- 1. Expense categories (default set from FR-EXP-02, stored as i18n keys per §8.2)
CREATE TABLE IF NOT EXISTS expense_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name_key TEXT UNIQUE NOT NULL,   -- e.g. 'expense.category.maintenance'; resolved via i18n, never raw text in UI
  is_default INTEGER NOT NULL DEFAULT 0
);

-- 2. Payments (income) — SRS §8.2
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER,             -- NULL for income not tied to a contract (other_income)
  property_id INTEGER NOT NULL,
  tenant_id INTEGER,               -- NULL for non-tenant income
  payment_type TEXT NOT NULL CHECK(payment_type IN ('rent', 'deposit', 'other_income')),
  payment_date DATE NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL,          -- always the linked property's currency at entry (BR-13)
  payment_method TEXT,             -- cash / bank_transfer / cheque / other
  receipt_number TEXT UNIQUE,      -- auto-generated, globally unique (BR-10)
  is_partial INTEGER NOT NULL DEFAULT 0,
  related_period_month TEXT,       -- e.g. '2026-07' — the month this payment covers
  notes TEXT,
  is_voided INTEGER NOT NULL DEFAULT 0,
  void_reason TEXT,                -- required when is_voided = 1
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (contract_id) REFERENCES contracts(id),
  FOREIGN KEY (property_id) REFERENCES properties(id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
CREATE INDEX IF NOT EXISTS idx_payments_property ON payments(property_id);
CREATE INDEX IF NOT EXISTS idx_payments_tenant ON payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payments_contract ON payments(contract_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date);

-- 3. Expenses — SRS §8.2
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER,             -- NULL for a general (not property-linked) expense (BR-11)
  category_id INTEGER NOT NULL,
  recurring_template_id INTEGER,   -- NULL for one-off expenses; set when generated from a recurring template
  expense_date DATE NOT NULL,
  vendor_name TEXT,
  amount REAL NOT NULL,
  currency TEXT NOT NULL,          -- linked property's currency, or user-chosen currency for general expenses
  notes TEXT,
  receipt_file_path TEXT,
  is_voided INTEGER NOT NULL DEFAULT 0,
  void_reason TEXT,                -- required when is_voided = 1
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (property_id) REFERENCES properties(id),
  FOREIGN KEY (category_id) REFERENCES expense_categories(id)
);
CREATE INDEX IF NOT EXISTS idx_expenses_property ON expenses(property_id);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);

-- 4. Financial Ledger — immutable journal (SRS §8.2, §5.15). The source of truth for all balances.
CREATE TABLE IF NOT EXISTS ledger_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_date DATE NOT NULL,
  entry_type TEXT NOT NULL CHECK(entry_type IN ('income', 'expense', 'income_void', 'expense_void', 'manual_adjustment')),
  reference_type TEXT,             -- 'payment' / 'expense' / 'recurring_expense' / 'manual'
  reference_id INTEGER,            -- id of the referenced payments/expenses row (NULL for manual)
  property_id INTEGER,             -- NULL for general (non-property-linked) expenses
  description TEXT NOT NULL,
  debit REAL NOT NULL DEFAULT 0,   -- amount flowing in (income, reversal of expense void)
  credit REAL NOT NULL DEFAULT 0,  -- amount flowing out (expense, reversal of income void)
  currency TEXT NOT NULL,          -- matches the source transaction's currency
  is_manual_adjustment INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (property_id) REFERENCES properties(id)
);
CREATE INDEX IF NOT EXISTS idx_ledger_property_date ON ledger_entries(property_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_ledger_reference ON ledger_entries(reference_type, reference_id);

-- 5. Seed default expense categories (FR-EXP-02). Stored as i18n keys — the UI resolves them.
INSERT OR IGNORE INTO expense_categories (name_key, is_default) VALUES
  ('expense.category.maintenance', 1),
  ('expense.category.electricity', 1),
  ('expense.category.water', 1),
  ('expense.category.municipality', 1),
  ('expense.category.taxes', 1),
  ('expense.category.insurance', 1),
  ('expense.category.cleaning', 1),
  ('expense.category.repairs', 1),
  ('expense.category.administrative', 1),
  ('expense.category.miscellaneous', 1);
