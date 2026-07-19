import { zodResolver } from '@hookform/resolvers/zod'
import {
  Box,
  Grid,
  TextField,
  MenuItem,
  Button,
  FormControl,
  InputLabel,
  Select,
  FormHelperText,
  Tabs,
  Tab
} from '@mui/material'
import React, { useEffect, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { AmountField } from '../../components/AmountField'
import CountryManagerDialog from '../../components/CountryManagerDialog'
import EntityDocumentsTab from '../../components/EntityDocumentsTab'
import { FormField } from '../../components/FormField'
import GlobalSnackbar from '../../components/GlobalSnackbar'
import StandardDialog from '../../components/StandardDialog'
import { useSnackbar } from '../../hooks/useSnackbar'
import { getLocalizedCountryName } from '../../utils/countryUtils'

interface Property {
  id: number
  code: string
  name: string
  type: 'apartment' | 'shop'
  country: string
  currency: string
  address?: string | null
  area_sqm?: number | null
  status: 'vacant' | 'rented' | 'maintenance'
  monthly_rent_default: number
  notes?: string | null
}

interface Country {
  id: number
  code: string
  name: string
  default_currency: string
  is_active: number
}

const propertySchema = z.object({
  code: z
    .string()
    .min(2, 'codeRequired')
    .regex(/^[a-zA-Z0-9-]+$/, 'codeInvalid'),
  name: z.string().min(3, 'nameRequired'),
  type: z.enum(['apartment', 'shop'], { message: 'typeRequired' }),
  country: z.string().min(2, 'countryRequired'),
  currency: z.string().min(3, 'currencyRequired'),
  address: z.string().optional().nullable(),
  area_sqm: z.number().positive().optional().nullable(),
  status: z.enum(['vacant', 'rented', 'maintenance']),
  monthly_rent_default: z.number().nonnegative('rentRequired'),
  notes: z.string().optional().nullable()
})

type PropertyFormData = z.infer<typeof propertySchema>

interface PropertyFormProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  property?: Property | null
  countries: Country[]
  onCountriesUpdated?: () => void
}

