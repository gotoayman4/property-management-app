-- Create tenants table
CREATE TABLE IF NOT EXISTS tenants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  fullname TEXT NOT NULL,
  national_id TEXT,
  phone TEXT NOT NULL,
  email TEXT,
  type TEXT NOT NULL CHECK(type IN ('individual', 'company')) DEFAULT 'individual',
  company_reg_no TEXT,
  representative_name TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create leases table
CREATE TABLE IF NOT EXISTS leases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_number TEXT UNIQUE NOT NULL,
  property_id INTEGER NOT NULL,
  tenant_id INTEGER NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  rent_amount REAL NOT NULL,
  currency TEXT NOT NULL,
  payment_frequency TEXT NOT NULL CHECK(payment_frequency IN ('monthly', 'quarterly', 'semi-annual', 'annual')) DEFAULT 'monthly',
  security_deposit REAL NOT NULL DEFAULT 0.0,
  status TEXT NOT NULL CHECK(status IN ('draft', 'active', 'expired', 'terminated')) DEFAULT 'draft',
  notes TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (property_id) REFERENCES properties(id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tenants_code ON tenants(code);
CREATE INDEX IF NOT EXISTS idx_leases_property ON leases(property_id);
CREATE INDEX IF NOT EXISTS idx_leases_tenant ON leases(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leases_status ON leases(status);
