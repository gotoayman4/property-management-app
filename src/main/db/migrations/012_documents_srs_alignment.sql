-- Phase 2B: Document vault alignment with SRS §5.17 / §9.11 / FR-DOC-02..07.
-- INTENT: Bring the unified `documents` table (see ADR-002 D1) up to SRS coverage:
--           * document_type classification (deed / insurance_policy / utility_contract / ...)
--           * is_archived soft-delete marker (BR-27 — archived docs keep file on disk)
--           * replaced_by linking so a replaced document points at its successor (FR-DOC-06)
-- CONSTRAINT: All columns are nullable / defaulted so existing rows remain valid.
-- CAVEAT: SQLite cannot add a column with a non-constant DEFAULT in a single ALTER, so
--         is_archived uses a constant default and document_type is nullable.

ALTER TABLE documents ADD COLUMN document_type TEXT;
ALTER TABLE documents ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;
ALTER TABLE documents ADD COLUMN replaced_by INTEGER;  -- FK -> documents.id (NULL until replaced)

CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(document_type)
  WHERE document_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_archived ON documents(is_archived);
