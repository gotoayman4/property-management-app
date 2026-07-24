import { Close as CloseIcon } from '@mui/icons-material'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Typography,
  Box,
  alpha
} from '@mui/material'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import ConfirmDialog from './ConfirmDialog'

interface StandardDialogProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  actions?: React.ReactNode
  isDirty?: boolean
  maxWidth?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  fullWidth?: boolean
}

export default function StandardDialog({
  open,
  onClose,
  title,
  children,
  actions,
  isDirty = false,
  maxWidth = 'sm',
  fullWidth = true
}: StandardDialogProps): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const isRtl = i18n.language === 'ar'
  // Tracks whether the unsaved-changes sub-confirmation is open (2-level dialog max).
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false)

  const handleClose = (_event: unknown, reason: 'backdropClick' | 'escapeKeyDown'): void => {
    if (isDirty && reason === 'backdropClick') {
      setConfirmCloseOpen(true)
      return
    }
    onClose()
  }

  const handleCancelClick = (): void => {
    if (isDirty) {
      // Dirty form — ask before discarding via the shared ConfirmDialog (not window.confirm)
      setConfirmCloseOpen(true)
      return
    }
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth={maxWidth}
      fullWidth={fullWidth}
      dir={isRtl ? 'rtl' : 'ltr'}
      aria-labelledby="standard-dialog-title"
      sx={{
        '& .MuiDialog-paper': {
          p: 0.5,
          boxShadow: (theme) =>
            theme.palette.mode === 'dark'
              ? '0px 16px 32px rgba(0, 0, 0, 0.5)'
              : '0px 16px 32px rgba(15, 23, 42, 0.12)',
          border: (theme) => `1px solid ${theme.palette.divider}`,
          borderRadius: 'var(--mui-shape-borderRadius, 12px)'
        }
      }}
    >
      <DialogTitle
        id="standard-dialog-title"
        sx={{ m: 0, p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Typography variant="h6" component="span" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
        <IconButton
          aria-label={t('common.close')}
          onClick={handleCancelClick}
          sx={{
            color: 'text.secondary',
            marginInlineStart: 'auto',
            transition: 'all 0.2s ease-in-out',
            '&:hover': {
              bgcolor: (theme) => alpha(theme.palette.action.hover, 0.8),
              color: 'text.primary'
            }
          }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 3 }}>
        <Box sx={{ minWidth: 280 }}>{children}</Box>
      </DialogContent>

      {actions && (
        <DialogActions sx={{ p: 2, justifyContent: 'flex-end', gap: 1 }}>{actions}</DialogActions>
      )}

      {/* Unsaved-changes confirmation (sub-dialog, 2-level max) */}
      <ConfirmDialog
        open={confirmCloseOpen}
        title={t('common.unsavedChanges')}
        message={t('common.unsavedChangesMessage')}
        confirmLabel={t('common.close')}
        severity="warning"
        onConfirm={() => {
          setConfirmCloseOpen(false)
          onClose()
        }}
        onCancel={() => setConfirmCloseOpen(false)}
      />
    </Dialog>
  )
}
