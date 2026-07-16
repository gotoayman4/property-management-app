import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
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
  Button
} from '@mui/material'
import DashboardIcon from '@mui/icons-material/Dashboard'
import BusinessIcon from '@mui/icons-material/Business'
import SettingsIcon from '@mui/icons-material/Settings'
import TranslateIcon from '@mui/icons-material/Translate'
import PeopleIcon from '@mui/icons-material/People'
import DescriptionIcon from '@mui/icons-material/Description'

const drawerWidth = 240

interface LayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: LayoutProps): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const location = useLocation()

  const currentLanguage = i18n.language
  const isRtl = currentLanguage === 'ar'

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
    { text: t('sidebar.contracts'), icon: <DescriptionIcon />, path: '/leases' },
    { text: t('sidebar.settings'), icon: <SettingsIcon />, path: '/settings' }
  ]

  const drawer = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Toolbar sx={{ justifyContent: 'center' }}>
        <Typography variant="h5" color="primary" sx={{ fontWeight: 700 }}>
          {isRtl ? 'أثـيـر العقاري' : 'Atheer Property'}
        </Typography>
      </Toolbar>
      <Divider />
      <List sx={{ flexGrow: 1, px: 1 }}>
        {menuItems.map((item) => {
          const isActive = location.pathname === item.path
          return (
            <ListItem key={item.text} disablePadding sx={{ mb: 0.5 }}>
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
                <ListItemIcon sx={{ minWidth: 40, color: isActive ? 'inherit' : 'text.secondary' }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Typography sx={{ fontWeight: isActive ? 600 : 500 }}>{item.text}</Typography>
                  }
                />
              </ListItemButton>
            </ListItem>
          )
        })}
      </List>
      <Divider />
      <Box sx={{ p: 2 }}>
        <Button
          fullWidth
          variant="outlined"
          startIcon={<TranslateIcon sx={{ marginInlineEnd: 1 }} />}
          onClick={toggleLanguage}
          sx={{ borderRadius: 2 }}
        >
          {currentLanguage === 'ar' ? 'English' : 'العربية'}
        </Button>
      </Box>
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
          <Typography variant="h6" component="div" sx={{ fontWeight: 600 }}>
            {location.pathname === '/' && t('sidebar.dashboard')}
            {location.pathname === '/properties' && t('sidebar.properties')}
            {location.pathname === '/settings' && t('sidebar.settings')}
          </Typography>
          <IconButton color="inherit" onClick={toggleLanguage}>
            <TranslateIcon />
          </IconButton>
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
