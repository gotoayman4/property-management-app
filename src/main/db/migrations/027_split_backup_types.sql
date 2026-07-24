-- Split backup types into database-only and full (with documents).
-- INTENT: Since uploaded documents change rarely, backing them up on every backup is wasteful.
--         Database-only backups are fast (~1s); full backups include documents and run less often.
-- CONSTRAINT: Existing backup_log rows default to 'full' so they remain fully restorable.
--             On-quit and scheduled daily/weekly backups become database-only by default.

-- 1. Add backup_content column to backup_log (existing rows default to 'full')
ALTER TABLE backup_log ADD COLUMN backup_content TEXT NOT NULL DEFAULT 'full'
  CHECK(backup_content IN ('database-only', 'full'));

-- 2. Add full-backup schedule settings to the settings singleton
ALTER TABLE settings ADD COLUMN full_backup_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE settings ADD COLUMN full_backup_frequency TEXT NOT NULL DEFAULT 'monthly'
  CHECK(full_backup_frequency IN ('monthly', 'weekly'));
ALTER TABLE settings ADD COLUMN full_backup_time TEXT NOT NULL DEFAULT '02:00';
ALTER TABLE settings ADD COLUMN last_full_backup_at DATETIME;
