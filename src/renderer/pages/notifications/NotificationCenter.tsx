/**
 * INTENT: Full notification center page — filterable list of all notification types
 *         (rent_due, contract_expiry, document_expiry, recurring_expense_due) with
 *         mark-as-read, mark-all-read, WhatsApp deep-link, and delete (single / bulk /
 *         clear-all) actions. Deletion is a soft-dismiss via the notifications:dismiss*
 *         IPC channels — rows stay in the DB so the evaluator dedup does not re-create them.
 * CONSTRAINT (AGENTS.md): StandardTable, PageHeader, explicit dir on dialogs, i18n keys only.
 */
import {
  Delete as DeleteIcon,
  DeleteSweep as ClearAllIcon,
  MarkEmailRead as MarkAllReadIcon,
  Notifications as NotificationsIcon,
  Send as SendWhatsAppIcon
} from '@mui/icons-material'
import { Box, Button, Chip, IconButton, Stack, Tab, Tabs, Typography, Tooltip } from '@mui/material'
import type { SxProps, Theme } from '@mui/material'
import { GridColDef, GridRowSelectionModel } from '@mui/x-data-grid'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ConfirmDialog from '../../components/ConfirmDialog'
import GlobalSnackbar from '../../components/GlobalSnackbar'
import PageHeader from '../../components/PageHeader'
import StandardTable from '../../components/StandardTable'
import { useDirection } from '../../hooks/useDirection'
import { useSnackbar } from '../../hooks/useSnackbar'
import { canSendWhatsApp, type NotificationRow } from '../../utils/notificationUtils'
import { buildWhatsAppUrl } from '../../utils/whatsappUtils'

/**
 * Tooltip that appears only when the wrapped text is actually truncated (ellipsis visible).
 * Measures scrollWidth vs clientWidth at open-time, so window resizes need no listeners.
 */
function OverflowTooltip({
  text,
  dir,
  sx
}: {
  text: string
  dir: 'rtl' | 'ltr'
  sx?: SxProps<Theme>
}): React.ReactElement {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLElement>(null)

  const handleOpen = (): void => {
    const el = ref.current
    if (el && el.scrollWidth > el.clientWidth) setOpen(true)
  }

  return (
    <Tooltip title={text} dir={dir} open={open} onOpen={handleOpen} onClose={() => setOpen(false)}>
      <Typography ref={ref} variant="body2" noWrap sx={{ maxWidth: '100%', ...sx }}>
        {text}
      </Typography>
    </Tooltip>
  )
}

