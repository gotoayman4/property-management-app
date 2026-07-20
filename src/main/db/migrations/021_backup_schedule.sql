-- FR-BAK-02: Interval-based scheduled backup configuration.
-- INTENT: Add columns to the settings singleton for enabling/configuring scheduled backups
--         while the app is running (not just on quit). The scheduler runs in the main process
--         and checks the current time against backup_time + backup_frequency every 60 seconds.
-- CAVEAT: backup_enabled defaults to 0 (off) to preserve existing on-quit-only behavior.

ALTER TABLE settings ADD COLUMN backup_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE settings ADD COLUMN backup_frequency TEXT NOT NULL DEFAULT 'daily'
  CHECK(backup_frequency IN ('daily', 'weekly'));
ALTER TABLE settings ADD COLUMN backup_time TEXT NOT NULL DEFAULT '23:00';
ALTER TABLE settings ADD COLUMN last_scheduled_backup_at DATETIME;
