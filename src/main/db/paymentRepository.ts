import { Database } from 'better-sqlite3'
import { resolveReportingSnapshot } from '../utils/currencyHelper'
import { appendLedgerEntry, generateReceiptNumber } from './ledgerService'

/**
 * @file paymentRepository — the data-access boundary for payments (SRS §5.5, §8.2).
 *
 * INTENT: Encapsulate EVERY payment write so that the BR-21 atomicity invariant (payment row +
 *         ledger row in ONE transaction) cannot be bypassed. Each function is pure w.r.t. the
 *         injected `db`, making the atomicity rule exhaustively testable on an in-memory DB.
 *
 * CONSTRAINTS:
 *   - BR-13 Currency lock: the caller passes the property's currency; a mismatch rejects the
 *     write with PAYMENT_CURRENCY_MISMATCH before any INSERT runs.
 *   - BR-20/21 Immutability+atomicity: voiding never UPDATEs the ledger; it appends an
 *     income_void reversal row and flips is_voided on the payment — both in one transaction.
 *   - BR-10 Receipt numbers are generated server-side and guaranteed unique.
 *
 * DECISION: This file holds NO ipcMain handlers — those live in paymentIpc.ts and delegate here.
 *           Splitting repository from IPC lets the regression tests exercise the real write path
 *           (transactions, ledger coupling) without an Electron runtime.
 */

/** Payload for creating a payment. property_currency is the linked property's currency (BR-13). */
export interface CreatePaymentInput {
  contract_id?: number | null
  property_id: number
  tenant_id?: number | null
  payment_type: 'rent' | 'deposit' | 'other_income'
  payment_date: string // YYYY-MM-DD
  amount: number
  currency: string // must equal property_currency
  property_currency: string
  payment_method?: string | null
  is_partial?: boolean
  related_period_month?: string | null
  notes?: string | null
  custom_exchange_rate?: number | null
}

/** Return shape of createPayment: the new row ids + the generated receipt number. */
export interface CreatedPayment {
  payment_id: number
  ledger_id: number
  receipt_number: string
}

/**
 * Insert a payment AND its income ledger row in a single transaction.
 * Throws PAYMENT_CURRENCY_MISMATCH if `currency` != `property_currency` (BR-13).
 * Throws PAYMENT_AMOUNT_INVALID if amount <= 0.
 */
export function createPayment(db: Database, input: CreatePaymentInput): CreatedPayment {
  if (input.amount <= 0) {
    throw new PaymentError('PAYMENT_AMOUNT_INVALID')
  }
  if (input.currency !== input.property_currency) {
    throw new PaymentError('PAYMENT_CURRENCY_MISMATCH')
  }

  return db.transaction(() => {
    const receiptNumber = generateReceiptNumber(db)
    // Freeze the reporting-currency snapshot at write time so reports are deterministic
    // and immune to later rate changes (NULL when no rate exists — graceful fallback).
    const snapshot = resolveReportingSnapshot(
      db,
      input.amount,
      input.currency,
      input.custom_exchange_rate
    )
    const paymentResult = db
      .prepare(
        `INSERT INTO payments
           (contract_id, property_id, tenant_id, payment_type, payment_date, amount,
            currency, payment_method, receipt_number, is_partial, related_period_month, notes,
            reporting_currency, exchange_rate, base_amount)
         VALUES
           (@contract_id, @property_id, @tenant_id, @payment_type, @payment_date, @amount,
            @currency, @payment_method, @receipt_number, @is_partial, @related_period_month, @notes,
            @reporting_currency, @exchange_rate, @base_amount)`
      )
      .run({
        contract_id: input.contract_id ?? null,
        property_id: input.property_id,
        tenant_id: input.tenant_id ?? null,
        payment_type: input.payment_type,
        payment_date: input.payment_date,
        amount: input.amount,
        currency: input.currency,
        payment_method: input.payment_method ?? null,
        receipt_number: receiptNumber,
        is_partial: input.is_partial ? 1 : 0,
        related_period_month: input.related_period_month ?? null,
        notes: input.notes ?? null,
        reporting_currency: snapshot?.reportingCurrency ?? null,
        exchange_rate: snapshot?.exchangeRate ?? null,
        base_amount: snapshot?.baseAmount ?? null
      })
    const paymentId = Number(paymentResult.lastInsertRowid)

    const description = buildPaymentDescription(db, input)
    const ledgerId = appendLedgerEntry(db, {
      entryDate: input.payment_date,
      entryType: 'income',
      referenceType: 'payment',
      referenceId: paymentId,
      propertyId: input.property_id,
      description,
      debit: input.amount,
      credit: 0,
      currency: input.currency,
      // Mirror the snapshot onto the ledger row so consolidation reads a single table.
      snapshot: snapshot
        ? {
            reportingCurrency: snapshot.reportingCurrency,
            exchangeRate: snapshot.exchangeRate,
            baseAmount: snapshot.baseAmount
          }
        : null
    })
    if (input.contract_id) {
      db.prepare(
        `UPDATE notifications
         SET status = 'dismissed', read_at = CURRENT_TIMESTAMP, is_read = 1
         WHERE status = 'pending'
           AND notification_type IN ('rent_due', 'overdue')
           AND entity_type = 'contract'
           AND entity_id = ?`
      ).run(input.contract_id)
    }

    return { payment_id: paymentId, ledger_id: ledgerId, receipt_number: receiptNumber }
  })()
}

