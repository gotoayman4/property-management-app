-- Create countries table
CREATE TABLE IF NOT EXISTS countries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  default_currency TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 -- Boolean representation
);

-- Create properties table
CREATE TABLE IF NOT EXISTS properties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('apartment', 'shop')),
  country TEXT NOT NULL,
  currency TEXT NOT NULL,
  address TEXT,
  area_sqm REAL,
  status TEXT NOT NULL CHECK(status IN ('vacant', 'rented', 'maintenance')) DEFAULT 'vacant',
  monthly_rent_default REAL NOT NULL DEFAULT 0.0,
  notes TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0, -- Boolean representation
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (country) REFERENCES countries(code)
);

-- Create exchange_rates table
CREATE TABLE IF NOT EXISTS exchange_rates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  currency_from TEXT NOT NULL,
  currency_to TEXT NOT NULL,
  rate REAL NOT NULL,
  effective_date DATE NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('manual', 'online')),
  fetched_at DATETIME,
  entered_by_note TEXT,
  UNIQUE(currency_from, currency_to, effective_date)
);

-- Create settings table
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK(id = 1), -- Singleton enforce
  app_language TEXT NOT NULL DEFAULT 'ar' CHECK(app_language IN ('ar', 'en')),
  reporting_currency TEXT NOT NULL DEFAULT 'JOD',
  default_payment_method TEXT NOT NULL DEFAULT 'cash',
  backup_path TEXT,
  theme TEXT NOT NULL DEFAULT 'light' CHECK(theme IN ('light', 'dark')),
  font_size TEXT NOT NULL DEFAULT 'medium' CHECK(font_size IN ('small', 'medium', 'large')),
  date_format TEXT NOT NULL DEFAULT 'YYYY-MM-DD',
  reminder_days_before_due INTEGER NOT NULL DEFAULT 3,
  reminder_days_before_contract_end INTEGER NOT NULL DEFAULT 30,
  reminder_days_before_document_expiry INTEGER NOT NULL DEFAULT 30,
  reminder_days_before_recurring_expense INTEGER NOT NULL DEFAULT 3
);

-- Index frequently searched columns
CREATE INDEX IF NOT EXISTS idx_properties_code ON properties(code);
CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status);
CREATE INDEX IF NOT EXISTS idx_properties_country ON properties(country);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_lookup ON exchange_rates(currency_from, currency_to);

-- Pre-populate default active countries
INSERT OR IGNORE INTO countries (code, name, default_currency, is_active) VALUES 
('JO', 'Jordan', 'JOD', 1),
('TR', 'Turkey', 'TRY', 1),
('QA', 'Qatar', 'QAR', 1);

-- Pre-populate initial singleton settings
INSERT OR IGNORE INTO settings (
  id, app_language, reporting_currency, default_payment_method, 
  theme, font_size, date_format, 
  reminder_days_before_due, reminder_days_before_contract_end, 
  reminder_days_before_document_expiry, reminder_days_before_recurring_expense
) VALUES (
  1, 'ar', 'JOD', 'cash', 
  'light', 'medium', 'YYYY-MM-DD', 
  3, 30, 
  30, 3
);
