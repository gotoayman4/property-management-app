-- Auto-download preference (VS Code-style update flow):
-- 1 = when a new release is detected, download it automatically in the background and
--     prompt the user to restart once it is verified; 0 = user must click Download manually.
-- Installation ALWAYS requires explicit user confirmation regardless of this flag.
ALTER TABLE settings ADD COLUMN auto_update_download INTEGER NOT NULL DEFAULT 1;
