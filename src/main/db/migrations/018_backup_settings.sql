-- Add backup retention settings columns
-- FR-BAK-04: Retain a set number of backups (default 10)
ALTER TABLE settings ADD COLUMN max_backup_count INTEGER NOT NULL DEFAULT 10;
