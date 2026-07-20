/**
 * INTENT: Full settings page — language, theme, font size, reporting currency,
 *         default payment method, reminder days, backup path. All fields map to
 *         the settings singleton table (001_initial_schema.sql §settings).
 * CONSTRAINT (AGENTS.md): i18n keys only, logical CSS, theme.palette tokens.
 */
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import SettingsIcon from '@mui/icons-material/Settings'
import {
  Box,
  Button,
  Card,
  CardContent,
  Typography,
  Grid,
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
  InputAdornment
} from '@mui/material'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import CountryManagerDialog from '../../components/CountryManagerDialog'
import GlobalSnackbar from '../../components/GlobalSnackbar'
import NotificationTemplateManager from '../../components/NotificationTemplateManager'
import PageHeader from '../../components/PageHeader'
import ReceiptSettingsCard from '../../components/ReceiptSettingsCard'
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
}

const CURRENCIES = ['JOD', 'TRY', 'QAR', 'USD', 'EUR', 'SAR']

// Spinner-less numeric input styling (AGENTS bans <TextField type="number"> native spinners).
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
  const [countryDialogOpen, setCountryDialogOpen] = useState(false)
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
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

  const updateField = async (field: string, value: string | number): Promise<void> => {
    try {
      await window.api.settings.update({ [field]: value })
      setSettings((prev) => (prev ? { ...prev, [field]: value } : prev))

      if (field === 'app_language') {
        await i18n.changeLanguage(value as string)
      }

      // FR-SET-04/05: notify the Zustand store so App.tsx re-renders with the new
      // theme / font_size immediately (no restart needed).
      if (field === 'theme' || field === 'font_size' || field === 'app_language') {
        refreshPrefs()
      }

      showSuccess('common.saveSuccess')
    } catch {
      showError('common.saveError')
    }
  }

  /**
   * INTENT: Open the native OS folder picker and persist the chosen directory as backup_path.
   * DECISION: Mirrors the Browse button on BackupPage.tsx so both entry points stay consistent.
   * CAVEAT: On cancel or error this is a silent no-op — dismissal is not an error condition.
   */
  const handleBrowse = async (): Promise<void> => {
    try {
      const result = await window.api.dialog.pickFolder()
      if (result.canceled || !result.filePath) return
      await updateField('backup_path', result.filePath)
    } catch {
      showError('backup.browseError')
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

      <Grid container spacing={3}>
        {/* Language & Appearance */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h5" sx={{ mb: 2.5 }}>
                {t('settings.appearance')}
              </Typography>

              <FormControl component="fieldset" sx={{ mb: 2.5 }}>
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

              <FormControl component="fieldset" sx={{ mb: 2.5 }}>
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
            </CardContent>
          </Card>
        </Grid>

        {/* Security */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h5" sx={{ mb: 2.5 }}>
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
            </CardContent>
          </Card>
        </Grid>

        {/* Financial Defaults */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h5" sx={{ mb: 2.5 }}>
                {t('settings.financialDefaults')}
              </Typography>

              <FormControl fullWidth sx={{ mb: 2.5 }}>
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
            </CardContent>
          </Card>
        </Grid>

        {/* Receipt Numbering (FR-SET-10) */}
        <Grid size={{ xs: 12, md: 6 }}>
          <ReceiptSettingsCard />
        </Grid>

        {/* Reminder Days */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h5" sx={{ mb: 2.5 }}>
                {t('settings.reminders')}
              </Typography>

              <Alert severity="info" sx={{ mb: 2 }}>
                {t('settings.reminderHelp')}
              </Alert>

              <TextField
                fullWidth
                type="text"
                inputMode="decimal"
                label={t('settings.reminderDaysBeforeDue')}
                value={settings.reminder_days_before_due}
                onChange={(e) => updateField('reminder_days_before_due', Number(e.target.value))}
                slotProps={{
                  htmlInput: {
                    dir: 'ltr',
                    min: 0,
                    max: 90,
                    sx: SPINNER_LESS
                  }
                }}
                sx={{ mb: 2 }}
              />
              <TextField
                fullWidth
                type="text"
                inputMode="decimal"
                label={t('settings.reminderDaysBeforeContractEnd')}
                value={settings.reminder_days_before_contract_end}
                onChange={(e) =>
                  updateField('reminder_days_before_contract_end', Number(e.target.value))
                }
                slotProps={{
                  htmlInput: {
                    dir: 'ltr',
                    min: 0,
                    max: 365,
                    sx: SPINNER_LESS
                  }
                }}
                sx={{ mb: 2 }}
              />
              <TextField
                fullWidth
                type="text"
                inputMode="decimal"
                label={t('settings.reminderDaysBeforeDocumentExpiry')}
                value={settings.reminder_days_before_document_expiry}
                onChange={(e) =>
                  updateField('reminder_days_before_document_expiry', Number(e.target.value))
                }
                slotProps={{
                  htmlInput: {
                    dir: 'ltr',
                    min: 0,
                    max: 365,
                    sx: SPINNER_LESS
                  }
                }}
                sx={{ mb: 2 }}
              />
              <TextField
                fullWidth
                type="text"
                inputMode="decimal"
                label={t('settings.reminderDaysBeforeRecurringExpense')}
                value={settings.reminder_days_before_recurring_expense}
                onChange={(e) =>
                  updateField('reminder_days_before_recurring_expense', Number(e.target.value))
                }
                slotProps={{
                  htmlInput: {
                    dir: 'ltr',
                    min: 0,
                    max: 30,
                    sx: SPINNER_LESS
                  }
                }}
              />
            </CardContent>
          </Card>
        </Grid>

        {/* Country Management */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h5" sx={{ mb: 2.5 }}>
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
            </CardContent>
          </Card>
        </Grid>

        {/* Notification Templates (FR-SET-08) */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h5" sx={{ mb: 2.5 }}>
                {t('settings.notificationTemplates')}
              </Typography>

              <Alert severity="info" sx={{ mb: 2 }}>
                {t('settings.templateHelp')}
              </Alert>

              <Button variant="outlined" onClick={() => setTemplateDialogOpen(true)}>
                {t('settings.manageTemplates')}
              </Button>
            </CardContent>
          </Card>
        </Grid>

        {/* Backup & Data */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h5" sx={{ mb: 2.5 }}>
                {t('settings.backupAndData')}
              </Typography>

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
                sx={{ mb: 2.5 }}
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
                    sx: {
                      '&::-webkit-outer-spin-button, &::-webkit-inner-spin-button': {
                        WebkitAppearance: 'none',
                        margin: 0
                      },
                      MozAppearance: 'textfield'
                    }
                  }
                }}
              />
            </CardContent>
          </Card>
        </Grid>
      </Grid>

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

      <GlobalSnackbar state={snack} onClose={hideSnackbar} />
    </Box>
  )
}
