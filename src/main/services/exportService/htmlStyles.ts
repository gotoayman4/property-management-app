/**
 * @file htmlStyles — embedded stylesheet for the standalone HTML report (SRS §15.2).
 *
 * INTENT: Single source of the report's visual layer: design tokens via CSS custom
 *         properties, fluid type via clamp(), responsive breakpoints (mobile <640px,
 *         tablet/desktop ≥641px), horizontal table scrolling via .table-wrap, print
 *         rules, and chart styling. Everything is inline so the file stays self-contained
 *         (BR-31) and opens offline.
 *
 * CONSTRAINTS:
 *   - BR-32: logical CSS properties ONLY — physical margin-left/right/padding-left/right
 *            are banned and asserted by tests. No [dir="rtl"] overrides needed.
 *   - BR-31: no url(), no @import, no external fonts — the stack is system fonts.
 *   - Print: interactive chrome (.toolbar, pagination, back-to-top) hidden; hidden rows
 *            are force-shown so a filtered report prints in full (FR-HTML-06).
 *   - Arabic: line-height ≥1.6, font-weight ≥400, no letter-spacing on text, no opacity
 *            on text blocks (jagged Firefox rendering), no word-break.
 *
 * DECISION: Split into a dedicated module so htmlExporter stays under the 500-line cap —
 *           this file is pure data (one exported string), no logic.
 */
