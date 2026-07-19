import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet'
import AddIcon from '@mui/icons-material/Add'
import AutorenewIcon from '@mui/icons-material/Autorenew'
import BusinessIcon from '@mui/icons-material/Business'
import DescriptionIcon from '@mui/icons-material/Description'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlineOutlined'
import EventAvailableIcon from '@mui/icons-material/EventAvailable'
import PaymentsIcon from '@mui/icons-material/Payments'
import PeopleIcon from '@mui/icons-material/People'
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import {
  Box,
  Grid,
  Typography,
  Chip,
  Button,
  Card,
  CardContent,
  Stack,
  Tabs,
  Tab
} from '@mui/material'
import type { GridColDef } from '@mui/x-data-grid'
import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { OccupiedDonut, TrendChart } from '../../components/dashboardCharts'
import PageHeader from '../../components/PageHeader'
import StandardTable from '../../components/StandardTable'
import StatCard from '../../components/StatCard'
import type {
  DashboardSummary,
  UpcomingDueRow,
  OverdueRow,
  UpcomingRecurringRow,
  ExpiringDocumentRow,
  TrendsData,
  RecentPaymentRow,
  RecentExpenseRow,
  CountryOption
} from './dashboardTypes'

export default function Dashboard(): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  // All-state loading pattern
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [upcomingDue, setUpcomingDue] = useState<UpcomingDueRow[]>([])
  const [overdue, setOverdue] = useState<OverdueRow[]>([])
  const [upcomingRecurring, setUpcomingRecurring] = useState<UpcomingRecurringRow[]>([])
  const [expiringDocs, setExpiringDocs] = useState<ExpiringDocumentRow[]>([])
  const [recentPayments, setRecentPayments] = useState<RecentPaymentRow[]>([])
  const [recentExpenses, setRecentExpenses] = useState<RecentExpenseRow[]>([])
  const [trends, setTrends] = useState<TrendsData | null>(null)
  const [countries, setCountries] = useState<CountryOption[]>([])
  const [activeCountry, setActiveCountry] = useState<string>('')
  const isNewApp = !loading && summary && summary.totalProperties === 0
  // Load all data on mount
  useEffect(() => {
    let cancelled = false
    async function loadAll(): Promise<void> {
      try {
        const [s, due, ov, rec, docs, tr, cnt, pay, exp] = await Promise.all([
          window.api.dashboard.summary(),
          window.api.dashboard.upcomingDue().catch(() => []),
          window.api.dashboard.overdue().catch(() => []),
          window.api.dashboard.upcomingRecurring().catch(() => []),
          window.api.dashboard.expiringDocuments().catch(() => []),
          window.api.dashboard.trends().catch(() => null),
          window.api.countries.list().catch(() => []),
          window.api.dashboard.recentPayments().catch(() => []),
          window.api.dashboard.recentExpenses().catch(() => [])
        ])
        if (cancelled) return
        setSummary(s as DashboardSummary)
        setUpcomingDue(due as UpcomingDueRow[])
        setOverdue(ov as OverdueRow[])
        setUpcomingRecurring(rec as UpcomingRecurringRow[])
        setExpiringDocs(docs as ExpiringDocumentRow[])
        setTrends(tr as TrendsData | null)
        setCountries(cnt as CountryOption[])
        setRecentPayments(pay as RecentPaymentRow[])
        setRecentExpenses(exp as RecentExpenseRow[])
      } catch {
        /* handled below — loading state will clear */
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadAll()
    return () => {
      cancelled = true
    }
  }, [])
  /* ------------------------------------------------------------------ */
  /* Welcome empty state for new apps                                   */
  /* ------------------------------------------------------------------ */
  if (isNewApp) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <BusinessIcon sx={{ fontSize: 80, color: 'primary.light', mb: 2 }} />
        <Typography variant="h4" sx={{ mb: 1, fontWeight: 600 }}>
          {t('dashboard.welcomeTitle')}
        </Typography>
        <Typography
          variant="body1"
          color="text.secondary"
          sx={{ mb: 4, maxWidth: 480, mx: 'auto' }}
        >
          {t('dashboard.welcomeBody')}
        </Typography>
        <Button
          variant="contained"
          size="large"
          startIcon={<AddIcon />}
          onClick={() => navigate('/properties')}
        >
          {t('dashboard.addFirstProperty')}
        </Button>
      </Box>
    )
  }
  /* ------------------------------------------------------------------ */
  /* Column definitions for StandardTables                              */
  /* ------------------------------------------------------------------ */
  const upcomingDueCols: GridColDef[] = [
    { field: 'property_name', headerName: t('common.property'), flex: 1, minWidth: 110 },
    { field: 'tenant_name', headerName: t('common.tenant'), flex: 1, minWidth: 100 },
    {
      field: 'rent_amount',
      headerName: t('common.amount'),
      flex: 1,
      minWidth: 90,
      type: 'number',
      valueFormatter: (value: number, row: UpcomingDueRow) =>
        `${Number(value).toLocaleString()} ${row.currency}`
    },
    { field: 'end_date', headerName: t('contract.endDate'), flex: 1, minWidth: 100 }
  ]
  const overdueCols: GridColDef[] = [
    { field: 'tenant_name', headerName: t('common.tenant'), flex: 1, minWidth: 100 },
    { field: 'property_name', headerName: t('common.property'), flex: 1, minWidth: 110 },
    {
      field: 'amount',
      headerName: t('common.amount'),
      flex: 1,
      minWidth: 90,
      type: 'number',
      valueFormatter: (value: number, row: OverdueRow) =>
        `${Number(value).toLocaleString()} ${row.currency}`
    },
    {
      field: 'payment_date',
      headerName: t('common.date'),
      flex: 1,
      minWidth: 100,
      renderCell: (params: { row: OverdueRow }) => (
        <Chip size="small" label={params.row.payment_date} color="error" variant="outlined" />
      )
    }
  ]
  const recurringCols: GridColDef[] = [
    { field: 'name', headerName: t('expense.name'), flex: 1, minWidth: 110 },
    { field: 'property_name', headerName: t('common.property'), flex: 1, minWidth: 100 },
    {
      field: 'amount',
      headerName: t('common.amount'),
      flex: 1,
      minWidth: 90,
      type: 'number',
      valueFormatter: (value: number, row: UpcomingRecurringRow) =>
        `${Number(value).toLocaleString()} ${row.currency}`
    },
    { field: 'next_due_date', headerName: t('common.date'), flex: 1, minWidth: 100 }
  ]
  const docCols: GridColDef[] = [
    { field: 'property_name', headerName: t('common.property'), flex: 1, minWidth: 110 },
    {
      field: 'document_type',
      headerName: t('documents.documentType'),
      flex: 1,
      minWidth: 100,
      valueFormatter: (value: string | null) => {
        if (!value) return '—'
        try {
          return t(`documents.types.${value}`, value)
        } catch {
          return value
        }
      }
    },
    { field: 'file_name', headerName: t('documents.fileName'), flex: 1, minWidth: 110 },
    {
      field: 'expiry_date',
      headerName: t('documents.expiryDate'),
      flex: 1,
      minWidth: 100,
      renderCell: (params: { row: ExpiringDocumentRow }) => (
        <Chip size="small" label={params.row.expiry_date} color="warning" variant="outlined" />
      )
    }
  ]
  /* ------------------------------------------------------------------ */
  /* Main render                                                        */
  /* ------------------------------------------------------------------ */
  return (
    <Box>
      <PageHeader
        icon={<AccountBalanceWalletIcon />}
        title={t('sidebar.dashboard')}
        subtitle={t('dashboard.subtitle')}
      />
      {/* Country filter (FR-DASH-00) */}
      {countries.length > 1 && (
        <Tabs
          value={activeCountry}
          onChange={(_, v) => setActiveCountry(v)}
          sx={{ mb: 2 }}
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab label={t('common.all')} value="" />
          {countries.map((c) => (
            <Tab key={c.code} label={c.name} value={c.code} />
          ))}
        </Tabs>
      )}
      {/* Stat Cards — clickable per FR-DASH-10 */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <StatCard
            icon={<BusinessIcon />}
            label={t('dashboard.totalProperties')}
            value={loading ? '...' : (summary?.totalProperties ?? 0)}
            color="primary"
            onClick={() => navigate('/properties')}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <StatCard
            icon={<PeopleIcon />}
            label={t('dashboard.activeTenants')}
            value={loading ? '...' : (summary?.totalTenants ?? 0)}
            color="secondary"
            onClick={() => navigate('/tenants')}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <StatCard
            icon={<DescriptionIcon />}
            label={t('dashboard.activeContracts')}
            value={loading ? '...' : (summary?.activeContracts ?? 0)}
            color="info"
            onClick={() => navigate('/contracts')}
          />
        </Grid>
      </Grid>
      {/* Second row: 3-wide stat cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ cursor: 'pointer' }} onClick={() => navigate('/payments')}>
            <CardContent>
              <Stack direction="row" spacing={1} sx={{ mb: 0.5, alignItems: 'center' }}>
                <PaymentsIcon color="success" fontSize="small" />
                <Typography variant="body2" color="text.secondary">
                  {t('dashboard.totalPayments')}
                </Typography>
              </Stack>
              <Typography variant="h5" sx={{ fontWeight: 600 }}>
                {loading
                  ? '...'
                  : (summary?.totalPayments ?? 0).toLocaleString(
                      i18n.language === 'ar' ? 'ar-u-nu-latn' : 'en'
                    )}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ cursor: 'pointer' }} onClick={() => navigate('/expenses')}>
            <CardContent>
              <Stack direction="row" spacing={1} sx={{ mb: 0.5, alignItems: 'center' }}>
                <ReceiptLongIcon color="error" fontSize="small" />
                <Typography variant="body2" color="text.secondary">
                  {t('dashboard.totalExpenses')}
                </Typography>
              </Stack>
              <Typography variant="h5" sx={{ fontWeight: 600 }}>
                {loading
                  ? '...'
                  : (summary?.totalExpenses ?? 0).toLocaleString(
                      i18n.language === 'ar' ? 'ar-u-nu-latn' : 'en'
                    )}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            icon={<AccountBalanceWalletIcon />}
            label={t('dashboard.netBalance')}
            value={
              loading
                ? '...'
                : (summary?.netBalance ?? 0).toLocaleString(
                    i18n.language === 'ar' ? 'ar-u-nu-latn' : 'en'
                  )
            }
            color={summary && summary.netBalance >= 0 ? 'success' : 'error'}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <OccupiedDonut
            total={summary?.totalProperties ?? 0}
            rented={summary?.rentedProperties ?? 0}
            t={t}
          />
        </Grid>
      </Grid>
      {/* Actionable Lists — FR-DASH-04/05/12/13 */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {/* Upcoming Due (FR-DASH-04) */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Stack direction="row" spacing={1} sx={{ mb: 1.5, alignItems: 'center' }}>
            <EventAvailableIcon color="primary" fontSize="small" />
            <Typography variant="h5" sx={{ fontWeight: 600 }}>
              {t('dashboard.upcomingDue')}
            </Typography>
          </Stack>
          <StandardTable
            columns={upcomingDueCols}
            rows={upcomingDue}
            loading={loading}
            emptyMessage={t('dashboard.noUpcomingDue')}
            pageSize={5}
            pageSizeOptions={[5]}
          />
        </Grid>
        {/* Overdue Payments (FR-DASH-05) */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Stack direction="row" spacing={1} sx={{ mb: 1.5, alignItems: 'center' }}>
            <ErrorOutlineIcon color="error" fontSize="small" />
            <Typography variant="h5" sx={{ fontWeight: 600 }}>
              {t('dashboard.overdue')}
            </Typography>
          </Stack>
          <StandardTable
            columns={overdueCols}
            rows={overdue}
            loading={loading}
            emptyMessage={t('dashboard.noOverdue')}
            pageSize={5}
            pageSizeOptions={[5]}
          />
        </Grid>
      </Grid>
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {/* Upcoming Recurring (FR-DASH-12) */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Stack direction="row" spacing={1} sx={{ mb: 1.5, alignItems: 'center' }}>
            <AutorenewIcon color="warning" fontSize="small" />
            <Typography variant="h5" sx={{ fontWeight: 600 }}>
              {t('dashboard.upcomingRecurring')}
            </Typography>
          </Stack>
          <StandardTable
            columns={recurringCols}
            rows={upcomingRecurring}
            loading={loading}
            emptyMessage={t('dashboard.noUpcomingRecurring')}
            pageSize={5}
            pageSizeOptions={[5]}
          />
        </Grid>
        {/* Expiring Documents (FR-DASH-13) */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Stack direction="row" spacing={1} sx={{ mb: 1.5, alignItems: 'center' }}>
            <WarningAmberIcon color="warning" fontSize="small" />
            <Typography variant="h5" sx={{ fontWeight: 600 }}>
              {t('dashboard.expiringDocuments')}
            </Typography>
          </Stack>
          <StandardTable
            columns={docCols}
            rows={expiringDocs}
            loading={loading}
            emptyMessage={t('dashboard.noExpiringDocuments')}
            pageSize={5}
            pageSizeOptions={[5]}
          />
        </Grid>
      </Grid>
      {/* 12-Month Trend Chart (FR-DASH-07/08) + Recent tables */}
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Typography variant="h5" sx={{ mb: 1, fontWeight: 600 }}>
            {t('dashboard.incomeExpenseTrend')}
          </Typography>
          <Card>
            <CardContent>
              {loading ? (
                <Typography variant="body2" color="text.secondary">
                  {t('common.loading')}
                </Typography>
              ) : trends ? (
                <TrendChart trends={trends} t={t} />
              ) : (
                <Typography variant="body2" color="text.secondary">
                  {t('common.noData')}
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Typography variant="h5" sx={{ mb: 1, fontWeight: 600 }}>
            {t('dashboard.recentPayments')}
          </Typography>
          <StandardTable
            columns={[
              { field: 'payment_date', headerName: t('common.date'), flex: 1, minWidth: 100 },
              { field: 'property_name', headerName: t('common.property'), flex: 1, minWidth: 120 },
              { field: 'tenant_name', headerName: t('common.tenant'), flex: 1, minWidth: 120 },
              {
                field: 'amount',
                headerName: t('common.amount'),
                flex: 1,
                minWidth: 100,
                type: 'number'
              }
            ]}
            rows={recentPayments}
            loading={loading}
            emptyMessage={t('dashboard.noPayments')}
            pageSize={5}
            pageSizeOptions={[5]}
          />
        </Grid>
      </Grid>
      {/* Bottom row: recent expenses */}
      <Grid container spacing={3} sx={{ mt: 0 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Typography variant="h5" sx={{ mb: 1, fontWeight: 600 }}>
            {t('dashboard.recentExpenses')}
          </Typography>
          <StandardTable
            columns={[
              { field: 'expense_date', headerName: t('common.date'), flex: 1, minWidth: 100 },
              { field: 'property_name', headerName: t('common.property'), flex: 1, minWidth: 120 },
              {
                field: 'amount',
                headerName: t('common.amount'),
                flex: 1,
                minWidth: 100,
                type: 'number'
              }
            ]}
            rows={recentExpenses}
            loading={loading}
            emptyMessage={t('dashboard.noExpenses')}
            pageSize={5}
            pageSizeOptions={[5]}
          />
        </Grid>
      </Grid>
    </Box>
  )
}
