import { Database } from 'better-sqlite3'

// INTENT: Silence migration progress logs in production (AGENTS: no console.log in prod code).
// DECISION: Gate on NODE_ENV rather than electron's isDev so this module works identically
//           under Vitest (NODE_ENV=test) without importing electron.
const isVerbose = process.env['NODE_ENV'] !== 'production'

// Eagerly load all SQL migration files as raw strings at build time using Vite glob import
const migrationFiles = import.meta.glob('./migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>

export function runMigrations(db: Database): void {
  // Create migrations log table if not exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  // Sort migrations by filename
  const sortedMigrationNames = Object.keys(migrationFiles).sort()

  for (const path of sortedMigrationNames) {
    const filename = path.split('/').pop() || path
    const isApplied = db.prepare('SELECT 1 FROM migrations WHERE name = ?').get(filename)

    if (!isApplied) {
      if (isVerbose) console.warn(`Applying migration: ${filename}`)
      const sqlContent = migrationFiles[path]

      if (!sqlContent || typeof sqlContent !== 'string') {
        throw new Error(`Failed to load migration content for: ${filename}`)
      }

      // Execute SQL scripts inside an atomic transaction.
      // DECISION: foreign_keys are toggled OFF for the duration of each migration so the
      //   SQLite 12-step table-rebuild pattern (used when changing CHECK / UNIQUE
      //   constraints, e.g. migration 014) works correctly. The pragma is restored AFTER
      //   the transaction commits — turning FK ON inside the transaction triggers
      //   constraint checks on the in-progress rebuilt tables and causes spurious failures.
      db.pragma('foreign_keys = OFF')
      try {
        db.transaction(() => {
          db.exec(sqlContent)
          db.prepare('INSERT INTO migrations (name) VALUES (?)').run(filename)
        })()
      } finally {
        db.pragma('foreign_keys = ON')
      }

      if (isVerbose) console.warn(`Successfully applied migration: ${filename}`)
    }
  }
}
