/**
 * @file DashboardSettingsCard — Dashboard widget visibility toggles for the Settings page.
 *
 * INTENT: Keep Settings.tsx under the 500-line limit by extracting the dashboard section.
 *         Lists all 13 dashboard widgets with Switch toggles to show/hide them.
 *
 * CONSTRAINT (AGENTS.md): i18n keys only, theme.palette tokens, logical CSS.
 * DECISION: Reads hiddenWidgets/showWidget/hideWidget from the Zustand store directly.
 */
import DashboardIcon from '@mui/icons-material/Dashboard'
import { FormControlLabel, Switch } from '@mui/material'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { useUiPreferences } from '../stores/uiPreferencesStore'
import SettingsSection from './SettingsSection'

const DASHBOARD_WIDGETS = [
  { id: 'stat-properties', labelKey: 'dashboard.widgetStatProperties' },
  { id: 'stat-tenants', labelKey: 'dashboard.widgetStatTenants' },
  { id: 'stat-contracts', labelKey: 'dashboard.widgetStatContracts' },
  { id: 'financial-summary', labelKey: 'dashboard.widgetFinancialSummary' },
  { id: 'occupied-donut', labelKey: 'dashboard.widgetOccupiedDonut' },
  { id: 'upcoming-due', labelKey: 'dashboard.widgetUpcomingDue' },
  { id: 'overdue-payments', labelKey: 'dashboard.widgetOverduePayments' },
  { id: 'upcoming-recurring', labelKey: 'dashboard.widgetUpcomingRecurring' },
  { id: 'expiring-documents', labelKey: 'dashboard.widgetExpiringDocuments' },
  { id: 'income-expense-trend', labelKey: 'dashboard.widgetIncomeExpenseTrend' },
  { id: 'recent-payments', labelKey: 'dashboard.widgetRecentPayments' },
  { id: 'recent-expenses', labelKey: 'dashboard.widgetRecentExpenses' },
  { id: 'recent-activities', labelKey: 'dashboard.widgetRecentActivities' }
] as const

export default function DashboardSettingsCard(): React.JSX.Element {
  const { t } = useTranslation()
  const hiddenWidgets = useUiPreferences((s) => s.hiddenWidgets)
  const showWidget = useUiPreferences((s) => s.showWidget)
  const hideWidget = useUiPreferences((s) => s.hideWidget)

  return (
    <SettingsSection
      icon={<DashboardIcon />}
      title={t('settings.dashboardWidgets')}
      description={t('settings.dashboardWidgetsHelp')}
    >
      {DASHBOARD_WIDGETS.map((w) => (
        <FormControlLabel
          key={w.id}
          control={
            <Switch
              checked={!hiddenWidgets.includes(w.id)}
              onChange={(e) => (e.target.checked ? showWidget(w.id) : hideWidget(w.id))}
              color="primary"
            />
          }
          label={t(w.labelKey)}
          sx={{ display: 'block', mb: 1 }}
        />
      ))}
    </SettingsSection>
  )
}
