import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach } from 'vitest'
import { runMigrations } from '../migrations'

/**
 * INTENT: Verify the 003 tenant-fields migration + national_id search (FR-TEN-01, FR-TEN-05).
 * CONSTRAINT: Per AGENTS — new code touching data persistence must include a regression test.
 */
describe('Tenant fields migration (003) + national_id search', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    runMigrations(db)
  })

  it('applies all migrations including 003 tenant fields', () => {
    const migrations = db.prepare('SELECT name FROM migrations ORDER BY id ASC').all()
    expect(migrations).toHaveLength(27)
    expect(migrations[2]).toEqual({ name: '003_tenant_fields.sql' })
  })

  it('adds the new SRS §8 columns to the tenants table', () => {
    const cols = db.prepare('PRAGMA table_info(tenants)').all() as { name: string }[]
    const names = cols.map((c) => c.name)
    expect(names).toContain('preferred_language')
    expect(names).toContain('emergency_contact_name')
    expect(names).toContain('emergency_contact_phone')
    expect(names).toContain('address')
    expect(names).toContain('notes')
  })

  it('rejects an invalid preferred_language via CHECK constraint', () => {
    expect(() =>
      db
        .prepare(
          "INSERT INTO tenants (code, fullname, phone, preferred_language) VALUES ('T-1', 'Jane', '+962', 'fr')"
        )
        .run()
    ).toThrow('CHECK constraint failed')
  })

  it('accepts a valid preferred_language and stores all new fields', () => {
    db.prepare(
      `INSERT INTO tenants (code, fullname, phone, preferred_language, emergency_contact_name,
                            emergency_contact_phone, address, notes)
       VALUES ('T-1', 'Jane Doe', '+962', 'tr', 'John', '+966', 'Amman', 'prefers Turkish')`
    ).run()

    const row = db.prepare('SELECT * FROM tenants WHERE code = ?').get('T-1') as {
      preferred_language: string
      emergency_contact_name: string
      address: string
      notes: string
    }
    expect(row.preferred_language).toBe('tr')
    expect(row.emergency_contact_name).toBe('John')
    expect(row.address).toBe('Amman')
    expect(row.notes).toBe('prefers Turkish')
  })

  it('finds a tenant by national_id substring (FR-TEN-05)', () => {
    db.prepare(
      `INSERT INTO tenants (code, fullname, phone, national_id) VALUES ('T-1', 'Jane', '+962', '999-123-456')`
    ).run()
    db.prepare(
      `INSERT INTO tenants (code, fullname, phone, national_id) VALUES ('T-2', 'Other', '+962', '888-000-000')`
    ).run()

    const found = db
      .prepare('SELECT * FROM tenants WHERE fullname LIKE ? OR national_id LIKE ?')
      .all('%123-456%', '%123-456%') as { code: string }[]
    expect(found).toHaveLength(1)
    expect(found[0].code).toBe('T-1')
  })
})
