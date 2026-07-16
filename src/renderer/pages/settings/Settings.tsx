import React from 'react'
import { useTranslation } from 'react-i18next'
import {
  Box,
  Typography,
  Card,
  CardContent,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Grid
} from '@mui/material'

export default function Settings(): React.JSX.Element {
  const { t, i18n } = useTranslation()

  const handleLanguageChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ): Promise<void> => {
    const nextLang = event.target.value
    await i18n.changeLanguage(nextLang)

    try {
      await window.api.settings.update({ app_language: nextLang })
    } catch (err) {
      console.error('Failed to update app language in settings:', err)
    }
  }

  return (
    <Box>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 3 }}>
        {t('settings.title')}
      </Typography>

      <Card>
        <CardContent sx={{ p: 3 }}>
          <Grid container spacing={4}>
            <Grid size={{ xs: 12 }}>
              <FormControl component="fieldset">
                <FormLabel
                  component="legend"
                  sx={{ fontWeight: 600, mb: 1, color: 'text.primary' }}
                >
                  {t('settings.language')}
                </FormLabel>
                <RadioGroup row value={i18n.language} onChange={handleLanguageChange}>
                  <FormControlLabel value="ar" control={<Radio />} label="العربية (Arabic)" />
                  <FormControlLabel value="en" control={<Radio />} label="English" />
                </RadioGroup>
              </FormControl>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
    </Box>
  )
}
