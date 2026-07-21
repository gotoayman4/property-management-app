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
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import NotificationsIcon from '@mui/icons-material/Notifications'
import PaletteIcon from '@mui/icons-material/Palette'
import ReceiptIcon from '@mui/icons-material/Receipt'
import SettingsIcon from '@mui/icons-material/Settings'
import StorageIcon from '@mui/icons-material/Storage'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import {
  Box,
  Button,
  Card,
  CardContent,
  Typography,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Switch,
  TextField,
  Select,
  MenuItem,
  InputLabel,
  Alert,
  IconButton,
  InputAdornment,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import CompanyInfoCard from '../../components/CompanyInfoCard'
import CountryManagerDialog from '../../components/CountryManagerDialog'
import GlobalSnackbar from '../../components/GlobalSnackbar'
import NotificationTemplateManager from '../../components/NotificationTemplateManager'
import PageHeader from '../../components/PageHeader'
import ReceiptSettingsCard from '../../components/ReceiptSettingsCard'
import ReminderSettingsCard from '../../components/ReminderSettingsCard'
import SettingsNav, { type SettingsSectionId } from '../../components/SettingsNav'
import SettingsSection from '../../components/SettingsSection'
import { useSnackbar } from '../../hooks/useSnackbar'
import { useUiPreferences } from '../../stores/uiPreferencesStore'

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
}

const CURRENCIES = ['JOD', 'TRY', 'QAR', 'USD', 'EUR', 'SAR']

const SPINNER_LESS = {
  '&::-webkit-outer-spin-button, &::-webkit-inner-spin-button': {
    WebkitAppearance: 'none',
    margin: 0
  },
  MozAppearance: 'textfield'
} as const

export default function Settings(): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const isRtl = i18n.language === 'ar'
  const { snack, showSuccess, showError, hideSnackbar } = useSnackbar()
  const [settings, setSettings] = useState<SettingsData | null>(null)
  const [activeSection, setActiveSection] = useState<SettingsSectionId>('appearance')
  const [countryDialogOpen, setCountryDialogOpen] = useState(false)
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [wipeDialogOpen, setWipeDialogOpen] = useState(false)
  const [wipeConfirmText, setWipeConfirmText] = useState('')
  const [wiping, setWiping] = useState(false)
  const [allCountries, setAllCountries] = useState<
    { code: string; name: string; is_active: number }[]
  >([])
  const refreshPrefs = useUiPreferences((s) => s.refresh)

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

  const updateField = async (field: string, value: string | number | null): Promise<void> => {
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

  const handleBrowse = async (): Promise<void> => {
    try {
      const result = await window.api.dialog.pickFolder()
      if (result.canceled || !result.filePath) return
      await updateField('backup_path', result.filePath)
    } catch {
      showError('backup.browseError')
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
        <SettingsNav activeSection={activeSection} onNavigate={setActiveSection} />
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
          <SettingsNav activeSection={activeSection} onNavigate={setActiveSection} />
        </Box>

        {/* Section content */}
        <Box sx={{ flex: 1, minWidth: 0, maxWidth: 800 }}>
          {/* ── Appearance ── */}
          {activeSection === 'appearance' && (
            <SettingsSection
              icon={<PaletteIcon />}
              title={t('settings.appearance')}
              description={t('settings.appearanceDesc')}
            >
              <FormControl component="fieldset" sx={{ mb: 3 }}>
                <FormLabel
                  component="legend"
                  sx={{ fontWeight: 600, mb: 1, color: 'text.primary' }}
                >
                  {t('settings.language')}
                </FormLabel>
                <RadioGroup
                  row
                  value={settings.app_language}
                  onChange={(e) => updateField('app_language', e.target.value)}
                >
                  <FormControlLabel value="ar" control={<Radio />} label={t('settings.langAr')} />
                  <FormControlLabel value="en" control={<Radio />} label={t('settings.langEn')} />
                </RadioGroup>
              </FormControl>

              <FormControl component="fieldset" sx={{ mb: 3 }}>
                <FormLabel
                  component="legend"
                  sx={{ fontWeight: 600, mb: 1, color: 'text.primary' }}
                >
                  {t('settings.theme')}
                </FormLabel>
                <RadioGroup
                  row
                  value={settings.theme}
                  onChange={(e) => updateField('theme', e.target.value)}
                >
                  <FormControlLabel
                    value="light"
                    control={<Radio />}
                    label={t('settings.themeLight')}
                  />
                  <FormControlLabel
                    value="dark"
                    control={<Radio />}
                    label={t('settings.themeDark')}
                  />
                </RadioGroup>
              </FormControl>

              <FormControl component="fieldset">
                <FormLabel
                  component="legend"
                  sx={{ fontWeight: 600, mb: 1, color: 'text.primary' }}
                >
                  {t('settings.fontSize')}
                </FormLabel>
                <RadioGroup
                  row
                  value={settings.font_size}
                  onChange={(e) => updateField('font_size', e.target.value)}
                >
                  <FormControlLabel
                    value="small"
                    control={<Radio />}
                    label={t('settings.fontSmall')}
                  />
                  <FormControlLabel
                    value="medium"
                    control={<Radio />}
                    label={t('settings.fontMedium')}
                  />
                  <FormControlLabel
                    value="large"
                    control={<Radio />}
                    label={t('settings.fontLarge')}
                  />
                </RadioGroup>
              </FormControl>

              {/* Security — grouped under Appearance for proximity */}
              <Box sx={{ mt: 4, pt: 3, borderTop: 1, borderColor: 'divider' }}>
                <Typography variant="h6" sx={{ mb: 1.5 }}>
                  {t('settings.security')}
                </Typography>
                <Alert severity="info" sx={{ mb: 2 }}>
                  {t('settings.requireAuthHelp')}
                </Alert>
                <FormControlLabel
                  control={
                    <Switch
                      checked={!!settings.require_auth}
                      onChange={(e) => updateField('require_auth', e.target.checked ? 1 : 0)}
                      color="primary"
                    />
                  }
                  label={t('settings.requireAuth')}
                />
              </Box>
            </SettingsSection>
          )}

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

          {/* ── Backup & Data ── */}
          {activeSection === 'backup' && (
            <SettingsSection
              icon={<StorageIcon />}
              title={t('settings.backupAndData')}
              description={t('settings.backupAndDataDesc')}
            >
              <TextField
                fullWidth
                label={t('settings.backupPath')}
                value={settings.backup_path ?? ''}
                onChange={(e) => updateField('backup_path', e.target.value)}
                placeholder={t('settings.backupPathPlaceholder')}
                helperText={t('settings.backupPathHelp')}
                slotProps={{
                  htmlInput: { dir: 'ltr' },
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={handleBrowse}
                          edge="end"
                          aria-label={t('backup.browse')}
                        >
                          <FolderOpenIcon />
                        </IconButton>
                      </InputAdornment>
                    )
                  }
                }}
                sx={{ mb: 3 }}
              />

              <TextField
                fullWidth
                type="text"
                inputMode="decimal"
                label={t('settings.maxBackupCount')}
                value={settings.max_backup_count ?? 10}
                onChange={(e) => updateField('max_backup_count', Number(e.target.value))}
                helperText={t('settings.maxBackupCountHelp')}
                slotProps={{
                  htmlInput: {
                    dir: 'ltr',
                    min: 1,
                    max: 100,
                    sx: SPINNER_LESS
                  }
                }}
              />
            </SettingsSection>
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
