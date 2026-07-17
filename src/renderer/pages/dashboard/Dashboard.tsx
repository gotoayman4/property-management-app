/**
 * INTENT: Dashboard landing page — StatCards with live aggregate counts + two recent
 *         transaction tables (payments, expenses). No charts (deferred to Phase 2B).
 * CONSTRAINT (AGENTS.md): i18n keys only, StandardTable for lists, logical CSS.
 */
import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Box, Grid, Typography } from '@mui/material'
import BusinessIcon from '@mui/icons-material/Business'
import PeopleIcon from '@mui/icons-material/People'
import DescriptionIcon from '@mui/icons-material/Description'
import PaymentsIcon from '@mui/icons-material/Payments'
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong'
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet'
import PageHeader from '../../components/PageHeader'
import StatCard from '../../components/StatCard'
import StandardTable from '../../components/StandardTable'
import type { GridColDef } from '@mui/x-data-grid'

interface DashboardSummary {
  totalProperties: number
  rentedProperties: number
  totalTenants: number
  activeContracts: number
  totalPayments: number
  totalExpenses: number
  netBalance: number
}

interface RecentRow {
  id: number
  payment_date?: string
  expense_date?: string
  amount: number
  currency: string
  property_name?: string
  tenant_name?: string
  vendor_name?: string
  category_key?: string
  payment_type?: string
  receipt_number?: string
}

export default function Dashboard(): React.JSX.Element {
  const { t } = useTranslation()
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [recentPayments, setRecentPayments] = useState<RecentRow[]>([])
  const [recentExpenses, setRecentExpenses] = useState<RecentRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load(): Promise<void> {
      try {
        const [s, p, e] = await Promise.all([
          window.api.dashboard.summary(),
          window.api.dashboard.recentPayments(),
          window.api.dashboard.recentExpenses()
        ])
        setSummary(s as DashboardSummary)
        setRecentPayments(p as RecentRow[])
        setRecentExpenses(e as RecentRow[])
      } catch {
        /* stats will remain null — cards show loading/empty */
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const paymentCols: GridColDef[] = [
    { field: 'payment_date', headerName: t('common.date'), flex: 1, minWidth: 100 },
    { field: 'property_name', headerName: t('common.property'), flex: 1, minWidth: 120 },
    { field: 'tenant_name', headerName: t('common.tenant'), flex: 1, minWidth: 120 },
    {
      field: 'amount',
      headerName: t('common.amount'),
      flex: 1,
      minWidth: 100,
      type: 'number',
      valueFormatter: (value: number, row: RecentRow) =>
        `${Number(value).toLocaleString()} ${row.currency}`
    },
    {
      field: 'payment_type',
      headerName: t('payment.paymentType'),
      flex: 1,
      minWidth: 100,
      valueFormatter: (value: string) => t(`payment.${value}`, value)
    }
  ]

  const expenseCols: GridColDef[] = [
    { field: 'expense_date', headerName: t('common.date'), flex: 1, minWidth: 100 },
    { field: 'property_name', headerName: t('common.property'), flex: 1, minWidth: 120 },
    {
      field: 'category_key',
      headerName: t('common.category'),
      flex: 1,
      minWidth: 120,
      valueFormatter: (value: string) => {
        try {
          return t(value, value)
        } catch {
          return value
        }
      }
    },
    { field: 'vendor_name', headerName: t('expense.vendor'), flex: 1, minWidth: 120 },
    {
      field: 'amount',
      headerName: t('common.amount'),
      flex: 1,
      minWidth: 100,
      type: 'number',
      valueFormatter: (value: number, row: RecentRow) =>
        `${Number(value).toLocaleString()} ${row.currency}`
    }
  ]

  return (
    <Box>
      <PageHeader
        icon={<AccountBalanceWalletIcon />}
        title={t('sidebar.dashboard')}
        subtitle={t('dashboard.subtitle')}
      />

      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <StatCard
            icon={<BusinessIcon />}
            label={t('dashboard.totalProperties')}
            value={loading ? '...' : (summary?.totalProperties ?? 0)}
            color="primary"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <StatCard
            icon={<PeopleIcon />}
            label={t('dashboard.activeTenants')}
            value={loading ? '...' : (summary?.totalTenants ?? 0)}
            color="secondary"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <StatCard
            icon={<DescriptionIcon />}
            label={t('dashboard.activeContracts')}
            value={loading ? '...' : (summary?.activeContracts ?? 0)}
            color="info"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <StatCard
            icon={<PaymentsIcon />}
            label={t('dashboard.totalPayments')}
            value={loading ? '...' : (summary?.totalPayments ?? 0).toLocaleString()}
            color="success"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <StatCard
            icon={<ReceiptLongIcon />}
            label={t('dashboard.totalExpenses')}
            value={loading ? '...' : (summary?.totalExpenses ?? 0).toLocaleString()}
            color="warning"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <StatCard
            icon={<AccountBalanceWalletIcon />}
            label={t('dashboard.netBalance')}
            value={loading ? '...' : (summary?.netBalance ?? 0).toLocaleString()}
            color={summary && summary.netBalance >= 0 ? 'success' : 'error'}
          />
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Typography variant="h5" sx={{ mb: 1.5, fontWeight: 600 }}>
            {t('dashboard.recentPayments')}
          </Typography>
          <StandardTable
            columns={paymentCols}
            rows={recentPayments}
            loading={loading}
            emptyMessage={t('dashboard.noPayments')}
            pageSize={5}
            pageSizeOptions={[5]}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Typography variant="h5" sx={{ mb: 1.5, fontWeight: 600 }}>
            {t('dashboard.recentExpenses')}
          </Typography>
          <StandardTable
            columns={expenseCols}
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