export const REPORT_CSS = `
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
  --surface: #ffffff;
  --toolbar-bg: #fafafa;
  --chart-bg: #f8fafc;
  --chart-border: #e2e8f0;
  --chart-grid: #cbd5e1;
  --chart-label: #64748b;
  --chart-value: #334155;
  --bar-pos: #10b981;
  --bar-neg: #ef4444;
}
* { box-sizing: border-box; }
html { font-family: 'Tajawal', 'Inter', system-ui, -apple-system, sans-serif; scroll-behavior: smooth; }
body { margin: 0; padding: clamp(8px, 3vw, 24px); color: var(--body-fg); background: var(--surface); line-height: 1.7; }
header { margin-block-end: 16px; display: flex; flex-wrap: wrap; align-items: center; gap: 16px; }
.company-logo { max-height: 60px; max-width: 150px; object-fit: contain; }
.company-name { font-size: 1.1rem; font-weight: 700; color: var(--header-bg); margin-block-end: 4px; }
h1 { font-size: clamp(1.25rem, 1rem + 1.5vw, 1.6rem); margin: 0 0 4px; }
.subtitle { color: var(--muted); font-size: 0.95rem; margin-block-end: 8px; }
.toolbar {
  display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
  margin-block-end: 12px; padding: clamp(6px, 1vw, 10px);
  border: 1px solid var(--border); border-radius: 6px; background: var(--toolbar-bg);
}
.toolbar input[type="search"] {
  flex: 1 1 200px; min-inline-size: 160px;
  padding: 6px 8px; border: 1px solid var(--border); border-radius: 4px; font: inherit;
}
.toolbar details { position: relative; }
.toolbar summary { cursor: pointer; padding: 4px 8px; border: 1px solid var(--border); border-radius: 4px; }
.toolbar .col-toggle {
  position: absolute; inset-block-start: 100%; inset-inline-start: 0;
  background: var(--surface); border: 1px solid var(--border); border-radius: 4px;
  padding: 6px; z-index: 10; min-inline-size: 180px;
  max-block-size: 60vh; overflow-y: auto; box-shadow: 0 2px 6px rgba(0,0,0,0.1);
}
.toolbar .col-toggle label { display: block; padding-block: 2px; font-size: 0.9rem; }
.report-status { color: var(--muted); font-size: 0.85rem; min-block-size: 1.3em; margin-block-end: 8px; }
.report-status.empty { color: var(--danger); font-weight: 600; }
.group-section { margin-block-end: 24px; }
.group-title { font-size: 1.1rem; font-weight: 600; margin-block-end: 8px; padding-block-end: 4px; border-block-end: 2px solid var(--header-bg); }
.table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; border: 1px solid var(--border); border-radius: 6px; }
.table-wrap:focus-visible { outline: 2px solid var(--link); outline-offset: 2px; }
table { width: 100%; min-inline-size: 480px; border-collapse: collapse; font-size: clamp(0.8rem, 0.75rem + 0.4vw, 0.92rem); }
thead th {
  background: var(--header-bg); color: var(--header-fg); font-weight: 700;
  padding: 8px 10px; text-align: start; border: 1px solid var(--header-bg);
  cursor: pointer; user-select: none;
}
@media (min-width: 641px) {
  thead th { position: sticky; inset-block-start: 0; }
}
thead th .sort-indicator { font-size: 0.75rem; opacity: 0.7; margin-inline-start: 4px; }
tbody td { padding: 6px 10px; border-block-end: 1px solid var(--border); }
tbody tr:nth-child(even) { background: var(--row-alt); }
tbody tr.filtered-out, tbody tr.page-hidden { display: none; }
tfoot td {
  background: var(--totals-bg); font-weight: 700; padding: 8px 10px;
  border-block-start: 2px solid var(--header-bg);
}
.num { text-align: end; font-variant-numeric: tabular-nums; }
.pagination { display: flex; align-items: center; justify-content: center; gap: 8px; margin-block-start: 8px; }
.page-btn { font: inherit; padding: 6px 14px; border: 1px solid var(--border); border-radius: 4px; background: var(--surface); cursor: pointer; }
.page-btn:hover:not(:disabled) { border-color: var(--link); color: var(--link); }
.page-btn:disabled { opacity: 0.5; cursor: default; }
.page-info { color: var(--muted); font-size: 0.85rem; }
.report-chart { margin-block: 20px; padding: clamp(10px, 2vw, 16px); background: var(--chart-bg); border-radius: 8px; border: 1px solid var(--chart-border); }
.report-chart .chart-title { margin: 0 0 12px; font-size: 0.95rem; color: var(--chart-label); }
.chart-scroll { overflow-x: auto; }
.chart-scroll svg { display: block; width: 100%; min-inline-size: 460px; }
.bar-pos { fill: var(--bar-pos); }
.bar-neg { fill: var(--bar-neg); }
.chart-grid-line { stroke: var(--chart-grid); }
.chart-label { fill: var(--chart-label); font-size: 11px; }
.chart-value { fill: var(--chart-value); font-size: 10px; font-weight: 700; }
.consolidated-note {
  margin-block-start: 16px; padding: 10px; border: 1px dashed var(--border);
  border-radius: 6px; font-style: italic; color: var(--muted);
}
footer { margin-block-start: 24px; color: var(--muted); font-size: 0.8rem; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 4px 16px; }
.back-to-top { color: var(--link); text-decoration: none; }
.back-to-top:hover { text-decoration: underline; }
.visually-hidden {
  position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden;
  clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap;
}
@media (max-width: 640px) {
  .toolbar input[type="search"] { flex-basis: 100%; font-size: 16px; }
  .toolbar .col-toggle { position: static; inset-inline-start: auto; box-shadow: none; min-inline-size: 100%; }
  .toolbar summary, .page-btn { padding-block: 10px; }
  .toolbar .col-toggle label { padding-block: 6px; }
  thead th { padding-block: 12px; }
  table { font-size: 0.85rem; }
}
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
@media print {
  .toolbar, .pagination, .back-to-top { display: none !important; }
  body { padding: 0; }
  thead { display: table-header-group; }
  table { font-size: 10pt; min-inline-size: 0; }
  .table-wrap { overflow: visible; border: 0; }
  thead th { position: static; }
  tbody tr.filtered-out, tbody tr.page-hidden { display: table-row !important; }
  .group-section, .report-chart { break-inside: avoid; }
}
`
