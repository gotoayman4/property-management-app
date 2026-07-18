/**
 * INTENT: Full settings page — language, theme, font size, reporting currency,
 *         default payment method, reminder days, backup path. All fields map to
 *         the settings singleton table (001_initial_schema.sql §settings).
 * CONSTRAINT (AGENTS.md): i18n keys only, logical CSS, theme.palette tokens.
 */
import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Box,
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
  Alert
} from '@mui/material'
import SettingsIcon from '@mui/icons-material/Settings'
import PageHeader from '../../components/PageHeader'
import GlobalSnackbar from '../../components/GlobalSnackbar'
import { useSnackbar } from '../../hooks/useSnackbar'

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

  useEffect(() => {
    async function loadSettings(): Promise<void> {
      try {
        const data = (await window.api.settings.get()) as SettingsData
        setSettings(data)
      } catch {
        showError('common.error')
      }
    }
    loadSettings()
  }, [t, showError])

  const updateField = async (field: string, value: string | number): Promise<void> => {
    try {
      await window.api.settings.update({ [field]: value })
      setSettings((prev) => (prev ? { ...prev, [field]: value } : prev))

      if (field === 'app_language') {
        await i18n.changeLanguage(value as string)
      }

      showSuccess('common.saveSuccess')
    } catch {
      showError('common.saveError')
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
                    min: 0,
                    max: 30,
                    sx: SPINNER_LESS
                  }
                }}
              />
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
              />
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <GlobalSnackbar state={snack} onClose={hideSnackbar} />
    </Box>
  )
}
