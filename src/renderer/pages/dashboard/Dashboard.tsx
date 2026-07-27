import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet'
import AddIcon from '@mui/icons-material/Add'
import ApartmentRoundedIcon from '@mui/icons-material/ApartmentRounded'
import AssignmentRoundedIcon from '@mui/icons-material/AssignmentRounded'
import AutorenewIcon from '@mui/icons-material/Autorenew'
import BusinessIcon from '@mui/icons-material/Business'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlineOutlined'
import EventAvailableIcon from '@mui/icons-material/EventAvailable'
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import {
  Alert,
  Box,
  Card,
  CardContent,
  Grid,
  Typography,
  Button,
  Stack,
  Tabs,
  Tab
} from '@mui/material'
import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { OccupiedDonut, TrendChart } from '../../components/dashboardCharts'
import DashboardWidget from '../../components/DashboardWidget'
import FinancialSummaryCard from '../../components/FinancialSummaryCard'
import GlobalSnackbar from '../../components/GlobalSnackbar'
import PageHeader from '../../components/PageHeader'
import StandardTable from '../../components/StandardTable'
import StatCard from '../../components/StatCard'
import { useSnackbar } from '../../hooks/useSnackbar'
import { useUiPreferences } from '../../stores/uiPreferencesStore'
import { getLocalizedCountryName } from '../../utils/countryUtils'
import { useDataChangedListener } from '../../utils/eventBus'
import {
  upcomingDueCols,
  overdueCols,
  recurringCols,
  docCols,
  recentPaymentCols,
  recentExpenseCols,
  recentActivityCols
} from './dashboardColumns'
import type {
  DashboardSummary,
  CurrencyFinancialRow,
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
  const hiddenWidgets = useUiPreferences((s) => s.hiddenWidgets)
  const { snack, showInfoWithAction, hideSnackbar } = useSnackbar()
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [upcomingDue, setUpcomingDue] = useState<UpcomingDueRow[]>([])
  const [overdue, setOverdue] = useState<OverdueRow[]>([])
  const [upcomingRecurring, setUpcomingRecurring] = useState<UpcomingRecurringRow[]>([])
  const [expiringDocs, setExpiringDocs] = useState<ExpiringDocumentRow[]>([])
  const [recentPayments, setRecentPayments] = useState<RecentPaymentRow[]>([])
  const [recentExpenses, setRecentExpenses] = useState<RecentExpenseRow[]>([])
  const [recentActivities, setRecentActivities] = useState<Record<string, unknown>[]>([])
  const [trends, setTrends] = useState<TrendsData | null>(null)
  const [countries, setCountries] = useState<CountryOption[]>([])
  const [activeCountry, setActiveCountry] = useState<string>('')
  const [refreshCount, setRefreshCount] = useState(0)
  const [loadError, setLoadError] = useState(false)

  useDataChangedListener(() => {
    setRefreshCount((prev) => prev + 1)
  })

  const isNewApp = !loading && summary && summary.totalProperties === 0

  useEffect(() => {
    let cancelled = false
    async function loadAll(): Promise<void> {
      setLoadError(false)
      try {
        const country = activeCountry || undefined
        const [s, due, ov, rec, docs, tr, cnt, pay, exp, act] = await Promise.all([
          window.api.dashboard.summary(country),
          window.api.dashboard.upcomingDue(country).catch(() => []),
          window.api.dashboard.overdue(country).catch(() => []),
          window.api.dashboard.upcomingRecurring(country).catch(() => []),
          window.api.dashboard.expiringDocuments(country).catch(() => []),
          window.api.dashboard.trends(country).catch(() => null),
          window.api.countries.listWithProperties().catch(() => []),
          window.api.dashboard.recentPayments(country).catch(() => []),
          window.api.dashboard.recentExpenses(country).catch(() => []),
          window.api.dashboard.recentActivities(country).catch(() => [])
        ])
        if (cancelled) return
        setSummary(s as unknown as DashboardSummary)
        setUpcomingDue(due as UpcomingDueRow[])
        setOverdue(ov as OverdueRow[])
        setUpcomingRecurring(rec as UpcomingRecurringRow[])
        setExpiringDocs(docs as ExpiringDocumentRow[])
        setTrends(tr as TrendsData | null)
        setCountries(cnt as CountryOption[])
        setRecentPayments(pay as RecentPaymentRow[])
        setRecentExpenses(exp as RecentExpenseRow[])
        setRecentActivities(act as Record<string, unknown>[])
      } catch {
        if (!cancelled) setLoadError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadAll()
    return () => {
      cancelled = true
    }
  }, [activeCountry, refreshCount])

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

  const isHidden = (id: string): boolean => hiddenWidgets.includes(id)

  return (
    <Box>
      <PageHeader
        icon={<AccountBalanceWalletIcon />}
        title={t('sidebar.dashboard')}
        subtitle={t('dashboard.subtitle')}
      />
      {loadError && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => setLoadError(false)}>
              {t('common.retry')}
            </Button>
          }
          sx={{ mb: 2 }}
        >
          {t('dashboard.loadError')}
        </Alert>
      )}
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
            <Tab
              key={c.code}
              label={getLocalizedCountryName(c.code, i18n.language, c.name)}
              value={c.code}
            />
          ))}
        </Tabs>
      )}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {!isHidden('stat-properties') && (
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <DashboardWidget widgetId="stat-properties" showUndoSnackbar={showInfoWithAction}>
              <StatCard
                icon={<ApartmentRoundedIcon />}
                label={t('dashboard.totalProperties')}
                value={loading ? '...' : (summary?.totalProperties ?? 0)}
                color="primary"
                onClick={() => navigate('/properties')}
              />
            </DashboardWidget>
          </Grid>
        )}
        {!isHidden('stat-tenants') && (
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <DashboardWidget widgetId="stat-tenants" showUndoSnackbar={showInfoWithAction}>
              <StatCard
                icon={<GroupsRoundedIcon />}
                label={t('dashboard.activeTenants')}
                value={loading ? '...' : (summary?.totalTenants ?? 0)}
                color="warning"
                onClick={() => navigate('/tenants')}
              />
            </DashboardWidget>
          </Grid>
        )}
        {!isHidden('stat-contracts') && (
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <DashboardWidget widgetId="stat-contracts" showUndoSnackbar={showInfoWithAction}>
              <StatCard
                icon={<AssignmentRoundedIcon />}
                label={t('dashboard.activeContracts')}
                value={loading ? '...' : (summary?.activeContracts ?? 0)}
                color="info"
                onClick={() => navigate('/contracts')}
              />
            </DashboardWidget>
          </Grid>
        )}
      </Grid>
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {!isHidden('financial-summary') && (
          <FinancialSummaryCard
            loading={loading}
            financialSummary={(summary?.financialSummary ?? []) as CurrencyFinancialRow[]}
            consolidatedSummary={summary?.consolidatedSummary ?? null}
            t={t}
            i18n={i18n}
          />
        )}
        {!isHidden('occupied-donut') && (
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <DashboardWidget widgetId="occupied-donut" showUndoSnackbar={showInfoWithAction}>
              <OccupiedDonut
                total={summary?.totalProperties ?? 0}
                rented={summary?.rentedProperties ?? 0}
                t={t}
              />
            </DashboardWidget>
          </Grid>
        )}
      </Grid>
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {!isHidden('upcoming-due') && (
          <Grid size={{ xs: 12, md: 6 }}>
            <DashboardWidget widgetId="upcoming-due" showUndoSnackbar={showInfoWithAction}>
              <Stack direction="row" spacing={1} sx={{ mb: 1.5, alignItems: 'center' }}>
                <EventAvailableIcon color="primary" fontSize="small" />
                <Typography variant="h5" sx={{ fontWeight: 600 }}>
                  {t('dashboard.upcomingDue')}
                </Typography>
              </Stack>
              <StandardTable
                columns={upcomingDueCols(t)}
                rows={upcomingDue}
                loading={loading}
                emptyMessage={t('dashboard.noUpcomingDue')}
                pageSize={5}
                pageSizeOptions={[5]}
                tableId="dashboard-upcoming-due"
              />
            </DashboardWidget>
          </Grid>
        )}
        {!isHidden('overdue-payments') && (
          <Grid size={{ xs: 12, md: 6 }}>
            <DashboardWidget widgetId="overdue-payments" showUndoSnackbar={showInfoWithAction}>
              <Stack direction="row" spacing={1} sx={{ mb: 1.5, alignItems: 'center' }}>
                <ErrorOutlineIcon color="error" fontSize="small" />
                <Typography variant="h5" sx={{ fontWeight: 600 }}>
                  {t('dashboard.overdue')}
                </Typography>
              </Stack>
              <StandardTable
                columns={overdueCols(t)}
                rows={overdue}
                loading={loading}
                emptyMessage={t('dashboard.noOverdue')}
                pageSize={5}
                pageSizeOptions={[5]}
                tableId="dashboard-overdue"
              />
            </DashboardWidget>
          </Grid>
        )}
      </Grid>
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {!isHidden('upcoming-recurring') && (
          <Grid size={{ xs: 12, md: 6 }}>
            <DashboardWidget widgetId="upcoming-recurring" showUndoSnackbar={showInfoWithAction}>
              <Stack direction="row" spacing={1} sx={{ mb: 1.5, alignItems: 'center' }}>
                <AutorenewIcon color="warning" fontSize="small" />
                <Typography variant="h5" sx={{ fontWeight: 600 }}>
                  {t('dashboard.upcomingRecurring')}
                </Typography>
              </Stack>
              <StandardTable
                columns={recurringCols(t)}
                rows={upcomingRecurring}
                loading={loading}
                emptyMessage={t('dashboard.noUpcomingRecurring')}
                pageSize={5}
                pageSizeOptions={[5]}
                tableId="dashboard-upcoming-recurring"
              />
            </DashboardWidget>
          </Grid>
        )}
        {!isHidden('expiring-documents') && (
          <Grid size={{ xs: 12, md: 6 }}>
            <DashboardWidget widgetId="expiring-documents" showUndoSnackbar={showInfoWithAction}>
              <Stack direction="row" spacing={1} sx={{ mb: 1.5, alignItems: 'center' }}>
                <WarningAmberIcon color="warning" fontSize="small" />
                <Typography variant="h5" sx={{ fontWeight: 600 }}>
                  {t('dashboard.expiringDocuments')}
                </Typography>
              </Stack>
              <StandardTable
                columns={docCols(t)}
                rows={expiringDocs}
                loading={loading}
                emptyMessage={t('dashboard.noExpiringDocuments')}
                pageSize={5}
                pageSizeOptions={[5]}
                tableId="dashboard-expiring-docs"
              />
            </DashboardWidget>
          </Grid>
        )}
      </Grid>
      <Grid container spacing={3}>
        {!isHidden('income-expense-trend') && (
          <Grid size={{ xs: 12, md: 6 }}>
            <DashboardWidget widgetId="income-expense-trend" showUndoSnackbar={showInfoWithAction}>
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
            </DashboardWidget>
          </Grid>
        )}
        {!isHidden('recent-payments') && (
          <Grid size={{ xs: 12, md: 6 }}>
            <DashboardWidget widgetId="recent-payments" showUndoSnackbar={showInfoWithAction}>
              <Typography variant="h5" sx={{ mb: 1, fontWeight: 600 }}>
                {t('dashboard.recentPayments')}
              </Typography>
              <StandardTable
                columns={recentPaymentCols(t)}
                rows={recentPayments}
                loading={loading}
                emptyMessage={t('dashboard.noPayments')}
                pageSize={5}
                pageSizeOptions={[5]}
                tableId="dashboard-recent-payments"
              />
            </DashboardWidget>
          </Grid>
        )}
      </Grid>
      <Grid container spacing={3} sx={{ mt: 0 }}>
        {!isHidden('recent-expenses') && (
          <Grid size={{ xs: 12, md: 6 }}>
            <DashboardWidget widgetId="recent-expenses" showUndoSnackbar={showInfoWithAction}>
              <Typography variant="h5" sx={{ mb: 1, fontWeight: 600 }}>
                {t('dashboard.recentExpenses')}
              </Typography>
              <StandardTable
                columns={recentExpenseCols(t)}
                rows={recentExpenses}
                loading={loading}
                emptyMessage={t('dashboard.noExpenses')}
                pageSize={5}
                pageSizeOptions={[5]}
                tableId="dashboard-recent-expenses"
              />
            </DashboardWidget>
          </Grid>
        )}
        {!isHidden('recent-activities') && (
          <Grid size={{ xs: 12, md: 6 }}>
            <DashboardWidget widgetId="recent-activities" showUndoSnackbar={showInfoWithAction}>
              <Typography variant="h5" sx={{ mb: 1, fontWeight: 600 }}>
                {t('dashboard.recentActivities')}
              </Typography>
              <StandardTable
                columns={recentActivityCols(t)}
                rows={recentActivities}
                loading={loading}
                emptyMessage={t('dashboard.noRecentActivities')}
                pageSize={5}
                pageSizeOptions={[5]}
                tableId="dashboard-recent-activities"
              />
            </DashboardWidget>
          </Grid>
        )}
      </Grid>
      <GlobalSnackbar state={snack} onClose={hideSnackbar} />
    </Box>
  )
}
