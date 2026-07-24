/**
 * INTENT: Bell icon with unread count badge in the AppBar. Click opens a popover
 *         listing recent notifications. Mark-as-read on click.
 * CONSTRAINT (AGENTS.md): i18n keys only, logical CSS, portal dir prop.
 */
import NotificationsIcon from '@mui/icons-material/Notifications'
import {
  IconButton,
  Badge,
  Popover,
  List,
  ListItem,
  ListItemText,
  Typography,
  Button,
  Box,
  Chip
} from '@mui/material'
import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

interface Notification {
  id: number
  notification_type: string
  title: string
  message: string
  due_date: string | null
  is_read: number
  created_at: string
}

const TYPE_COLORS: Record<string, 'warning' | 'error' | 'info' | 'success'> = {
  rent_due: 'warning',
  contract_expiry: 'error',
  contract_expiring: 'error',
  document_expiry: 'info',
  document_expiring: 'info',
  recurring_expense_due: 'success'
}

export default function NotificationBell(): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const isRtl = i18n.language === 'ar'
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)

  useEffect(() => {
    let cancelled = false
    async function fetchCount(): Promise<void> {
      try {
        const result = await window.api.notifications.unreadCount()
        if (!cancelled) setUnreadCount(result.count)
      } catch {
        /* silent — badge stays at 0 */
      }
    }
    fetchCount()
    const interval = setInterval(() => {
      fetchCount()
    }, 30_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  const handleOpen = async (event: React.MouseEvent<HTMLElement>): Promise<void> => {
    setAnchorEl(event.currentTarget)
    try {
      const data = await window.api.notifications.list({ unread_only: false })
      setNotifications(data as Notification[])
    } catch {
      /* silent */
    }
  }

  const handleClose = (): void => setAnchorEl(null)

  const handleMarkRead = async (id: number): Promise<void> => {
    try {
      await window.api.notifications.markRead(id)
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: 1 } : n)))
      setUnreadCount((prev) => Math.max(0, prev - 1))
    } catch {
      /* silent */
    }
  }

  const handleMarkAllRead = async (): Promise<void> => {
    try {
      await window.api.notifications.markAllRead()
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })))
      setUnreadCount(0)
    } catch {
      /* silent */
    }
  }

  const open = Boolean(anchorEl)

  return (
    <>
      <IconButton color="inherit" onClick={handleOpen} aria-label={t('notifications.label')}>
        <Badge badgeContent={unreadCount} color="error" max={99}>
          <NotificationsIcon />
        </Badge>
      </IconButton>
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        dir={isRtl ? 'rtl' : 'ltr'}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Box sx={{ width: 360, maxHeight: 400, overflow: 'auto' }}>
          <Box
            sx={{
              p: 2,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <Typography variant="h5" sx={{ fontWeight: 600 }}>
              {t('notifications.title')}
            </Typography>
            {unreadCount > 0 && (
              <Button size="small" onClick={handleMarkAllRead}>
                {t('notifications.markAllRead')}
              </Button>
            )}
          </Box>
          {notifications.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
              {t('notifications.empty')}
            </Typography>
          ) : (
            <List dense disablePadding>
              {notifications.map((n) => (
                <ListItem
                  key={n.id}
                  sx={{
                    bgcolor: n.is_read ? 'transparent' : 'action.hover',
                    cursor: 'pointer'
                  }}
                  onClick={() => handleMarkRead(n.id)}
                >
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip
                          label={t(`notifications.type.${n.notification_type}`)}
                          size="small"
                          color={TYPE_COLORS[n.notification_type] ?? 'default'}
                          aria-hidden="true"
                        />
                        {n.due_date && (
                          <Typography variant="caption" color="text.secondary">
                            {n.due_date}
                          </Typography>
                        )}
                      </Box>
                    }
                    secondary={n.message}
                  />
                </ListItem>
              ))}
            </List>
          )}
        </Box>
      </Popover>
    </>
  )
}
