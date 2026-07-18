-- Phase 2B: Contract + Tenant status alignment with SRS §8.2 + §8.3.
-- INTENT:
--   * contracts.status: align enum to SRS values active/expired/renewing/cancelled.
--     Existing 'terminated' rows become 'cancelled'. 'draft' is RETAINED as a superset
--     value (in-progress contracts) — see ADR-002 D3. 'renewing' is added.
--   * contracts.deposit_status: NEW column (FR-INC-02 — held/returned/partially_forfeited/forfeited).
--   * tenants.phone_secondary: NEW column (FR-TEN-01 — second phone number).
--   * tenants.national_id: enforce uniqueness (SRS validation rule: unique if entered).
-- CONSTRAINT: SQLite cannot ALTER a CHECK constraint in place. The 12-step table-rebuild
--             procedure (sqlite.org/lang_altertable#otheralter) is used for contracts so
--             foreign keys, indexes, and data are preserved.
-- CAVEAT: This migration MUST run with foreign_keys OFF (the runner disables them around
--         each migration's transaction — see migrations.ts). The rebuild is wrapped in a
--         single transaction so a failure rolls back to the pre-migration state.

-- 1. contracts: rebuild with the aligned status enum + deposit_status column.
CREATE TABLE IF NOT EXISTS contracts_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_number TEXT UNIQUE NOT NULL,
  property_id INTEGER NOT NULL,
  tenant_id INTEGER NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  rent_amount REAL NOT NULL,
  currency TEXT NOT NULL,
  payment_frequency TEXT NOT NULL CHECK(payment_frequency IN ('monthly', 'quarterly', 'semi_annual', 'semi-annual', 'annual')) DEFAULT 'monthly',
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
  FOREIGN KEY (property_id) REFERENCES properties(id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

-- Map old status values to the new enum. 'terminated' -> 'cancelled'; others pass through.
INSERT INTO contracts_new (
  id, contract_number, property_id, tenant_id, start_date, end_date, rent_amount, currency,
  payment_frequency, security_deposit, deposit_status, status, notes, is_archived,
  contract_term_years, has_variable_escalation, annual_increase_percent,
  cancellation_reason, payment_method, created_at, updated_at
)
SELECT
  id, contract_number, property_id, tenant_id, start_date, end_date, rent_amount, currency,
  payment_frequency, security_deposit, NULL,
  CASE status WHEN 'terminated' THEN 'cancelled' ELSE status END,
  notes, is_archived, contract_term_years, has_variable_escalation, annual_increase_percent,
  cancellation_reason, payment_method, created_at, updated_at
FROM contracts;

DROP TABLE contracts;
ALTER TABLE contracts_new RENAME TO contracts;

-- Re-create indexes dropped with the old table.
CREATE INDEX IF NOT EXISTS idx_leases_property ON contracts(property_id);
CREATE INDEX IF NOT EXISTS idx_leases_tenant ON contracts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leases_status ON contracts(status);

-- 2. tenants: add phone_secondary column (FR-TEN-01).
ALTER TABLE tenants ADD COLUMN phone_secondary TEXT;

-- 3. tenants.national_id uniqueness. SQLite cannot add a UNIQUE constraint via ALTER on an
--    existing column, so dedupe first (keep the lowest-id row per national_id), then rebuild.
--    NULL national_ids are allowed multiple times (SRS: "unique if entered").
DELETE FROM tenants
WHERE national_id IS NOT NULL
  AND id NOT IN (
    SELECT MIN(id) FROM tenants
    WHERE national_id IS NOT NULL
    GROUP BY national_id
  );

CREATE TABLE IF NOT EXISTS tenants_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  fullname TEXT NOT NULL,
  national_id TEXT UNIQUE,
  phone TEXT NOT NULL,
  phone_secondary TEXT,
  email TEXT,
  type TEXT NOT NULL CHECK(type IN ('individual', 'company')) DEFAULT 'individual',
  company_reg_no TEXT,
  representative_name TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  preferred_language TEXT CHECK(preferred_language IN ('ar', 'tr', 'en')),
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  address TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO tenants_new (
  id, code, fullname, national_id, phone, phone_secondary, email, type, company_reg_no,
  representative_name, is_active, preferred_language, emergency_contact_name,
  emergency_contact_phone, address, notes, created_at, updated_at
)
SELECT
  id, code, fullname, national_id, phone, NULL, email, type, company_reg_no,
  representative_name, is_active, preferred_language, emergency_contact_name,
  emergency_contact_phone, address, notes, created_at, updated_at
FROM tenants;

DROP TABLE tenants;
ALTER TABLE tenants_new RENAME TO tenants;

CREATE INDEX IF NOT EXISTS idx_tenants_code ON tenants(code);
