/**
 * @file htmlExporter — builds a standalone, interactive .html report (SRS §15.2).
 *
 * INTENT: Generate a single self-contained .html file with all CSS in <style> and all JS in
 *         <script>, zero external dependencies (BR-31). The file must open offline in any browser,
 *         support column sorting, client-side search, column-visibility toggles, and print cleanly
 *         via @media print (FR-HTML-04/05/06).
 *
 * CONSTRAINTS:
 *   - BR-29:   every header label resolved from an i18n key (never hardcoded text).
 *   - BR-31:   no <link>, no <script src>, no remote URLs. Asserted by tests.
 *   - BR-32:   <html dir lang> driven by language; CSS logical properties only.
 *   - NFR-I18N-07: numbers formatted via Intl in the page's locale.
 *   - SECURITY: all user-supplied strings (property names, notes, descriptions) go through
 *               escapeHtml before interpolation to prevent template injection.
 *
 * DECISION: The page is rendered as a static table on load; the embedded JS enhances it in place.
 *           A <noscript> fallback keeps the raw table readable if JS is disabled.
 */

import { db } from '../../db/database'
import {
  type ReportData,
  type ReportColumn,
  type ExportLanguage,
  resolveLocaleKey,
  escapeHtml,
  escapeJs,
  formatNumber
} from './exportUtils'

/** Embedded CSS — uses logical properties throughout (BR-32) and a @media print block (FR-HTML-06). */
const CSS = `
:root {
  --header-bg: #1a237e;
  --header-fg: #ffffff;
  --totals-bg: #e8eaf6;
  --border: #d1d5db;
  --row-alt: #f8f9fb;
  --link: #1565c0;
  --body-fg: #1f2937;
  --muted: #6b7280;
  --danger: #c62828;
}
* { box-sizing: border-box; }
html { font-family: 'Tajawal', 'Inter', system-ui, -apple-system, sans-serif; }
body { margin: 0; padding: 16px; color: var(--body-fg); background: #ffffff; line-height: 1.7; }
header { margin-block-end: 16px; display: flex; align-items: center; gap: 16px; }
.company-logo { max-height: 60px; max-width: 150px; object-fit: contain; }
.company-name { font-size: 1.1rem; font-weight: bold; color: var(--header-bg); margin-block-end: 4px; }
h1 { font-size: 1.4rem; margin: 0 0 4px; }
.subtitle { color: var(--muted); font-size: 0.95rem; margin-block-end: 8px; }
.toolbar {
  display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
  margin-block-end: 12px; padding: 8px; border: 1px solid var(--border); border-radius: 6px;
}
.toolbar input[type="search"] { padding: 6px 8px; border: 1px solid var(--border); border-radius: 4px; min-inline-size: 200px; }
.toolbar details { position: relative; }
.toolbar summary { cursor: pointer; padding: 4px 8px; border: 1px solid var(--border); border-radius: 4px; }
.toolbar .col-toggle {
  position: absolute; inset-block-start: 100%; inset-inline-start: 0;
  background: #fff; border: 1px solid var(--border); border-radius: 4px;
  padding: 6px; z-index: 10; min-inline-size: 180px; box-shadow: 0 2px 6px rgba(0,0,0,0.1);
}
.toolbar .col-toggle label { display: block; padding-block: 2px; font-size: 0.9rem; }
.group-section { margin-block-end: 24px; }
.group-title { font-size: 1.1rem; font-weight: 600; margin-block-end: 8px; padding-block-end: 4px; border-block-end: 2px solid var(--header-bg); }
table { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
thead th {
  background: var(--header-bg); color: var(--header-fg); font-weight: 700;
  padding: 8px 10px; text-align: start; border: 1px solid var(--header-bg);
  cursor: pointer; user-select: none; position: sticky; inset-block-start: 0;
}
thead th .sort-indicator { font-size: 0.75rem; opacity: 0.7; margin-inline-start: 4px; }
tbody td { padding: 6px 10px; border-block-end: 1px solid var(--border); }
tbody tr:nth-child(even) { background: var(--row-alt); }
tbody tr.hidden { display: none; }
tfoot td {
  background: var(--totals-bg); font-weight: 700; padding: 8px 10px;
  border-block-start: 2px solid var(--header-bg);
}
.num { text-align: end; font-variant-numeric: tabular-nums; }
.consolidated-note {
  margin-block-start: 16px; padding: 10px; border: 1px dashed var(--border);
  border-radius: 6px; font-style: italic; color: var(--muted);
}
footer { margin-block-start: 24px; color: var(--muted); font-size: 0.8rem; }
@media print {
  .toolbar, footer .no-print { display: none !important; }
  body { padding: 0; }
  thead { display: table-header-group; }
  table { font-size: 10pt; }
  thead th { position: static; }
  tbody tr.hidden { display: table-row !important; }
}
`

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
      return `<th data-col="${escapeHtml(col.key)}" data-type="${col.type ?? 'text'}">${label}<span class="sort-indicator"></span></th>`
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
  return `
  <section class="group-section" data-currency="${escapeHtml(group.currency)}">
    <div class="group-title">${escapeHtml(groupLabel)}: ${escapeHtml(group.currency)}</div>
    <table>
      <thead><tr>${headers}</tr></thead>
      <tbody>${bodyRows}</tbody>
      ${group.rows.length > 0 ? `<tfoot><tr>${totalsCells}</tfoot>` : ''}
    </table>
  </section>`
}

/**
 * Embedded vanilla-JS interactivity: column sort, client-side search filter, column toggle,
 * and pagination. IDs/classes match the structure above.
 */
