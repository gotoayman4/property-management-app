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
  Grid
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
  is_active: z.number().int().min(0).max(1).default(1)
})

type TenantFormValues = z.infer<typeof tenantFormSchema>

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
        is_active: 1
      }

  const {
    control,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting }
  } = useForm<TenantFormValues>({
    resolver: zodResolver(tenantFormSchema),
    defaultValues
  })

  const tenantType = watch('type')

  const onSubmit = async (data: TenantFormValues): Promise<void> => {
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
