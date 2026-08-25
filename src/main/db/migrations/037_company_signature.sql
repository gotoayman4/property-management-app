-- Company authorized-signature image (base64 data URL), shown on payment receipts
-- above the "Authorized Signature" line.
ALTER TABLE settings ADD COLUMN company_signature TEXT DEFAULT NULL;
