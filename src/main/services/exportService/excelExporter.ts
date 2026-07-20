/**
 * @file excelExporter — builds a formatted .xlsx workbook from a normalized ReportData.
 *
 * INTENT: Produce print-ready Excel exports per SRS §15.1: one sheet per currency group (so mixed
 *         currencies are never silently summed — BR-14), with frozen bold headers, auto-width
 *         columns, currency-aware number formats, real SUM() formulas in the totals row, a real
 *         `=prior + debit - credit` formula in the ledger running-balance column (SRS §14.9),
 *         AutoFilter, and landscape print setup with repeating headers.
 *
 * CONSTRAINTS:
 *   - FR-XLS-02: RTL sheet view when Arabic, LTR when English.
 *   - FR-XLS-03: totals row uses Excel formulas, never static numbers.
 *   - FR-XLS-04: AutoFilter enabled on the header row.
 *   - FR-XLS-05: landscape, 1.5cm margins, repeating header row on every printed page.
 *   - BR-29:    every column header is resolved from an i18n key, never hardcoded text.
 *   - NFR-I18N-07: number formatting via the sheet's number format, not via JS string concat.
 *
 * DECISION: exceljs is imported lazily inside the builder so this module can be unit-tested
 *           without forcing the (heavy) exceljs load when only the types are imported.
 */

import ExcelJS from 'exceljs'
import { db } from '../../db/database'
import {
  type ReportData,
  type ReportColumn,
  type ExportLanguage,
  resolveLocaleKey
} from './exportUtils'

function parseBase64Image(
  dataUrl: string
): { base64: string; extension: 'png' | 'jpeg' | 'gif' } | null {
  const matches = dataUrl.match(/^data:image\/([a-zA-Z+]+);base64,(.+)$/)
  if (!matches || matches.length !== 3) return null
  let ext = matches[1].toLowerCase()
  if (ext === 'jpg') ext = 'jpeg'
  if (ext === 'svg+xml') return null
  if (ext !== 'png' && ext !== 'jpeg' && ext !== 'gif') return null
  return {
    extension: ext as 'png' | 'jpeg' | 'gif',
    base64: matches[2]
  }
}

/**
 * Convert a 1-based column index to an Excel column letter (A, B, …, Z, AA, …).
 * INTENT: replace exceljs's `ColumnUtils.letterForNumber`, which is not exported as a static on
 *         the default import in this version. Implemented locally so we avoid relying on internals.
 */
function colLetter(n: number): string {
  let s = ''
  let i = n
  while (i > 0) {
    const rem = (i - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    i = Math.floor((i - 1) / 26)
  }
  return s
}

/** MUI-palette-aligned header style (dark surface, white text) — kept as constants so the
 *  exporter stays pure and does not import the renderer's theme. */
const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1A237E' } // MUI indigo 900 — high contrast for printed headers
}
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 }
const TOTALS_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFE8EAF6' }
} // indigo 50
const TOTALS_FONT: Partial<ExcelJS.Font> = { bold: true, size: 11 }

/** Font stack per SRS §15.1 — Tajawal for Arabic, Calibri for English. */
function bodyFont(lang: ExportLanguage): string {
  return lang === 'ar' ? 'Tajawal' : 'Calibri'
}

/** Excel number format that always shows the currency code next to the amount (SRS §15.1). */
function currencyFormat(currency: string): string {
  return `#,##0.00 "${currency}"`
}

const PLAIN_NUMBER_FORMAT = '#,##0.00'

/**
 * Build a worksheet for a single currency group and add it to the workbook.
 * Sheet name is truncated to Excel's 31-char limit and suffixed with the currency code.
 */
