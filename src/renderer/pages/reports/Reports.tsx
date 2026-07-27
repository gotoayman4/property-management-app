/**
 * @file Reports — the Reports & Export page (SRS §5.7, §5.8, §9.10, §10).
 *
 * INTENT: Let the user pick a report type, apply filters, preview the rows in-app, and export
 *         to .xlsx or .html in one click. All disk writes happen through the main-process IPC
 *         handler which shows the native save dialog — the renderer never touches the filesystem.
 *
 * CONSTRAINTS:
 *   - AGENTS.md: i18n keys only, StandardTable for the preview, logical CSS properties,
 *                theme.palette tokens, portal components get an explicit dir.
 *   - BR-29:   every visible string uses t() keys (no hardcoded labels).
 *   - Heuristics: all four states handled — loading, error, empty, success.
 *
 * DECISION: The preview loads via reports:preview; the export buttons call reports:exportExcel /
 *           reports:exportHtml with the same payload. The export's language is passed explicitly
 *           so the server-side exporter can resolve locale keys without guessing.
 */
import AssessmentIcon from '@mui/icons-material/Assessment'
import { Box } from '@mui/material'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import GlobalSnackbar from '../../components/GlobalSnackbar'
import PageHeader from '../../components/PageHeader'
import { useSnackbar } from '../../hooks/useSnackbar'
import ReportFilterBar from './ReportFilterBar'
import ReportPreview from './ReportPreview'
import type { ReportType, ReportData, Property, Tenant } from './reportTypes'
import { buildGridColumns } from './reportTypes'

export default function Reports(): React.ReactElement {
  const { t, i18n } = useTranslation()
  const { snack, showSuccess, showError, hideSnackbar } = useSnackbar()

  const [reportType, setReportType] = useState<ReportType | ''>('')
  const [presetPeriod, setPresetPeriod] = useState<string>('custom')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [propertyId, setPropertyId] = useState<number | ''>('')
  const [tenantId, setTenantId] = useState<number | ''>('')

  const handlePresetChange = useCallback((preset: string): void => {
    setPresetPeriod(preset)
    if (preset === 'custom') return

    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth()
    const formatDate = (d: Date): string => d.toISOString().split('T')[0]

    if (preset === 'this_month') {
      setFromDate(formatDate(new Date(year, month, 1)))
      setToDate(formatDate(new Date(year, month + 1, 0)))
    } else if (preset === 'last_month') {
      setFromDate(formatDate(new Date(year, month - 1, 1)))
      setToDate(formatDate(new Date(year, month, 0)))
    } else if (preset === 'this_quarter') {
      const qStart = Math.floor(month / 3) * 3
      setFromDate(formatDate(new Date(year, qStart, 1)))
      setToDate(formatDate(new Date(year, qStart + 3, 0)))
    } else if (preset === 'this_year') {
      setFromDate(`${year}-01-01`)
      setToDate(`${year}-12-31`)
    } else if (preset === 'last_year') {
      setFromDate(`${year - 1}-01-01`)
      setToDate(`${year - 1}-12-31`)
    }
  }, [])

  const [properties, setProperties] = useState<Property[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState<'xlsx' | 'html' | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Load filter dropdowns once.
  useEffect(() => {
    async function load(): Promise<void> {
      try {
        const [p, tn] = await Promise.all([
          window.api.properties.list() as Promise<Property[]>,
          window.api.tenants.list() as Promise<Tenant[]>
        ])
        setProperties(p)
        setTenants(tn)
      } catch {
        /* dropdowns stay empty — user can still type dates */
      }
    }
    load()
  }, [])

  const buildPayload = useCallback((): {
    type: ReportType
    from_date?: string
    to_date?: string
    property_id?: number
    tenant_id?: number
    ledger_property_id?: number
    language: 'ar' | 'en'
  } | null => {
    if (!reportType) return null
    const payload: {
      type: ReportType
      from_date?: string
      to_date?: string
      property_id?: number
      tenant_id?: number
      ledger_property_id?: number
      language: 'ar' | 'en'
    } = {
      type: reportType,
      language: i18n.language === 'en' ? 'en' : 'ar'
    }
    if (fromDate) payload.from_date = fromDate
    if (toDate) payload.to_date = toDate
    if (propertyId !== '') payload.property_id = propertyId
    if (reportType === 'ledger' && propertyId !== '') payload.ledger_property_id = propertyId
    if (reportType === 'income' && tenantId !== '') payload.tenant_id = tenantId
    return payload
  }, [reportType, fromDate, toDate, propertyId, tenantId, i18n.language])

  const runPreview = useCallback(async (): Promise<void> => {
    const payload = buildPayload()
    if (!payload) {
      showError('reports.typeMissing')
      return
    }
    if (reportType === 'ledger' && propertyId === '') {
      showError('reports.ledgerPropertyRequired')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = (await window.api.reports.preview(payload)) as ReportData
      setData(result)
    } catch (err) {
      console.error(err)
      setError(t('common.error'))
    } finally {
      setLoading(false)
    }
  }, [buildPayload, reportType, propertyId, showError, t])

  const handleExport = useCallback(
    async (format: 'xlsx' | 'html'): Promise<void> => {
      const payload = buildPayload()
      if (!payload) {
        showError('reports.typeMissing')
        return
      }
      if (reportType === 'ledger' && propertyId === '') {
        showError('reports.ledgerPropertyRequired')
        return
      }
      setExporting(format)
      try {
        const result = (await window.api.reports[format === 'xlsx' ? 'exportExcel' : 'exportHtml'](
          payload
        )) as { filePath: string | null }
        if (result.filePath === null) {
          showSuccess('reports.exportCanceled')
        } else {
          showSuccess('reports.exportSuccess')
        }
      } catch (err) {
        console.error(err)
        showError('reports.exportFailed')
      } finally {
        setExporting(null)
      }
    },
    [buildPayload, reportType, propertyId, showError, showSuccess]
  )

  const gridColumns = useMemo(() => {
    if (!data) return []
    return buildGridColumns(data, t, i18n.language)
  }, [data, t, i18n.language])

  const previewRows = useMemo<Record<string, unknown>[]>(() => {
    if (!data) return []
    return data.groups.flatMap((g) =>
      g.rows.map((r) => ({ ...r, currency: g.currency, __currency: g.currency }))
    )
  }, [data])

  return (
    <Box sx={{ py: 3, px: 4 }}>
      <PageHeader
        icon={<AssessmentIcon />}
        title={t('reports.title')}
        subtitle={t('reports.subtitle')}
      />

      <ReportFilterBar
        reportType={reportType}
        setReportType={setReportType}
        presetPeriod={presetPeriod}
        handlePresetChange={handlePresetChange}
        fromDate={fromDate}
        setFromDate={setFromDate}
        toDate={toDate}
        setToDate={setToDate}
        propertyId={propertyId}
        setPropertyId={setPropertyId}
        tenantId={tenantId}
        setTenantId={setTenantId}
        properties={properties}
        tenants={tenants}
        loading={loading}
        exporting={exporting}
        onRunPreview={runPreview}
        onExport={handleExport}
        setData={setData}
      />

      <ReportPreview
        data={data}
        gridColumns={gridColumns}
        previewRows={previewRows}
        error={error}
        onRetry={runPreview}
      />

      <GlobalSnackbar state={snack} onClose={hideSnackbar} />
    </Box>
  )
}
