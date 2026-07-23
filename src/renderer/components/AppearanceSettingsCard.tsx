import PaletteIcon from '@mui/icons-material/Palette'
import {
  Box,
  Typography,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Switch,
  Alert
} from '@mui/material'
import React from 'react'
import { useTranslation } from 'react-i18next'
import SettingsSection from './SettingsSection'

export interface SettingsDataFields {
  app_language: string
  theme: string
  font_size: string
  require_auth: number
}

interface AppearanceSettingsCardProps {
  settings: SettingsDataFields
  onUpdateField: (key: string, value: unknown) => void
}

export default function AppearanceSettingsCard({
  settings,
  onUpdateField
}: AppearanceSettingsCardProps): React.JSX.Element {
  const { t } = useTranslation()

  return (
    <SettingsSection
      icon={<PaletteIcon />}
      title={t('settings.appearance')}
      description={t('settings.appearanceDesc')}
    >
      <FormControl component="fieldset" sx={{ mb: 3 }}>
        <FormLabel component="legend" sx={{ fontWeight: 600, mb: 1, color: 'text.primary' }}>
          {t('settings.language')}
        </FormLabel>
        <RadioGroup
          row
          value={settings.app_language}
          onChange={(e) => onUpdateField('app_language', e.target.value)}
        >
          <FormControlLabel value="ar" control={<Radio />} label={t('settings.langAr')} />
          <FormControlLabel value="en" control={<Radio />} label={t('settings.langEn')} />
        </RadioGroup>
      </FormControl>

      <FormControl component="fieldset" sx={{ mb: 3 }}>
        <FormLabel component="legend" sx={{ fontWeight: 600, mb: 1, color: 'text.primary' }}>
          {t('settings.theme')}
        </FormLabel>
        <RadioGroup
          row
          value={settings.theme}
          onChange={(e) => onUpdateField('theme', e.target.value)}
        >
          <FormControlLabel value="light" control={<Radio />} label={t('settings.themeLight')} />
          <FormControlLabel value="dark" control={<Radio />} label={t('settings.themeDark')} />
        </RadioGroup>
      </FormControl>

      <FormControl component="fieldset">
        <FormLabel component="legend" sx={{ fontWeight: 600, mb: 1, color: 'text.primary' }}>
          {t('settings.fontSize')}
        </FormLabel>
        <RadioGroup
          row
          value={settings.font_size}
          onChange={(e) => onUpdateField('font_size', e.target.value)}
        >
          <FormControlLabel value="small" control={<Radio />} label={t('settings.fontSmall')} />
          <FormControlLabel value="medium" control={<Radio />} label={t('settings.fontMedium')} />
          <FormControlLabel value="large" control={<Radio />} label={t('settings.fontLarge')} />
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
              onChange={(e) => onUpdateField('require_auth', e.target.checked ? 1 : 0)}
              color="primary"
            />
          }
          label={t('settings.requireAuth')}
        />
      </Box>
    </SettingsSection>
  )
}
