-- Align the lease/contract domain with SRS §8.
-- INTENT: Rename `leases` -> `contracts`, add the multi-year escalation + cancellation columns
--         (FR-CON-08, FR-CON-09..13), and create rent_escalation_schedule + contract_history.
-- CONSTRAINT: SQLite ALTER TABLE RENAME preserves data and indexes; foreign keys are ON.
-- CAVEAT: SQLite cannot add a CHECK-constrained NOT NULL column with a non-constant default in
--         a single ALTER, so contract_term_years / has_variable_escalation use a constant default.

-- 1. Rename the table to match the SRS entity name
ALTER TABLE leases RENAME TO contracts;

-- 2. Multi-year escalation toggle + term length (FR-CON-09)
ALTER TABLE contracts ADD COLUMN contract_term_years INTEGER NOT NULL DEFAULT 1;
ALTER TABLE contracts ADD COLUMN has_variable_escalation INTEGER NOT NULL DEFAULT 0;
-- Flat annual increase %, used ONLY when has_variable_escalation = 0 (BR-16)
ALTER TABLE contracts ADD COLUMN annual_increase_percent REAL;

-- 3. Cancellation capture (FR-CON-08). cancellation_date is not in the SRS schema; the
--    cancellation timestamp lives in contract_history.changed_at (action_type='cancelled').
ALTER TABLE contracts ADD COLUMN cancellation_reason TEXT;
ALTER TABLE contracts ADD COLUMN payment_method TEXT;

-- 4. Per-year rent schedule for multi-year contracts (SRS §8 — rent_escalation_schedule)
CREATE TABLE IF NOT EXISTS rent_escalation_schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL,
  year_number INTEGER NOT NULL,          -- 1..N within the term
  effective_start_date DATE NOT NULL,    -- anniversary date this year's rent takes effect
  rent_amount REAL NOT NULL,             -- the monthly rent for this year (source of truth)
  increase_percent_applied REAL,         -- informational: % applied vs previous year
  notes TEXT,
  FOREIGN KEY (contract_id) REFERENCES contracts(id),
  UNIQUE(contract_id, year_number)
);
CREATE INDEX IF NOT EXISTS idx_escalation_contract ON rent_escalation_schedule(contract_id);

-- 5. Contract amendment/renewal/cancellation audit trail (SRS §8 — contract_history)
CREATE TABLE IF NOT EXISTS contract_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL,
  action_type TEXT NOT NULL CHECK(action_type IN ('created', 'renewed', 'amended', 'cancelled')),
  previous_values_json TEXT,             -- JSON snapshot of values before the change
  changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  changed_by_note TEXT,
  FOREIGN KEY (contract_id) REFERENCES contracts(id)
);
CREATE INDEX IF NOT EXISTS idx_history_contract ON contract_history(contract_id);
