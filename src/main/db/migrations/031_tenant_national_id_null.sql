-- INTENT: Normalize blank tenants.national_id values to NULL (bug fix).
-- CAVEAT: national_id is UNIQUE (migration 014). SQLite permits multiple NULLs but only
--         ONE '' — so a legacy row saved with an empty string blocks every subsequent
--         tenant created without a national ID ("UNIQUE constraint failed").
--         The IPC layer now writes NULL for blank input; this backfills existing rows.
UPDATE tenants SET national_id = NULL WHERE TRIM(COALESCE(national_id, '')) = '';