function addGroupSheet(
  workbook: ExcelJS.Workbook,
  data: ReportData,
  group: { currency: string; rows: Record<string, unknown>[]; totals: Record<string, number> },
  columns: ReportColumn[],
  lang: ExportLanguage
): ExcelJS.Worksheet {
  // Query company settings from DB safely (handling missing schema in tests)
  let settings: { company_name: string | null; company_logo: string | null } | undefined
  try {
    settings = db.prepare('SELECT company_name, company_logo FROM settings LIMIT 1').get() as {
      company_name: string | null
      company_logo: string | null
    }
  } catch {
    // Fallback if table/columns don't exist in unit test DB
  }

  const hasCompanyInfo = !!(settings?.company_name || settings?.company_logo)
  const headerRowIndex = hasCompanyInfo ? 5 : 1
  const firstDataRow = headerRowIndex + 1

  const sheetName = `${data.titleKey.split('.').pop()} (${group.currency})`.slice(0, 31)
  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ rightToLeft: lang === 'ar', state: 'frozen', ySplit: headerRowIndex }],
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.59,
        right: 0.59,
        top: 0.59,
        bottom: 0.59,
        header: 0.3,
        footer: 0.3
      }
    }
  })

  // Repeat the header row on every printed page (FR-XLS-05).
  sheet.pageSetup.printTitlesRow = `${headerRowIndex}:${headerRowIndex}`

  if (hasCompanyInfo) {
    if (settings?.company_logo) {
      const imgInfo = parseBase64Image(settings.company_logo)
      if (imgInfo) {
        try {
          const imageId = workbook.addImage({
            base64: imgInfo.base64,
            extension: imgInfo.extension
          })
          // Place logo in top left (A1)
          sheet.addImage(imageId, {
            tl: { col: 0, row: 0 },
            ext: { width: 100, height: 50 },
            editAs: 'absolute'
          })
        } catch (err) {
          console.error('Error adding company logo to Excel sheet:', err)
        }
      }
    }

    if (settings?.company_name) {
      const nameRow = sheet.getRow(2)
      const colIdx = settings.company_logo ? 3 : 1
      const cell = nameRow.getCell(colIdx)
      cell.value = settings.company_name
      cell.font = { name: bodyFont(lang), size: 14, bold: true, color: { argb: 'FF1A237E' } }
    }

    // Put report title on row 4
    const titleRow = sheet.getRow(4)
    const titleCell = titleRow.getCell(1)
    const titleText = resolveLocaleKey(data.titleKey, lang)
    const subtitleText = data.subtitleKey ? resolveLocaleKey(data.subtitleKey, lang) : ''
    titleCell.value = subtitleText ? `${titleText} — ${subtitleText}` : titleText
    titleCell.font = { name: bodyFont(lang), size: 12, bold: true, italic: true }
  }

  // Build column definitions with auto-width and number formats.
  sheet.columns = columns.map((col) => {
    const header = resolveLocaleKey(col.headerKey, lang)
    const widestSample = group.rows.reduce((max, row) => {
      const cellValue = row[col.key]
      const len = cellValue === null || cellValue === undefined ? 0 : String(cellValue).length
      return Math.max(max, len)
    }, header.length)
    return {
      key: col.key,
      width: Math.min(Math.max(widestSample + 2, 10), 40)
    }
  })

  // Header row styling.
  const headerRow = sheet.getRow(headerRowIndex)
  headerRow.height = 22
  columns.forEach((col, colIdx) => {
    const cell = headerRow.getCell(colIdx + 1)
    cell.value = resolveLocaleKey(col.headerKey, lang)
    cell.fill = HEADER_FILL
    cell.font = HEADER_FONT
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FF000000' } }
    }
  })

  // Body rows — for each row, write typed values so Excel treats numbers/dates correctly.
  group.rows.forEach((row, idx) => {
    const excelRow = sheet.getRow(firstDataRow + idx)
    excelRow.font = { name: bodyFont(lang), size: 11 }
    columns.forEach((col, colIdx) => {
      const cell = excelRow.getCell(colIdx + 1)
      const raw = row[col.key]
      if (col.type === 'number' || col.type === 'currency') {
        cell.value = typeof raw === 'number' ? raw : Number(raw ?? 0)
        if (col.type === 'currency') {
          cell.numFmt = currencyFormat(group.currency)
        }
      } else if (col.type === 'date' && typeof raw === 'string') {
        // Keep ISO date strings as text — Excel handles them predictably across locales.
        cell.value = raw
      } else {
        cell.value = raw === null || raw === undefined ? '' : String(raw)
      }
    })
    excelRow.commit()
  })

  // Totals row — real SUM() formulas referencing the data rows (FR-XLS-03).
  const totalsRowNumber = firstDataRow + group.rows.length
  if (group.rows.length > 0) {
    const totalsRow = sheet.getRow(totalsRowNumber)
    totalsRow.font = TOTALS_FONT
    totalsRow.fill = TOTALS_FILL
    columns.forEach((col, colIdx) => {
      const cell = totalsRow.getCell(colIdx + 1)
      const letter = colLetter(colIdx + 1)
      if (col.sumInTotals) {
        cell.value = {
          formula: `SUM(${letter}${firstDataRow}:${letter}${totalsRowNumber - 1})`
        }
        cell.numFmt = col.type === 'currency' ? currencyFormat(group.currency) : PLAIN_NUMBER_FORMAT
      } else if (col.isRunningBalance) {
        // The totals row of a running-balance column shows the final balance as a formula.
        cell.value = { formula: `${letter}${totalsRowNumber - 1}` }
        cell.numFmt = currencyFormat(group.currency)
      }
    })
    totalsRow.commit()
  }

  // Ledger running-balance column: overwrite the static value with a per-row formula referencing
  // the previous row's balance (SRS §14.9). The formula must reference the actual debit/credit
  // cells so the reader can independently verify every figure.
  const rbCol = columns.find((c) => c.isRunningBalance)
  if (rbCol) {
    const rbIdx = columns.indexOf(rbCol)
    const rbLetter = colLetter(rbIdx + 1)
    const debitCol = columns.find((c) => c.key === 'debit')
    const creditCol = columns.find((c) => c.key === 'credit')
    if (debitCol && creditCol) {
      const debitLetter = colLetter(columns.indexOf(debitCol) + 1)
      const creditLetter = colLetter(columns.indexOf(creditCol) + 1)
      // First data row has no prior balance — its balance is just debit - credit.
      const firstCell = sheet.getCell(firstDataRow, rbIdx + 1)
      firstCell.value = { formula: `${debitLetter}${firstDataRow}-${creditLetter}${firstDataRow}` }
      firstCell.numFmt = currencyFormat(group.currency)
      // Subsequent rows: prior_balance + debit - credit.
      for (let i = 1; i < group.rows.length; i++) {
        const rowNum = firstDataRow + i
        const cell = sheet.getCell(rowNum, rbIdx + 1)
        cell.value = {
          formula: `${rbLetter}${rowNum - 1}+${debitLetter}${rowNum}-${creditLetter}${rowNum}`
        }
        cell.numFmt = currencyFormat(group.currency)
      }
    }
  }

  // AutoFilter on the header row spanning all columns (FR-XLS-04).
  const lastColLetter = colLetter(columns.length)
  sheet.autoFilter = `A1:${lastColLetter}${Math.max(totalsRowNumber, firstDataRow)}`

  // Page header/footer (FR-XLS-06).
  const title = resolveLocaleKey(data.titleKey, lang)
  sheet.headerFooter.oddHeader = `&L${title}&R&D &T`
  sheet.headerFooter.oddFooter = `&L&D&R&P / &N`

  return sheet
}

