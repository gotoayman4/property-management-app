/**
 * INTENT: Read-only data tab for contract detail — displays all contract fields in a 2-column
 *         card layout. Extracted from ContractDetail.tsx to keep it under the 500-line limit.
 * FR-INC-02: Shows deposit status with a chip and action button for held deposits.
 */
import { AccountBalance as DepositIcon } from '@mui/icons-material'
import { Box, Button, Card, CardContent, Chip, Grid, Typography } from '@mui/material'
import React from 'react'
import { useTranslation } from 'react-i18next'
import type { ContractData } from './ContractDetail'

const STATUS_COLORS: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  active: 'success',
  draft: 'warning',
  expired: 'error',
  cancelled: 'error',
  terminated: 'default'
}

const DEPOSIT_STATUS_COLORS: Record<string, 'info' | 'success' | 'warning' | 'error'> = {
  held: 'info',
  returned: 'success',
  partially_forfeited: 'warning',
  forfeited: 'error'
}

interface ContractDataTabProps {
  contract: ContractData
  onUpdateDepositStatus?: () => void
}

export function ContractDataTab({
  contract,
  onUpdateDepositStatus
}: ContractDataTabProps): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <Card elevation={1} sx={{ borderRadius: 3 }}>
      <CardContent>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="caption" color="text.secondary">
              {t('contract.contractNumber')}
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 600 }}>
              {contract.contract_number}
            </Typography>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="caption" color="text.secondary">
              {t('common.status')}
            </Typography>
            <Box sx={{ mt: 0.5 }}>
              <Chip
                label={t(`contract.${contract.status}`)}
                color={STATUS_COLORS[contract.status] ?? 'default'}
                size="small"
              />
            </Box>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="caption" color="text.secondary">
              {t('common.property')}
            </Typography>
            <Typography variant="body1">
              {contract.property_name} ({contract.property_code})
            </Typography>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="caption" color="text.secondary">
              {t('common.tenant')}
            </Typography>
            <Typography variant="body1">{contract.tenant_fullname}</Typography>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="caption" color="text.secondary">
              {t('contract.startDate')}
            </Typography>
            <Typography variant="body1">{contract.start_date}</Typography>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="caption" color="text.secondary">
              {t('contract.endDate')}
            </Typography>
            <Typography variant="body1">{contract.end_date}</Typography>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="caption" color="text.secondary">
              {t('contract.rentAmount')}
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 600 }}>
              {contract.rent_amount.toLocaleString()} {contract.currency}
            </Typography>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="caption" color="text.secondary">
              {t('contract.securityDeposit')}
            </Typography>
            <Typography variant="body1">
              {contract.security_deposit != null
                ? `${contract.security_deposit.toLocaleString()} ${contract.currency}`
                : '—'}
            </Typography>
          </Grid>
          {contract.security_deposit != null && contract.security_deposit > 0 && (
            <Grid size={{ xs: 12, sm: 6 }}>
              <Typography variant="caption" color="text.secondary">
                {t('contract.depositStatus')}
              </Typography>
              <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Chip
                  icon={<DepositIcon />}
                  label={t(
                    `contract.depositStatus${(contract.deposit_status ?? 'held').charAt(0).toUpperCase() + (contract.deposit_status ?? 'held').slice(1)}`
                  )}
                  color={DEPOSIT_STATUS_COLORS[contract.deposit_status ?? 'held'] ?? 'default'}
                  size="small"
                />
                {contract.deposit_status === 'held' && onUpdateDepositStatus && (
                  <Button size="small" variant="outlined" onClick={onUpdateDepositStatus}>
                    {t('contract.updateDepositStatus')}
                  </Button>
                )}
              </Box>
            </Grid>
          )}
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="caption" color="text.secondary">
              {t('contract.frequency')}
            </Typography>
            <Typography variant="body1">{t(`contract.${contract.payment_frequency}`)}</Typography>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="caption" color="text.secondary">
              {t('payment.paymentMethod')}
            </Typography>
            <Typography variant="body1">
              {contract.payment_method
                ? t(
                    `payment.method${contract.payment_method.charAt(0).toUpperCase() + contract.payment_method.slice(1)}`
                  )
                : '—'}
            </Typography>
          </Grid>
          {contract.has_variable_escalation ? (
            <Grid size={{ xs: 12, sm: 6 }}>
              <Typography variant="caption" color="text.secondary">
                {t('contract.increaseMode')}
              </Typography>
              <Typography variant="body1">
                {t('contract.variableMode')} ({contract.contract_term_years} {t('contract.year')})
              </Typography>
            </Grid>
          ) : contract.annual_increase_percent != null ? (
            <Grid size={{ xs: 12, sm: 6 }}>
              <Typography variant="caption" color="text.secondary">
                {t('contract.annualIncreasePercent')}
              </Typography>
              <Typography variant="body1">{contract.annual_increase_percent}%</Typography>
            </Grid>
          ) : null}
          {contract.notes && (
            <Grid size={{ xs: 12 }}>
              <Typography variant="caption" color="text.secondary">
                {t('contract.notes')}
              </Typography>
              <Typography variant="body1">{contract.notes}</Typography>
            </Grid>
          )}
          {contract.cancellation_reason && (
            <Grid size={{ xs: 12 }}>
              <Typography variant="caption" color="text.secondary">
                {t('contract.cancellationReason')}
              </Typography>
              <Typography variant="body1" color="error">
                {contract.cancellation_reason}
              </Typography>
            </Grid>
          )}
        </Grid>
      </CardContent>
    </Card>
  )
}
