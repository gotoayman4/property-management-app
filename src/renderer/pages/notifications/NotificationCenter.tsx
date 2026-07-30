/**
 * INTENT: Full notification center page — filterable list of all notification types
 *         (rent_due, contract_expiry, document_expiry, recurring_expense_due) with
 *         mark-as-read, mark-all-read, and WhatsApp deep-link actions.
 * CONSTRAINT (AGENTS.md): StandardTable, PageHeader, explicit dir on dialogs, i18n keys only.
 */
import {
  MarkEmailRead as MarkAllReadIcon,
  Notifications as NotificationsIcon,
  Send as SendWhatsAppIcon
} from '@mui/icons-material'
import { Box, Button, Chip, IconButton, Tab, Tabs, Typography, Tooltip } from '@mui/material'
import { GridColDef } from '@mui/x-data-grid'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import GlobalSnackbar from '../../components/GlobalSnackbar'
import PageHeader from '../../components/PageHeader'
import StandardTable from '../../components/StandardTable'
import { useSnackbar } from '../../hooks/useSnackbar'
import { buildWhatsAppUrl } from '../../utils/whatsappUtils'

interface NotificationRow {
  id: number
  notification_type: string
  entity_type: string
  entity_id: number
  title: string
  message: string
  due_date: string | null
  is_read: number
  read_at: string | null
  created_at: string
  tenant_phone?: string
  tenant_country_code?: string
}

export default function NotificationCenter(): React.ReactElement {
  const { t } = useTranslation()
  const { snack, showError, showSuccess, hideSnackbar } = useSnackbar()

  const [tab, setTab] = useState(0)
  const [notifications, setNotifications] = useState<NotificationRow[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

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
    let cancelled = false
    async function load(): Promise<void> {
      try {
        setLoading(true)
        setError(null)
        const data = await window.api.notifications.list({
          unread_only: tab === 1
        })
        if (!cancelled) setNotifications(data as NotificationRow[])
      } catch {
        if (!cancelled) setError(t('common.error'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [tab, t])

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
      const url = buildWhatsAppUrl(row.tenant_phone, row.tenant_country_code, row.message)
      window.open(url, '_blank')
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
          <Typography
            variant="body2"
            sx={{
              fontWeight: row.is_read ? 400 : 600,
              color: row.is_read ? 'text.secondary' : 'text.primary'
            }}
          >
            {row.message}
          </Typography>
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
        const canWhatsApp =
          !!row.tenant_phone &&
          ['rent_due', 'overdue', 'contract_expiry', 'escalation_upcoming'].includes(
            row.notification_type
          )
        return (
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            {!row.is_read && (
              <Tooltip title={t('notification.markAsRead')}>
                <IconButton size="small" onClick={() => handleMarkRead(row.id)}>
                  <MarkAllReadIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {canWhatsApp && (
              <Tooltip title={t('common.sendWhatsApp')}>
                <IconButton size="small" color="success" onClick={() => handleWhatsApp(row)}>
                  <SendWhatsAppIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
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
          unreadCount > 0 ? (
            <Button variant="outlined" startIcon={<MarkAllReadIcon />} onClick={handleMarkAllRead}>
              {t('notifications.markAllRead')}
            </Button>
          ) : undefined
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
      />

      <GlobalSnackbar state={snack} onClose={hideSnackbar} />
    </Box>
  )
}
