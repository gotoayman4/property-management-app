/**
 * @file ReportPreview.test — regression tests for the reports preview states.
 *
 * INTENT: Guard the white-page bug: a successful report build with zero matching rows
 *         produces `groups: []`, which previously rendered nothing at all (no empty state,
 *         no feedback). Also verifies the error and success branches, plus the IPC error-code
 *         extraction helper used by Reports.tsx to map codes to user-facing messages.
 * CONSTRAINT: StandardTable is stubbed — this suite tests ReportPreview's branch selection,
 *             not the table implementation (behavior, not implementation).
 */
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import ReportPreview from '../ReportPreview'
import type { ReportData } from '../reportTypes'
import { extractIpcErrorCode } from '../reportTypes'

// Mock react-i18next — return key as-is for assertions
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' }
  })
}))

// Lightweight StandardTable stub exposing the props the branches differ on.
vi.mock('../../../components/StandardTable', () => ({
  default: ({
    rows,
    error,
    emptyMessage
  }: {
    rows: unknown[]
    error?: string | null
    emptyMessage?: string
  }) => (
    <div data-testid="standard-table">
      {error ? <span>{error}</span> : null}
      {rows.length === 0 ? <span>{emptyMessage}</span> : <span>rows:{rows.length}</span>}
    </div>
  )
}))

const baseColumns = [{ key: 'amount', headerKey: 'reports.col.amount', type: 'currency' as const }]

function renderPreview(data: ReportData | null, error: string | null = null): void {
  render(
    <ReportPreview data={data} gridColumns={[]} previewRows={[]} error={error} onRetry={vi.fn()} />
  )
}

describe('ReportPreview', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('empty result (groups: []) shows the noData empty state, not a blank page', () => {
    renderPreview({ titleKey: 'reports.type.income', columns: baseColumns, groups: [] })
    expect(screen.getByText('reports.noData')).toBeInTheDocument()
  })

  it('result with one empty group also shows the noData empty state', () => {
    renderPreview({
      titleKey: 'reports.type.vacancy',
      columns: baseColumns,
      groups: [{ currency: '—', rows: [], totals: {} }]
    })
    expect(screen.getByText('reports.noData')).toBeInTheDocument()
    // No stray currency-group heading for an empty report
    expect(screen.queryByText(/reports\.currencyGroup/)).not.toBeInTheDocument()
  })

  it('result with rows renders the currency group table', () => {
    renderPreview({
      titleKey: 'reports.type.income',
      columns: baseColumns,
      groups: [{ currency: 'USD', rows: [{ amount: 100 }], totals: { amount: 100 } }]
    })
    expect(screen.getByText('reports.currencyGroup: USD')).toBeInTheDocument()
    expect(screen.getByText('rows:1')).toBeInTheDocument()
  })

  it('error with no data renders the error state', () => {
    renderPreview(null, 'Something broke')
    expect(screen.getByText('Something broke')).toBeInTheDocument()
  })
})

describe('extractIpcErrorCode', () => {
  it.each([
    [
      new Error("Error invoking remote method 'reports:preview': Error: REPORT_BUILD_FAILED"),
      'REPORT_BUILD_FAILED'
    ],
    [
      new Error("Error invoking remote method 'reports:exportExcel': Error: REPORT_NO_DATA"),
      'REPORT_NO_DATA'
    ],
    [
      new Error("Error invoking remote method 'reports:preview': Error: LEDGER_PROPERTY_REQUIRED"),
      'LEDGER_PROPERTY_REQUIRED'
    ],
    [new Error('INVALID_INPUT'), 'INVALID_INPUT'],
    ['plain string failure', 'plain string failure'],
    [new Error(''), ''],
    [undefined, 'undefined']
  ])('extracts %s → %s', (input, expected) => {
    expect(extractIpcErrorCode(input)).toBe(expected)
  })
})
