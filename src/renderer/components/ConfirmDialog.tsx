import { Dialog, DialogTitle, DialogContent, DialogActions, Button } from '@mui/material'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { useDirection } from '../hooks/useDirection'

/**
 * INTENT: Shared confirmation dialog for destructive/irreversible actions.
 * CONSTRAINT: Per dialog-patterns.md confirm API — confirm button uses the severity color,
 *             Cancel is always the default/safe action (Escape cancels), titles describe the
 *             action not a question, at most 2 dialog levels. Receives explicit dir for the
 *             portal (RTL #1 regression source).
 */

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
  severity?: 'error' | 'warning'
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  severity = 'error'
}: ConfirmDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const isRtl = useDirection()

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      dir={isRtl ? 'rtl' : 'ltr'}
      maxWidth="xs"
      fullWidth
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-message"
    >
      <DialogTitle id="confirm-dialog-title">{title}</DialogTitle>
      <DialogContent>
        <span id="confirm-dialog-message">{message}</span>
      </DialogContent>
      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button onClick={onCancel} variant="outlined">
          {cancelLabel || t('common.cancel')}
        </Button>
        <Button onClick={onConfirm} color={severity} variant="contained" autoFocus>
          {confirmLabel || t('common.confirm')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
