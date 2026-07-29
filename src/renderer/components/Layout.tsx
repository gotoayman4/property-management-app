import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet'
import AssessmentIcon from '@mui/icons-material/Assessment'
import AutorenewIcon from '@mui/icons-material/Autorenew'
import BusinessIcon from '@mui/icons-material/Business'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import DashboardIcon from '@mui/icons-material/Dashboard'
import DescriptionIcon from '@mui/icons-material/Description'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import LightModeIcon from '@mui/icons-material/LightMode'
import MenuIcon from '@mui/icons-material/Menu'
import MenuOpenIcon from '@mui/icons-material/MenuOpen'
import NotificationsIcon from '@mui/icons-material/Notifications'
import PaymentsIcon from '@mui/icons-material/Payments'
import PeopleIcon from '@mui/icons-material/People'
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong'
import RequestQuoteIcon from '@mui/icons-material/RequestQuote'
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
  Badge,
  alpha
} from '@mui/material'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router-dom'
import appLogo from '../assets/logo.png'
import { useUiPreferences } from '../stores/uiPreferencesStore'
import AboutDialog from './AboutDialog'
import NotificationBell from './NotificationBell'
import SearchBar from './SearchBar'
import UpdateNotifier from './UpdateNotifier'

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
  const themeMode = useUiPreferences((s) => s.theme)
  const toggleTheme = useUiPreferences((s) => s.toggleTheme)

  const currentLanguage = i18n.language
  const direction = currentLanguage === 'ar' ? 'rtl' : 'ltr'
  const [unreadCount, setUnreadCount] = useState<number>(0)
  const [aboutOpen, setAboutOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const handleSearchInputMount = useCallback((el: HTMLInputElement | null): void => {
    searchRef.current = el
  }, [])

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

  // Ctrl+K / Cmd+K global hotkey — focus the search bar (FR-SRCH-01)
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
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
    { text: t('sidebar.dues'), icon: <RequestQuoteIcon />, path: '/dues' },
    { text: t('sidebar.expenses'), icon: <ReceiptLongIcon />, path: '/expenses' },
    { text: t('sidebar.recurringExpenses'), icon: <AutorenewIcon />, path: '/recurring-expenses' },
    { text: t('sidebar.ledger'), icon: <AccountBalanceWalletIcon />, path: '/ledger' },
    { text: t('sidebar.reports'), icon: <AssessmentIcon />, path: '/reports' },
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
      <Toolbar
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
          px: sidebarCollapsed ? 1 : 2,
          minHeight: 64
        }}
      >
        <Tooltip
          title={sidebarCollapsed ? t('app.brand') : ''}
          placement={direction === 'rtl' ? 'left' : 'right'}
          arrow
        >
          <Box
            component="img"
            src={appLogo}
            alt={t('app.brand')}
            sx={{
              width: 36,
              height: 36,
              borderRadius: '8px',
              objectFit: 'cover',
              boxShadow: (theme) => `0 2px 8px ${alpha(theme.palette.primary.main, 0.19)}`,
              flexShrink: 0
            }}
          />
        </Tooltip>
        {!sidebarCollapsed && (
          <Typography
            variant="h6"
            color="primary"
            sx={{
              fontWeight: 700,
              fontSize: '1.15rem',
              marginInlineStart: 1.5,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {t('app.brand')}
          </Typography>
        )}
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
              aria-label={sidebarCollapsed ? t('sidebar.expand') : t('sidebar.collapse')}
            >
              {sidebarCollapsed ? <MenuIcon /> : <MenuOpenIcon />}
            </IconButton>
            <Typography variant="h6" component="div" sx={{ fontWeight: 600 }}>
              {location.pathname === '/' && t('sidebar.dashboard')}
              {location.pathname === '/properties' && t('sidebar.properties')}
              {location.pathname === '/tenants' && t('sidebar.tenants')}
              {location.pathname === '/contracts' && t('sidebar.contracts')}
              {location.pathname === '/payments' && t('sidebar.payments')}
              {location.pathname === '/dues' && t('sidebar.dues')}
              {location.pathname === '/expenses' && t('sidebar.expenses')}
              {location.pathname === '/recurring-expenses' && t('sidebar.recurringExpenses')}
              {location.pathname === '/ledger' && t('sidebar.ledger')}
              {location.pathname === '/reports' && t('sidebar.reports')}
              {location.pathname === '/currency' && t('sidebar.currency')}
              {location.pathname === '/settings' && t('sidebar.settings')}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SearchBar onInputMount={handleSearchInputMount} />
            <NotificationBell />
            <Tooltip title={t('sidebar.toggleTheme')} arrow>
              <IconButton
                color="inherit"
                onClick={toggleTheme}
                aria-label={t('sidebar.toggleTheme')}
              >
                {themeMode === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
              </IconButton>
            </Tooltip>
            <Tooltip title={t('sidebar.toggleLanguage')} arrow>
              <IconButton
                color="inherit"
                onClick={toggleLanguage}
                aria-label={t('sidebar.toggleLanguage')}
              >
                <TranslateIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title={t('sidebar.about')} arrow>
              <IconButton
                color="inherit"
                onClick={() => setAboutOpen(true)}
                aria-label={t('sidebar.about')}
              >
                <InfoOutlinedIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Toolbar>
      </AppBar>

      {/* About dialog (topbar info icon) + global update notifications (VS Code-style) */}
      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
      <UpdateNotifier />

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
