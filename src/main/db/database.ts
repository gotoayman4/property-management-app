import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { runMigrations } from './migrations'

const isDev = !app.isPackaged

let dbPath: string
if (isDev) {
  dbPath = join(app.getAppPath(), 'database.db')
} else {
  const userDataPath = app.getPath('userData')
  if (!existsSync(userDataPath)) {
    mkdirSync(userDataPath, { recursive: true })
  }
  dbPath = join(userDataPath, 'database.db')
}

// Open SQLite database connection
export const db = new Database(dbPath, {
  verbose: isDev ? console.log : undefined
})

// Enable WAL journal mode for performance and Foreign Key constraints for integrity
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

export function initDatabase(): void {
  console.log(`Database connected at: ${dbPath}`)
  runMigrations(db)
}
