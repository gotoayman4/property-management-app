/**
 * @file dataGridLocale — Builds a complete MUI DataGrid localeText object from i18n keys.
 *
 * INTENT: All DataGrid built-in UI text (column menu, sort labels, pagination, filter panel,
 *         column management panel) must be translated when the app is in Arabic mode.
 *         This function maps the `table.*` i18n namespace to the GridLocaleText shape.
 *
 * CONSTRAINT: We spread the MUI defaults first, then override only the keys we translate.
 *             This ensures all required keys are present even if we don't translate every one.
 */
import { GRID_DEFAULT_LOCALE_TEXT } from '@mui/x-data-grid'
import type { GridLocaleText } from '@mui/x-data-grid'
import type { TFunction } from 'i18next'

/**
 * Returns the full DataGrid locale text object using the provided i18n `t` function.
 * Overrides the MUI English defaults with translated strings from the `table.*` namespace.
 */
export function getGridLocaleText(t: TFunction): GridLocaleText {
  return {
    ...GRID_DEFAULT_LOCALE_TEXT,

    // Root
    noRowsLabel: t('table.noRowsLabel'),
    noResultsOverlayLabel: t('table.noResultsOverlayLabel'),
    noColumnsOverlayLabel: t('table.noColumnsOverlayLabel'),
    noColumnsOverlayManageColumns: t('table.noColumnsOverlayManageColumns'),

    // Density selector
    toolbarDensity: t('table.toolbarDensity'),
    toolbarDensityLabel: t('table.toolbarDensityLabel'),
    toolbarDensityCompact: t('table.toolbarDensityCompact'),
    toolbarDensityStandard: t('table.toolbarDensityStandard'),
    toolbarDensityComfortable: t('table.toolbarDensityComfortable'),

    // Undo/redo
    toolbarUndo: t('table.toolbarUndo'),
    toolbarRedo: t('table.toolbarRedo'),

    // Columns selector
    toolbarColumns: t('table.toolbarColumns'),
    toolbarColumnsLabel: t('table.toolbarColumnsLabel'),

    // Filters toolbar
    toolbarFilters: t('table.toolbarFilters'),
    toolbarFiltersLabel: t('table.toolbarFiltersLabel'),
    toolbarFiltersTooltipHide: t('table.toolbarFiltersTooltipHide'),
    toolbarFiltersTooltipShow: t('table.toolbarFiltersTooltipShow'),
    toolbarFiltersTooltipActive: (count) =>
      count !== 1
        ? `${count} ${t('table.toolbarFiltersTooltipActive_plural')}`
        : `${count} ${t('table.toolbarFiltersTooltipActive')}`,

    // Quick filter
    toolbarQuickFilterPlaceholder: t('table.toolbarQuickFilterPlaceholder'),
    toolbarQuickFilterLabel: t('table.toolbarQuickFilterLabel'),
    toolbarQuickFilterDeleteIconLabel: t('table.toolbarQuickFilterDeleteIconLabel'),

    // Export
    toolbarExport: t('table.toolbarExport'),
    toolbarExportLabel: t('table.toolbarExportLabel'),
    toolbarExportCSV: t('table.toolbarExportCSV'),
    toolbarExportPrint: t('table.toolbarExportPrint'),
    toolbarExportExcel: t('table.toolbarExportExcel'),

    // Columns management
    columnsManagementSearchTitle: t('table.columnsManagementSearchTitle'),
    columnsManagementNoColumns: t('table.columnsManagementNoColumns'),
    columnsManagementShowHideAllText: t('table.columnsManagementShowHideAllText'),
    columnsManagementReset: t('table.columnsManagementReset'),
    columnsManagementDeleteIconLabel: t('table.columnsManagementDeleteIconLabel'),

    // Filter panel
    filterPanelAddFilter: t('table.filterPanelAddFilter'),
    filterPanelRemoveAll: t('table.filterPanelRemoveAll'),
    filterPanelDeleteIconLabel: t('table.filterPanelDeleteIconLabel'),
    filterPanelLogicOperator: t('table.filterPanelLogicOperator'),
    filterPanelOperator: t('table.filterPanelOperator'),
    filterPanelOperatorAnd: t('table.filterPanelOperatorAnd'),
    filterPanelOperatorOr: t('table.filterPanelOperatorOr'),
    filterPanelColumn: t('table.filterPanelColumn'),
    filterPanelInputLabel: t('table.filterPanelInputLabel'),
    filterPanelInputPlaceholder: t('table.filterPanelInputPlaceholder'),

    // Filter operators
    filterOperatorContains: t('table.filterOperatorContains'),
    filterOperatorDoesNotContain: t('table.filterOperatorDoesNotContain'),
    filterOperatorEquals: t('table.filterOperatorEquals'),
    filterOperatorDoesNotEqual: t('table.filterOperatorDoesNotEqual'),
    filterOperatorStartsWith: t('table.filterOperatorStartsWith'),
    filterOperatorEndsWith: t('table.filterOperatorEndsWith'),
    filterOperatorIs: t('table.filterOperatorIs'),
    filterOperatorNot: t('table.filterOperatorNot'),
    filterOperatorAfter: t('table.filterOperatorAfter'),
    filterOperatorOnOrAfter: t('table.filterOperatorOnOrAfter'),
    filterOperatorBefore: t('table.filterOperatorBefore'),
    filterOperatorOnOrBefore: t('table.filterOperatorOnOrBefore'),
    filterOperatorIsEmpty: t('table.filterOperatorIsEmpty'),
    filterOperatorIsNotEmpty: t('table.filterOperatorIsNotEmpty'),
    filterOperatorIsAnyOf: t('table.filterOperatorIsAnyOf'),

    // Column menu
    columnMenuLabel: t('table.columnMenuLabel'),
    columnMenuAriaLabel: (columnName: string) => t('table.columnMenuAriaLabel', { columnName }),
    columnMenuShowColumns: t('table.columnMenuShowColumns'),
    columnMenuManageColumns: t('table.columnMenuManageColumns'),
    columnMenuFilter: t('table.columnMenuFilter'),
    columnMenuHideColumn: t('table.columnMenuHideColumn'),
    columnMenuUnsort: t('table.columnMenuUnsort'),
    columnMenuSortAsc: t('table.columnMenuSortAsc'),
    columnMenuSortDesc: t('table.columnMenuSortDesc'),

    // Column header
    columnHeaderFiltersTooltipActive: (count) =>
      count !== 1
        ? `${count} ${t('table.columnHeaderFiltersTooltipActive_plural')}`
        : `${count} ${t('table.columnHeaderFiltersTooltipActive')}`,
    columnHeaderFiltersLabel: t('table.columnHeaderFiltersLabel'),
    columnHeaderSortIconLabel: t('table.columnHeaderSortIconLabel'),

    // Footer
    footerRowSelected: (count) =>
      count !== 1
        ? `${count.toLocaleString()} ${t('table.footerRowSelected_plural')}`
        : `${count.toLocaleString()} ${t('table.footerRowSelected')}`,
    footerTotalRows: t('table.footerTotalRows'),
    footerTotalVisibleRows: (visibleCount, totalCount) =>
      `${visibleCount.toLocaleString()} ${t('table.footerTotalVisibleRows_of')} ${totalCount.toLocaleString()}`,

    // Checkbox selection
    checkboxSelectionHeaderName: t('table.checkboxSelectionHeaderName'),
    checkboxSelectionSelectAllRows: t('table.checkboxSelectionSelectAllRows'),
    checkboxSelectionUnselectAllRows: t('table.checkboxSelectionUnselectAllRows'),
    checkboxSelectionSelectRow: t('table.checkboxSelectionSelectRow'),
    checkboxSelectionUnselectRow: t('table.checkboxSelectionUnselectRow'),

    // Boolean cell
    booleanCellTrueLabel: t('table.booleanCellTrueLabel'),
    booleanCellFalseLabel: t('table.booleanCellFalseLabel'),

    // Long text cell
    longTextCellExpandLabel: t('table.longTextCellExpandLabel'),
    longTextCellCollapseLabel: t('table.longTextCellCollapseLabel'),

    // Actions cell
    actionsCellMore: t('table.actionsCellMore'),

    // Column pinning
    pinToLeft: t('table.pinToLeft'),
    pinToRight: t('table.pinToRight'),
    unpin: t('table.unpin'),

    // Tree data
    treeDataGroupingHeaderName: t('table.treeDataGroupingHeaderName'),
    treeDataExpand: t('table.treeDataExpand'),
    treeDataCollapse: t('table.treeDataCollapse'),

    // Grouping
    groupingColumnHeaderName: t('table.groupingColumnHeaderName'),
    groupColumn: (name) => t('table.groupColumn', { name }),
    unGroupColumn: (name) => t('table.unGroupColumn', { name }),

    // Master/detail
    detailPanelToggle: t('table.detailPanelToggle'),
    expandDetailPanel: t('table.expandDetailPanel'),
    collapseDetailPanel: t('table.collapseDetailPanel'),

    // Pagination
    paginationRowsPerPage: t('table.paginationRowsPerPage'),
    paginationDisplayedRows: ({ from, to, count, estimated }) => {
      const unknownRowCount = count == null || count === -1
      if (!estimated) {
        return `${from}\u2013${to} ${t('table.paginationDisplayedRows_of')} ${!unknownRowCount ? String(count) : `${t('table.paginationDisplayedRows_moreThan')} ${to}`}`
      }
      const estimatedLabel =
        estimated && estimated > to
          ? `${t('table.paginationDisplayedRows_around')} ${estimated}`
          : `${t('table.paginationDisplayedRows_moreThan')} ${to}`
      return `${from}\u2013${to} ${t('table.paginationDisplayedRows_of')} ${estimatedLabel}`
    },
    paginationItemAriaLabel: (type) => {
      if (type === 'first') return t('table.paginationItemAriaLabel_first')
      if (type === 'last') return t('table.paginationItemAriaLabel_last')
      if (type === 'next') return t('table.paginationItemAriaLabel_next')
      return t('table.paginationItemAriaLabel_previous')
    },

    // Row reordering
    rowReorderingHeaderName: t('table.rowReorderingHeaderName'),

    // Aggregation
    aggregationMenuItemHeader: t('table.aggregationMenuItemHeader'),
    aggregationFunctionLabelNone: t('table.aggregationFunctionLabelNone'),
    aggregationFunctionLabelSum: t('table.aggregationFunctionLabelSum'),
    aggregationFunctionLabelAvg: t('table.aggregationFunctionLabelAvg'),
    aggregationFunctionLabelMin: t('table.aggregationFunctionLabelMin'),
    aggregationFunctionLabelMax: t('table.aggregationFunctionLabelMax'),
    aggregationFunctionLabelSize: t('table.aggregationFunctionLabelSize')
  }
}
