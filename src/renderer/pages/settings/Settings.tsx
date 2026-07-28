/**
 * INTENT: Full settings page — sidebar navigation + section content layout following
 *         best practices from Windows Settings, VS Code, and macOS System Preferences.
 *         Sections: Appearance, Company, Financial, Receipts, Notifications, Backup, Danger Zone.
 * CONSTRAINT (AGENTS.md): i18n keys only, logical CSS, theme.palette tokens.
 * DECISION: Sidebar nav (desktop) / scrollable tabs (mobile) on the left, section content
 *           on the right with max-width for readability. Extracted card components use
 *           compact mode (no Card wrapper) since SettingsSection provides structure.
 */
import AttachMoneyIcon from '@mui/icons-material/AttachMoney'
import BusinessIcon from '@mui/icons-material/Business'
import NotificationsIcon from '@mui/icons-material/Notifications'
import ReceiptIcon from '@mui/icons-material/Receipt'
import SettingsIcon from '@mui/icons-material/Settings'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import {
  Box,
  Button,
  Card,
  CardContent,
  Typography,
  FormControl,
  TextField,
  Select,
  MenuItem,
  InputLabel,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import AboutUpdatesCard from '../../components/AboutUpdatesCard'
import AppearanceSettingsCard from '../../components/AppearanceSettingsCard'
import CompanyInfoCard from '../../components/CompanyInfoCard'
import CountryManagerDialog from '../../components/CountryManagerDialog'
import DashboardSettingsCard from '../../components/DashboardSettingsCard'
import GlobalSnackbar from '../../components/GlobalSnackbar'
import NotificationTemplateManager from '../../components/NotificationTemplateManager'
import PageHeader from '../../components/PageHeader'
import ReceiptSettingsCard from '../../components/ReceiptSettingsCard'
import ReminderSettingsCard from '../../components/ReminderSettingsCard'
import SettingsNav, {
  SETTINGS_SECTIONS,
  type SettingsSectionId
} from '../../components/SettingsNav'
import SettingsSection from '../../components/SettingsSection'
import { useSnackbar } from '../../hooks/useSnackbar'
import { useUiPreferences } from '../../stores/uiPreferencesStore'
import BackupPage from '../backup/BackupPage'
import ExchangeRateManager from '../currency/ExchangeRateManager'

interface SettingsData {
  app_language: string
  theme: string
  font_size: string
  reporting_currency: string
  default_payment_method: string
  backup_path: string | null
  date_format: string
  reminder_days_before_due: number
  reminder_days_before_contract_end: number
  reminder_days_before_document_expiry: number
  reminder_days_before_recurring_expense: number
  require_auth: number
  default_country: string | null
  max_backup_count: number
  receipt_prefix: string
  receipt_starting_sequence: number
  company_name?: string | null
  company_logo?: string | null
  auto_update_check?: number
  auto_update_download?: number
}

const CURRENCIES = ['JOD', 'TRY', 'QAR', 'USD', 'EUR', 'SAR']

export default function Settings(): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const isRtl = i18n.language === 'ar'
  const { snack, showSuccess, showError, hideSnackbar } = useSnackbar()
  const [searchParams, setSearchParams] = useSearchParams()
  const sectionParam = searchParams.get('section') as SettingsSectionId | null
  const [activeSection, setActiveSection] = useState<SettingsSectionId>(
    sectionParam && SETTINGS_SECTIONS.some((s) => s.id === sectionParam)
      ? sectionParam
      : 'appearance'
  )
  const [settings, setSettings] = useState<SettingsData | null>(null)
  const [countryDialogOpen, setCountryDialogOpen] = useState(false)
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [wipeDialogOpen, setWipeDialogOpen] = useState(false)
  const [wipeConfirmText, setWipeConfirmText] = useState('')
  const [wiping, setWiping] = useState(false)
  const [allCountries, setAllCountries] = useState<
    { code: string; name: string; is_active: number }[]
  >([])
  const refreshPrefs = useUiPreferences((s) => s.refresh)

  const handleNavigate = useCallback(
    (section: SettingsSectionId): void => {
      setActiveSection(section)
      setSearchParams({ section }, { replace: true })
    },
    [setSearchParams]
  )

  const fetchAllCountries = useCallback(async (): Promise<void> => {
    try {
      const data = await window.api.countries.listAll()
      setAllCountries(data)
    } catch {
      // Silent
    }
  }, [])

  useEffect(() => {
    async function loadSettings(): Promise<void> {
      try {
        const data = (await window.api.settings.get()) as SettingsData
        setSettings(data)
        fetchAllCountries()
      } catch {
        showError('common.error')
      }
    }
    loadSettings()
  }, [t, showError, fetchAllCountries])

  const updateField = async (field: string, value: unknown): Promise<void> => {
    try {
      await window.api.settings.update({ [field]: value })
      setSettings((prev) => (prev ? { ...prev, [field]: value } : prev))

      if (field === 'app_language') {
        await i18n.changeLanguage(value as string)
      }

      if (field === 'theme' || field === 'font_size' || field === 'app_language') {
        refreshPrefs()
      }

      showSuccess('common.saveSuccess')
    } catch {
      showError('common.saveError')
    }
  }

  const handleWipeConfirm = async (): Promise<void> => {
    if (wipeConfirmText !== 'DELETE') return
    setWiping(true)
    try {
      await window.api.data.wipeAll('DELETE')
      showSuccess('settings.wipeAllDataSuccess')
      setWipeDialogOpen(false)
      setWipeConfirmText('')
    } catch {
      showError('common.error')
    } finally {
      setWiping(false)
    }
  }

  if (!settings) return <></>

  return (
    <Box>
      <PageHeader
        icon={<SettingsIcon />}
        title={t('settings.title')}
        subtitle={t('settings.subtitle')}
      />

      {/* Tabs for mobile (renders above flex container) */}
      <Box sx={{ display: { sm: 'none' } }}>
        <SettingsNav activeSection={activeSection} onNavigate={handleNavigate} />
      </Box>

      <Box
        sx={{
          display: 'flex',
          gap: 4,
          alignItems: 'flex-start'
        }}
      >
        {/* Sidebar nav for desktop */}
        <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
          <SettingsNav activeSection={activeSection} onNavigate={handleNavigate} />
        </Box>

        {/* Section content */}
        <Box sx={{ flex: 1, minWidth: 0, maxWidth: 800 }}>
          {/* ── Appearance ── */}
          {activeSection === 'appearance' && (
            <AppearanceSettingsCard settings={settings} onUpdateField={updateField} />
          )}

          {/* ── Dashboard ── */}
          {activeSection === 'dashboard' && <DashboardSettingsCard />}

          {/* ── Company ── */}
          {activeSection === 'company' && (
            <SettingsSection
              icon={<BusinessIcon />}
              title={t('settings.companyInfo')}
              description={t('settings.companyInfoDesc')}
            >
              <CompanyInfoCard compact />

              <Box sx={{ mt: 3, pt: 3, borderTop: 1, borderColor: 'divider' }}>
                <Typography variant="h6" sx={{ mb: 1 }}>
                  {t('settings.countryManagement')}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  {t('settings.defaultCountry')}
                </Typography>
                <Typography variant="body1" sx={{ mb: 2, fontWeight: 600 }}>
                  {settings.default_country
                    ? (allCountries.find((c) => c.code === settings.default_country)?.name ??
                      settings.default_country)
                    : t('common.none')}
                </Typography>
                <Button variant="outlined" onClick={() => setCountryDialogOpen(true)}>
                  {t('settings.manageCountries')}
                </Button>
              </Box>
            </SettingsSection>
          )}

          {/* ── Financial ── */}
          {activeSection === 'financial' && (
            <SettingsSection
              icon={<AttachMoneyIcon />}
              title={t('settings.financialDefaults')}
              description={t('settings.financialDefaultsDesc')}
            >
              <FormControl fullWidth sx={{ mb: 3 }}>
                <InputLabel>{t('settings.reportingCurrency')}</InputLabel>
                <Select
                  value={settings.reporting_currency}
                  label={t('settings.reportingCurrency')}
                  onChange={(e) => updateField('reporting_currency', e.target.value)}
                  dir={isRtl ? 'rtl' : 'ltr'}
                >
                  {CURRENCIES.map((c) => (
                    <MenuItem key={c} value={c}>
                      {t(`currency.name.${c}`)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl fullWidth>
                <InputLabel>{t('settings.defaultPaymentMethod')}</InputLabel>
                <Select
                  value={settings.default_payment_method}
                  label={t('settings.defaultPaymentMethod')}
                  onChange={(e) => updateField('default_payment_method', e.target.value)}
                  dir={isRtl ? 'rtl' : 'ltr'}
                >
                  <MenuItem value="cash">{t('payment.methodCash')}</MenuItem>
                  <MenuItem value="bank_transfer">{t('payment.methodBank')}</MenuItem>
                  <MenuItem value="cheque">{t('payment.methodCheque')}</MenuItem>
                  <MenuItem value="other">{t('payment.methodOther')}</MenuItem>
                </Select>
              </FormControl>
            </SettingsSection>
          )}

          {/* ── Receipts ── */}
          {activeSection === 'receipts' && (
            <SettingsSection
              icon={<ReceiptIcon />}
              title={t('settings.receiptNumbering')}
              description={t('settings.receiptNumberingHelp')}
            >
              <ReceiptSettingsCard compact />
            </SettingsSection>
          )}

          {/* ── Notifications ── */}
          {activeSection === 'notifications' && (
            <SettingsSection
              icon={<NotificationsIcon />}
              title={t('settings.notificationTemplates')}
              description={t('settings.templateHelp')}
            >
              <ReminderSettingsCard compact />

              <Box sx={{ mt: 3, pt: 3, borderTop: 1, borderColor: 'divider' }}>
                <Button variant="outlined" onClick={() => setTemplateDialogOpen(true)}>
                  {t('settings.manageTemplates')}
                </Button>
              </Box>
            </SettingsSection>
          )}

          {/* ── Exchange Rates History & Offline Log ── */}
          {activeSection === 'exchangeRates' && (
            <Box>
              <ExchangeRateManager />
            </Box>
          )}

          {/* ── Backup & Data ── */}
          {activeSection === 'backup' && <BackupPage />}

          {/* ── About & Updates ── */}
          {activeSection === 'about' && (
            <AboutUpdatesCard
              autoUpdateCheck={settings.auto_update_check ?? 1}
              autoUpdateDownload={settings.auto_update_download ?? 1}
              onUpdateField={updateField}
            />
          )}

          {/* ── Danger Zone ── */}
          {activeSection === 'danger' && (
            <SettingsSection
              icon={<WarningAmberIcon />}
              title={t('settings.dangerZone')}
              description={t('settings.wipeAllDataDescription')}
            >
              <Card sx={{ border: 1, borderColor: 'error.main' }}>
                <CardContent sx={{ p: 3 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {t('settings.wipeAllDataWarning')}
                  </Typography>
                  <Button
                    variant="outlined"
                    color="error"
                    onClick={() => {
                      setWipeConfirmText('')
                      setWipeDialogOpen(true)
                    }}
                  >
                    {t('settings.wipeAllData')}
                  </Button>
                </CardContent>
              </Card>
            </SettingsSection>
          )}
        </Box>
      </Box>

      <CountryManagerDialog
        open={countryDialogOpen}
        onClose={() => setCountryDialogOpen(false)}
        onChange={() => {
          fetchAllCountries()
          window.api.settings.get().then((data) => setSettings(data as SettingsData))
        }}
      />

      <NotificationTemplateManager
        open={templateDialogOpen}
        onClose={() => setTemplateDialogOpen(false)}
      />

      <Dialog
        open={wipeDialogOpen}
        onClose={() => !wiping && setWipeDialogOpen(false)}
        dir={isRtl ? 'rtl' : 'ltr'}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ color: 'error.main' }}>{t('settings.wipeAllData')}</DialogTitle>
        <DialogContent>
          <Alert severity="error" sx={{ mb: 2 }}>
            {t('settings.wipeAllDataWarning')}
          </Alert>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t('settings.wipeAllDataDescription')}
          </Typography>
          <TextField
            autoFocus
            fullWidth
            label={t('settings.wipeAllDataTypeConfirm')}
            value={wipeConfirmText}
            onChange={(e) => setWipeConfirmText(e.target.value)}
            slotProps={{ htmlInput: { dir: 'ltr' } }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button variant="outlined" onClick={() => setWipeDialogOpen(false)} disabled={wiping}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleWipeConfirm}
            disabled={wipeConfirmText !== 'DELETE' || wiping}
          >
            {t('settings.wipeAllData')}
          </Button>
        </DialogActions>
      </Dialog>

      <GlobalSnackbar state={snack} onClose={hideSnackbar} />
    </Box>
  )
}
