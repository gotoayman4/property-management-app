import { zodResolver } from '@hookform/resolvers/zod'
import {
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
import EntityDocumentsTab from '../../components/EntityDocumentsTab'
import GlobalSnackbar from '../../components/GlobalSnackbar'
import StandardDialog from '../../components/StandardDialog'
import { useSnackbar } from '../../hooks/useSnackbar'

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
}

export default function PropertyForm({
  open,
  onClose,
  onSuccess,
  property = null,
  countries
}: PropertyFormProps): React.JSX.Element {
  const { t } = useTranslation()
  const { snack, showError, showSuccess, hideSnackbar } = useSnackbar()
  const isEdit = !!property
  const [activeTab, setActiveTab] = useState(0)

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

  useEffect(() => {
    if (selectedCountry && !isEdit) {
      const match = countries.find((c) => c.code === selectedCountry)
      if (match) {
        setValue('currency', match.default_currency)
      }
    }
  }, [selectedCountry, countries, setValue, isEdit])

  const onSubmit = async (data: PropertyFormData): Promise<void> => {
    try {
      if (isEdit) {
        await window.api.properties.update({ id: property.id, ...data })
      } else {
        await window.api.properties.create(data)
      }
      showSuccess('common.saveSuccess')
      onSuccess()
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

  const actions = (
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
        {isEdit && (
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
                    helperText={errors.code ? t(`property.${errors.code.message}`) : ''}
                    disabled={isEdit} // Disable editing the code once created
                  />
                )}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Controller
                name="name"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label={t('property.name')}
                    error={!!errors.name}
                    helperText={errors.name ? t(`property.${errors.name.message}`) : ''}
                  />
                )}
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
              <FormControl fullWidth size="small" error={!!errors.country}>
                <InputLabel>{t('property.country')}</InputLabel>
                <Controller
                  name="country"
                  control={control}
                  render={({ field }) => (
                    <Select {...field} label={t('property.country')}>
                      {countries.map((c) => (
                        <MenuItem key={c.code} value={c.code}>
                          {t(`countries.${c.code}`, c.code)}
                        </MenuItem>
                      ))}
                    </Select>
                  )}
                />
                {errors.country && (
                  <FormHelperText>{t(`property.${errors.country.message}`)}</FormHelperText>
                )}
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Controller
                name="currency"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label={t('property.currency')}
                    error={!!errors.currency}
                    helperText={errors.currency ? t(`property.${errors.currency.message}`) : ''}
                  />
                )}
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
              <Controller
                name="address"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    fullWidth
                    multiline
                    rows={2}
                    label={t('property.address')}
                  />
                )}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <Controller
                name="notes"
                control={control}
                render={({ field }) => (
                  <TextField {...field} fullWidth multiline rows={2} label={t('property.notes')} />
                )}
              />
            </Grid>
          </Grid>
        </form>
        {isEdit && activeTab === 1 && property && (
          <EntityDocumentsTab entityType="property" entityId={property.id} />
        )}
      </StandardDialog>
      <GlobalSnackbar state={snack} onClose={hideSnackbar} />
    </>
  )
}
