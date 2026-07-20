/**
 * @file exportUtils — shared types + helpers for the Excel/HTML export pipeline.
 *
 * INTENT: Define the normalized `ReportData` shape that every report builder returns and that
 *         both exporters (excelExporter / htmlExporter) consume. Centralizing it here guarantees
 *         the two renderers stay in sync and that report builders cannot drift.
 *
 * CONSTRAINTS:
 *   - BR-14: any report spanning multiple currencies MUST group by currency. `groupByCurrency`
 *            is the single helper that enforces this — never sum across currency codes.
 *   - BR-29: column headers are i18n keys. `resolveLocale` resolves keys server-side; a missing
 *            key throws (never silently falls back to the raw key string in production).
 *   - BR-31: HTML export must be self-contained. `escapeHtml` + `escapeJs` prevent template
 *            injection when user-supplied strings (property names, notes) are interpolated.
 *   - NFR-SEC-05: no string concatenation into SQL anywhere in the report builders either.
 */

import { readFileSync } from 'fs'
import { rename, writeFile } from 'fs/promises'
import { dirname, join } from 'path'

/** The two output formats produced by this pipeline. */
export type ExportFormat = 'xlsx' | 'html'

/** The active UI language for an export — drives sheet direction and column-header locale. */
export type ExportLanguage = 'ar' | 'en'

/** A single column in a normalized report. `key` is the row field name; `headerKey` is an i18n key. */
export interface ReportColumn {
  /** Property name on the row object this column reads from. */
  key: string
  /** i18n key resolved server-side into a localized header label (BR-29). */
  headerKey: string
  /** Column data type — drives number/date formatting in both exporters. */
  type?: 'text' | 'number' | 'currency' | 'date'
  /** For currency columns: the row field that carries the ISO 4217 code (e.g. 'JOD'). */
  currencyField?: string
  /** When true, this column gets a SUM() totals-row entry (numeric/currency only). */
  sumInTotals?: boolean
  /**
   * Ledger-only: the running-balance column is exported as an Excel formula referencing the
   * previous row's balance cell, not as a static value (SRS §14.9).
   */
  isRunningBalance?: boolean
}

/** One logical group of rows that share a currency (BR-14). Single-currency reports have one group. */
export interface ReportCurrencyGroup {
  currency: string
  rows: Record<string, unknown>[]
  /** Totals row keyed by column.key; numeric/currency columns summed within this group. */
  totals: Record<string, number>
}

/** The normalized report shape that report builders return and both exporters consume. */
export interface ReportData {
  /** i18n key for the report title shown in headers/footers (e.g. 'reports.type.income'). */
  titleKey: string
  /** Optional subtitle key (e.g. period description). */
  subtitleKey?: string
  /** Shared columns (every currency group uses the same column set). */
  columns: ReportColumn[]
  /** Rows grouped per currency (BR-14). Most reports have exactly one group. */
  groups: ReportCurrencyGroup[]
  /** When the report spans multiple currencies, an optional consolidated figure may be added by
   *  the builder; it is rendered as a clearly-labeled footnote, never as a silent mixed sum. */
  consolidatedNote?: string
  /**
   * Optional single group whose rows are the same transactions expressed in the configured
   * REPORTING currency via each row's frozen exchange-rate snapshot (base_amount). Rendered as a
   * distinct "Consolidated" table ABOVE the per-currency groups so the user sees reporting-
   * currency values without losing the native-currency detail below. Undefined when every row is
   * already in the reporting currency (no conversion needed → no redundant section).
   */
  consolidatedGroup?: ReportCurrencyGroup
}

/** Page size cap — every list query is bounded per NFR-PAGE-01. */
export const REPORT_ROW_LIMIT = 5000

/**
 * Group report rows by their currency field. This is the single enforcement point for BR-14:
 * reports that span multiple currencies produce multiple groups, each with its own totals.
 *
 * @param rows         raw rows from the DB query
 * @param currencyField the row field that holds the ISO currency code
 * @param sumColumns   column keys that should be summed per group (numeric/currency columns)
 * @returns one ReportCurrencyGroup per distinct currency, in first-seen order
 */
export function groupByCurrency(
  rows: Record<string, unknown>[],
  currencyField: string,
  sumColumns: string[]
): ReportCurrencyGroup[] {
  const groupMap = new Map<string, Record<string, unknown>[]>()
  for (const row of rows) {
    const currency = String(row[currencyField] ?? '')
    if (!groupMap.has(currency)) groupMap.set(currency, [])
    groupMap.get(currency)!.push(row)
  }

  const groups: ReportCurrencyGroup[] = []
  for (const [currency, groupRows] of groupMap) {
    const totals: Record<string, number> = {}
    for (const col of sumColumns) {
      totals[col] = groupRows.reduce((sum, r) => sum + Number(r[col] ?? 0), 0)
    }
    groups.push({ currency, rows: groupRows, totals })
  }
  return groups
}