export default function PropertyForm({
  open,
  onClose,
  onSuccess,
  property = null,
  countries,
  onCountriesUpdated
}: PropertyFormProps): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const { snack, showError, showSuccess, hideSnackbar } = useSnackbar()
  const isEdit = !!property
  const [createdEntity, setCreatedEntity] = useState<Property | null>(null)
  const effectiveIsEdit = isEdit || !!createdEntity
  const currentEntity = property || createdEntity
  const [activeTab, setActiveTab] = useState(0)
  const [countryDialogOpen, setCountryDialogOpen] = useState(false)

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    setError,
    formState: { errors, isDirty, isSubmitting }
  } = useForm<PropertyFormData>({
    resolver: zodResolver(propertySchema),
    defaultValues: {
      code: property?.code || '',
      name: property?.name || '',
      type: property?.type || 'apartment',
      country: property?.country || '',
      currency: property?.currency || '',
      address: property?.address || '',
      area_sqm: property?.area_sqm || undefined,
      status: property?.status || 'vacant',
      monthly_rent_default: property?.monthly_rent_default || 0,
      notes: property?.notes || ''
    }
  })

  // Watch country changes to auto-fill default currency
  const selectedCountry = watch('country')
  const selectedType = watch('type')

  // Auto-select default country from settings when adding a new property
  useEffect(() => {
    if (!isEdit && !selectedCountry) {
      window.api.settings.get().then((data) => {
        const defaultCountry = (data as { default_country: string | null }).default_country
        if (defaultCountry) {
          setValue('country', defaultCountry)
        }
      })
    }
  }, [isEdit, selectedCountry, setValue])

  useEffect(() => {
    if (selectedCountry && !isEdit) {
      const match = countries.find((c) => c.code === selectedCountry)
      if (match) {
        setValue('currency', match.default_currency)
      }
    }
  }, [selectedCountry, countries, setValue, isEdit])

  // Auto-generate property code when country + type are selected (create only)
  useEffect(() => {
    if (!isEdit && selectedCountry && selectedType) {
      window.api.properties
        .generateCode({ country: selectedCountry, type: selectedType })
        .then((code) => {
          setValue('code', code)
        })
        .catch(() => {
          // Silent — code field stays empty; form validation prevents submission
        })
    }
  }, [selectedCountry, selectedType, setValue, isEdit])

  const onSubmit = async (data: PropertyFormData): Promise<void> => {
    try {
      if (isEdit) {
        await window.api.properties.update({ id: property.id, ...data })
        showSuccess('common.saveSuccess')
        onSuccess()
      } else {
        const result = (await window.api.properties.create(data)) as Property
        setCreatedEntity(result)
        showSuccess('common.saveSuccess')
      }
    } catch (err: unknown) {
      console.error(err)
      const errorMessage = err instanceof Error ? err.message : ''
      if (errorMessage === 'PROPERTY_CODE_DUPLICATE') {
        setError('code', { type: 'manual', message: t('property.codeUnique') })
      } else {
        showError('common.saveError')
      }
    }
  }

  const actions = createdEntity ? (
    <>
      <Button onClick={onClose} disabled={isSubmitting}>
        {t('common.cancel')}
      </Button>
      <Button variant="contained" color="primary" onClick={onSuccess} disabled={isSubmitting}>
        {t('common.close')}
      </Button>
    </>
  ) : (
    <>
      <Button onClick={onClose} disabled={isSubmitting}>
        {t('common.cancel')}
      </Button>
      <Button
        type="submit"
        variant="contained"
        color="primary"
        onClick={handleSubmit(onSubmit)}
        disabled={isSubmitting}
      >
        {t('common.save')}
      </Button>
    </>
  )

  return (
    <>
      <StandardDialog
        open={open}
        onClose={onClose}
        title={isEdit ? t('property.editTitle') : t('property.add')}
        actions={actions}
        isDirty={isDirty}
        maxWidth="md"
      >
        {effectiveIsEdit && (
          <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ mb: 1 }}>
            <Tab label={t('common.details')} />
            <Tab label={t('propertyDetail.documents')} />
          </Tabs>
        )}
        <form onSubmit={handleSubmit(onSubmit)} hidden={activeTab !== 0}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Controller
                name="code"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label={t('property.code')}
                    error={!!errors.code}
                    helperText={
                      errors.code
                        ? t(`property.${errors.code.message}`)
                        : !isEdit
                          ? t('common.autoGenerated')
                          : ''
                    }
                    disabled={!isEdit}
                    sx={
                      !isEdit
                        ? {
                            '& .MuiOutlinedInput-root': {
                              backgroundColor: 'action.selected',
                              cursor: 'not-allowed'
                            }
                          }
                        : undefined
                    }
                  />
                )}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormField
                name="name"
                control={control}
                errors={errors}
                label={t('property.name')}
                required
                errorNamespace="property"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth size="small" error={!!errors.type}>
                <InputLabel>{t('property.type')}</InputLabel>
                <Controller
                  name="type"
                  control={control}
                  render={({ field }) => (
                    <Select {...field} label={t('property.type')}>
                      <MenuItem value="apartment">{t('property.apartment')}</MenuItem>
                      <MenuItem value="shop">{t('property.shop')}</MenuItem>
                    </Select>
                  )}
                />
                {errors.type && (
                  <FormHelperText>{t(`property.${errors.type.message}`)}</FormHelperText>
                )}
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                <FormControl fullWidth size="small" error={!!errors.country}>
                  <InputLabel>{t('property.country')}</InputLabel>
                  <Controller
                    name="country"
                    control={control}
                    render={({ field }) => (
                      <Select {...field} label={t('property.country')}>
                        {countries.map((c) => (
                          <MenuItem key={c.code} value={c.code}>
                            {getLocalizedCountryName(c.code, i18n.language, c.name)}
                          </MenuItem>
                        ))}
                      </Select>
                    )}
                  />
                  {errors.country && (
                    <FormHelperText>{t(`property.${errors.country.message}`)}</FormHelperText>
                  )}
                </FormControl>
                <Button
                  size="small"
                  variant="outlined"
                  sx={{ mt: 0.5, whiteSpace: 'nowrap', minWidth: 'auto' }}
                  onClick={() => setCountryDialogOpen(true)}
                >
                  {t('property.manageCountries')}
                </Button>
              </Box>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormField
                name="currency"
                control={control}
                errors={errors}
                label={t('property.currency')}
                required
                errorNamespace="property"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <AmountField
                name="monthly_rent_default"
                control={control}
                label={t('property.monthlyRent')}
                required
                min={0}
                allowEmpty={false}
                errorText={errors.monthly_rent_default ? t('property.rentRequired') : undefined}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <AmountField
                name="area_sqm"
                control={control}
                label={t('property.area')}
                min={0}
                errorText={errors.area_sqm ? t('property.areaInvalid') : undefined}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth size="small" error={!!errors.status}>
                <InputLabel>{t('common.status')}</InputLabel>
                <Controller
                  name="status"
                  control={control}
                  render={({ field }) => (
                    <Select {...field} label={t('common.status')}>
                      <MenuItem value="vacant">{t('property.statusVacant')}</MenuItem>
                      <MenuItem value="rented">{t('property.statusRented')}</MenuItem>
                      <MenuItem value="maintenance">{t('property.statusMaintenance')}</MenuItem>
                    </Select>
                  )}
                />
                {errors.status && <FormHelperText>{errors.status.message}</FormHelperText>}
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <FormField
                name="address"
                control={control}
                errors={errors}
                label={t('property.address')}
                errorNamespace="property"
                multiline
                rows={2}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <FormField
                name="notes"
                control={control}
                errors={errors}
                label={t('property.notes')}
                errorNamespace="property"
                multiline
                rows={2}
              />
            </Grid>
          </Grid>
        </form>
        {effectiveIsEdit && activeTab === 1 && currentEntity && (
          <EntityDocumentsTab entityType="property" entityId={currentEntity.id} />
        )}
      </StandardDialog>
      <CountryManagerDialog
        open={countryDialogOpen}
        onClose={() => setCountryDialogOpen(false)}
        onChange={onCountriesUpdated}
      />

      <GlobalSnackbar state={snack} onClose={hideSnackbar} />
    </>
  )
}
