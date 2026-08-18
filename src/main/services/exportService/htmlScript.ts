/**
 * @file htmlScript — embedded vanilla-JS interactivity for the standalone HTML report.
 *
 * INTENT: Provide column sorting, client-side search with live result feedback, per-table
 *         pagination (50 rows/page), and column-visibility toggles — all in one inline
 *         <script> so the exported file stays self-contained (BR-31) and works offline.
 *
 * CONSTRAINTS:
 *   - BR-31: no external scripts; the whole script is returned as a string literal.
 *   - BR-29: every user-visible string is pre-resolved server-side from an i18n key and
 *            passed in via `labels`; escapeJs() prevents quote-injection into literals.
 *   - No-JS fallback: the raw static HTML remains readable without this script; search
 *            filters and pagination only hide rows (print CSS force-shows them).
 *   - Filtering and pagination use separate classes (.filtered-out / .page-hidden) so
 *            they never fight over the same <tr>.
 *
 * DECISION: Split from htmlExporter into a dedicated module because pagination and search
 *           feedback grew the script past what fits comfortably in the exporter file
 *           (500-line cap). The DOM contract (ids/classes) is shared with htmlExporter
 *           and htmlStyles; change all three together.
 */

import { escapeJs } from './exportUtils'

/** Localized strings resolved from i18n keys by the caller — never hardcoded here (BR-29). */
export interface ScriptLabels {
  /** 'Showing {{shown}} of {{total}} rows' — {{}} placeholders interpolated at runtime. */
  showingRows: string
  /** Empty-search message. */
  noResults: string
  /** 'Page {{page}} of {{pages}}' — {{}} placeholders interpolated at runtime. */
  pageInfo: string
  /** Previous-page button label. */
  prevPage: string
  /** Next-page button label. */
  nextPage: string
}

/** Rows per page for tables exceeding the threshold. */
const PAGE_SIZE = 50

/**
 * Build the inline <script> block that enhances the static report tables in place.
 *
 * @param labels localized strings for the interactive chrome (BR-29)
 * @returns a complete <script>...</script> string, safe to inline into the document
 */
