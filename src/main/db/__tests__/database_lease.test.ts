import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach } from 'vitest'
import { runMigrations } from '../migrations'

describe('Tenant & Lease Database Queries & Constraints', () => {
  let db: Database.Database

  beforeEach(() => {
    // Initialize fresh, isolated in-memory SQLite database
    db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    // Run the migrations
    runMigrations(db)
  })

  it('should apply both initial schema and tenant/lease migrations', () => {
    const migrations = db.prepare('SELECT name FROM migrations ORDER BY id ASC').all()
    expect(migrations.length).toBe(29)
    expect(migrations[0]).toEqual({ name: '001_initial_schema.sql' })
    expect(migrations[1]).toEqual({ name: '002_tenant_lease_schema.sql' })
  })

  it('should insert a tenant successfully and fetch them back', () => {
    const tenantStmt = db.prepare(`
      INSERT INTO tenants (code, fullname, phone, type)
      VALUES (?, ?, ?, ?)
    `)
    const info = tenantStmt.run('TENANT-001', 'John Doe', '+962790000000', 'individual')
    expect(info.changes).toBe(1)

    const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(info.lastInsertRowid) as {
      code: string
      fullname: string
      type: string
    }
    expect(tenant).toBeDefined()
    expect(tenant.code).toBe('TENANT-001')
    expect(tenant.fullname).toBe('John Doe')
    expect(tenant.type).toBe('individual')
  })

  describe('Lease Validations & Property Status Transitions', () => {
    let propertyId: number | bigint
    let tenantId: number | bigint

    beforeEach(() => {
      // Setup a default property and tenant
      const propInfo = db
        .prepare(
          `
        INSERT INTO properties (code, name, type, country, currency, monthly_rent_default)
        VALUES ('PROP-001', 'Apartment A1', 'apartment', 'JO', 'JOD', 500)
      `
        )
        .run()
      propertyId = propInfo.lastInsertRowid

      const tenantInfo = db
        .prepare(
          `
        INSERT INTO tenants (code, fullname, phone)
        VALUES ('T-001', 'Jane Doe', '+962791111111')
      `
        )
        .run()
      tenantId = tenantInfo.lastInsertRowid
    })

    it('should create a contract successfully', () => {
      const stmt = db.prepare(`
        INSERT INTO contracts (contract_number, property_id, tenant_id, start_date, end_date, rent_amount, currency, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      const info = stmt.run(
        'LEASE-2026-001',
        propertyId,
        tenantId,
        '2026-01-01',
        '2026-12-31',
        500.0,
        'JOD',
        'active'
      )
      expect(info.changes).toBe(1)

      const contract = db
        .prepare('SELECT * FROM contracts WHERE id = ?')
        .get(info.lastInsertRowid) as {
        contract_number: string
        rent_amount: number
        status: string
      }
      expect(contract.contract_number).toBe('LEASE-2026-001')
      expect(contract.rent_amount).toBe(500.0)
      expect(contract.status).toBe('active')
    })

    it('should prevent inserting a contract with a duplicate contract number due to unique constraint', () => {
      const stmt = db.prepare(`
        INSERT INTO contracts (contract_number, property_id, tenant_id, start_date, end_date, rent_amount, currency)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      stmt.run('L-DUP', propertyId, tenantId, '2026-01-01', '2026-12-31', 500, 'JOD')

      expect(() => {
        stmt.run('L-DUP', propertyId, tenantId, '2027-01-01', '2027-12-31', 600, 'JOD')
      }).toThrow()
    })
  })
})
