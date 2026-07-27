/**
 * INTENT: Exchange rate management — list rates, add manually, fetch online (ADR-001).
 *         This is the single place where rates are entered/viewed.
 * CONSTRAINT (ADR-001): online fetch is user-initiated, offline-default.
 * CONSTRAINT (AGENTS.md): i18n keys only, StandardTable, logical CSS.
 */
import AddIcon from '@mui/icons-material/Add'
import AttachMoneyIcon from '@mui/icons-material/AttachMoney'
import CloudDownloadIcon from '@mui/icons-material/CloudDownload'
import {
  Box,
  Button,
  TextField,
  Grid,
  Card,
  CardContent,
  Typography,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material'
import type { GridColDef } from '@mui/x-data-grid'
import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import GlobalSnackbar from '../../components/GlobalSnackbar'
import PageHeader from '../../components/PageHeader'
import StandardTable from '../../components/StandardTable'
import { useSnackbar } from '../../hooks/useSnackbar'
import { numericInputSx } from '../../utils/numericInputSx'

interface ExchangeRateRow {
  id: number
  currency_from: string
  currency_to: string
  rate: number
  effective_date: string
  source: string
  fetched_at: string | null
  entered_by_note: string | null
}

const CURRENCIES = ['JOD', 'TRY', 'QAR', 'USD', 'EUR', 'SAR']

export default function ExchangeRateManager(): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const isRtl = i18n.language === 'ar'
  const { snack, showSuccess, showError, showInfo, hideSnackbar } = useSnackbar()
  const [rates, setRates] = useState<ExchangeRateRow[]>([])
  const [loading, setLoading] = useState(true)
  const [fromCurrency, setFromCurrency] = useState('USD')
  const [toCurrency, setToCurrency] = useState('JOD')
  const [rateValue, setRateValue] = useState('')
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0])
  const [note, setNote] = useState('')
  const [fetching, setFetching] = useState(false)

  // Load exchange rates from the IPC layer. Defined at component scope so it can be
  // re-invoked after a manual add/fetch, not only on mount.
  async function loadRates(): Promise<void> {
    try {
      const data = (await window.api.exchangeRates.list()) as ExchangeRateRow[]
      setRates(data)
    } catch {
      showError('common.error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const data = (await window.api.exchangeRates.list()) as ExchangeRateRow[]
        if (!cancelled) setRates(data)
      } catch {
        if (!cancelled) showError('common.error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [t, showError])

  const handleAddRate = async (): Promise<void> => {
    if (!rateValue || Number(rateValue) <= 0) return
    try {
      await window.api.exchangeRates.add({
        currency_from: fromCurrency,
        currency_to: toCurrency,
        rate: Number(rateValue),
        effective_date: effectiveDate,
        source: 'manual',
        entered_by_note: note || undefined
      })
      setRateValue('')
      setNote('')
      showSuccess('common.saveSuccess')
      await loadRates()
    } catch {
      showError('common.saveError')
    }
  }

  const handleFetchOnline = async (): Promise<void> => {
    setFetching(true)
    try {
      const result = await window.api.exchangeRates.fetchOnline({
        currency_from: fromCurrency,
        currency_to: toCurrency
      })
      setRateValue(String(result.rate))
      setEffectiveDate(result.effective_date)
      showInfo('currency.fetchedSuccessfully', { rate: result.rate })
    } catch {
      showError('currency.fetchFailed')
    } finally {
      setFetching(false)
    }
  }

  const columns: GridColDef[] = [
    { field: 'currency_from', headerName: t('currency.from'), flex: 1, minWidth: 80 },
    { field: 'currency_to', headerName: t('currency.to'), flex: 1, minWidth: 80 },
    { field: 'rate', headerName: t('currency.rate'), flex: 1, minWidth: 100, type: 'number' },
    { field: 'effective_date', headerName: t('currency.effectiveDate'), flex: 1, minWidth: 120 },
    {
      field: 'source',
      headerName: t('currency.source'),
      flex: 1,
      minWidth: 80,
      valueFormatter: (value: string) =>
        value === 'online' ? t('currency.sourceOnline') : t('currency.sourceManual')
    },
    { field: 'entered_by_note', headerName: t('common.notes'), flex: 1, minWidth: 120 }
  ]

  return (
    <Box>
      <PageHeader
        icon={<AttachMoneyIcon />}
        title={t('currency.title')}
        subtitle={t('currency.subtitle')}
      />

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h5" sx={{ mb: 2 }}>
                {t('currency.addRate')}
              </Typography>

              <Alert severity="info" sx={{ mb: 2 }}>
                {t('currency.offlineDefault')}
              </Alert>

              <Grid container spacing={2}>
                <Grid size={{ xs: 6 }}>
                  <FormControl fullWidth>
                    <InputLabel>{t('currency.from')}</InputLabel>
                    <Select
                      value={fromCurrency}
                      label={t('currency.from')}
                      onChange={(e) => setFromCurrency(e.target.value)}
                      dir={isRtl ? 'rtl' : 'ltr'}
                    >
                      {CURRENCIES.map((c) => (
                        <MenuItem key={c} value={c}>
                          {c}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <FormControl fullWidth>
                    <InputLabel>{t('currency.to')}</InputLabel>
                    <Select
                      value={toCurrency}
                      label={t('currency.to')}
                      onChange={(e) => setToCurrency(e.target.value)}
                      dir={isRtl ? 'rtl' : 'ltr'}
                    >
                      {CURRENCIES.map((c) => (
                        <MenuItem key={c} value={c}>
                          {c}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <TextField
                    fullWidth
                    type="text"
                    inputMode="decimal"
                    label={t('currency.rate')}
                    value={rateValue}
                    onChange={(e) => setRateValue(e.target.value)}
                    slotProps={{ htmlInput: { min: 0, step: 'any', sx: numericInputSx } }}
                  />
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <TextField
                    fullWidth
                    type="date"
                    label={t('currency.effectiveDate')}
                    value={effectiveDate}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                    slotProps={{ htmlInput: { max: new Date().toISOString().split('T')[0] } }}
                  />
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <TextField
                    fullWidth
                    label={t('common.notes')}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    size="small"
                  />
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <Box sx={{ display: 'flex', gap: 1.5 }}>
                    <Button
                      variant="contained"
                      startIcon={<AddIcon />}
                      onClick={handleAddRate}
                      disabled={!rateValue || Number(rateValue) <= 0}
                    >
                      {t('currency.addRate')}
                    </Button>
                    <Button
                      variant="outlined"
                      startIcon={<CloudDownloadIcon />}
                      onClick={handleFetchOnline}
                      disabled={fetching}
                    >
                      {fetching ? t('common.loading') : t('currency.fetchOnline')}
                    </Button>
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <StandardTable
            columns={columns}
            rows={rates}
            loading={loading}
            emptyMessage={t('currency.noRates')}
            pageSize={10}
            tableId="exchange-rates"
          />
        </Grid>
      </Grid>

      <GlobalSnackbar state={snack} onClose={hideSnackbar} />
    </Box>
  )
}