export default function NotificationCenter(): React.ReactElement {
  const { t } = useTranslation()
  const isRtl = useDirection()
  const { snack, showError, showSuccess, hideSnackbar } = useSnackbar()

  const [tab, setTab] = useState(0)
  const [notifications, setNotifications] = useState<NotificationRow[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [selection, setSelection] = useState<GridRowSelectionModel>({
    type: 'include',
    ids: new Set()
  })
  // Which delete confirmation is open: the selected rows or the whole list.
  const [confirmMode, setConfirmMode] = useState<'selected' | 'all' | null>(null)

  const fetchNotifications = useCallback(
    async (unreadOnly = false): Promise<void> => {
      try {
        setLoading(true)
        setError(null)
        const data = await window.api.notifications.list({
          unread_only: unreadOnly
        })
        setNotifications(data as NotificationRow[])
      } catch {
        setError(t('common.error'))
      } finally {
        setLoading(false)
      }
    },
    [t]
  )

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- async data-fetch is the standard
       React pattern (mirrors useFetch); setState fires when the Promise resolves */
    fetchNotifications(tab === 1)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [tab, fetchNotifications])

  const handleMarkAllRead = async (): Promise<void> => {
    try {
      await window.api.notifications.markAllRead()
      showSuccess('common.saveSuccess')
      fetchNotifications(tab === 1)
    } catch {
      showError('common.saveError')
    }
  }

  const handleMarkRead = async (id: number): Promise<void> => {
    try {
      await window.api.notifications.markRead(id)
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: 1, read_at: new Date().toISOString() } : n))
      )
    } catch {
      /* silent */
    }
  }

  // INTENT: Open WhatsApp chat with the notification message pre-filled in the input box.
  //         Uses wa.me deep-link with ?text= parameter — user only needs to hit Send.
  const handleWhatsApp = (row: NotificationRow): void => {
    if (row.tenant_phone) {
      const url = buildWhatsAppUrl(
        row.tenant_phone,
        row.tenant_country_code ?? undefined,
        row.message
      )
      window.open(url, '_blank')
    }
  }

  // Selected row ids resolved against the grid's include/exclude selection model.
  const selectedIds = useMemo(() => {
    const ids = selection.ids
    return selection.type === 'include'
      ? notifications.filter((n) => ids.has(n.id)).map((n) => n.id)
      : notifications.filter((n) => !ids.has(n.id)).map((n) => n.id)
  }, [notifications, selection])

  const handleDismiss = async (id: number): Promise<void> => {
    try {
      await window.api.notifications.dismiss(id)
      setNotifications((prev) => prev.filter((n) => n.id !== id))
      showSuccess('notifications.deleted')
    } catch {
      showError('common.saveError')
    }
  }

  const handleConfirmDelete = async (): Promise<void> => {
    const mode = confirmMode
    setConfirmMode(null)
    try {
      if (mode === 'all') {
        await window.api.notifications.clearAll()
      } else if (selectedIds.length > 0) {
        await window.api.notifications.dismissMany(selectedIds)
      }
      setSelection({ type: 'include', ids: new Set() })
      showSuccess('notifications.deleted')
      fetchNotifications(tab === 1)
    } catch {
      showError('common.saveError')
    }
  }

  const unreadCount = notifications.filter((n) => n.is_read === 0).length

  const columns: GridColDef[] = [
    {
      field: 'notification_type',
      headerName: t('common.category'),
      flex: 1.2,
      renderCell: (params) => {
        const row = params.row as NotificationRow
        return (
          <Chip
            label={t(`notifications.type.${row.notification_type}`)}
            size="small"
            variant={row.is_read ? 'outlined' : 'filled'}
            color={row.is_read ? 'default' : 'primary'}
          />
        )
      }
    },
    {
      field: 'message',
      headerName: t('common.description'),
      flex: 3,
      renderCell: (params) => {
        const row = params.row as NotificationRow
        return (
          <OverflowTooltip
            text={row.message}
            dir={isRtl ? 'rtl' : 'ltr'}
            sx={{
              fontWeight: row.is_read ? 400 : 600,
              color: row.is_read ? 'text.secondary' : 'text.primary'
            }}
          />
        )
      }
    },
    {
      field: 'due_date',
      headerName: t('notifications.dueDate'),
      flex: 1,
      renderCell: (params) => {
        const row = params.row as NotificationRow
        return row.due_date ?? '—'
      }
    },
    {
      field: 'created_at',
      headerName: t('notifications.createdAt'),
      flex: 1.2,
      renderCell: (params) => {
        const row = params.row as NotificationRow
        return row.created_at
      }
    },
    {
      field: 'is_read',
      headerName: t('common.status'),
      flex: 0.8,
      renderCell: (params) => {
        const row = params.row as NotificationRow
        return row.is_read ? (
          <Chip label={t('notification.read')} size="small" variant="outlined" />
        ) : (
          <Chip label={t('notification.unread')} size="small" color="warning" />
        )
      }
    },
    {
      field: 'actions',
      headerName: t('common.actions'),
      flex: 1.2,
      sortable: false,
      renderCell: (params) => {
        const row = params.row as NotificationRow
        const canWhatsApp = canSendWhatsApp(row)
        return (
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            {!row.is_read && (
              <Tooltip title={t('notification.markAsRead')}>
                <IconButton
                  size="small"
                  aria-label={t('notification.markAsRead')}
                  onClick={() => handleMarkRead(row.id)}
                >
                  <MarkAllReadIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {canWhatsApp && (
              <Tooltip title={t('common.sendWhatsApp')}>
                <IconButton
                  size="small"
                  color="success"
                  aria-label={t('common.sendWhatsApp')}
                  onClick={() => handleWhatsApp(row)}
                >
                  <SendWhatsAppIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title={t('common.delete')}>
              <IconButton
                size="small"
                color="error"
                aria-label={t('common.delete')}
                onClick={() => handleDismiss(row.id)}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        )
      }
    }
  ]

  return (
    <Box sx={{ py: 3, px: 4 }}>
      <PageHeader
        icon={<NotificationsIcon />}
        title={t('notifications.title')}
        subtitle={`${unreadCount} ${t('notification.unread')}`}
        action={
          <Stack direction="row" spacing={1}>
            {selectedIds.length > 0 && (
              <Button
                variant="outlined"
                color="error"
                startIcon={<DeleteIcon />}
                onClick={() => setConfirmMode('selected')}
              >
                {t('notifications.deleteSelected', { count: selectedIds.length })}
              </Button>
            )}
            {notifications.length > 0 && (
              <Button
                variant="outlined"
                color="error"
                startIcon={<ClearAllIcon />}
                onClick={() => setConfirmMode('all')}
              >
                {t('notifications.clearAll')}
              </Button>
            )}
            {unreadCount > 0 && (
              <Button
                variant="outlined"
                startIcon={<MarkAllReadIcon />}
                onClick={handleMarkAllRead}
              >
                {t('notifications.markAllRead')}
              </Button>
            )}
          </Stack>
        }
      />

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label={`${t('common.all')} (${notifications.length})`} />
        <Tab label={`${t('notification.unread')} (${unreadCount})`} />
      </Tabs>

      <StandardTable
        columns={columns}
        rows={notifications}
        loading={loading}
        error={error ?? undefined}
        onRetry={() => fetchNotifications(tab === 1)}
        emptyMessage={t('notifications.empty')}
        tableId="notifications"
        checkboxSelection
        rowSelectionModel={selection}
        onRowSelectionModelChange={setSelection}
      />

      <ConfirmDialog
        open={confirmMode !== null}
        title={t('notifications.deleteConfirmTitle')}
        message={
          confirmMode === 'all'
            ? t('notifications.clearAllConfirmMessage')
            : t('notifications.deleteConfirmMessage', { count: selectedIds.length })
        }
        confirmLabel={t('common.delete')}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmMode(null)}
      />

      <GlobalSnackbar state={snack} onClose={hideSnackbar} />
    </Box>
  )
}
