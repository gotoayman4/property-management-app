-- Add optional authentication toggle (disabled by default).
ALTER TABLE settings ADD COLUMN require_auth INTEGER NOT NULL DEFAULT 0;
