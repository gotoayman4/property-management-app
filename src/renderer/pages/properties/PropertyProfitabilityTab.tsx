/**
 * INTENT: Property profitability tab — shows income vs expense summary for the property.
 *         All financial calculations are delegated to the main process via properties:profitability.
 * CONSTRAINT: i18n keys only, MUI components, theme tokens, logical CSS.
 */
import { Box, Card, CardContent, Grid, Typography } from '@mui/material'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

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
        const result = await window.api.properties.profitability({ property_id: propertyId })
        if (cancelled) return
        setData(result)
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
