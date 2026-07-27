/**
 * INTENT: Manage expense categories Dialog (add, update, delete custom categories).
 *         Used in ExpenseForm and RecurringExpenseForm.
 * CONSTRAINT: logical CSS, i18n keys only, theme.palette colors, explicit dir.
 */
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  List,
  ListItem,
  ListItemText,
  TextField,
  Stack
} from '@mui/material'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDirection } from '../hooks/useDirection'
import { useSnackbar } from '../hooks/useSnackbar'
import ConfirmDialog from './ConfirmDialog'
import GlobalSnackbar from './GlobalSnackbar'

interface CategoryRow {
  id: number
  name_key: string
  is_default: number
}

interface ExpenseCategoryManagerDialogProps {
  open: boolean
  onClose: () => void
  onChange?: () => void
}

export default function ExpenseCategoryManagerDialog({
  open,
  onClose,
  onChange
}: ExpenseCategoryManagerDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const isRtl = useDirection()
  const { snack, showSuccess, showError, hideSnackbar } = useSnackbar()

  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [newCategoryName, setNewCategoryName] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null)

  const loadCategories = useCallback(async (): Promise<void> => {
    try {
      const data = await window.api.expenseCategories.list()
      setCategories(data as CategoryRow[])
    } catch {
      showError('common.error')
    }
  }, [showError])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    window.api.expenseCategories
      .list()
      .then((data) => {
        if (!cancelled) setCategories(data as CategoryRow[])
      })
      .catch(() => {
        if (!cancelled) showError('common.error')
      })
    return () => {
      cancelled = true
    }
  }, [open, showError])

  const handleAdd = async (): Promise<void> => {
    const val = newCategoryName.trim()
    if (!val) return
    try {
      await window.api.expenseCategories.create({ name_key: val })
      showSuccess('common.saveSuccess')
      setNewCategoryName('')
      loadCategories()
      if (onChange) onChange()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      if (msg === 'EXPENSE_CATEGORY_DUPLICATE') {
        showError('expense.categoryExists')
      } else {
        showError('common.saveError')
      }
    }
  }

  const handleStartEdit = (cat: CategoryRow): void => {
    setEditingId(cat.id)
    const rawLabel = cat.name_key.startsWith('expense.category.')
      ? cat.name_key.replace('expense.category.', '')
      : cat.name_key
    setEditingName(rawLabel)
  }

  const handleSaveEdit = async (id: number): Promise<void> => {
    const val = editingName.trim()
    if (!val) return
    try {
      await window.api.expenseCategories.update({ id, name_key: val })
      showSuccess('common.saveSuccess')
      setEditingId(null)
      loadCategories()
      if (onChange) onChange()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      if (msg === 'EXPENSE_CATEGORY_DUPLICATE') {
        showError('expense.categoryExists')
      } else {
        showError('common.saveError')
      }
    }
  }

  const handleDelete = async (): Promise<void> => {
    if (deleteTargetId === null) return
    const id = deleteTargetId
    setDeleteTargetId(null)
    try {
      await window.api.expenseCategories.delete(id)
      showSuccess('common.saveSuccess')
      loadCategories()
      if (onChange) onChange()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      if (msg === 'EXPENSE_CATEGORY_IN_USE') {
        showError('expense.categoryInUse')
      } else {
        showError('common.deleteError')
      }
    }
  }

  const displayLabel = (cat: CategoryRow): string => {
    if (cat.is_default) {
      return t(cat.name_key)
    }
    return cat.name_key.startsWith('expense.category.')
      ? cat.name_key.replace('expense.category.', '')
      : cat.name_key
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" dir={isRtl ? 'rtl' : 'ltr'}>
      <DialogTitle sx={{ fontWeight: 600 }}>{t('expense.manageCategories')}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              size="small"
              placeholder={t('expense.newCategoryPlaceholder')}
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              sx={{ flexGrow: 1 }}
            />
            <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={handleAdd}>
              {t('common.add')}
            </Button>
          </Box>

          <List sx={{ maxHeight: 300, overflow: 'auto' }}>
            {categories.map((cat) => (
              <ListItem
                key={cat.id}
                sx={{
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  py: 1
                }}
                secondaryAction={
                  cat.is_default === 0 && (
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      {editingId === cat.id ? (
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => handleSaveEdit(cat.id)}
                        >
                          {t('common.save')}
                        </Button>
                      ) : (
                        <IconButton size="small" onClick={() => handleStartEdit(cat)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      )}
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => setDeleteTargetId(cat.id)}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  )
                }
              >
                {editingId === cat.id ? (
                  <TextField
                    size="small"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    sx={{ width: '70%' }}
                  />
                ) : (
                  <ListItemText
                    primary={displayLabel(cat)}
                    secondary={
                      cat.is_default ? t('expense.defaultCategory') : t('expense.customCategory')
                    }
                  />
                )}
              </ListItem>
            ))}
          </List>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('common.close')}</Button>
      </DialogActions>

      <ConfirmDialog
        open={deleteTargetId !== null}
        title={t('common.confirmDelete')}
        message={t('expense.confirmDeleteCategory')}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTargetId(null)}
      />

      <GlobalSnackbar state={snack} onClose={hideSnackbar} />
    </Dialog>
  )
}
