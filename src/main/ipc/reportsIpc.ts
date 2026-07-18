/**
 * @file reportsIpc — IPC handlers for the Reports module (SRS §5.7, §5.8).
 *
 * INTENT: Expose three channels:
 *           - reports:preview    → build the normalized ReportData and return it (no disk write)
 *           - reports:exportExcel → build + show save dialog + write .xlsx atomically
 *           - reports:exportHtml  → build + show save dialog + write .html atomically
 *
 * CONSTRAINTS:
 *   - NFR-SEC-06: every payload validated with Zod before the report builder runs.
 *   - NFR-SEC-07: errors surface a machine-readable code string; stack traces never reach the UI.
 *   - BR-31:     the only way the renderer triggers a disk write is through this handler's save
 *                dialog — there is no renderer filesystem access.
 *   - FR-XLS-01 / FR-HTML-01: one-click export from the renderer's perspective.
 */

import { ipcMain } from 'electron'
import { z } from 'zod'
import { db } from '../db/database'
import { buildExcelWorkbook } from '../services/exportService/excelExporter'
import {
  buildFileName,
  writeFileAtomic,
  type ExportLanguage
} from '../services/exportService/exportUtils'
import { buildHtmlBuffer } from '../services/exportService/htmlExporter'
import { showSaveDialog } from '../services/fileDialogService'
import {
  buildReport,
  ReportError,
  type ReportType,
  type ReportFilters
} from '../services/reportService'

/** Zod schema for every report request. All filters optional; builder decides which apply. */
const reportRequestSchema = z.object({
  type: z.enum(['income', 'expense', 'profit_loss', 'vacancy', 'ledger']),
  from_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  property_id: z.number().int().positive().optional(),
  tenant_id: z.number().int().positive().optional(),
  ledger_property_id: z.number().int().positive().optional(),
  payment_method: z.string().max(50).optional(),
  category_id: z.number().int().positive().optional(),
  language: z.enum(['ar', 'en']).optional()
})

type ReportRequest = z.infer<typeof reportRequestSchema>

/** Has any actual data to export? Used to reject empty exports with a clear code. */
function hasRows(data: { groups: { rows: unknown[] }[] }): boolean {
  return data.groups.some((g) => g.rows.length > 0)
}

/** Build the report and translate ReportError codes into IPC-friendly errors. */
function safeBuildReport(req: ReportRequest): ReturnType<typeof buildReport> {
  try {
    const filters: ReportFilters = { ...req }
    return buildReport(db, req.type as ReportType, filters)
  } catch (err: unknown) {
    if (err instanceof ReportError) throw new Error(err.code)
    if (err instanceof z.ZodError) throw new Error('INVALID_INPUT')
    // Never leak the raw error message — only a stable code.
    console.error('Report build failed:', err)
    throw new Error('REPORT_BUILD_FAILED')
  }
}

/** Common save flow: build → validate non-empty → render buffer → save dialog → atomic write. */
async function exportToFile(
  req: ReportRequest,
  format: 'xlsx' | 'html'
): Promise<{ filePath: string | null }> {
  const data = safeBuildReport(req)
  if (!hasRows(data)) throw new Error('REPORT_NO_DATA')

  const lang: ExportLanguage = req.language === 'en' ? 'en' : 'ar'
  const fileName = buildFileName(req.type, req.from_date, req.to_date, format)
  const ext = format === 'xlsx' ? ['xlsx'] : ['html', 'htm']

  const { filePath, canceled } = await showSaveDialog(fileName, ext)
  if (canceled || !filePath) return { filePath: null }

  const buffer =
    format === 'xlsx' ? await buildExcelWorkbook(data, lang) : buildHtmlBuffer(data, lang)
  try {
    await writeFileAtomic(filePath, buffer)
  } catch (err) {
    console.error('Export write failed:', err)
    throw new Error('EXPORT_WRITE_FAILED')
  }
  return { filePath }
}

export function registerReportsIpcHandlers(): void {
  ipcMain.handle('reports:preview', async (_, payload: unknown) => {
    let req: ReportRequest
    try {
      req = reportRequestSchema.parse(payload)
    } catch (err: unknown) {
      if (err instanceof z.ZodError) throw new Error('INVALID_INPUT')
      throw new Error('REPORT_BUILD_FAILED')
    }
    return safeBuildReport(req)
  })

  ipcMain.handle('reports:exportExcel', async (_, payload: unknown) => {
    let req: ReportRequest
    try {
      req = reportRequestSchema.parse(payload)
    } catch (err: unknown) {
      if (err instanceof z.ZodError) throw new Error('INVALID_INPUT')
      throw new Error('REPORT_BUILD_FAILED')
    }
    return exportToFile(req, 'xlsx')
  })

  ipcMain.handle('reports:exportHtml', async (_, payload: unknown) => {
    let req: ReportRequest
    try {
      req = reportRequestSchema.parse(payload)
    } catch (err: unknown) {
      if (err instanceof z.ZodError) throw new Error('INVALID_INPUT')
      throw new Error('REPORT_BUILD_FAILED')
    }
    return exportToFile(req, 'html')
  })
}