/**
 * Build a single consolidated group whose rows are the same transactions as `rows`, but with
 * each row's primary monetary field replaced by its frozen `base_amount` snapshot and `currency`
 * set to the reporting currency. Used to surface a reporting-currency view on top of the
 * per-currency native tables.
 *
 * CONSTRAINT: Pure w.r.t. `reportingCurrency` (caller resolves it from settings once and passes
 *             it in) so this helper stays side-effect-free and unit-testable without a DB.
 * CONSTRAINT: When a row's `base_amount` is NULL (no rate existed at write time), it falls back
 *             to its native `amountField` value (graceful) and the row's original currency is
 *             kept — so the consolidated total is never silently wrong, just mixed where
 *             snapshots are missing.
 * DECISION: Returns `undefined` (not an empty group) when EVERY row is already in the reporting
 *           currency — in that case the consolidated view would duplicate the single native
 *           group, so the renderer/exporter skips it entirely.
 *
 * @param rows              raw rows from the report SELECT; each must carry `base_amount`,
 *                          `reporting_currency`, and the native field named by `amountField`.
 * @param reportingCurrency the configured reporting currency (settings.reporting_currency).
 * @param amountField       the row field that holds the native monetary value AND that the
 *                          ReportColumn reads (e.g. 'amount' for income/expense,
 *                          'net_profit' for P&L). The consolidated row writes base_amount here.
 */
export function buildConsolidatedGroup(
  rows: Record<string, unknown>[],
  reportingCurrency: string,
  amountField: string
): ReportCurrencyGroup | undefined {
  if (rows.length === 0) return undefined

  // Skip when every row is already in the reporting currency (no conversion needed → the
  // consolidated view would duplicate the single native group).
  const allNative = rows.every(
    (r) => r['reporting_currency'] == null || r['reporting_currency'] === reportingCurrency
  )
  if (allNative) return undefined

  const consolidatedRows: Record<string, unknown>[] = rows.map((r) => {
    const base = r['base_amount']
    if (base == null) {
      // No snapshot — keep the row as-is (native currency + native amount). Graceful.
      return { ...r }
    }
    return { ...r, [amountField]: base, currency: reportingCurrency }
  })

  const totals: Record<string, number> = {
    [amountField]: consolidatedRows.reduce((sum, r) => sum + Number(r[amountField] ?? 0), 0)
  }

  return { currency: reportingCurrency, rows: consolidatedRows, totals }
}

/**
 * Build a human-readable, filesystem-safe filename per SRS §15: `[Type]_[From]_to_[To].ext`.
 * Dates with no dashes so the filename is safe on every OS.
 */
export function buildFileName(
  reportType: string,
  fromDate: string | undefined,
  toDate: string | undefined,
  ext: ExportFormat
): string {
  const from = (fromDate ?? 'all').replace(/-/g, '')
  const to = (toDate ?? 'now').replace(/-/g, '')
  const base = `${reportType}_${from}_to_${to}`.replace(/\s+/g, '_')
  return `${base}.${ext}`
}

/**
 * Resolve a set of i18n keys into localized strings on the main-process side.
 * Missing keys throw — there is never a silent fallback to the raw key (BR-29 / NFR-I18N-03).
 *
 * CAVEAT: locale JSON files live under `src/renderer/locales/`. We resolve them via
 *         `app.getAppPath()` (or `process.cwd()` in Vitest) so the path works both
 *         in the bundled Electron output and under test.
 */
const localeCache = new Map<ExportLanguage, Record<string, unknown>>()

/**
 * Resolve the project root. In the bundled Electron app, use `app.getAppPath()`.
 * In Vitest (no Electron), fall back to `process.cwd()` which is the project root.
 */
function resolveAppRoot(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require('electron') as { app?: { getAppPath(): string } }
    if (electron?.app?.getAppPath) return electron.app.getAppPath()
  } catch {
    // Not in Electron context
  }
  return process.cwd()
}

function loadLocale(lang: ExportLanguage): Record<string, unknown> {
  const cached = localeCache.get(lang)
  if (cached) return cached
  const appRoot = resolveAppRoot()
  const filePath = join(appRoot, 'src', 'renderer', 'locales', `${lang}.json`)
  const raw = readFileSync(filePath, 'utf-8')
  const parsed = JSON.parse(raw) as Record<string, unknown>
  localeCache.set(lang, parsed)
  return parsed
}

/** Resolve a dotted i18n key (e.g. 'reports.type.income') against the locale object tree. */
export function resolveLocaleKey(key: string, lang: ExportLanguage): string {
  const root = loadLocale(lang)
  const parts = key.split('.')
  let node: unknown = root
  for (const part of parts) {
    if (node && typeof node === 'object' && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part]
    } else {
      throw new Error(`I18N_KEY_MISSING:${key}:${lang}`)
    }
  }
  if (typeof node !== 'string') {
    throw new Error(`I18N_KEY_NOT_STRING:${key}:${lang}`)
  }
  return node
}

/** HTML-escape any user-supplied string before interpolation into the HTML report (BR-31). */
export function escapeHtml(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Escape a string for safe interpolation into a JS string literal in the HTML report. */
export function escapeJs(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n')
}

/**
 * Write a buffer to `targetPath` atomically: write to a sibling temp file, then rename over the
 * target. A partial write (crash mid-write, disk full) never leaves a corrupt file in place of a
 * previously-good one.
 */
export async function writeFileAtomic(targetPath: string, data: Buffer): Promise<void> {
  const dir = dirname(targetPath)
  const tmpPath = join(dir, `.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  await writeFile(tmpPath, data)
  await rename(tmpPath, targetPath)
}

/** Format a number using Intl with Western Arabic numerals per NFR-I18N-07. */
export function formatNumber(value: number, lang: ExportLanguage, currency?: string): string {
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en'
  if (currency) {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      currencyDisplay: 'code',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value)
  }
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value)
}
