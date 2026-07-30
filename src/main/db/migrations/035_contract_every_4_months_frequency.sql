-- 035: Add 'every_4_months' to the contracts.payment_frequency CHECK enum.
-- INTENT: support contracts billed every 4 months (3 payments per year) alongside the
--         existing monthly/quarterly/semi-annual/annual frequencies.
-- CONSTRAINT: SQLite cannot ALTER a CHECK constraint in place, so the contracts table is
--             rebuilt (same 12-step procedure as migration 014). Columns added AFTER 014 —
--             auto_renew + auto_renew_increase_percent (032) and payment_due_day (034) —
--             are included so no data is lost.
-- CAVEAT: Must run with foreign_keys OFF (the migration runner disables them around each
--         migration's transaction — see migrations.ts). Indexes on contracts are dropped
--         with the old table and re-created below (014 + 026).

CREATE TABLE IF NOT EXISTS contracts_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_number TEXT UNIQUE NOT NULL,
  property_id INTEGER NOT NULL,
  tenant_id INTEGER NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  rent_amount REAL NOT NULL,
  currency TEXT NOT NULL,
  payment_frequency TEXT NOT NULL CHECK(payment_frequency IN ('monthly', 'quarterly', 'every_4_months', 'semi_annual', 'semi-annual', 'annual')) DEFAULT 'monthly',
  security_deposit REAL NOT NULL DEFAULT 0.0,
  deposit_status TEXT CHECK(deposit_status IN ('held', 'returned', 'partially_forfeited', 'forfeited')),
  status TEXT NOT NULL CHECK(status IN ('draft', 'active', 'expired', 'renewing', 'cancelled')) DEFAULT 'draft',
  notes TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0,
  contract_term_years INTEGER NOT NULL DEFAULT 1,
  has_variable_escalation INTEGER NOT NULL DEFAULT 0,
  annual_increase_percent REAL,
  cancellation_reason TEXT,
  payment_method TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  auto_renew INTEGER NOT NULL DEFAULT 0,
  auto_renew_increase_percent REAL,
  payment_due_day INTEGER NOT NULL DEFAULT 1 CHECK (payment_due_day BETWEEN 1 AND 31),
  FOREIGN KEY (property_id) REFERENCES properties(id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

INSERT INTO contracts_new (
  id, contract_number, property_id, tenant_id, start_date, end_date, rent_amount, currency,
  payment_frequency, security_deposit, deposit_status, status, notes, is_archived,
  contract_term_years, has_variable_escalation, annual_increase_percent,
  cancellation_reason, payment_method, created_at, updated_at,
  auto_renew, auto_renew_increase_percent, payment_due_day
)
SELECT
  id, contract_number, property_id, tenant_id, start_date, end_date, rent_amount, currency,
  payment_frequency, security_deposit, deposit_status, status, notes, is_archived,
  contract_term_years, has_variable_escalation, annual_increase_percent,
  cancellation_reason, payment_method, created_at, updated_at,
  auto_renew, auto_renew_increase_percent, payment_due_day
FROM contracts;

DROP TABLE contracts;
ALTER TABLE contracts_new RENAME TO contracts;

-- Re-create indexes dropped with the old table (014 + 026).
CREATE INDEX IF NOT EXISTS idx_leases_property ON contracts(property_id);
CREATE INDEX IF NOT EXISTS idx_leases_tenant ON contracts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leases_status ON contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_tenant_status ON contracts(tenant_id, status) WHERE is_archived = 0;
