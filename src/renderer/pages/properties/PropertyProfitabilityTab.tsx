/**
 * INTENT: Property profitability tab — shows income vs expense summary for the property.
 *         Computes total income (payments), total expenses, and net profit.
 * CONSTRAINT: i18n keys only, MUI components, theme tokens, logical CSS.
 */
import { Box, Card, CardContent, Grid, Typography } from '@mui/material'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface Payment {
  amount: number
  is_voided: number
}

interface Expense {
  amount: number
  is_voided: number
}

interface ProfitabilityData {
  totalIncome: number
  totalExpenses: number
  netProfit: number
  paymentCount: number
  expenseCount: number
}

interface PropertyProfitabilityTabProps {
  propertyId: number
  currency: string
}

export default function PropertyProfitabilityTab({
  propertyId,
  currency
}: PropertyProfitabilityTabProps): React.ReactElement {
  const { t } = useTranslation()
  const [data, setData] = useState<ProfitabilityData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load(): Promise<void> {
      try {
        const [payments, expenses] = await Promise.all([
          window.api.payments.list({ property_id: propertyId }),
          window.api.expenses.list({ property_id: propertyId })
        ])
        if (cancelled) return

        const validPayments = (payments as Payment[]).filter((p) => !p.is_voided)
        const validExpenses = (expenses as Expense[]).filter((e) => !e.is_voided)
        const totalIncome = validPayments.reduce((s, p) => s + p.amount, 0)
        const totalExpenses = validExpenses.reduce((s, e) => s + e.amount, 0)

        setData({
          totalIncome,
          totalExpenses,
          netProfit: totalIncome - totalExpenses,
          paymentCount: validPayments.length,
          expenseCount: validExpenses.length
        })
      } catch {
        /* empty */
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [propertyId])

  if (loading || !data) return <></>

  return (
    <Box>
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, sm: 4 }}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                {t('propertyDetail.totalIncome')}
              </Typography>
              <Typography variant="h4" color="success.main" sx={{ fontWeight: 700 }}>
                {data.totalIncome.toLocaleString()} {currency}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {data.paymentCount} {t('propertyDetail.payments').toLowerCase()}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                {t('propertyDetail.totalExpenses')}
              </Typography>
              <Typography variant="h4" color="error.main" sx={{ fontWeight: 700 }}>
                {data.totalExpenses.toLocaleString()} {currency}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {data.expenseCount} {t('propertyDetail.expenses').toLowerCase()}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                {t('propertyDetail.netProfit')}
              </Typography>
              <Typography
                variant="h4"
                color={data.netProfit >= 0 ? 'success.main' : 'error.main'}
                sx={{ fontWeight: 700 }}
              >
                {data.netProfit.toLocaleString()} {currency}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {data.totalIncome > 0
                  ? `${((data.netProfit / data.totalIncome) * 100).toFixed(1)}%`
                  : '—'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}
