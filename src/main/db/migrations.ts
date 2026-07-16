import { Database } from 'better-sqlite3'

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
      console.log(`Applying migration: ${filename}`)
      const sqlContent = migrationFiles[path]

      if (!sqlContent || typeof sqlContent !== 'string') {
        throw new Error(`Failed to load migration content for: ${filename}`)
      }

      // Execute SQL scripts inside an atomic transaction
      db.transaction(() => {
        db.exec(sqlContent)
        db.prepare('INSERT INTO migrations (name) VALUES (?)').run(filename)
      })()

      console.log(`Successfully applied migration: ${filename}`)
    }
  }
}
