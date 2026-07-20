-- Phase 12 (addition): Company settings (company_name & company_logo).
-- INTENT: Allow storing base64 logo and company name so they appear on HTML/Excel report headers.

ALTER TABLE settings ADD COLUMN company_name TEXT DEFAULT NULL;
ALTER TABLE settings ADD COLUMN company_logo TEXT DEFAULT NULL;
