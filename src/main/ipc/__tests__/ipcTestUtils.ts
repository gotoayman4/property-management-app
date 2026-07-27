/**
 * INTENT: Shared harness for main-process IPC handler tests.
 *         Provides an in-memory SQLite db (migrated) and an ipcMain registry so handlers
 *         registered via ipcMain.handle can be invoked directly without Electron running.
 * CONSTRAINT: Tests run under Vitest `node` project. Electron is mocked by each test file;
 *             this util only owns the test db + registry plumbing.
 */
import Database from 'better-sqlite3'
import { runMigrations } from '../../db/migrations'

export interface IpcRegistry {
  [channel: string]: (event: unknown, data: unknown) => unknown
}

/** Create a fresh in-memory db with all migrations applied (FK enforced). */
export function makeDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  return db
}

/** Create an ipcMain.handle registry that captures handlers by channel name. */
export function makeRegistry(): IpcRegistry {
  const registry: IpcRegistry = {}
  return registry
}

/** Invoke a registered IPC handler exactly as Electron would (event arg is unused by handlers). */
export async function invoke(
  registry: IpcRegistry,
  channel: string,
  data?: unknown
): Promise<unknown> {
  const handler = registry[channel]
  if (!handler) throw new Error(`No handler registered for channel: ${channel}`)
  return handler(null, data)
}

/**
 * INTENT: Wipe all data between tests while keeping the migrated schema.
 * CONSTRAINT: FK enforcement is momentarily disabled so we can clear child tables
 *             regardless of order; it is re-enabled immediately after.
 */
export function resetDb(db: Database.Database): void {
  db.pragma('foreign_keys = OFF')
  // Drop immutability triggers temporarily so DELETE can clear ledger_entries during test cleanup.
  db.exec('DROP TRIGGER IF EXISTS ledger_immutable_no_update')
  db.exec('DROP TRIGGER IF EXISTS ledger_immutable_no_delete')
  const tables = db
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
         AND name NOT IN ('migrations', 'countries', 'settings', 'expense_categories')`
    )
    .all() as Array<{ name: string }>
  for (const { name } of tables) {
    db.prepare(`DELETE FROM ${name}`).run()
  }
  db.pragma('foreign_keys = ON')
  // Re-create immutability triggers after cleanup.
  db.exec(`CREATE TRIGGER IF NOT EXISTS ledger_immutable_no_update
    BEFORE UPDATE ON ledger_entries
    BEGIN SELECT RAISE(ABORT, 'Ledger entries are immutable. Use a reversal entry instead.'); END`)
  db.exec(`CREATE TRIGGER IF NOT EXISTS ledger_immutable_no_delete
    BEFORE DELETE ON ledger_entries
    BEGIN SELECT RAISE(ABORT, 'Ledger entries are immutable. Use a reversal entry instead.'); END`)
}