export function buildScript(labels: ScriptLabels): string {
  const L = {
    showingRows: escapeJs(labels.showingRows),
    noResults: escapeJs(labels.noResults),
    pageInfo: escapeJs(labels.pageInfo),
    prevPage: escapeJs(labels.prevPage),
    nextPage: escapeJs(labels.nextPage)
  }
  return `
<script>
(function() {
  'use strict';
  var PAGE_SIZE = ${PAGE_SIZE};
  var L = {
    showingRows: '${L.showingRows}',
    noResults: '${L.noResults}',
    pageInfo: '${L.pageInfo}',
    prevPage: '${L.prevPage}',
    nextPage: '${L.nextPage}'
  };
  var sortState = {};
  var pagers = [];

  function tpl(t, p) {
    return t.replace(/\\{\\{(\\w+)\\}\\}/g, function(m, k) { return p[k] != null ? p[k] : m; });
  }

  function debounce(fn, ms) {
    var t;
    return function() {
      var a = arguments, c = this;
      clearTimeout(t);
      t = setTimeout(function() { fn.apply(c, a); }, ms);
    };
  }

  function cellText(cell) { return cell ? (cell.textContent || '').trim().toLowerCase() : ''; }

  // ---------- per-table pagination ----------
  function makePager(table) {
    var tbody = table.querySelector('tbody');
    if (!tbody) return null;
    var rows = Array.prototype.slice.call(tbody.querySelectorAll('tr'));
    if (rows.length <= PAGE_SIZE) return null;

    var wrap = table.closest('.table-wrap') || table;
    var pager = document.createElement('div');
    pager.className = 'pagination no-print';
    var prev = document.createElement('button');
    var next = document.createElement('button');
    var info = document.createElement('span');
    prev.type = 'button'; next.type = 'button';
    prev.className = 'page-btn'; next.className = 'page-btn';
    info.className = 'page-info';
    prev.textContent = L.prevPage;
    next.textContent = L.nextPage;
    pager.appendChild(prev);
    pager.appendChild(info);
    pager.appendChild(next);
    wrap.insertAdjacentElement('afterend', pager);

    var state = { page: 1 };

    function render() {
      // Read rows fresh from the DOM each time so sorting (which reorders the tbody)
      // stays consistent with pagination.
      var currentRows = Array.prototype.slice.call(tbody.querySelectorAll('tr'));
      var visibleCount = currentRows.filter(function(r) {
        return !r.classList.contains('filtered-out');
      }).length;
      state.pages = Math.max(1, Math.ceil(visibleCount / PAGE_SIZE));
      if (state.page > state.pages) state.page = state.pages;
      var from = (state.page - 1) * PAGE_SIZE;
      currentRows.forEach(function(r, i) {
        r.classList.toggle('page-hidden', i < from || i >= from + PAGE_SIZE);
      });
      info.textContent = tpl(L.pageInfo, { page: String(state.page), pages: String(state.pages) });
      prev.disabled = state.page <= 1;
      next.disabled = state.page >= state.pages;
    }

    prev.addEventListener('click', function() { if (state.page > 1) { state.page--; render(); } });
    next.addEventListener('click', function() { if (state.page < state.pages) { state.page++; render(); } });
    state.reset = function() { state.page = 1; render(); };
    render();
    return state;
  }

  // ---------- column sorting ----------
  function wireSorting(table) {
    var headers = table.querySelectorAll('thead th');
    var tbody = table.querySelector('tbody');
    if (!tbody) return;
    var rows = Array.prototype.slice.call(tbody.querySelectorAll('tr'));
    headers.forEach(function(th, idx) {
      th.addEventListener('click', function() {
        var key = th.getAttribute('data-col');
        var type = th.getAttribute('data-type');
        var dir = sortState[key] === 'asc' ? 'desc' : 'asc';
        sortState = {};
        sortState[key] = dir;
        headers.forEach(function(h2) {
          var ind = h2.querySelector('.sort-indicator');
          if (ind) ind.textContent = '';
          h2.removeAttribute('aria-sort');
        });
        th.setAttribute('aria-sort', dir === 'asc' ? 'ascending' : 'descending');
        var ind = th.querySelector('.sort-indicator');
        if (ind) ind.textContent = dir === 'asc' ? '\\u25B2' : '\\u25BC';
        rows.sort(function(a, b) {
          var av = cellText(a.children[idx]);
          var bv = cellText(b.children[idx]);
          if (type === 'number' || type === 'currency') {
            var an = parseFloat(av.replace(/[^0-9.-]/g, '')) || 0;
            var bn = parseFloat(bv.replace(/[^0-9.-]/g, '')) || 0;
            return dir === 'asc' ? an - bn : bn - an;
          }
          return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
        });
        rows.forEach(function(r) { tbody.appendChild(r); });
        if (table.__pager) table.__pager.reset();
      });
    });
  }

  // ---------- search filter + live feedback ----------
  var statusEl = document.getElementById('report-status');

  function updateStatus() {
    if (!statusEl) return;
    var total = 0, shown = 0;
    document.querySelectorAll('tbody tr').forEach(function(r) {
      total++;
      if (!r.classList.contains('filtered-out')) shown++;
    });
    statusEl.classList.toggle('empty', shown === 0);
    statusEl.textContent = shown === 0 ? L.noResults : tpl(L.showingRows, { shown: String(shown), total: String(total) });
  }

  function applyFilter(query) {
    query = query.toLowerCase().trim();
    document.querySelectorAll('tbody tr').forEach(function(row) {
      var text = (row.textContent || '').toLowerCase();
      row.classList.toggle('filtered-out', query !== '' && text.indexOf(query) === -1);
    });
    pagers.forEach(function(p) { p.reset(); });
    updateStatus();
  }

  // ---------- column visibility toggles ----------
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

  // ---------- init ----------
  document.querySelectorAll('section[data-currency] table').forEach(function(table) {
    wireSorting(table);
    var pager = makePager(table);
    if (pager) {
      pagers.push(pager);
      table.__pager = pager;
    }
  });
  var search = document.getElementById('search-input');
  if (search) search.addEventListener('input', debounce(function() { applyFilter(search.value); }, 150));
  wireColumnToggle();
  updateStatus();
})();
</script>`
}
