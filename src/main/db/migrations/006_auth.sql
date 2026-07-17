-- Phase 5: Authentication (AGENTS.md §Authentication, NFR-SEC-01).
-- INTENT: Add a users table for single-user offline authentication. The password
--         hash uses bcrypt via the application layer — SQLite never sees plaintext.
-- CONSTRAINT (NFR-SEC-01): the app requires authentication before any data access.
-- CONSTRAINT: This is a single-user desktop app — one admin account created on first launch.
-- CONSTRAINT: Session state is held in renderer memory only; no JWT or persisted token.

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login_at DATETIME
);
