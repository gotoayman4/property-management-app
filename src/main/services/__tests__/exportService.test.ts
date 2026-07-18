/**
 * @file exportService.test — verifies the Excel + HTML export engine invariants.
 *
 * INTENT: Assert the non-negotiable export rules from the SRS:
 *   - BR-29: every header is resolved from an i18n key (no raw keys leak into output)
 *   - BR-31: the HTML report is fully self-contained (no external URLs, no <script src>, no <link>)
 *   - BR-32: <html dir lang> flips with the active language; logical CSS properties appear in CSS
 *   - BR-14: mixed-currency input produces one group per currency, never a silent cross sum
 *   - SECURITY: user-supplied strings are HTML-escaped before interpolation
 *
 * CONSTRAINT: tests build a synthetic ReportData fixture rather than hitting the DB so the engine
 *             is exercised in isolation from the report builders.
 */
import { describe, it, expect } from 'vitest'
import { buildExcelWorkbook } from '../exportService/excelExporter'
import {
  type ReportData,
  groupByCurrency,
  buildFileName,
  escapeHtml,
  resolveLocaleKey
} from '../exportService/exportUtils'
import { buildHtmlDocument } from '../exportService/htmlExporter'

const COLUMNS = [
  { key: 'date', headerKey: 'reports.col.date', type: 'date' as const },
  { key: 'name', headerKey: 'reports.col.property', type: 'text' as const },
  {
    key: 'amount',
    headerKey: 'reports.col.amount',
    type: 'currency' as const,
    sumInTotals: true
  }
]

function fixture(): ReportData {
  return {
    titleKey: 'reports.type.income',
    columns: COLUMNS,
    groups: [
      {
        currency: 'JOD',
        rows: [
          { date: '2026-07-01', name: 'Apt 1', amount: 500 },
          { date: '2026-07-02', name: 'Apt 2', amount: 300 }
        ],
        totals: { amount: 800 }
      }
    ]
  }
}

describe('exportUtils', () => {
  it('groups rows by currency and never sums across currencies (BR-14)', () => {
    const rows = [
      { currency: 'JOD', amount: 100 },
      { currency: 'TRY', amount: 200 },
      { currency: 'JOD', amount: 50 }
    ]
    const groups = groupByCurrency(rows, 'currency', ['amount'])
    expect(groups).toHaveLength(2)
    const jod = groups.find((g) => g.currency === 'JOD')
    const tryGroup = groups.find((g) => g.currency === 'TRY')
    expect(jod?.totals.amount).toBe(150)
    expect(tryGroup?.totals.amount).toBe(200)
  })

  it('builds a filesystem-safe filename with no dashes in the date (SRS §15)', () => {
    const name = buildFileName('Income', '2026-07-01', '2026-07-31', 'xlsx')
    expect(name).toBe('Income_20260701_to_20260731.xlsx')
  })

  it('resolves a known i18n key in both languages (BR-29)', () => {
    expect(resolveLocaleKey('reports.col.date', 'en')).toBe('Date')
    expect(resolveLocaleKey('reports.col.date', 'ar')).toBe('التاريخ')
  })

  it('throws on a missing i18n key rather than silently returning the raw key (BR-29)', () => {
    expect(() => resolveLocaleKey('reports.col.nonsense', 'en')).toThrow(/I18N_KEY_MISSING/)
  })

  it('HTML-escapes user-supplied strings before interpolation', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(escapeHtml('" & \'')).toBe('&quot; &amp; &#39;')
  })
})

