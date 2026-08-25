-- Name of the person authorized to sign receipts; printed under the signature image/line.
ALTER TABLE settings ADD COLUMN company_signer_name TEXT DEFAULT NULL;
