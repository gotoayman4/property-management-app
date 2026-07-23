/**
 * @file CountryFormCard — Add country sub-form card for CountryManagerDialog.
 * INTENT: Isolates autocomplete country selector and default currency inputs.
 */
import {
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  TextField,
  Typography
} from '@mui/material'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { type WorldCountry } from '../data/worldCountries'

interface CountryFormCardProps {
  showAddForm: boolean
  setShowAddForm: (show: boolean) => void
  availableWorldCountries: WorldCountry[]
  selectedWorldCountry: WorldCountry | null
  setSelectedWorldCountry: (c: WorldCountry | null) => void
  localizedName: (c: WorldCountry) => string
  handleAddSubmit: () => Promise<void>
  addError?: string
}

export function CountryFormCard({
  showAddForm,
  setShowAddForm,
  availableWorldCountries,
  selectedWorldCountry,
  setSelectedWorldCountry,
  localizedName,
  handleAddSubmit,
  addError
}: CountryFormCardProps): React.JSX.Element | null {
  const { t } = useTranslation()

  if (!showAddForm) {
    return (
      <Button onClick={() => setShowAddForm(true)} sx={{ mt: 2 }}>
        {t('countries.addTitle')}
      </Button>
    )
  }

  return (
    <Card variant="outlined" sx={{ mt: 2 }}>
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
          {t('countries.addTitle')}
        </Typography>

        <Autocomplete
          fullWidth
          size="small"
          options={availableWorldCountries}
          getOptionLabel={(option) => `${localizedName(option)} (${option.code})`}
          value={selectedWorldCountry}
          onChange={(_, value) => setSelectedWorldCountry(value)}
          filterOptions={(options, { inputValue }) =>
            options.filter(
              (o) =>
                localizedName(o).toLowerCase().includes(inputValue.toLowerCase()) ||
                o.code.toLowerCase().includes(inputValue.toLowerCase())
            )
          }
          noOptionsText={t('countries.noMatch')}
          renderOption={(props, option) => (
            <Box
              component="li"
              {...props}
              sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}
            >
              <span>{localizedName(option)}</span>
              <Chip
                label={`${option.code} · ${option.default_currency}`}
                size="small"
                variant="outlined"
                sx={{ flexShrink: 0 }}
              />
            </Box>
          )}
          renderInput={(params) => (
            <TextField
              {...params}
              label={t('countries.searchCountry')}
              placeholder={t('countries.searchCountryPlaceholder')}
            />
          )}
        />

        {selectedWorldCountry && (
          <Box
            sx={{
              mt: 1.5,
              p: 1.5,
              bgcolor: 'action.selected',
              borderRadius: 1,
              display: 'flex',
              gap: 2,
              flexWrap: 'wrap'
            }}
          >
            <Typography variant="body2">
              <strong>{t('countries.code')}:</strong> {selectedWorldCountry.code}
            </Typography>
            <Typography variant="body2">
              <strong>{t('countries.name')}:</strong> {localizedName(selectedWorldCountry)}
            </Typography>
            <Typography variant="body2">
              <strong>{t('countries.defaultCurrency')}:</strong>{' '}
              {selectedWorldCountry.default_currency}
            </Typography>
          </Box>
        )}
        {addError && (
          <Typography color="error" variant="body2" sx={{ mt: 1 }}>
            {addError}
          </Typography>
        )}

        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 2 }}>
          <Button size="small" onClick={() => setShowAddForm(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            size="small"
            variant="contained"
            disabled={!selectedWorldCountry}
            onClick={handleAddSubmit}
          >
            {t('common.add')}
          </Button>
        </Box>
      </CardContent>
    </Card>
  )
}