describe('htmlExporter', () => {
  it('produces a fully self-contained document with no external URLs (BR-31)', () => {
    const html = buildHtmlDocument(fixture(), 'en')
    // No external script/link/img src may appear.
    expect(html).not.toMatch(/<script[^>]+src=/i)
    expect(html).not.toMatch(/<link[^>]+href=/i)
    expect(html).not.toMatch(/https?:\/\//i)
    // Styles and scripts must be inline.
    expect(html).toMatch(/<style>/)
    expect(html).toMatch(/<script>/)
  })

  it('sets <html dir lang> based on the active language (BR-32)', () => {
    const rtl = buildHtmlDocument(fixture(), 'ar')
    const ltr = buildHtmlDocument(fixture(), 'en')
    expect(rtl).toMatch(/<html dir="rtl" lang="ar">/)
    expect(ltr).toMatch(/<html dir="ltr" lang="en">/)
  })

  it('uses CSS logical properties, not physical direction properties (BR-32)', () => {
    const html = buildHtmlDocument(fixture(), 'en')
    const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'))
    // Logical properties appear (either inline-axis or block-axis variants).
    expect(css).toMatch(/(-inline-start|-inline-end|margin-inline|padding-inline|inset-inline)/)
    expect(css).toMatch(/(-block-start|-block-end|margin-block|padding-block|inset-block)/)
    // Physical direction properties must never appear in the UI chrome CSS.
    expect(css).not.toMatch(/\bmargin-left\b/)
    expect(css).not.toMatch(/\bmargin-right\b/)
    expect(css).not.toMatch(/\bpadding-left\b/)
    expect(css).not.toMatch(/\bpadding-right\b/)
  })

  it('renders every currency group with its own labeled section (BR-14)', () => {
    const data: ReportData = {
      ...fixture(),
      groups: [
        {
          currency: 'JOD',
          rows: [{ date: '2026-07-01', name: 'A', amount: 100 }],
          totals: { amount: 100 }
        },
        {
          currency: 'TRY',
          rows: [{ date: '2026-07-01', name: 'B', amount: 200 }],
          totals: { amount: 200 }
        }
      ]
    }
    const html = buildHtmlDocument(data, 'en')
    expect(html).toMatch(/data-currency="JOD"/)
    expect(html).toMatch(/data-currency="TRY"/)
    // Each group must have its own table.
    const tables = html.match(/<table>/g) ?? []
    expect(tables).toHaveLength(2)
  })

  it('escapes user-supplied property names in the rendered table (SECURITY)', () => {
    const data: ReportData = {
      ...fixture(),
      groups: [
        {
          currency: 'JOD',
          rows: [{ date: '2026-07-01', name: '<img src=x onerror=alert(1)>', amount: 100 }],
          totals: { amount: 100 }
        }
      ]
    }
    const html = buildHtmlDocument(data, 'en')
    expect(html).not.toMatch(/<img src=x onerror=alert\(1\)>/)
    expect(html).toMatch(/&lt;img src=x onerror=alert\(1\)&gt;/)
  })

  it('localizes headers from i18n keys in both languages (BR-29)', () => {
    const en = buildHtmlDocument(fixture(), 'en')
    const ar = buildHtmlDocument(fixture(), 'ar')
    expect(en).toMatch(/<th[^>]*>Date/)
    expect(ar).toMatch(/<th[^>]*>التاريخ/)
    // No raw i18n key should leak into the rendered headers.
    expect(en).not.toMatch(/reports\.col\.date/)
  })

  it('includes the @media print block that hides interactive chrome (FR-HTML-06)', () => {
    const html = buildHtmlDocument(fixture(), 'en')
    expect(html).toMatch(/@media print/)
    expect(html).toMatch(/\.toolbar[^{]*\{[^}]*display:\s*none/)
  })
})

describe('excelExporter', () => {
  it('builds a valid .xlsx buffer (non-empty, ZIP magic bytes)', async () => {
    const buffer = await buildExcelWorkbook(fixture(), 'en')
    expect(buffer.length).toBeGreaterThan(1000)
    // .xlsx is a ZIP — starts with the PK magic bytes.
    expect(buffer[0]).toBe(0x50)
    expect(buffer[1]).toBe(0x4b)
  })

  it('produces one worksheet per currency group (BR-14)', async () => {
    // Re-import the workbook parser to read back sheet names.
    const ExcelJS = (await import('exceljs')).default
    const data: ReportData = {
      ...fixture(),
      groups: [
        {
          currency: 'JOD',
          rows: [{ date: '2026-07-01', name: 'A', amount: 100 }],
          totals: { amount: 100 }
        },
        {
          currency: 'TRY',
          rows: [{ date: '2026-07-01', name: 'B', amount: 200 }],
          totals: { amount: 200 }
        }
      ]
    }
    const buffer = await buildExcelWorkbook(data, 'en')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer as unknown as ArrayBuffer)
    const sheetNames = wb.worksheets.map((s) => s.name)
    expect(sheetNames.some((n) => n.includes('JOD'))).toBe(true)
    expect(sheetNames.some((n) => n.includes('TRY'))).toBe(true)
  })

  it('uses SUM formulas in the totals row rather than static numbers (FR-XLS-03)', async () => {
    const ExcelJS = (await import('exceljs')).default
    const buffer = await buildExcelWorkbook(fixture(), 'en')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer as unknown as ArrayBuffer)
    const sheet = wb.worksheets[0]
    // The amount column is the 3rd column; the totals row follows the data rows.
    // Find any cell in column C whose value is a formula object.
    let foundSum = false
    sheet.eachRow((row) => {
      const cell = row.getCell(3)
      if (cell.value && typeof cell.value === 'object' && 'formula' in cell.value) {
        const formula = String((cell.value as { formula: string }).formula)
        if (formula.startsWith('SUM(')) foundSum = true
      }
    })
    expect(foundSum).toBe(true)
  })

  it('RTL flag flips the sheet view when Arabic (FR-XLS-02)', async () => {
    const ExcelJS = (await import('exceljs')).default
    const rtlBuffer = await buildExcelWorkbook(fixture(), 'ar')
    const ltrBuffer = await buildExcelWorkbook(fixture(), 'en')
    const wbRtl = new ExcelJS.Workbook()
    await wbRtl.xlsx.load(rtlBuffer as unknown as ArrayBuffer)
    const wbLtr = new ExcelJS.Workbook()
    await wbLtr.xlsx.load(ltrBuffer as unknown as ArrayBuffer)
    const rtlView = wbRtl.worksheets[0].views[0] as { rightToLeft?: boolean }
    const ltrView = wbLtr.worksheets[0].views[0] as { rightToLeft?: boolean }
    expect(rtlView?.rightToLeft).toBe(true)
    expect(ltrView?.rightToLeft).toBe(false)
  })
})
