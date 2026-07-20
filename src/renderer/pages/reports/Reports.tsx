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
import CodeIcon from '@mui/icons-material/Code'
import FileDownloadIcon from '@mui/icons-material/FileDownload'
import {
  Box,
  Button,
  Card,
  CardContent,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Typography,
  Stack,
  CircularProgress
} from '@mui/material'
import { GridColDef } from '@mui/x-data-grid'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import GlobalSnackbar from '../../components/GlobalSnackbar'
import PageHeader from '../../components/PageHeader'
import StandardTable from '../../components/StandardTable'
import { useSnackbar } from '../../hooks/useSnackbar'

type ReportType =
  | 'income'
  | 'expense'
  | 'profit_loss'
  | 'property_profitability'
  | 'tenant_payment_history'
  | 'outstanding_balances'
  | 'vacancy'
  | 'contract_expiry'
  | 'recurring_schedule'
  | 'document_expiry'
  | 'ledger'

interface ReportColumn {
  key: string
  headerKey: string
  type?: 'text' | 'number' | 'currency' | 'date'
  sumInTotals?: boolean
  isRunningBalance?: boolean
}

interface ReportGroup {
  currency: string
  rows: Record<string, unknown>[]
  totals: Record<string, number>
}

interface ReportData {
  titleKey: string
  columns: ReportColumn[]
  groups: ReportGroup[]
  consolidatedNote?: string
  /** Optional single group in the reporting currency (frozen base_amount per row). */
  consolidatedGroup?: ReportGroup
}

interface Property {
  id: number
  name: string
  code: string
}

interface Tenant {
  id: number
  fullname: string
}

const REPORT_TYPES: ReportType[] = [
  'income',
  'expense',
  'profit_loss',
  'property_profitability',
  'tenant_payment_history',
  'outstanding_balances',
  'vacancy',
  'contract_expiry',
  'recurring_schedule',
  'document_expiry',
  'ledger'
]

/** Stable row IDs for DataGrid — some report rows have no `id` field (vacancy, P&L). */
function makeRowId(prefix: string): (row: Record<string, unknown>) => string {
  return (row) =>
    String(
      row['id'] ??
        `${prefix}-${JSON.stringify(row).length}-${Math.random().toString(36).slice(2, 8)}`
    )
}

