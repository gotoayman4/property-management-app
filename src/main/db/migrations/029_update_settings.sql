-- Auto-update preference (ADR-003 §4 amendment: custom updater + GitHub Releases)
-- 1 = check for updates automatically on startup and every 4 hours; 0 = manual checks only.
ALTER TABLE settings ADD COLUMN auto_update_check INTEGER NOT NULL DEFAULT 1;
