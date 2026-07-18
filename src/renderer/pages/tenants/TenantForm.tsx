import React from 'react'
import {
  Box,
  Button,
  TextField,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Grid,
  Select,
  MenuItem,
  InputLabel
} from '@mui/material'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import GlobalSnackbar from '../../components/GlobalSnackbar'
import { useSnackbar } from '../../hooks/useSnackbar'

const tenantFormSchema = z.object({
  code: z
    .string()
    .min(2, 'codeRequired')
    .max(20)
    .regex(/^[a-zA-Z0-9-]+$/, 'codeInvalid'),
  fullname: z.string().min(3, 'fullnameRequired').max(100),
  national_id: z.string().optional().nullable(),
  phone: z.string().min(5, 'phoneRequired').max(20),
  email: z.string().email('emailInvalid').optional().nullable().or(z.literal('')),
  type: z.enum(['individual', 'company']).default('individual'),
  company_reg_no: z.string().optional().nullable(),
  representative_name: z.string().optional().nullable(),
  preferred_language: z.enum(['ar', 'tr', 'en']).default('ar'),
  emergency_contact_name: z.string().optional().nullable(),
  emergency_contact_phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  is_active: z.number().int().min(0).max(1).default(1)
})

// Form values hold raw user input (schema INPUT shape); `onSubmit` receives the OUTPUT shape.
type TenantFormValues = z.input<typeof tenantFormSchema>
type TenantFormOutput = z.output<typeof tenantFormSchema>

interface Tenant {
  id: number
  code: string
  fullname: string
  national_id?: string
  phone: string
  email?: string
  type: 'individual' | 'company'
  company_reg_no?: string
  representative_name?: string
  preferred_language?: string
  emergency_contact_name?: string
  emergency_contact_phone?: string
  address?: string
  notes?: string
  is_active: number
}

interface TenantFormProps {
  tenant: Tenant | null
  onSuccess: () => void
  onCancel: () => void
}

