/**
 * INTENT: Financial summary card for the dashboard — displays income, expenses, and net balance
 *         per currency for the current month. Extracted from Dashboard.tsx for modularity.
 */
import { AccountBalanceWallet, Payments, ReceiptLong } from '@mui/icons-material'
import { Card, CardContent, Grid, Stack, Typography } from '@mui/material'
import React from 'react'
import { useTranslation } from 'react-i18next'
import type { CurrencyFinancialRow } from '../pages/dashboard/dashboardTypes'

interface FinancialSummaryCardProps {
  loading: boolean
  financialSummary: CurrencyFinancialRow[]
  t: ReturnType<typeof useTranslation>['t']
  i18n: ReturnType<typeof useTranslation>['i18n']
}

export default function FinancialSummaryCard({
  loading,
  financialSummary,
  t,
  i18n
}: FinancialSummaryCardProps): React.ReactElement | React.ReactNode {
  const locale = i18n.language === 'ar' ? 'ar-u-nu-latn' : 'en'
  const fmt = (v: number): string => v.toLocaleString(locale)

  return loading ? (
    <Grid size={{ xs: 12 }}>
      <Typography variant="body2" color="text.secondary">
        {t('common.loading')}
      </Typography>
    </Grid>
  ) : financialSummary.length === 0 ? (
    <Grid size={{ xs: 12 }}>
      <Typography variant="body2" color="text.secondary">
        {t('dashboard.noTransactionsThisMonth')}
      </Typography>
    </Grid>
  ) : (
    financialSummary.map((row) => (
      <Grid key={row.currency} size={{ xs: 12, sm: 6, md: 4 }}>
        <Card>
          <CardContent>
            <Typography
              variant="overline"
              color="text.secondary"
              sx={{ fontWeight: 700, letterSpacing: 1.2 }}
            >
              {row.currency} &mdash; {t('dashboard.currentMonth')}
            </Typography>
            <Stack spacing={0.5} sx={{ mt: 1 }}>
              <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                  <Payments sx={{ fontSize: 15, color: 'success.main' }} />
                  <Typography variant="body2" color="text.secondary">
                    {t('dashboard.incomeLabel')}
                  </Typography>
                </Stack>
                <Typography variant="body2" sx={{ fontWeight: 600, color: 'success.main' }}>
                  {fmt(row.income)}
                </Typography>
              </Stack>
              <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                  <ReceiptLong sx={{ fontSize: 15, color: 'error.main' }} />
                  <Typography variant="body2" color="text.secondary">
                    {t('dashboard.expensesLabel')}
                  </Typography>
                </Stack>
                <Typography variant="body2" sx={{ fontWeight: 600, color: 'error.main' }}>
                  {fmt(row.expenses)}
                </Typography>
              </Stack>
              <Stack
                direction="row"
                sx={{
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  pt: 0.5,
                  borderTop: '1px solid',
                  borderColor: 'divider'
                }}
              >
                <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                  <AccountBalanceWallet
                    sx={{ fontSize: 15, color: row.netProfit >= 0 ? 'success.main' : 'error.main' }}
                  />
                  <Typography variant="body2" color="text.secondary">
                    {t('dashboard.netBalance')}
                  </Typography>
                </Stack>
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: 700,
                    color: row.netProfit >= 0 ? 'success.main' : 'error.main'
                  }}
                >
                  {fmt(row.netProfit)}
                </Typography>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      </Grid>
    ))
  )
}
