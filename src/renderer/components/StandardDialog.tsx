import React from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Typography,
  Box
} from '@mui/material'
import { Close as CloseIcon } from '@mui/icons-material'
import { useTranslation } from 'react-i18next'

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
  const { i18n } = useTranslation()
  const isRtl = i18n.language === 'ar'

  const handleClose = (_event: unknown, reason: 'backdropClick' | 'escapeKeyDown'): void => {
    // If the form has unsaved changes, prevent accidental closing by backdrop/escape
    if (isDirty || reason === 'escapeKeyDown') {
      return
    }
    onClose()
  }

  const handleCancelClick = (): void => {
    if (isDirty) {
      const confirmClose = window.confirm(
        isRtl
          ? 'لديك تغييرات غير محفوظة، هل أنت متأكد من رغبتك في الإغلاق؟'
          : 'You have unsaved changes. Are you sure you want to close?'
      )
      if (!confirmClose) {
        return
      }
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
          borderRadius: 4,
          p: 1
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
          aria-label="close"
          onClick={handleCancelClick}
          sx={{
            color: 'text.secondary',
            [isRtl ? 'marginRight' : 'marginLeft']: 'auto'
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
    </Dialog>
  )
}
