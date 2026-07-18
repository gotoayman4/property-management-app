/**
 * @file ManualAdjustmentDialog — the only write path on the Ledger screen (FR-LED-04).
 *
 * INTENT: Extracted from Ledger.tsx to keep the main page under the 500-line file-size limit
 *         (AGENTS.md / NFR-MAIN-02). Behavior is unchanged: opens a StandardDialog, captures a
 *         description + signed amount + date, and posts a manual_adjustment ledger row.
 *
 * CONSTRAINT: the ledger is append-only; this dialog is the ONLY user-facing way to add a row
 *             that is not derived from a payment or an expense.
 */
import { Box, Button, TextField } from '@mui/material'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import StandardDialog from '../../components/StandardDialog'

interface ManualAdjustmentDialogProps {
  open: boolean
  propertyId: number | null
  currency: string
  onClose: () => void
  onSaved: () => void
  onError: (key: string) => void
  onSuccess: (key: string) => void
}

export function ManualAdjustmentDialog({
  open,
  propertyId,
  currency,
  onClose,
  onSaved,
  onError,
  onSuccess
}: ManualAdjustmentDialogProps): React.ReactElement {
  const { t } = useTranslation()
  const [description, setDescription] = useState<string>('')
  const [amount, setAmount] = useState<string>('')
  const [entryDate, setEntryDate] = useState<string>(new Date().toISOString().split('T')[0])
  const [submitting, setSubmitting] = useState<boolean>(false)

  const parsedAmount = Number(amount)
  const amountValid = amount !== '' && !Number.isNaN(parsedAmount) && parsedAmount !== 0
  const descriptionValid = description.trim().length >= 5 && description.trim().length <= 500

  const handleSubmit = async (): Promise<void> => {
    if (!propertyId || !amountValid || !descriptionValid) return
    setSubmitting(true)
    try {
      await window.api.ledger.addManualAdjustment({
        property_id: propertyId,
        entry_date: entryDate,
        description: description.trim(),
        amount: parsedAmount,
        currency
      })
      onSuccess('common.saveSuccess')
      onSaved()
    } catch (err: unknown) {
      console.error(err)
      const msg = err instanceof Error ? err.message : ''
      if (msg === 'DESCRIPTION_TOO_SHORT') onError('ledger.descriptionTooShort')
      else if (msg === 'DESCRIPTION_TOO_LONG') onError('ledger.descriptionTooLong')
      else if (msg === 'AMOUNT_REQUIRED') onError('ledger.amountRequired')
      else onError('common.saveError')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <StandardDialog
      open={open}
      onClose={onClose}
      title={t('ledger.addManualAdjustment')}
      maxWidth="sm"
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <TextField
          label={t('ledger.adjustmentDescription')}
          helperText={t('ledger.adjustmentDescriptionHelp')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          multiline
          rows={3}
          fullWidth
          required
          error={description.length > 0 && !descriptionValid}
        />
        <TextField
          label={t('ledger.adjustmentAmount')}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          fullWidth
          required
          slotProps={{ htmlInput: { inputMode: 'decimal' } }}
          helperText={currency}
        />
        <TextField
          label={t('ledger.adjustmentDate')}
          type="date"
          value={entryDate}
          onChange={(e) => setEntryDate(e.target.value)}
          fullWidth
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
          <Button variant="outlined" onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={submitting || !amountValid || !descriptionValid}
          >
            {t('common.save')}
          </Button>
        </Box>
      </Box>
    </StandardDialog>
  )
}