/**
 * Void a payment: flip is_voided (with required reason) and append an income_void reversal
 * ledger row of equal magnitude — all in one transaction. The original payment row and the
 * original income ledger row are NEVER modified or deleted (BR-20).
 * Throws PAYMENT_NOT_FOUND, PAYMENT_ALREADY_VOID, or VOID_REASON_REQUIRED.
 */
export function voidPayment(
  db: Database,
  paymentId: number,
  reason: string
): { ledger_id: number } {
  const trimmed = reason?.trim() ?? ''
  if (trimmed.length === 0) {
    throw new PaymentError('VOID_REASON_REQUIRED')
  }

  return db.transaction(() => {
    const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId) as
      PaymentRow | undefined
    if (!payment) throw new PaymentError('PAYMENT_NOT_FOUND')
    if (payment.is_voided === 1) throw new PaymentError('PAYMENT_ALREADY_VOID')

    db.prepare('UPDATE payments SET is_voided = 1, void_reason = ? WHERE id = ?').run(
      trimmed,
      paymentId
    )

    const ledgerId = appendLedgerEntry(db, {
      entryDate: payment.payment_date,
      entryType: 'income_void',
      referenceType: 'payment',
      referenceId: paymentId,
      propertyId: payment.property_id,
      description: `Void: ${payment.receipt_number ?? 'payment'} — ${trimmed}`,
      debit: 0,
      credit: payment.amount, // equal-and-opposite reversal
      currency: payment.currency,
      // Reuse the ORIGINAL snapshot (sign-flipped via debit-credit) so the void contributes
      // the exact negation of the original income to every reporting-currency total.
      snapshot:
        payment.reporting_currency && payment.exchange_rate && payment.base_amount != null
          ? {
              reportingCurrency: payment.reporting_currency,
              exchangeRate: payment.exchange_rate,
              baseAmount: -payment.base_amount
            }
          : null
    })
    return { ledger_id: ledgerId }
  })()
}

/** Read-side: list payments with optional filters, newest first. */
export function listPayments(
  db: Database,
  filters?: {
    property_id?: number
    tenant_id?: number
    contract_id?: number
    from_date?: string
    to_date?: string
    payment_type?: string
  }
): unknown[] {
  let query = `
    SELECT pay.*,
           p.name AS property_name, p.code AS property_code,
           t.fullname AS tenant_fullname, t.code AS tenant_code,
           c.contract_number AS contract_number
    FROM payments pay
    LEFT JOIN properties p ON pay.property_id = p.id
    LEFT JOIN tenants   t ON pay.tenant_id   = t.id
    LEFT JOIN contracts c ON pay.contract_id = c.id
    WHERE 1=1
  `
  const params: Record<string, unknown> = {}
  if (filters) {
    if (filters.property_id) {
      query += ' AND pay.property_id = @property_id'
      params.property_id = filters.property_id
    }
    if (filters.tenant_id) {
      query += ' AND pay.tenant_id = @tenant_id'
      params.tenant_id = filters.tenant_id
    }
    if (filters.contract_id) {
      query += ' AND pay.contract_id = @contract_id'
      params.contract_id = filters.contract_id
    }
    if (filters.from_date) {
      query += ' AND pay.payment_date >= @from_date'
      params.from_date = filters.from_date
    }
    if (filters.to_date) {
      query += ' AND pay.payment_date <= @to_date'
      params.to_date = filters.to_date
    }
    if (filters.payment_type) {
      query += ' AND pay.payment_type = @payment_type'
      params.payment_type = filters.payment_type
    }
  }
  query += ' ORDER BY pay.payment_date DESC, pay.id DESC'
  return db.prepare(query).all(params)
}

interface PaymentRow {
  id: number
  property_id: number
  tenant_id: number | null
  contract_id: number | null
  payment_type: string
  payment_date: string
  amount: number
  currency: string
  receipt_number: string | null
  notes: string | null
  is_voided: number
  /** Frozen snapshot — reused by the void reversal so it reconciles exactly. */
  reporting_currency: string | null
  exchange_rate: number | null
  base_amount: number | null
}

/** Build a human-readable ledger description for a payment (used for audit readability). */
function buildPaymentDescription(db: Database, input: CreatePaymentInput): string {
  const parts: string[] = []
  const prop = db
    .prepare('SELECT name, code FROM properties WHERE id = ?')
    .get(input.property_id) as { name: string; code: string } | undefined
  if (prop) parts.push(prop.code)
  if (input.tenant_id) {
    const tenant = db.prepare('SELECT fullname FROM tenants WHERE id = ?').get(input.tenant_id) as
      { fullname: string } | undefined
    if (tenant) parts.push(tenant.fullname)
  }
  parts.push(input.payment_type)
  if (input.related_period_month) parts.push(input.related_period_month)
  return parts.join(' — ')
}

/** Domain error thrown by payment helpers; carries a machine-readable code for the IPC layer. */
export class PaymentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PaymentError'
  }
}
