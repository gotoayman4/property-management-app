import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach } from 'vitest'
import { runMigrations } from '../migrations'

describe('Database Schema & Properties SQL Queries', () => {
  let db: Database.Database

  beforeEach(() => {
    // Initialize a fresh, isolated in-memory SQLite database for each test
    db = new Database(':memory:')
    // Enable foreign keys
    db.pragma('foreign_keys = ON')
    // Run the migrations
    runMigrations(db)
  })

  describe('Migrations & Initial Data', () => {
    it('should create the migrations log table and record migrations', () => {
      const migrations = db.prepare('SELECT * FROM migrations ORDER BY id ASC').all()
      expect(migrations.length).toBe(30)
      expect(migrations[0]).toMatchObject({
        name: '001_initial_schema.sql'
      })
      expect(migrations[1]).toMatchObject({
        name: '002_tenant_lease_schema.sql'
      })
      expect(migrations[4]).toMatchObject({
        name: '005_financial_core.sql'
      })
    })

    it('should pre-populate default active countries', () => {
      const countries = db.prepare('SELECT * FROM countries ORDER BY code').all()
      expect(countries.length).toBe(3)
      expect(countries[0]).toMatchObject({
        code: 'JO',
        name: 'Jordan',
        default_currency: 'JOD',
        is_active: 1
      })
      expect(countries[1]).toMatchObject({
        code: 'QA',
        name: 'Qatar',
        default_currency: 'QAR',
        is_active: 1
      })
      expect(countries[2]).toMatchObject({
        code: 'TR',
        name: 'Turkey',
        default_currency: 'TRY',
        is_active: 1
      })
    })

    it('should pre-populate singleton settings with default values', () => {
      const settings = db.prepare('SELECT * FROM settings').all()
      expect(settings.length).toBe(1)
      expect(settings[0]).toMatchObject({
        id: 1,
        app_language: 'ar',
        reporting_currency: 'JOD',
        theme: 'light',
        font_size: 'medium'
      })
    })
  })

  describe('Properties CRUD Query Validation', () => {
    it('should insert a new property successfully and query it back', () => {
      const stmt = db.prepare(`
        INSERT INTO properties (
          code, name, type, country, currency, address, area_sqm, status, monthly_rent_default
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      const info = stmt.run(
        'PROP-001',
        'Al-Rabiah Apartment',
        'apartment',
        'JO',
        'JOD',
        'Amman, Jordan',
        120,
        'vacant',
        350.0
      )
      expect(info.changes).toBe(1)
      expect(info.lastInsertRowid).toBeDefined()

      const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(info.lastInsertRowid)
      expect(property).toMatchObject({
        code: 'PROP-001',
        name: 'Al-Rabiah Apartment',
        type: 'apartment',
        country: 'JO',
        currency: 'JOD',
        status: 'vacant',
        monthly_rent_default: 350.0,
        is_archived: 0
      })
    })

    it('should enforce unique constraints on property code', () => {
      const stmt = db.prepare(`
        INSERT INTO properties (code, name, type, country, currency)
        VALUES (?, ?, ?, ?, ?)
      `)
      stmt.run('PROP-DUPLICATE', 'First Property', 'apartment', 'JO', 'JOD')

      // Second insert with same code should throw unique constraint error
      expect(() => {
        stmt.run('PROP-DUPLICATE', 'Second Property', 'shop', 'JO', 'JOD')
      }).toThrow('UNIQUE constraint failed: properties.code')
    })

    it('should enforce enum check constraints on type and status', () => {
      const stmt = db.prepare(`
        INSERT INTO properties (code, name, type, country, currency, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `)

      // Invalid type check
      expect(() => {
        stmt.run('PROP-ERR1', 'Invalid Type', 'villa', 'JO', 'JOD', 'vacant')
      }).toThrow('CHECK constraint failed')

      // Invalid status check
      expect(() => {
        stmt.run('PROP-ERR2', 'Invalid Status', 'apartment', 'JO', 'JOD', 'sold')
      }).toThrow('CHECK constraint failed')
    })

    it('should enforce foreign key constraint for country', () => {
      const stmt = db.prepare(`
        INSERT INTO properties (code, name, type, country, currency)
        VALUES (?, ?, ?, ?, ?)
      `)

      // Country 'US' is not pre-populated in countries table, should fail foreign key check
      expect(() => {
        stmt.run('PROP-US', 'US Property', 'apartment', 'US', 'USD')
      }).toThrow('FOREIGN KEY constraint failed')
    })

    it('should soft-delete (archive) a property', () => {
      const insertStmt = db.prepare(`
        INSERT INTO properties (code, name, type, country, currency)
        VALUES (?, ?, ?, ?, ?)
      `)
      const info = insertStmt.run('PROP-TO-DEL', 'Temp Apartment', 'apartment', 'JO', 'JOD')

      const deleteStmt = db.prepare('UPDATE properties SET is_archived = 1 WHERE id = ?')
      deleteStmt.run(info.lastInsertRowid)

      const property = db
        .prepare('SELECT * FROM properties WHERE id = ?')
        .get(info.lastInsertRowid) as { is_archived: number }
      expect(property.is_archived).toBe(1)
    })
  })
})
