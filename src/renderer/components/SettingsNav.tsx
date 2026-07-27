/**
 * INTENT: Settings page navigation — vertical sidebar on desktop (sm+), horizontal
 *         scrollable tabs on mobile (xs). Groups related settings sections with icons
 *         and labels. Active item is visually highlighted.
 * CONSTRAINT (AGENTS.md): i18n keys only, theme.palette tokens, logical CSS.
 * DECISION: Uses MUI Tabs for mobile (compact, scrollable) and a custom List for
 *           desktop (more control over icon+label layout and active styling).
 */
import AttachMoneyIcon from '@mui/icons-material/AttachMoney'
import BusinessIcon from '@mui/icons-material/Business'
import CurrencyExchangeIcon from '@mui/icons-material/CurrencyExchange'
import DashboardIcon from '@mui/icons-material/Dashboard'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import NotificationsIcon from '@mui/icons-material/Notifications'
import PaletteIcon from '@mui/icons-material/Palette'
import ReceiptIcon from '@mui/icons-material/Receipt'
import StorageIcon from '@mui/icons-material/Storage'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import {
  Box,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tab,
  Tabs,
  Typography,
  alpha,
  useMediaQuery,
  useTheme
} from '@mui/material'
import React from 'react'
import { useTranslation } from 'react-i18next'

export const SETTINGS_SECTIONS = [
  { id: 'appearance', icon: <PaletteIcon />, labelKey: 'settings.navAppearance' },
  { id: 'dashboard', icon: <DashboardIcon />, labelKey: 'settings.navDashboard' },
  { id: 'company', icon: <BusinessIcon />, labelKey: 'settings.navCompany' },
  { id: 'financial', icon: <AttachMoneyIcon />, labelKey: 'settings.navFinancial' },
  { id: 'exchangeRates', icon: <CurrencyExchangeIcon />, labelKey: 'currency.title' },
  { id: 'receipts', icon: <ReceiptIcon />, labelKey: 'settings.navReceipts' },
  { id: 'notifications', icon: <NotificationsIcon />, labelKey: 'settings.navNotifications' },
  { id: 'backup', icon: <StorageIcon />, labelKey: 'settings.navBackup' },
  { id: 'about', icon: <InfoOutlinedIcon />, labelKey: 'settings.navAbout' },
  { id: 'danger', icon: <WarningAmberIcon />, labelKey: 'settings.navDangerZone' }
] as const

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]['id']

interface SettingsNavProps {
  activeSection: SettingsSectionId
  onNavigate: (section: SettingsSectionId) => void
}

export default function SettingsNav({
  activeSection,
  onNavigate
}: SettingsNavProps): React.JSX.Element {
  const { t } = useTranslation()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

  const activeIndex = SETTINGS_SECTIONS.findIndex((s) => s.id === activeSection)

  if (isMobile) {
    return (
      <Box
        sx={{
          borderBottom: 1,
          borderColor: 'divider',
          mb: 3
        }}
      >
        <Tabs
          value={activeIndex}
          onChange={(_, idx) => onNavigate(SETTINGS_SECTIONS[idx].id)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          sx={{
            '& .MuiTab-root': {
              minHeight: 48,
              textTransform: 'none',
              fontWeight: 500,
              minWidth: 'auto',
              px: 2
            }
          }}
        >
          {SETTINGS_SECTIONS.map((section) => (
            <Tab
              key={section.id}
              icon={<Box sx={{ '& svg': { fontSize: 20 } }}>{section.icon}</Box>}
              label={
                <Typography variant="body2" noWrap>
                  {t(section.labelKey)}
                </Typography>
              }
              iconPosition="start"
            />
          ))}
        </Tabs>
      </Box>
    )
  }

  return (
    <Box
      sx={{
        minInlineSize: 200,
        maxInlineSize: 220,
        flexShrink: 0
      }}
    >
      <List disablePadding>
        {SETTINGS_SECTIONS.map((section) => {
          const isActive = section.id === activeSection
          const isDanger = section.id === 'danger'

          return (
            <ListItemButton
              key={section.id}
              selected={isActive}
              onClick={() => onNavigate(section.id)}
              sx={{
                borderRadius: 2,
                mb: 0.5,
                px: 1.5,
                py: 1,
                color: isDanger
                  ? isActive
                    ? 'error.main'
                    : 'text.secondary'
                  : isActive
                    ? 'primary.main'
                    : 'text.secondary',
                bgcolor: isActive
                  ? isDanger
                    ? (t) => alpha(t.palette.error.main, 0.08)
                    : (t) => alpha(t.palette.primary.main, 0.08)
                  : 'transparent',
                '&:hover': {
                  bgcolor: isDanger
                    ? (t) => alpha(t.palette.error.main, 0.04)
                    : isActive
                      ? (t) => alpha(t.palette.primary.main, 0.04)
                      : 'action.hover'
                },
                '& .MuiListItemIcon-root': {
                  color: 'inherit',
                  minWidth: 40
                },
                '& .MuiListItemText-primary': {
                  fontWeight: isActive ? 600 : 400,
                  fontSize: '0.875rem'
                }
              }}
            >
              <ListItemIcon>{section.icon}</ListItemIcon>
              <ListItemText primary={t(section.labelKey)} />
            </ListItemButton>
          )
        })}
      </List>
    </Box>
  )
}
