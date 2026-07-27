/**
 * @file ReportFilterBar — the filter controls for the Reports page.
 *
 * INTENT: Extract the filter bar Card so Reports.tsx stays under the 500-line limit.
 *         This component is purely presentational — all state lives in the parent.
 *
 * CONSTRAINT: Portal-based Selects must receive an explicit `dir` prop for RTL.
 *             All strings use i18n keys — no hardcoded labels.
 */
import FileDownloadIcon from '@mui/icons-material/FileDownload'
import {
  Button,
  Card,
  CardContent,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Stack,
  CircularProgress
} from '@mui/material'
import React from 'react'
import { useTranslation } from 'react-i18next'
import type { ReportType, Property, Tenant } from './reportTypes'
import { REPORT_TYPES } from './reportTypes'

interface ReportFilterBarProps {
  reportType: ReportType | ''
  setReportType: (v: ReportType | '') => void
  presetPeriod: string
  handlePresetChange: (preset: string) => void
  fromDate: string
  setFromDate: (v: string) => void
  toDate: string
  setToDate: (v: string) => void
  propertyId: number | ''
  setPropertyId: (v: number | '') => void
  tenantId: number | ''
  setTenantId: (v: number | '') => void
  properties: Property[]
  tenants: Tenant[]
  loading: boolean
  exporting: 'xlsx' | 'html' | null
  onRunPreview: () => void
  onExport: (format: 'xlsx' | 'html') => void
  setData: (d: null) => void
}

export default function ReportFilterBar({
  reportType,
  setReportType,
  presetPeriod,
  handlePresetChange,
  fromDate,
  setFromDate,
  toDate,
  setToDate,
  propertyId,
  setPropertyId,
  tenantId,
  setTenantId,
  properties,
  tenants,
  loading,
  exporting,
  onRunPreview,
  onExport,
  setData
}: ReportFilterBarProps): React.ReactElement {
  const { t, i18n } = useTranslation()
  const isRtl = i18n.language === 'ar'

  const showTenantFilter = reportType === 'income' || reportType === 'tenant_payment_history'
  const showPropertyFilter =
    reportType !== '' && reportType !== 'vacancy' && reportType !== 'document_expiry'

  return (
    <>
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
                <InputLabel>{t('reports.presetPeriod')}</InputLabel>
                <Select
                  label={t('reports.presetPeriod')}
                  value={presetPeriod}
                  onChange={(e) => handlePresetChange(e.target.value)}
                  dir={isRtl ? 'rtl' : 'ltr'}
                >
                  <MenuItem value="custom">{t('reports.presetCustom')}</MenuItem>
                  <MenuItem value="this_month">{t('reports.presetThisMonth')}</MenuItem>
                  <MenuItem value="last_month">{t('reports.presetLastMonth')}</MenuItem>
                  <MenuItem value="this_quarter">{t('reports.presetThisQuarter')}</MenuItem>
                  <MenuItem value="this_year">{t('reports.presetThisYear')}</MenuItem>
                  <MenuItem value="last_year">{t('reports.presetLastYear')}</MenuItem>
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
                  handlePresetChange('custom')
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
                  handlePresetChange('custom')
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
                onClick={onRunPreview}
                disabled={!reportType || loading}
              >
                {loading ? <CircularProgress size={20} color="inherit" /> : t('reports.runReport')}
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {reportType && (
        <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
          <Button
            variant="outlined"
            startIcon={<FileDownloadIcon />}
            onClick={() => onExport('xlsx')}
            disabled={exporting !== null}
          >
            {exporting === 'xlsx' ? t('reports.exporting') : t('reports.exportExcel')}
          </Button>
          <Button variant="outlined" onClick={() => onExport('html')} disabled={exporting !== null}>
            {exporting === 'html' ? t('reports.exporting') : t('reports.exportHtml')}
          </Button>
        </Stack>
      )}
    </>
  )
}