export default function Reports(): React.ReactElement {
  const { t, i18n } = useTranslation()
  const isRtl = i18n.language === 'ar'
  const { snack, showSuccess, showError, hideSnackbar } = useSnackbar()

  const [reportType, setReportType] = useState<ReportType | ''>('')
  const [presetPeriod, setPresetPeriod] = useState<string>('custom')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [propertyId, setPropertyId] = useState<number | ''>('')
  const [tenantId, setTenantId] = useState<number | ''>('')

  const handlePresetChange = (preset: string): void => {
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
  }

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

  // Build DataGrid columns from the report's column metadata — header resolved via i18n.
  const gridColumns: GridColDef[] = useMemo(() => {
    if (!data) return []
    return data.columns.map((col) => {
      const base: GridColDef = {
        field: col.key,
        headerName: t(col.headerKey),
        flex: 1,
        minWidth: 110
      }
      if (col.type === 'number' || col.type === 'currency') {
        base.type = 'number'
        base.valueFormatter = (value: unknown) => {
          const n = Number(value ?? 0)
          return n.toLocaleString(i18n.language === 'ar' ? 'ar-u-nu-latn' : 'en', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          })
        }
      }
      return base
    })
  }, [data, t, i18n.language])

  // Flatten groups for the preview grid — one big table; currency is its own column.
  const previewRows = useMemo<Record<string, unknown>[]>(() => {
    if (!data) return []
    return data.groups.flatMap((g) =>
      g.rows.map((r) => ({ ...r, currency: g.currency, __currency: g.currency }))
    )
  }, [data])

  const showTenantFilter = reportType === 'income' || reportType === 'tenant_payment_history'
  const showPropertyFilter =
    reportType !== '' && reportType !== 'vacancy' && reportType !== 'document_expiry'

  return (
    <Box sx={{ py: 3, px: 4 }}>
      <PageHeader
        icon={<AssessmentIcon />}
        title={t('reports.title')}
        subtitle={t('reports.subtitle')}
      />

      {/* Filter bar */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} sx={{ alignItems: 'center' }}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <FormControl fullWidth>
                <InputLabel>{t('reports.selectType')}</InputLabel>
                <Select
                  label={t('reports.selectType')}
                  value={reportType}
                  onChange={(e) => {
                    setReportType(e.target.value as ReportType)
                    setData(null)
                  }}
                  dir={isRtl ? 'rtl' : 'ltr'}
                >
                  {REPORT_TYPES.map((rt) => (
                    <MenuItem key={rt} value={rt}>
                      {t(`reports.type.${rt}`)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 2 }}>
              <FormControl fullWidth>
                <InputLabel>{t('reports.presetPeriod', 'Period Preset')}</InputLabel>
                <Select
                  label={t('reports.presetPeriod', 'Period Preset')}
                  value={presetPeriod}
                  onChange={(e) => handlePresetChange(e.target.value)}
                  dir={isRtl ? 'rtl' : 'ltr'}
                >
                  <MenuItem value="custom">{t('reports.presetCustom', 'Custom Range')}</MenuItem>
                  <MenuItem value="this_month">
                    {t('reports.presetThisMonth', 'This Month')}
                  </MenuItem>
                  <MenuItem value="last_month">
                    {t('reports.presetLastMonth', 'Last Month')}
                  </MenuItem>
                  <MenuItem value="this_quarter">
                    {t('reports.presetThisQuarter', 'This Quarter')}
                  </MenuItem>
                  <MenuItem value="this_year">{t('reports.presetThisYear', 'This Year')}</MenuItem>
                  <MenuItem value="last_year">{t('reports.presetLastYear', 'Last Year')}</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 6, sm: 6, md: 2 }}>
              <TextField
                label={t('reports.fromDate')}
                type="date"
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value)
                  setPresetPeriod('custom')
                }}
                fullWidth
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 6, md: 2 }}>
              <TextField
                label={t('reports.toDate')}
                type="date"
                value={toDate}
                onChange={(e) => {
                  setToDate(e.target.value)
                  setPresetPeriod('custom')
                }}
                fullWidth
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Grid>
            {showPropertyFilter && (
              <Grid size={{ xs: 12, sm: 6, md: 2 }}>
                <FormControl fullWidth>
                  <InputLabel>{t('reports.property')}</InputLabel>
                  <Select
                    label={t('reports.property')}
                    value={propertyId === '' ? '' : String(propertyId)}
                    onChange={(e) =>
                      setPropertyId(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    dir={isRtl ? 'rtl' : 'ltr'}
                  >
                    <MenuItem value="">{t('reports.allProperties')}</MenuItem>
                    {properties.map((p) => (
                      <MenuItem key={p.id} value={p.id}>
                        {p.name} ({p.code})
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            )}
            {showTenantFilter && (
              <Grid size={{ xs: 12, sm: 6, md: 2 }}>
                <FormControl fullWidth>
                  <InputLabel>{t('reports.tenant')}</InputLabel>
                  <Select
                    label={t('reports.tenant')}
                    value={tenantId === '' ? '' : String(tenantId)}
                    onChange={(e) =>
                      setTenantId(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    dir={isRtl ? 'rtl' : 'ltr'}
                  >
                    <MenuItem value="">{t('reports.allTenants')}</MenuItem>
                    {tenants.map((tn) => (
                      <MenuItem key={tn.id} value={tn.id}>
                        {tn.fullname}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            )}
            <Grid size={{ xs: 12, md: showTenantFilter ? 1 : 3 }}>
              <Button
                variant="contained"
                fullWidth
                onClick={runPreview}
                disabled={!reportType || loading}
              >
                {loading ? <CircularProgress size={20} color="inherit" /> : t('reports.runReport')}
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Export buttons — shown only once a report type is chosen. */}
      {reportType && (
        <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
          <Button
            variant="outlined"
            startIcon={isRtl ? undefined : <FileDownloadIcon />}
            endIcon={isRtl ? <FileDownloadIcon /> : undefined}
            onClick={() => handleExport('xlsx')}
            disabled={exporting !== null}
          >
            {exporting === 'xlsx' ? t('reports.exporting') : t('reports.exportExcel')}
          </Button>
          <Button
            variant="outlined"
            startIcon={isRtl ? undefined : <CodeIcon />}
            endIcon={isRtl ? <CodeIcon /> : undefined}
            onClick={() => handleExport('html')}
            disabled={exporting !== null}
          >
            {exporting === 'html' ? t('reports.exporting') : t('reports.exportHtml')}
          </Button>
        </Stack>
      )}

      {/* Preview */}
      {data && (
        <Box>
          {data.consolidatedGroup && (
            <Box
              sx={{
                mb: 3,
                p: 2,
                border: '1px solid',
                borderColor: 'primary.main',
                borderRadius: 1,
                bgcolor: 'action.hover'
              }}
            >
              <Typography variant="h6" sx={{ mb: 0.5, fontWeight: 700, color: 'primary.main' }}>
                {t('reports.consolidatedGroup')}: {data.consolidatedGroup.currency}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                {t('reports.consolidatedSnapshotNote')}
              </Typography>
              <StandardTable
                columns={gridColumns}
                rows={data.consolidatedGroup.rows}
                emptyMessage={t('reports.noData')}
                getRowId={makeRowId(`consolidated-${data.consolidatedGroup.currency}`)}
                pageSize={25}
                pageSizeOptions={[10, 25, 50, 100]}
                tableId="reports-consolidated"
              />
            </Box>
          )}
          {data.groups.map((g) => (
            <Box key={g.currency} sx={{ mb: 3 }}>
              <Typography variant="h6" sx={{ mb: 1, fontWeight: 600 }}>
                {t('reports.currencyGroup')}: {g.currency}
              </Typography>
              <StandardTable
                columns={gridColumns}
                rows={g.rows}
                emptyMessage={t('reports.noData')}
                getRowId={makeRowId(g.currency)}
                pageSize={25}
                pageSizeOptions={[10, 25, 50, 100]}
                tableId="reports-currency"
              />
            </Box>
          ))}
          {data.consolidatedNote && (
            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', mt: 1 }}>
              {data.consolidatedNote.startsWith('reports.')
                ? t(data.consolidatedNote)
                : data.consolidatedNote}
            </Typography>
          )}
        </Box>
      )}

      {!data && !loading && !error && (
        <StandardTable
          columns={[]}
          rows={previewRows}
          loading={false}
          emptyMessage={t('reports.noData')}
        />
      )}

      {error && (
        <StandardTable
          columns={[]}
          rows={[]}
          error={error}
          onRetry={runPreview}
          emptyMessage={t('reports.noData')}
        />
      )}

      <GlobalSnackbar state={snack} onClose={hideSnackbar} />
    </Box>
  )
}
