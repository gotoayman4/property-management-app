-- Extend tenants to match SRS §8 (Tenant Management / FR-TEN-01).
-- All new columns are nullable so existing tenant rows remain valid.
ALTER TABLE tenants ADD COLUMN preferred_language TEXT CHECK(preferred_language IN ('ar', 'tr', 'en'));
ALTER TABLE tenants ADD COLUMN emergency_contact_name TEXT;
ALTER TABLE tenants ADD COLUMN emergency_contact_phone TEXT;
ALTER TABLE tenants ADD COLUMN address TEXT;
ALTER TABLE tenants ADD COLUMN notes TEXT;

-- Backfill existing rows to the Arabic-first product default so the field is never NULL-ambiguous
-- for application logic that branches on preferred_language.
UPDATE tenants SET preferred_language = 'ar' WHERE preferred_language IS NULL;
