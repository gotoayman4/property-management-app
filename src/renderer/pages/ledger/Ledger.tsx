import {
  AccountBalanceWallet as LedgerIcon,
  FileDownload as FileDownloadIcon
} from '@mui/icons-material'
import {
  alpha,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  FormControlLabel,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  TextField,
  Typography
} from '@mui/material'
import { GridColDef } from '@mui/x-data-grid'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import GlobalSnackbar from '../../components/GlobalSnackbar'
import LedgerSummaryCard from '../../components/LedgerSummaryCard'
import PageHeader from '../../components/PageHeader'
import ReconstructBalanceCard from '../../components/ReconstructBalanceCard'
import StandardTable from '../../components/StandardTable'
import { useSnackbar } from '../../hooks/useSnackbar'
import { ManualAdjustmentDialog } from './ManualAdjustmentDialog'

/**
 * INTENT: The Financial Ledger screen (SRS §9.8). Shows the chronological journal for a selected
 *         property with a running balance derived fresh on every read (BR-22), a summary bar, a
 *         "reconstruct balance as of" tool, and a manual-adjustment entry (FR-LED-04).
 * CONSTRAINT: The ledger is append-only — this screen performs NO edits to existing rows; the only
 *             write is adding a manual adjustment. The Excel export button calls the shared Reports
 *             engine (reports:exportExcel) which shows the native save dialog; the renderer never
 *             touches the filesystem directly.
 */

interface Property {
  id: number
  code: string
  name: string
  currency: string
}

interface LedgerRow {
  id: number
  entry_date: string
  entry_type: 'income' | 'expense' | 'income_void' | 'expense_void' | 'manual_adjustment'
  reference_type: string | null
  reference_id: number | null
  description: string
  debit: number
  credit: number
  currency: string
  running_balance: number
  /** Frozen reporting-currency snapshot (NULL when no rate existed at write time). */
  base_amount: number | null
  reporting_currency: string | null
  exchange_rate: number | null
}

interface LedgerSummary {
  total_debit: number
  total_credit: number
  net_balance: number
  row_count: number
}

const ENTRY_TYPE_LABEL: Record<LedgerRow['entry_type'], string> = {
  income: 'typeIncome',
  expense: 'typeExpense',
  income_void: 'typeIncomeVoid',
  expense_void: 'typeExpenseVoid',
  manual_adjustment: 'typeManual'
}

