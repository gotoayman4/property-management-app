/**
 * @file htmlExporter — builds a standalone, interactive .html report (SRS §15.2).
 *
 * INTENT: Generate a single self-contained .html file with all CSS in <style> and all JS in
 *         <script>, zero external dependencies (BR-31). The file must open offline in any
 *         browser, support column sorting, client-side search with live feedback, per-table
 *         pagination, column-visibility toggles, and print cleanly via @media print
 *         (FR-HTML-04/05/06). Layout is responsive: fluid type, horizontally scrollable
 *         tables on narrow screens, stacked header/toolbar on mobile.
 *
 * CONSTRAINTS:
 *   - BR-29:   every header label resolved from an i18n key (never hardcoded text).
 *   - BR-31:   no <link>, no <script src>, no remote URLs. Asserted by tests.
 *   - BR-32:   <html dir lang> driven by language; CSS logical properties only.
 *   - NFR-I18N-07: numbers formatted via Intl in the page's locale.
 *   - SECURITY: all user-supplied strings (property names, notes, descriptions) go through
 *               escapeHtml before interpolation to prevent template injection.
 *
 * DECISION: The page is rendered as a static table on load; the embedded JS (htmlScript.ts)
 *           enhances it in place. A <noscript> fallback keeps the raw table readable if JS
 *           is disabled. Styles live in htmlStyles.ts to keep this file under the line cap.
 */

import { db } from '../../db/database'
import {
  type ReportData,
  type ReportColumn,
  type ExportLanguage,
  resolveLocaleKey,
  escapeHtml,
  formatNumber
} from './exportUtils'
import { buildScript, type ScriptLabels } from './htmlScript'
import { REPORT_CSS } from './htmlStyles'

/**
 * Render one currency group as an HTML <section> with its own table.
 * BR-14: each currency gets its own visibly-titled section, never merged into a mixed sum.
 */
function renderGroup(
  group: { currency: string; rows: Record<string, unknown>[]; totals: Record<string, number> },
  columns: ReportColumn[],
  lang: ExportLanguage
): string {
  const headers = columns
    .map((col) => {
      const label = escapeHtml(resolveLocaleKey(col.headerKey, lang))
      return `<th scope="col" data-col="${escapeHtml(col.key)}" data-type="${col.type ?? 'text'}">${label}<span class="sort-indicator"></span></th>`
    })
    .join('')

  const bodyRows = group.rows
    .map((row) => {
      const cells = columns
        .map((col) => {
          const raw = row[col.key]
          let display: string
          if (col.type === 'currency' || col.type === 'number') {
            display = escapeHtml(
              formatNumber(
                Number(raw ?? 0),
                lang,
                col.type === 'currency' ? group.currency : undefined
              )
            )
          } else {
            display = escapeHtml(raw === null || raw === undefined ? '' : raw)
          }
          const numClass = col.type === 'currency' || col.type === 'number' ? ' class="num"' : ''
          return `<td data-col="${escapeHtml(col.key)}"${numClass}>${display}</td>`
        })
        .join('')
      return `<tr>${cells}</tr>`
    })
    .join('')

  // Totals row — only for columns flagged sumInTotals (+running-balance final value).
  const totalsCells = columns
    .map((col) => {
      if (col.sumInTotals || col.isRunningBalance) {
        const val = col.isRunningBalance
          ? Number(group.rows[group.rows.length - 1]?.[col.key] ?? 0)
          : Number(group.totals[col.key] ?? 0)
        const text = escapeHtml(
          formatNumber(val, lang, col.type === 'currency' ? group.currency : undefined)
        )
        return `<td class="num">${text}</td>`
      }
      return '<td></td>'
    })
    .join('')

  const groupLabel = resolveLocaleKey('reports.currencyGroup', lang)
  const caption = escapeHtml(`${groupLabel}: ${group.currency}`)
  return `
  <section class="group-section" data-currency="${escapeHtml(group.currency)}">
    <div class="group-title">${caption}</div>
    <div class="table-wrap" tabindex="0">
      <table>
        <caption class="visually-hidden">${caption}</caption>
        <thead><tr>${headers}</tr></thead>
        <tbody>${bodyRows}</tbody>
        ${group.rows.length > 0 ? `<tfoot><tr>${totalsCells}</tfoot>` : ''}
      </table>
    </div>
  </section>`
}

/**
 * Hand-built SVG bar chart (top 8 rows) with tooltips, localized title, and formatted
 * values. The svg scales fluidly (width 100%) and scrolls horizontally on narrow screens
 * (min-inline-size) instead of squishing labels.
 */
