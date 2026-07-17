-- Phase 7: Document Management (SRS §5.10, FR-DOC-01 to FR-DOC-08).
-- INTENT: Track uploaded document metadata. Files are stored on disk in the user-
--         configured backup/documents directory; only the path is recorded in DB.
-- CONSTRAINT (AGENTS.md): ALL file uploads validated via file-type@16.5.4 magic bytes.
-- CONSTRAINT: allowed MIME types are image/jpeg, image/png, application/pdf only.

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('property', 'tenant', 'contract', 'expense')),
  entity_id INTEGER NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,           -- absolute path on disk
  mime_type TEXT NOT NULL,           -- validated via magic bytes at upload time
  file_size INTEGER NOT NULL,        -- bytes
  description TEXT,
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_documents_entity ON documents(entity_type, entity_id);