export default function Ledger(): React.ReactElement {
  const { t, i18n } = useTranslation()
  const { snack, showError, showSuccess, hideSnackbar } = useSnackbar()

  const [properties, setProperties] = useState<Property[]>([])
  const [selectedPropertyId, setSelectedPropertyId] = useState<number | null>(null)
  const [fromDate, setFromDate] = useState<string>('')
  const [toDate, setToDate] = useState<string>('')

  const [rows, setRows] = useState<LedgerRow[]>([])
  const [summary, setSummary] = useState<LedgerSummary | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  /** When true, debit/credit/running-balance render in the reporting currency (frozen snapshot). */
  const [showInReporting, setShowInReporting] = useState<boolean>(false)
  /** The configured reporting currency — read from settings so the toggle label is meaningful. */
  const [reportingCurrency, setReportingCurrency] = useState<string>('')

  const [reconstructDate, setReconstructDate] = useState<string>('')
  const [reconstructResult, setReconstructResult] = useState<number | null>(null)

  const [adjustOpen, setAdjustOpen] = useState<boolean>(false)
  const [exporting, setExporting] = useState<boolean>(false)

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const [data, settings] = await Promise.all([
          window.api.properties.list() as Promise<Property[]>,
          window.api.settings.get() as Promise<{ reporting_currency?: string } | null>
        ])
        setProperties(data)
        if (settings?.reporting_currency) setReportingCurrency(settings.reporting_currency)
      } catch (err) {
        console.error('Failed to load properties:', err)
      }
    }
    load()
  }, [])

  const fetchLedger = useCallback(async (): Promise<void> => {
    if (!selectedPropertyId) {
      setRows([])
      setSummary(null)
      return
    }
    try {
      setLoading(true)
      setError(null)
      const filter = {
        property_id: selectedPropertyId,
        ...(fromDate ? { from_date: fromDate } : {}),
        ...(toDate ? { to_date: toDate } : {}),
        // Summary uses the reporting-currency variant when the toggle is on; rows always carry
        // both native and base_amount so no re-fetch is needed for the per-row display switch.
        ...(showInReporting ? { reporting_currency: true } : {})
      }
      const [ledgerRows, ledgerSummary] = await Promise.all([
        window.api.ledger.list({
          property_id: filter.property_id,
          from_date: filter.from_date,
          to_date: filter.to_date
        }) as Promise<LedgerRow[]>,
        window.api.ledger.summary(filter) as Promise<LedgerSummary>
      ])
      setRows(ledgerRows)
      setSummary(ledgerSummary)
    } catch (err: unknown) {
      console.error(err)
      setError(t('common.error'))
    } finally {
      setLoading(false)
    }
  }, [selectedPropertyId, fromDate, toDate, showInReporting, t])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLedger()
  }, [fetchLedger])

  const handleReconstruct = async (): Promise<void> => {
    if (!selectedPropertyId || !reconstructDate) return
    try {
      const result = await window.api.ledger.reconstructBalance({
        property_id: selectedPropertyId,
        as_of_date: reconstructDate,
        ...(showInReporting ? { reporting_currency: true } : {})
      })
      setReconstructResult(result.balance)
    } catch (err) {
      console.error(err)
      showError('common.error')
    }
  }

  /** Export this property's ledger to Excel via the shared Reports engine (BR-22, SRS §14.9). */
  const handleExportExcel = async (): Promise<void> => {
    if (!selectedPropertyId) return
    setExporting(true)
    try {
      const result = (await window.api.reports.exportExcel({
        type: 'ledger',
        ledger_property_id: selectedPropertyId,
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
        language: i18n.language === 'en' ? 'en' : 'ar'
      })) as { filePath: string | null }
      if (result.filePath === null) {
        showSuccess('reports.exportCanceled')
      } else {
        showSuccess('reports.exportSuccess')
      }
    } catch (err) {
      console.error(err)
      const msg = err instanceof Error ? err.message : ''
      if (msg === 'REPORT_NO_DATA') showError('reports.noData')
      else showError('reports.exportFailed')
    } finally {
      setExporting(false)
    }
  }

  const selectedProperty = properties.find((p) => p.id === selectedPropertyId)
  const currency = selectedProperty?.currency ?? ''

  /**
   * When showInReporting is on, project each row into the reporting currency using its frozen
   * base_amount snapshot. debit/credit are reconstructed from the signed base_amount (positive →
   * debit, negative → credit) and a reporting-currency running_balance is accumulated. Rows with
   * a NULL snapshot fall back to native values (graceful). When the toggle is off, rows pass
   * through unchanged so the native view is identical to before.
   */
  const displayRows: LedgerRow[] = useMemo(() => {
    if (!showInReporting) return rows
    let cumulative = 0
    return rows.map((r) => {
      const signed =
        r.base_amount != null ? r.base_amount : Number(r.debit ?? 0) - Number(r.credit ?? 0)
      cumulative += signed
      return {
        ...r,
        debit: signed > 0 ? signed : 0,
        credit: signed < 0 ? Math.abs(signed) : 0,
        running_balance: cumulative,
        currency: r.reporting_currency ?? r.currency
      }
    })
  }, [rows, showInReporting])

  /** The currency label shown on debit/credit/running-balance cells and the summary bar. */
  const displayCurrency = showInReporting ? reportingCurrency || currency : currency

  const columns: GridColDef[] = [
    { field: 'entry_date', headerName: t('ledger.entryDate'), flex: 1.1 },
    {
      field: 'entry_type',
      headerName: t('ledger.entryType'),
      flex: 1.2,
      renderCell: (params) => {
        const row = params.row as LedgerRow
        const tone =
          row.entry_type === 'income' || row.entry_type === 'expense_void'
            ? 'success'
            : row.entry_type === 'manual_adjustment'
              ? 'default'
              : 'error'
        return (
          <Chip
            label={t(`ledger.${ENTRY_TYPE_LABEL[row.entry_type]}`)}
            color={tone}
            size="small"
            variant="outlined"
          />
        )
      }
    },
    { field: 'description', headerName: t('ledger.description'), flex: 2.5 },
    {
      field: 'debit',
      headerName: t('ledger.debit'),
      flex: 1,
      renderCell: (params) => {
        const row = params.row as LedgerRow
        return row.debit
          ? `${row.debit.toLocaleString(i18n.language === 'ar' ? 'ar-u-nu-latn' : 'en')}`
          : '—'
      }
    },
    {
      field: 'credit',
      headerName: t('ledger.credit'),
      flex: 1,
      renderCell: (params) => {
        const row = params.row as LedgerRow
        return row.credit
          ? `${row.credit.toLocaleString(i18n.language === 'ar' ? 'ar-u-nu-latn' : 'en')}`
          : '—'
      }
    },
    {
      field: 'running_balance',
      headerName: t('ledger.runningBalance'),
      flex: 1.3,
      renderCell: (params) => {
        const row = params.row as LedgerRow
        const color = row.running_balance >= 0 ? 'success.main' : 'error.main'
        return (
          <Typography component="span" sx={{ color, fontWeight: 600 }}>
            {row.running_balance.toLocaleString(i18n.language === 'ar' ? 'ar-u-nu-latn' : 'en')}{' '}
            {row.currency}
          </Typography>
        )
      }
    }
  ]

  return (
    <Box sx={{ py: 3, px: 4 }}>
      <PageHeader
        icon={<LedgerIcon />}
        title={t('ledger.title')}
        action={
          <Button
            variant="contained"
            startIcon={
              exporting ? <CircularProgress size={18} color="inherit" /> : <FileDownloadIcon />
            }
            onClick={handleExportExcel}
            disabled={!selectedPropertyId || exporting}
            sx={{
              px: 3,
              py: 1,
              borderRadius: 2,
              bgcolor: 'background.paper',
              color: 'text.primary',
              boxShadow: 2,
              '&:hover': {
                bgcolor: (theme) => alpha(theme.palette.background.paper, 0.9),
                boxShadow: 4
              },
              '&.Mui-disabled': {
                bgcolor: (theme) => alpha(theme.palette.background.paper, 0.4),
                color: (theme) => alpha(theme.palette.text.primary, 0.4)
              }
            }}
          >
            {exporting ? t('reports.exporting') : t('ledger.exportExcel')}
          </Button>
        }
      />

      {/* Filter bar */}
      <Paper
        elevation={1}
        sx={{ p: 2, mb: 3, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}
      >
        <Grid container spacing={2} sx={{ alignItems: 'center' }}>
          <Grid size={{ xs: 12, sm: 4 }}>
            <FormControl fullWidth>
              <InputLabel>{t('common.property')}</InputLabel>
              <Select
                label={t('common.property')}
                value={selectedPropertyId != null ? String(selectedPropertyId) : ''}
                onChange={(e) => {
                  const raw = e.target.value as string
                  setSelectedPropertyId(raw === '' ? null : Number(raw))
                  setReconstructResult(null)
                }}
              >
                <MenuItem value="" disabled>
                  {t('ledger.selectProperty')}
                </MenuItem>
                {properties.map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <TextField
              label={t('common.fromDate')}
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <TextField
              label={t('common.toDate')}
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 2 }}>
            <Button
              variant="outlined"
              fullWidth
              onClick={() => {
                setFromDate('')
                setToDate('')
              }}
            >
              {t('common.clearFilters')}
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {/* Reporting-currency toggle: shows when the property currency differs from the reporting
          currency (otherwise the native view IS the reporting view). Toggling ON re-fetches the
          summary in reporting currency; per-row cells and the summary bar switch to base_amount. */}
      {reportingCurrency && selectedProperty && selectedProperty.currency !== reportingCurrency && (
        <FormControlLabel
          control={
            <Switch
              checked={showInReporting}
              onChange={(_, checked) => setShowInReporting(checked)}
              size="small"
            />
          }
          label={t('ledger.showInReportingCurrency', { currency: reportingCurrency })}
          sx={{ mb: 2, ml: 0 }}
        />
      )}

      {/* Summary bar — only meaningful once a property is selected. Currency label switches
          with the reporting-currency toggle; totals come from computeSummaryReporting when on. */}
      {summary && selectedPropertyId && (
        <Stack direction="row" spacing={2} sx={{ mb: 3, flexWrap: 'wrap', gap: 2 }}>
          <LedgerSummaryCard
            label={t('ledger.summaryTotalDebit')}
            value={summary.total_debit}
            currency={displayCurrency}
            tone="success"
          />
          <LedgerSummaryCard
            label={t('ledger.summaryTotalCredit')}
            value={summary.total_credit}
            currency={displayCurrency}
            tone="error"
          />
          <LedgerSummaryCard
            label={t('ledger.summaryNet')}
            value={summary.net_balance}
            currency={displayCurrency}
            tone={summary.net_balance >= 0 ? 'success' : 'error'}
          />
        </Stack>
      )}

      <StandardTable
        columns={columns}
        rows={displayRows}
        loading={loading}
        error={error ?? undefined}
        onRetry={fetchLedger}
        emptyMessage={selectedPropertyId ? t('ledger.noEntries') : t('ledger.propertyRequired')}
        tableId="ledger"
      />

      {/* Reconstruct balance + manual adjustment actions */}
      {selectedPropertyId && (
        <ReconstructBalanceCard
          reconstructDate={reconstructDate}
          onDateChange={setReconstructDate}
          onReconstruct={handleReconstruct}
          onOpenAdjustment={() => setAdjustOpen(true)}
          reconstructResult={reconstructResult}
          displayCurrency={displayCurrency}
        />
      )}

      {adjustOpen && (
        <ManualAdjustmentDialog
          open={adjustOpen}
          propertyId={selectedPropertyId}
          currency={currency}
          onClose={() => setAdjustOpen(false)}
          onSaved={() => {
            setAdjustOpen(false)
            fetchLedger()
          }}
          onError={showError}
          onSuccess={showSuccess}
        />
      )}

      <GlobalSnackbar state={snack} onClose={hideSnackbar} />
    </Box>
  )
}

/** Manual-adjustment dialog lives in its own module to keep this file under the 500-line cap
 *  (NFR-MAIN-02). See ManualAdjustmentDialog.tsx — the only write path on this screen (FR-LED-04). */
