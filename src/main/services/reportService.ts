/**
 * @file reportService — data assembly dispatcher for the 11 core reports (SRS §5.7, §14).
 * INTENT: Dispatches report requests to reportQueries or extendedBuilders.
 */
import { Database } from 'better-sqlite3'
import {
  type ReportData,
  type ReportColumn,
  groupByCurrency,
  buildConsolidatedGroup,
  REPORT_ROW_LIMIT
} from './exportService/exportUtils'
import {
  type ReportFilters,
  type ReportType,
  ReportError,
  langOf,
  dateRangeClause,
  buildIncomeReport,
  buildExpenseReport,
  buildProfitLossReport,
  buildVacancyReport,
  buildLedgerReport
} from './reportQueries'
import { extendedBuilders } from './reportServiceExtended'

// Re-export for reportServiceExtended.ts and consumer modules
export {
  type ReportData,
  type ReportColumn,
  groupByCurrency,
  buildConsolidatedGroup,
  REPORT_ROW_LIMIT,
  type ReportFilters,
  type ReportType,
  ReportError,
  dateRangeClause
}

/**
 * Build a report by type. All builders share the same shape, so the IPC layer can hand the
 * result straight to either exporter without per-type branching.
 */
export function buildReport(db: Database, type: ReportType, filters: ReportFilters): ReportData {
  void langOf(filters)

  switch (type) {
    case 'income':
      return buildIncomeReport(db, filters)
    case 'expense':
      return buildExpenseReport(db, filters)
    case 'profit_loss':
      return buildProfitLossReport(db, filters)
    case 'vacancy':
      return buildVacancyReport(db, filters)
    case 'ledger':
      return buildLedgerReport(db, filters)
    default: {
      const builder = extendedBuilders[type]
      if (builder) return builder(db, filters)
      throw new ReportError(`UNKNOWN_REPORT_TYPE:${String(type)}`)
    }
  }
}
