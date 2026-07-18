import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet'
import AssessmentIcon from '@mui/icons-material/Assessment'
import AttachMoneyIcon from '@mui/icons-material/AttachMoney'
import AutorenewIcon from '@mui/icons-material/Autorenew'
import BusinessIcon from '@mui/icons-material/Business'
import DashboardIcon from '@mui/icons-material/Dashboard'
import DescriptionIcon from '@mui/icons-material/Description'
import MenuIcon from '@mui/icons-material/Menu'
import MenuOpenIcon from '@mui/icons-material/MenuOpen'
import NotificationsIcon from '@mui/icons-material/Notifications'
import PaymentsIcon from '@mui/icons-material/Payments'
import PeopleIcon from '@mui/icons-material/People'
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong'
import SettingsIcon from '@mui/icons-material/Settings'
import TranslateIcon from '@mui/icons-material/Translate'
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  List,
  Typography,
  Divider,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  IconButton,
  Tooltip,
  Badge
} from '@mui/material'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router-dom'
import { useUiPreferences } from '../stores/uiPreferencesStore'
import NotificationBell from './NotificationBell'
import SearchBar from './SearchBar'

/** Width when sidebar is fully expanded with labels visible. */
const drawerExpandedWidth = 240
/** Width when sidebar is docked / collapsed to icon-only mode. */
const drawerCollapsedWidth = 64