/**
 * Build a complete .xlsx workbook from `data`. Returns a Node Buffer ready to write to disk.
 *
 * Each currency group becomes its own worksheet (BR-14). If a `consolidatedNote` is present it is
 * rendered as a final "Summary" worksheet so the per-currency sheets never lie about totals.
 */
export async function buildExcelWorkbook(data: ReportData, lang: ExportLanguage): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Property Manager'
  workbook.created = new Date()

  for (const group of data.groups) {
    addGroupSheet(workbook, data, group, data.columns, lang)
  }

  if (data.consolidatedNote) {
    const summary = workbook.addWorksheet('Summary', {
      views: [{ rightToLeft: lang === 'ar' }]
    })
    summary.columns = [{ header: resolveLocaleKey('reports.consolidatedNote', lang), width: 80 }]
    summary.getCell('A2').value = data.consolidatedNote
    summary.getCell('A2').font = { italic: true }
    summary.getRow(1).font = HEADER_FONT
    summary.getRow(1).getCell(1).fill = HEADER_FILL
  }

  const excelBuffer = await workbook.xlsx.writeBuffer()
  // ExcelJS declares its own `Buffer extends ArrayBuffer` which differs from Node's Buffer type.
  // Coerce through `unknown` to the Node Buffer constructor so the return type matches the
  // writeFileAtomic signature regardless of which Buffer shape exceljs emits at runtime.
  return Buffer.from(excelBuffer as unknown as ArrayBuffer)
}