export function TenantForm({ tenant, onSuccess, onCancel }: TenantFormProps): React.ReactElement {
  const { t, i18n } = useTranslation()
  const isRtl = i18n.language === 'ar'
  const { snack, showError, showSuccess, hideSnackbar } = useSnackbar()
  const isEdit = !!tenant

  const defaultValues: Partial<TenantFormValues> = tenant
    ? {
        code: tenant.code,
        fullname: tenant.fullname,
        national_id: tenant.national_id || '',
        phone: tenant.phone,
        email: tenant.email || '',
        type: tenant.type,
        company_reg_no: tenant.company_reg_no || '',
        representative_name: tenant.representative_name || '',
        preferred_language: (tenant.preferred_language as 'ar' | 'tr' | 'en') || 'ar',
        emergency_contact_name: tenant.emergency_contact_name || '',
        emergency_contact_phone: tenant.emergency_contact_phone || '',
        address: tenant.address || '',
        notes: tenant.notes || '',
        is_active: tenant.is_active
      }
    : {
        code: '',
        fullname: '',
        national_id: '',
        phone: '',
        email: '',
        type: 'individual',
        company_reg_no: '',
        representative_name: '',
        preferred_language: 'ar',
        emergency_contact_name: '',
        emergency_contact_phone: '',
        address: '',
        notes: '',
        is_active: 1
      }

  const {
    control,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting }
  } = useForm<TenantFormValues, unknown, TenantFormOutput>({
    resolver: zodResolver(tenantFormSchema),
    defaultValues
  })

  const tenantType = watch('type')

  const onSubmit = async (data: TenantFormOutput): Promise<void> => {
    try {
      if (isEdit && tenant) {
        await window.api.tenants.update({ id: tenant.id, ...data })
      } else {
        await window.api.tenants.create(data)
      }
      showSuccess('common.saveSuccess')
      onSuccess()
    } catch (err: unknown) {
      console.error(err)
      const errorMessage = err instanceof Error ? err.message : ''
      if (errorMessage === 'TENANT_CODE_DUPLICATE') {
        setError('code', { type: 'manual', message: t('tenant.codeUnique') })
      } else {
        showError('common.saveError')
      }
    }
  }

  return (
    <>
      <Box component="form" onSubmit={handleSubmit(onSubmit)} sx={{ mt: 1 }}>
        <Grid container spacing={3}>
          {/* Tenant Type (Radio) */}
          <Grid size={12}>
            <FormControl component="fieldset">
              <FormLabel component="legend">{t('tenant.type')}</FormLabel>
              <Controller
                name="type"
                control={control}
                render={({ field }) => (
                  <RadioGroup row {...field} sx={{ flexDirection: isRtl ? 'row-reverse' : 'row' }}>
                    <FormControlLabel
                      value="individual"
                      control={<Radio />}
                      label={t('tenant.individual')}
                    />
                    <FormControlLabel
                      value="company"
                      control={<Radio />}
                      label={t('tenant.company')}
                    />
                  </RadioGroup>
                )}
              />
            </FormControl>
          </Grid>

          {/* Tenant Code */}
          <Grid size={{ xs: 12, sm: 6 }}>
            <Controller
              name="code"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label={t('tenant.code')}
                  fullWidth
                  error={!!errors.code}
                  helperText={errors.code ? t(`tenant.${errors.code.message}`) : ''}
                  disabled={isEdit}
                />
              )}
            />
          </Grid>

          {/* Full Name */}
          <Grid size={{ xs: 12, sm: 6 }}>
            <Controller
              name="fullname"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label={t('tenant.fullname')}
                  fullWidth
                  error={!!errors.fullname}
                  helperText={errors.fullname ? t(`tenant.${errors.fullname.message}`) : ''}
                />
              )}
            />
          </Grid>

          {/* National ID */}
          <Grid size={{ xs: 12, sm: 6 }}>
            <Controller
              name="national_id"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  value={field.value || ''}
                  label={t('tenant.nationalId')}
                  fullWidth
                  error={!!errors.national_id}
                />
              )}
            />
          </Grid>

          {/* Phone */}
          <Grid size={{ xs: 12, sm: 6 }}>
            <Controller
              name="phone"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label={t('tenant.phone')}
                  fullWidth
                  error={!!errors.phone}
                  helperText={errors.phone ? t(`tenant.${errors.phone.message}`) : ''}
                />
              )}
            />
          </Grid>

          {/* Email */}
          <Grid size={12}>
            <Controller
              name="email"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  value={field.value || ''}
                  label={t('tenant.email')}
                  fullWidth
                  error={!!errors.email}
                />
              )}
            />
          </Grid>

          {/* Preferred communication language (FR-TEN-01) */}
          <Grid size={{ xs: 12, sm: 6 }}>
            <FormControl fullWidth>
              <InputLabel>{t('tenant.preferredLanguage')}</InputLabel>
              <Controller
                name="preferred_language"
                control={control}
                render={({ field }) => (
                  <Select {...field} label={t('tenant.preferredLanguage')}>
                    <MenuItem value="ar">{t('tenant.langArabic')}</MenuItem>
                    <MenuItem value="tr">{t('tenant.langTurkish')}</MenuItem>
                    <MenuItem value="en">{t('tenant.langEnglish')}</MenuItem>
                  </Select>
                )}
              />
            </FormControl>
          </Grid>

          {/* Address */}
          <Grid size={{ xs: 12, sm: 6 }}>
            <Controller
              name="address"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  value={field.value || ''}
                  label={t('tenant.address')}
                  fullWidth
                />
              )}
            />
          </Grid>

          {/* Emergency contact name */}
          <Grid size={{ xs: 12, sm: 6 }}>
            <Controller
              name="emergency_contact_name"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  value={field.value || ''}
                  label={t('tenant.emergencyContactName')}
                  fullWidth
                />
              )}
            />
          </Grid>

          {/* Emergency contact phone */}
          <Grid size={{ xs: 12, sm: 6 }}>
            <Controller
              name="emergency_contact_phone"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  value={field.value || ''}
                  label={t('tenant.emergencyContactPhone')}
                  fullWidth
                />
              )}
            />
          </Grid>

          {/* Notes */}
          <Grid size={12}>
            <Controller
              name="notes"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  value={field.value || ''}
                  label={t('tenant.notes')}
                  fullWidth
                  multiline
                  rows={2}
                />
              )}
            />
          </Grid>

          {/* Company Conditional Fields */}
          {tenantType === 'company' && (
            <>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Controller
                  name="company_reg_no"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      value={field.value || ''}
                      label={t('tenant.companyRegNo')}
                      fullWidth
                    />
                  )}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Controller
                  name="representative_name"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      value={field.value || ''}
                      label={t('tenant.representativeName')}
                      fullWidth
                    />
                  )}
                />
              </Grid>
            </>
          )}
        </Grid>

        <Box
          sx={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 2,
            mt: 4,
            flexDirection: isRtl ? 'row-reverse' : 'row'
          }}
        >
          <Button variant="outlined" onClick={onCancel} disabled={isSubmitting}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="contained" disabled={isSubmitting}>
            {t('common.save')}
          </Button>
        </Box>
      </Box>
      <GlobalSnackbar state={snack} onClose={hideSnackbar} />
    </>
  )
}