function renderSvgChart(data: ReportData, lang: ExportLanguage): string {
  const group = data.consolidatedGroup ?? data.groups[0]
  if (!group || group.rows.length === 0) return ''
  const rows = group.rows.slice(0, 8)
  const firstRow = rows[0]

  const labelKey =
    'name' in firstRow ? 'name' : 'code' in firstRow ? 'code' : Object.keys(firstRow)[0]
  const valKey =
    'net_profit' in firstRow
      ? 'net_profit'
      : 'total_income' in firstRow
        ? 'total_income'
        : 'amount' in firstRow
          ? 'amount'
          : null

  if (!valKey) return ''

  const chartHeight = 220
  const chartWidth = 600
  const barWidth = Math.max(24, Math.floor(chartWidth / (rows.length * 2)))
  const maxVal = Math.max(...rows.map((r) => Math.abs(Number(r[valKey] ?? 0))), 1)

  const title = escapeHtml(
    resolveLocaleKey('reports.summaryChart', lang, { currency: group.currency })
  )
  const bars = rows
    .map((r, i) => {
      const val = Number(r[valKey] ?? 0)
      const height = Math.round((Math.abs(val) / maxVal) * 130)
      const x = i * (barWidth + 24) + 40
      const y = 160 - height
      const label = escapeHtml(String(r[labelKey] ?? ''))
      const valueLabel = escapeHtml(formatNumber(val, lang))
      const fullLabel = escapeHtml(
        `${String(r[labelKey] ?? '')}: ${formatNumber(val, lang, group.currency)}`
      )
      const barClass = val >= 0 ? 'bar-pos' : 'bar-neg'

      return `
        <rect class="${barClass}" x="${x}" y="${y}" width="${barWidth}" height="${height}" rx="4"><title>${fullLabel}</title></rect>
        <text class="chart-label" x="${x + barWidth / 2}" y="180" text-anchor="middle">${label.slice(0, 12)}</text>
        <text class="chart-value" x="${x + barWidth / 2}" y="${y - 6}" text-anchor="middle">${valueLabel}</text>
      `
    })
    .join('')

  return `
    <div class="report-chart">
      <h3 class="chart-title">${title}</h3>
      <div class="chart-scroll">
        <svg viewBox="0 0 ${chartWidth} ${chartHeight}" role="img" aria-label="${title}">
          <line class="chart-grid-line" x1="20" y1="160" x2="${chartWidth - 20}" y2="160" stroke-width="1" />
          ${bars}
        </svg>
      </div>
    </div>
  `
}

/**
 * Build the complete standalone HTML document string for `data`.
 */
export function buildHtmlDocument(data: ReportData, lang: ExportLanguage): string {
  const dir = lang === 'ar' ? 'rtl' : 'ltr'
  const langAttr = lang
  const title = escapeHtml(resolveLocaleKey(data.titleKey, lang))
  const subtitle = data.subtitleKey ? escapeHtml(resolveLocaleKey(data.subtitleKey, lang)) : ''

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

  const companyName = settings?.company_name ? escapeHtml(settings.company_name) : ''
  const companyLogo = settings?.company_logo ? settings.company_logo : ''

  // Column-visibility toggle panel — populated from the shared column set.
  const toggleItems = data.columns
    .map(
      (col) =>
        `<label><input type="checkbox" checked data-col="${escapeHtml(col.key)}">${escapeHtml(resolveLocaleKey(col.headerKey, lang))}</label>`
    )
    .join('')

  const chartHtml = renderSvgChart(data, lang)
  const consolidatedGroupHtml = data.consolidatedGroup
    ? renderGroup(data.consolidatedGroup, data.columns, lang)
    : ''
  const groupsHtml =
    consolidatedGroupHtml + data.groups.map((g) => renderGroup(g, data.columns, lang)).join('')
  const consolidatedHtml = data.consolidatedNote
    ? `<div class="consolidated-note">${escapeHtml(data.consolidatedNote)}</div>`
    : ''

  const searchLabel = escapeHtml(resolveLocaleKey('reports.search', lang))
  const columnsLabel = escapeHtml(resolveLocaleKey('reports.columns', lang))
  const generatedLabel = escapeHtml(resolveLocaleKey('reports.generatedOn', lang))
  const backToTopLabel = escapeHtml(resolveLocaleKey('reports.backToTop', lang))
  const noScriptLabel = escapeHtml(resolveLocaleKey('reports.noScript', lang))
  const logoAlt = escapeHtml(resolveLocaleKey('reports.logoAlt', lang))
  const scriptLabels: ScriptLabels = {
    showingRows: resolveLocaleKey('reports.showingRows', lang),
    noResults: resolveLocaleKey('reports.noResults', lang),
    pageInfo: resolveLocaleKey('reports.pageInfo', lang),
    prevPage: resolveLocaleKey('reports.prevPage', lang),
    nextPage: resolveLocaleKey('reports.nextPage', lang)
  }

  return `<!DOCTYPE html>
<html dir="${dir}" lang="${langAttr}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${REPORT_CSS}</style>
</head>
<body>
<header id="top">
  ${companyLogo ? `<img class="company-logo" src="${companyLogo}" alt="${logoAlt}">` : ''}
  <div>
    ${companyName ? `<div class="company-name">${companyName}</div>` : ''}
    <h1>${title}</h1>
    ${subtitle ? `<div class="subtitle">${subtitle}</div>` : ''}
  </div>
</header>
<noscript><p style="color:var(--muted)">${noScriptLabel}</p></noscript>
<div class="toolbar">
  <input type="search" id="search-input" placeholder="${searchLabel}">
  <details>
    <summary>${columnsLabel}</summary>
    <div class="col-toggle">${toggleItems}</div>
  </details>
</div>
<div id="report-status" class="report-status no-print" role="status" aria-live="polite"></div>
${chartHtml}
${groupsHtml}
${consolidatedHtml}
<footer>
  <span>${generatedLabel}: ${escapeHtml(new Date().toISOString().split('T')[0])}</span>
  <a class="back-to-top" href="#top">${backToTopLabel}</a>
</footer>
${buildScript(scriptLabels)}
</body>
</html>`
}

/** Convenience: build the HTML string as a UTF-8 Buffer ready to write to disk. */
export function buildHtmlBuffer(data: ReportData, lang: ExportLanguage): Buffer {
  return Buffer.from(buildHtmlDocument(data, lang), 'utf-8')
}