interface LayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: LayoutProps): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const location = useLocation()
  const sidebarCollapsed = useUiPreferences((s) => s.sidebarCollapsed)
  const toggleSidebar = useUiPreferences((s) => s.toggleSidebar)

  const currentLanguage = i18n.language
  const direction = currentLanguage === 'ar' ? 'rtl' : 'ltr'
  const [unreadCount, setUnreadCount] = useState<number>(0)

  /** Drawer width adapts based on collapsed state. */
  const drawerWidth = sidebarCollapsed ? drawerCollapsedWidth : drawerExpandedWidth

  useEffect(() => {
    let cancelled = false
    async function loadUnreadCount(): Promise<void> {
      try {
        const result = await window.api.notifications.unreadCount()
        if (!cancelled) setUnreadCount(result.count)
      } catch {
        /* ignore */
      }
    }
    loadUnreadCount()
    // Poll every 30 seconds for new notifications
    const interval = setInterval(loadUnreadCount, 30000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  const toggleLanguage = async (): Promise<void> => {
    const nextLang = currentLanguage === 'ar' ? 'en' : 'ar'
    await i18n.changeLanguage(nextLang)
    // Update local settings in SQLite database
    try {
      await window.api.settings.update({ app_language: nextLang })
    } catch (err) {
      console.error('Failed to save language setting to DB:', err)
    }
  }

  const menuItems = [
    { text: t('sidebar.dashboard'), icon: <DashboardIcon />, path: '/' },
    { text: t('sidebar.properties'), icon: <BusinessIcon />, path: '/properties' },
    { text: t('sidebar.tenants'), icon: <PeopleIcon />, path: '/tenants' },
    { text: t('sidebar.contracts'), icon: <DescriptionIcon />, path: '/contracts' },
    { text: t('sidebar.payments'), icon: <PaymentsIcon />, path: '/payments' },
    { text: t('sidebar.expenses'), icon: <ReceiptLongIcon />, path: '/expenses' },
    { text: t('sidebar.recurringExpenses'), icon: <AutorenewIcon />, path: '/recurring-expenses' },
    { text: t('sidebar.ledger'), icon: <AccountBalanceWalletIcon />, path: '/ledger' },
    { text: t('sidebar.reports'), icon: <AssessmentIcon />, path: '/reports' },
    { text: t('sidebar.currency'), icon: <AttachMoneyIcon />, path: '/currency' },
    {
      text: t('sidebar.notifications'),
      icon: (
        <Badge badgeContent={unreadCount} color="error" invisible={unreadCount === 0}>
          <NotificationsIcon />
        </Badge>
      ),
      path: '/notifications'
    },
    { text: t('sidebar.settings'), icon: <SettingsIcon />, path: '/settings' }
  ]

  const drawer = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Toolbar sx={{ justifyContent: 'center' }}>
        <Typography
          variant="h5"
          color="primary"
          sx={{
            fontWeight: 700,
            fontSize: sidebarCollapsed ? '0.75rem' : undefined,
            lineHeight: sidebarCollapsed ? 1 : undefined,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: sidebarCollapsed ? drawerCollapsedWidth - 16 : undefined
          }}
        >
          {sidebarCollapsed ? 'أثـيـر' : t('app.brand')}
        </Typography>
      </Toolbar>
      <Divider />
      <List sx={{ flexGrow: 1, px: sidebarCollapsed ? 0.5 : 1 }}>
        {menuItems.map((item) => {
          const isActive = location.pathname === item.path
          return (
            <ListItem key={item.text} disablePadding sx={{ mb: 0.5 }}>
              {sidebarCollapsed ? (
                <Tooltip title={item.text} placement="right" arrow>
                  <ListItemButton
                    component={Link}
                    to={item.path}
                    selected={isActive}
                    sx={{
                      justifyContent: 'center',
                      px: 1,
                      borderRadius: 2,
                      minHeight: 44,
                      '&.Mui-selected': {
                        bgcolor: 'primary.light',
                        color: 'primary.contrastText',
                        '& .MuiListItemIcon-root': {
                          color: 'primary.contrastText'
                        },
                        '&:hover': {
                          bgcolor: 'primary.main'
                        }
                      }
                    }}
                  >
                    <ListItemIcon
                      sx={{
                        minWidth: 0,
                        justifyContent: 'center',
                        color: isActive ? 'inherit' : 'text.secondary'
                      }}
                    >
                      {item.icon}
                    </ListItemIcon>
                  </ListItemButton>
                </Tooltip>
              ) : (
                <ListItemButton
                  component={Link}
                  to={item.path}
                  selected={isActive}
                  sx={{
                    borderRadius: 2,
                    '&.Mui-selected': {
                      bgcolor: 'primary.light',
                      color: 'primary.contrastText',
                      '& .MuiListItemIcon-root': {
                        color: 'primary.contrastText'
                      },
                      '&:hover': {
                        bgcolor: 'primary.main'
                      }
                    }
                  }}
                >
                  <ListItemIcon
                    sx={{ minWidth: 40, color: isActive ? 'inherit' : 'text.secondary' }}
                  >
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Typography sx={{ fontWeight: isActive ? 600 : 500 }}>{item.text}</Typography>
                    }
                  />
                </ListItemButton>
              )}
            </ListItem>
          )
        })}
      </List>
    </Box>
  )

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar
        position="fixed"
        elevation={1}
        sx={{
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          marginInlineStart: { sm: `${drawerWidth}px` },
          bgcolor: 'background.paper',
          color: 'text.primary',
          borderBottom: '1px solid',
          borderColor: 'divider'
        }}
      >
        <Toolbar sx={{ justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconButton
              color="inherit"
              onClick={toggleSidebar}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? <MenuIcon /> : <MenuOpenIcon />}
            </IconButton>
            <Typography variant="h6" component="div" sx={{ fontWeight: 600 }}>
              {location.pathname === '/' && t('sidebar.dashboard')}
              {location.pathname === '/properties' && t('sidebar.properties')}
              {location.pathname === '/tenants' && t('sidebar.tenants')}
              {location.pathname === '/contracts' && t('sidebar.contracts')}
              {location.pathname === '/payments' && t('sidebar.payments')}
              {location.pathname === '/expenses' && t('sidebar.expenses')}
              {location.pathname === '/recurring-expenses' && t('sidebar.recurringExpenses')}
              {location.pathname === '/ledger' && t('sidebar.ledger')}
              {location.pathname === '/reports' && t('sidebar.reports')}
              {location.pathname === '/currency' && t('sidebar.currency')}
              {location.pathname === '/settings' && t('sidebar.settings')}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SearchBar />
            <NotificationBell />
            <IconButton color="inherit" onClick={toggleLanguage}>
              <TranslateIcon />
            </IconButton>
          </Box>
        </Toolbar>
      </AppBar>

      <Box
        component="nav"
        sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
        aria-label="navigation drawer"
      >
        <Drawer
          variant="permanent"
          anchor="left"
          dir={direction}
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: drawerWidth,
              borderInlineEnd: '1px solid',
              borderInlineStart: 'none',
              borderColor: 'divider'
            }
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          mt: 8
        }}
      >
        {children}
      </Box>
    </Box>
  )
}