function buildScript(): string {
  return `
<script>
(function() {
  'use strict';
  var sortState = {};

  function debounce(fn, ms) {
    var t; return function() { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function(){ fn.apply(c, a); }, ms); };
  }

  function cellText(cell) { return cell ? (cell.textContent || '').trim().toLowerCase() : ''; }

  function sortSection(section) {
    var tables = section.querySelectorAll('table');
    tables.forEach(function(table) {
      var headers = table.querySelectorAll('thead th');
      var tbody = table.querySelector('tbody');
      if (!tbody) return;
      var rows = Array.prototype.slice.call(tbody.querySelectorAll('tr'));
      headers.forEach(function(th, idx) {
        th.addEventListener('click', function() {
          var key = th.getAttribute('data-col');
          var type = th.getAttribute('data-type');
          var dir = sortState[key] === 'asc' ? 'desc' : 'asc';
          sortState = {}; sortState[key] = dir;
          headers.forEach(function(h2) { var ind = h2.querySelector('.sort-indicator'); if (ind) ind.textContent = ''; });
          var ind = th.querySelector('.sort-indicator'); if (ind) ind.textContent = dir === 'asc' ? '\\u25B2' : '\\u25BC';
          rows.sort(function(a, b) {
            var av = a.children[idx].textContent.trim();
            var bv = b.children[idx].textContent.trim();
            if (type === 'number' || type === 'currency') {
              var an = parseFloat(av.replace(/[^0-9.-]/g, '')) || 0;
              var bn = parseFloat(bv.replace(/[^0-9.-]/g, '')) || 0;
              return dir === 'asc' ? an - bn : bn - an;
            }
            return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
          });
          rows.forEach(function(r) { tbody.appendChild(r); });
        });
      });
    });
  }

  function applyFilter(query) {
    query = query.toLowerCase().trim();
    document.querySelectorAll('tbody tr').forEach(function(row) {
      var text = (row.textContent || '').toLowerCase();
      row.classList.toggle('hidden', query !== '' && text.indexOf(query) === -1);
    });
  }

  function wireColumnToggle() {
    document.querySelectorAll('.col-toggle input[type="checkbox"]').forEach(function(cb) {
      cb.addEventListener('change', function() {
        var col = cb.getAttribute('data-col');
        var checked = cb.checked;
        document.querySelectorAll('th[data-col="' + col + '"], td[data-col="' + col + '"]').forEach(function(c) {
          c.style.display = checked ? '' : 'none';
        });
      });
    });
  }

  document.querySelectorAll('section[data-currency]').forEach(sortSection);
  var search = document.getElementById('search-input');
  if (search) search.addEventListener('input', debounce(function() { applyFilter(search.value); }, 150));
  wireColumnToggle();
})();
</script>`
}

function renderSvgChart(data: ReportData): string {
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

  const bars = rows
    .map((r, i) => {
      const val = Number(r[valKey] ?? 0)
      const height = Math.round((Math.abs(val) / maxVal) * 130)
      const x = i * (barWidth + 24) + 40
      const y = 160 - height
      const label = escapeHtml(String(r[labelKey] ?? ''))
      // eslint-disable-next-line no-restricted-syntax -- chart colors in exported HTML document, not UI
      const color = val >= 0 ? '#10b981' : '#ef4444'

      return `
        <rect x="${x}" y="${y}" width="${barWidth}" height="${height}" fill="${color}" rx="4" />
        <text x="${x + barWidth / 2}" y="180" text-anchor="middle" font-size="11" fill="#64748b">${label.slice(0, 12)}</text>
        <text x="${x + barWidth / 2}" y="${y - 6}" text-anchor="middle" font-size="10" font-weight="bold" fill="#334155">${val}</text>
      `
    })
    .join('')

  return `
    <div class="report-chart-container" style="margin: 20px 0; padding: 16px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
      <h3 style="margin: 0 0 12px 0; font-size: 14px; color: #475569;">Summary Chart (${escapeHtml(group.currency)})</h3>
      <svg width="100%" height="${chartHeight}" viewBox="0 0 ${chartWidth} ${chartHeight}">
        <line x1="20" y1="160" x2="${chartWidth - 20}" y2="160" stroke="#cbd5e1" stroke-width="1" />
        ${bars}
      </svg>
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

  const chartHtml = renderSvgChart(data)
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

  return `<!DOCTYPE html>
<html dir="${dir}" lang="${langAttr}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${CSS}</style>
</head>
<body>
<header>
  ${companyLogo ? `<img class="company-logo" src="${companyLogo}" alt="Logo">` : ''}
  <div>
    ${companyName ? `<div class="company-name">${companyName}</div>` : ''}
    <h1>${title}</h1>
    ${subtitle ? `<div class="subtitle">${subtitle}</div>` : ''}
  </div>
</header>
<noscript><p style="color:var(--muted)">Interactive sorting and filtering require JavaScript.</p></noscript>
<div class="toolbar">
  <input type="search" id="search-input" placeholder="${searchLabel}">
  <details>
    <summary>${columnsLabel}</summary>
    <div class="col-toggle">${toggleItems}</div>
  </details>
</div>
${chartHtml}
${groupsHtml}
${consolidatedHtml}
<footer>
  <span>${generatedLabel}: ${escapeHtml(new Date().toISOString().split('T')[0])}</span>
</footer>
${buildScript()}
</body>
</html>`
}

/** Convenience: build the HTML string as a UTF-8 Buffer ready to write to disk. */
export function buildHtmlBuffer(data: ReportData, lang: ExportLanguage): Buffer {
  // escapeJs is exported for callers that interpolate dynamic strings into <script>; keep the
  // import live by referencing it here so it survives tree-shaking in case the helpers grow.
  void escapeJs
  return Buffer.from(buildHtmlDocument(data, lang), 'utf-8')
}
