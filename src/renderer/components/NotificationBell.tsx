/**
 * INTENT: Bell icon with unread count badge in the AppBar. Click opens a popover
 *         listing recent notifications. Mark-as-read on click.
 * CONSTRAINT (AGENTS.md): i18n keys only, logical CSS, portal dir prop.
 */
import NotificationsIcon from '@mui/icons-material/Notifications'
import SendWhatsAppIcon from '@mui/icons-material/Send'
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
  Chip,
  Tooltip
} from '@mui/material'
import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useDirection } from '../hooks/useDirection'
import { canSendWhatsApp, type NotificationRow } from '../utils/notificationUtils'
import { buildWhatsAppUrl } from '../utils/whatsappUtils'

const TYPE_COLORS: Record<string, 'warning' | 'error' | 'info' | 'success'> = {
  rent_due: 'warning',
  contract_expiry: 'error',
  contract_expiring: 'error',
  auto_renew_upcoming: 'warning',
  contract_auto_renewed: 'success',
  document_expiry: 'info',
  document_expiring: 'info',
  recurring_expense_due: 'success'
}

// Contract notifications that should deep-link straight into the renewal flow (?renew=1).
const RENEWAL_DEEP_LINK_TYPES = new Set([
  'contract_expiry',
  'contract_expiring',
  'auto_renew_upcoming'
])

export default function NotificationBell(): React.JSX.Element {
  const { t } = useTranslation()
  const isRtl = useDirection()
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState<NotificationRow[]>([])
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
      setNotifications(data as NotificationRow[])
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

  // Mark read, then deep-link contract notifications to their detail page (renewal ones open the
  // renewal dialog via ?renew=1). Non-contract notifications just mark read in place.
  const handleNotificationClick = (n: NotificationRow): void => {
    handleMarkRead(n.id)
    if (n.entity_type === 'contract' && n.entity_id) {
      handleClose()
      const suffix = RENEWAL_DEEP_LINK_TYPES.has(n.notification_type) ? '?renew=1' : ''
      navigate(`/contracts/${n.entity_id}${suffix}`)
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

  // INTENT: Forward the notification message to the tenant via WhatsApp deep-link.
  //         stopPropagation so the row's mark-read/navigate click does not fire.
  const handleWhatsApp = (e: React.MouseEvent, n: NotificationRow): void => {
    e.stopPropagation()
    if (n.tenant_phone) {
      const url = buildWhatsAppUrl(n.tenant_phone, n.tenant_country_code ?? undefined, n.message)
      window.open(url, '_blank')
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
                  onClick={() => handleNotificationClick(n)}
                  secondaryAction={
                    canSendWhatsApp(n) ? (
                      <Tooltip title={t('common.sendWhatsApp')} dir={isRtl ? 'rtl' : 'ltr'}>
                        <IconButton
                          edge="end"
                          size="small"
                          color="success"
                          aria-label={t('common.sendWhatsApp')}
                          onClick={(e) => handleWhatsApp(e, n)}
                        >
                          <SendWhatsAppIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    ) : undefined
                  }
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
                    secondary={
                      <Tooltip title={n.message} dir={isRtl ? 'rtl' : 'ltr'}>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden'
                          }}
                        >
                          {n.message}
                        </Typography>
                      </Tooltip>
                    }
                    slotProps={{ secondary: { component: 'div' } }}
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
