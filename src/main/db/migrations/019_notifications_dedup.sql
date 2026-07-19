-- Deduplicate notifications: keep only the oldest row per (type, entity, due_date).
-- CAVEAT: SQLite UNIQUE treats NULLs as distinct, so we COALESCE due_date to ''
--         in the index to ensure rows with NULL due_date also deduplicate.
DELETE FROM notifications
WHERE id NOT IN (
  SELECT MIN(id)
  FROM notifications
  GROUP BY notification_type, entity_type, entity_id, COALESCE(due_date, '')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedup
  ON notifications(notification_type, entity_type, entity_id, COALESCE(due_date, ''));
