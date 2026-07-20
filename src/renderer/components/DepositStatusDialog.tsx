/**
 * INTENT: Dialog for updating a contract's deposit status (FR-INC-02).
 *         Supports return, partial forfeiture, and full forfeiture with appropriate amounts.
 * CONSTRAINT (AGENTS.md): i18n keys only, StandardDialog wrapper, dir prop on portal.
 */
import {
  Box,
  Button,
  FormControl,
  FormControlLabel,
  FormHelperText,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography
} from '@mui/material'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSnackbar } from '../hooks/useSnackbar'
import StandardDialog from './StandardDialog'
interface DepositStatusDialogProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  contractId: number
  securityDeposit: number
  currency: string
}

type StatusChoice = 'returned' | 'partially_forfeited' | 'forfeited'

export function DepositStatusDialog({
  open,
  onClose,
  onSuccess,
  contractId,
  securityDeposit,
  currency
}: DepositStatusDialogProps): React.ReactElement {
  const { t } = useTranslation()
  const { showError, showSuccess } = useSnackbar()
  const [status, setStatus] = useState<StatusChoice>('returned')
  const [refundAmount, setRefundAmount] = useState<number>(securityDeposit)
  const [forfeitAmount, setForfeitAmount] = useState<number>(0)
  const [notes, setNotes] = useState<string>('')
  const [submitting, setSubmitting] = useState<boolean>(false)

  const handleStatusChange = (choice: StatusChoice): void => {
    setStatus(choice)
    if (choice === 'returned') {
      setRefundAmount(securityDeposit)
      setForfeitAmount(0)
    } else if (choice === 'forfeited') {
      setRefundAmount(0)
      setForfeitAmount(securityDeposit)
    } else {
      setRefundAmount(0)
      setForfeitAmount(0)
    }
  }

  const handleSubmit = async (): Promise<void> => {
    setSubmitting(true)
    try {
      await window.api.contracts.updateDepositStatus({
        contract_id: contractId,
        new_status: status,
        refund_amount: refundAmount,
        forfeit_amount: forfeitAmount,
        notes
      })
      showSuccess('contract.depositStatusUpdated')
      onSuccess()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'common.error'
      showError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit =
    (status === 'returned' && refundAmount >= 0 && refundAmount <= securityDeposit) ||
    status === 'forfeited' ||
    (status === 'partially_forfeited' &&
      Math.abs(refundAmount + forfeitAmount - securityDeposit) <= 0.01 &&
      refundAmount >= 0 &&
      forfeitAmount >= 0)

  return (
    <StandardDialog
      open={open}
      onClose={onClose}
      title={t('contract.depositDialogTitle')}
      maxWidth="sm"
    >
      <Stack spacing={3}>
        <Typography variant="body2" color="text.secondary">
          {t('contract.depositDialogDesc', {
            amount: securityDeposit.toLocaleString(),
            currency
          })}
        </Typography>

        <FormControl>
          <RadioGroup
            value={status}
            onChange={(e) => handleStatusChange(e.target.value as StatusChoice)}
          >
            <FormControlLabel
              value="returned"
              control={<Radio />}
              label={t('contract.depositReturn')}
            />
            <FormControlLabel
              value="partially_forfeited"
              control={<Radio />}
              label={t('contract.depositPartialForfeit')}
            />
            <FormControlLabel
              value="forfeited"
              control={<Radio />}
              label={t('contract.depositForfeit')}
            />
          </RadioGroup>
        </FormControl>

        {status === 'partially_forfeited' && (
          <Box>
            <TextField
              fullWidth
              type="text"
              inputMode="decimal"
              label={t('contract.depositRefundAmount')}
              value={refundAmount}
              onChange={(e) => {
                const v = Number(e.target.value)
                if (Number.isFinite(v) && v >= 0) {
                  setRefundAmount(v)
                  setForfeitAmount(Math.max(0, securityDeposit - v))
                }
              }}
              slotProps={{ htmlInput: { dir: 'ltr' } }}
              sx={{ mb: 2 }}
            />
            <TextField
              fullWidth
              type="text"
              inputMode="decimal"
              label={t('contract.depositForfeitAmount')}
              value={forfeitAmount}
              onChange={(e) => {
                const v = Number(e.target.value)
                if (Number.isFinite(v) && v >= 0) {
                  setForfeitAmount(v)
                  setRefundAmount(Math.max(0, securityDeposit - v))
                }
              }}
              slotProps={{ htmlInput: { dir: 'ltr' } }}
            />
            {Math.abs(refundAmount + forfeitAmount - securityDeposit) > 0.01 && (
              <FormHelperText error>{t('contract.depositAmountMismatch')}</FormHelperText>
            )}
          </Box>
        )}

        <TextField
          fullWidth
          multiline
          rows={2}
          label={t('common.notes')}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        <Stack direction="row" spacing={2} sx={{ justifyContent: 'flex-end' }}>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="contained" onClick={handleSubmit} disabled={!canSubmit || submitting}>
            {submitting ? t('common.saving') : t('common.confirm')}
          </Button>
        </Stack>
      </Stack>
    </StandardDialog>
  )
}
