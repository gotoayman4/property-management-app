/**
 * INTENT: Proximity banner on ContractDetail shown when a contract is expired or within the
 *         reminder window. Surfaces the auto-renew state with an inline enable/disable toggle
 *         (flat-mode contracts only) and a one-click Renew action.
 */
import { Autorenew as RenewIcon } from '@mui/icons-material'
import { Alert, Button, FormControlLabel, Switch, Typography } from '@mui/material'
import React from 'react'
import { useTranslation } from 'react-i18next'

interface ContractRenewalBannerProps {
  status: string
  endDate: string
  autoRenew: number
  hasVariableEscalation: number
  reminderDays: number
  savingAutoRenew: boolean
  onRenew: () => void
  onToggleAutoRenew: (next: boolean) => void
}

// Whole-day distance from today to an ISO date (negative when already past).
function daysUntil(isoDate: string): number {
  const end = new Date(`${isoDate}T00:00:00`)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((end.getTime() - today.getTime()) / 86_400_000)
}

export function ContractRenewalBanner({
  status,
  endDate,
  autoRenew,
  hasVariableEscalation,
  reminderDays,
  savingAutoRenew,
  onRenew,
  onToggleAutoRenew
}: ContractRenewalBannerProps): React.ReactElement | null {
  const { t } = useTranslation()

  const renewable = status === 'active' || status === 'expired'
  const withinWindow = status === 'expired' || daysUntil(endDate) <= reminderDays
  if (!renewable || !withinWindow) return null

  return (
    <Alert
      severity={status === 'expired' ? 'error' : 'warning'}
      icon={<RenewIcon />}
      sx={{ mb: 3 }}
      action={
        <Button color="inherit" size="small" startIcon={<RenewIcon />} onClick={onRenew}>
          {t('contract.renew')}
        </Button>
      }
    >
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {status === 'expired'
          ? t('contract.renewalBannerExpired', { date: endDate })
          : t('contract.renewalBannerExpiring', {
              days: Math.max(daysUntil(endDate), 0),
              date: endDate
            })}
      </Typography>
      {autoRenew === 1 && (
        <Typography variant="caption" color="text.secondary">
          {t('contract.renewalBannerAutoOn', { date: endDate })}
        </Typography>
      )}
      {hasVariableEscalation === 0 && (
        <FormControlLabel
          sx={{ display: 'block', mt: 0.5 }}
          control={
            <Switch
              size="small"
              checked={autoRenew === 1}
              disabled={savingAutoRenew}
              onChange={(e) => onToggleAutoRenew(e.target.checked)}
            />
          }
          label={t('contract.autoRenewEnable')}
        />
      )}
    </Alert>
  )
}
