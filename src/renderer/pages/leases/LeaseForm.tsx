import React, { useEffect, useState } from 'react'
import {
  Box,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormHelperText,
  Grid
} from '@mui/material'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'

const leaseFormSchema = z
  .object({
    contract_number: z.string().min(2, 'numberRequired').max(50),
    property_id: z.number().int().positive('propertyRequired'),
    tenant_id: z.number().int().positive('tenantRequired'),
    start_date: z.string().min(1, 'startDateRequired'),
    end_date: z.string().min(1, 'endDateRequired'),
    rent_amount: z.number().positive('rentRequired'),
    currency: z.string().min(3).max(3),
    payment_frequency: z.enum(['monthly', 'quarterly', 'semi-annual', 'annual']).default('monthly'),
    security_deposit: z.number().nonnegative().default(0.0),
    status: z.enum(['draft', 'active', 'expired', 'terminated']).default('draft'),
    notes: z.string().optional().nullable()
  })
  .refine(
    (data) => {
      return new Date(data.end_date) > new Date(data.start_date)
    },
    {
      message: 'endDateAfterStart',
      path: ['end_date']
    }
  )

type LeaseFormValues = z.infer<typeof leaseFormSchema>

interface Property {
  id: number
  code: string
  name: string
  status: string
  monthly_rent_default: number
  currency: string
}

interface Tenant {
  id: number
  code: string
  fullname: string
  is_active: number
}

interface Lease {
  id: number
  contract_number: string
  property_id: number
  tenant_id: number
  start_date: string
  end_date: string
  rent_amount: number
  currency: string
  payment_frequency: 'monthly' | 'quarterly' | 'semi-annual' | 'annual'
  security_deposit: number
  status: 'draft' | 'active' | 'expired' | 'terminated'
  notes?: string
}

interface LeaseFormProps {
  lease: Lease | null
  onSuccess: () => void
  onCancel: () => void
}

export function LeaseForm({ lease, onSuccess, onCancel }: LeaseFormProps): React.ReactElement {
  const { t, i18n } = useTranslation()
  const isRtl = i18n.language === 'ar'
  const isEdit = !!lease

  const [properties, setProperties] = useState<Property[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])

  const defaultValues: Partial<LeaseFormValues> = lease
    ? {
        contract_number: lease.contract_number,
        property_id: lease.property_id,
        tenant_id: lease.tenant_id,
        start_date: lease.start_date,
        end_date: lease.end_date,
        rent_amount: lease.rent_amount,
        currency: lease.currency,
        payment_frequency: lease.payment_frequency,
        security_deposit: lease.security_deposit,
        status: lease.status,
        notes: lease.notes || ''
      }
    : {
        contract_number: '',
        start_date: new Date().toISOString().split('T')[0],
        end_date: '',
        rent_amount: 0,
        currency: 'USD',
        payment_frequency: 'monthly',
        security_deposit: 0.0,
        status: 'draft',
        notes: ''
      }

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting }
  } = useForm<LeaseFormValues>({
    resolver: zodResolver(leaseFormSchema),
    defaultValues
  })

  // Load properties and tenants
  useEffect(() => {
    const loadFormData = async (): Promise<void> => {
      try {
        const propsData = (await window.api.properties.list()) as Property[]
        const tenantsData = (await window.api.tenants.list({ is_active: 1 })) as Tenant[]

        // Filter vacant properties + current lease property if editing
        const availableProps = propsData.filter(
          (p) => p.status === 'vacant' || (lease && p.id === lease.property_id)
        )

        setProperties(availableProps)
        setTenants(tenantsData)
      } catch (err) {
        console.error('Failed to load properties/tenants:', err)
      }
    }
    loadFormData()
  }, [lease])

  // Watch selected property changes to auto-fill default values
  const selectedPropertyId = watch('property_id')
  useEffect(() => {
    if (selectedPropertyId && !isEdit) {
      const prop = properties.find((p) => p.id === selectedPropertyId)
      if (prop) {
        setValue('rent_amount', prop.monthly_rent_default)
        setValue('currency', prop.currency)
      }
    }
  }, [selectedPropertyId, properties, isEdit, setValue])

  const onSubmit = async (data: LeaseFormValues): Promise<void> => {
    try {
      if (isEdit && lease) {
        await window.api.leases.update({ id: lease.id, ...data })
      } else {
        await window.api.leases.create(data)
      }
      onSuccess()
    } catch (err: unknown) {
      console.error(err)
      const errorMessage = err instanceof Error ? err.message : ''
      if (errorMessage === 'LEASE_OVERLAPS') {
        setError('property_id', { type: 'manual', message: t('lease.overlapError') })
      } else if (errorMessage === 'LEASE_NUMBER_DUPLICATE') {
        setError('contract_number', { type: 'manual', message: t('lease.numberUnique') })
      } else {
        alert(t('common.error'))
      }
    }
  }

  return (
    <Box component="form" onSubmit={handleSubmit(onSubmit)} sx={{ mt: 1 }}>
      <Grid container spacing={3}>
        {/* Contract Number */}
        <Grid size={{ xs: 12, sm: 6 }}>
          <Controller
            name="contract_number"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label={t('lease.contractNumber')}
                fullWidth
                error={!!errors.contract_number}
                helperText={
                  errors.contract_number ? t(`lease.${errors.contract_number.message}`) : ''
                }
              />
            )}
          />
        </Grid>

        {/* Status */}
        <Grid size={{ xs: 12, sm: 6 }}>
          <FormControl fullWidth error={!!errors.status}>
            <InputLabel id="lease-status-label">{t('lease.status')}</InputLabel>
            <Controller
              name="status"
              control={control}
              render={({ field }) => (
                <Select labelId="lease-status-label" label={t('lease.status')} {...field}>
                  <MenuItem value="draft">{t('lease.draft')}</MenuItem>
                  <MenuItem value="active">{t('lease.active')}</MenuItem>
                  <MenuItem value="expired">{t('lease.expired')}</MenuItem>
                  <MenuItem value="terminated">{t('lease.terminated')}</MenuItem>
                </Select>
              )}
            />
          </FormControl>
        </Grid>

        {/* Property Selector */}
        <Grid size={{ xs: 12, sm: 6 }}>
          <FormControl fullWidth error={!!errors.property_id}>
            <InputLabel id="property-select-label">{t('lease.property')}</InputLabel>
            <Controller
              name="property_id"
              control={control}
              render={({ field }) => (
                <Select
                  labelId="property-select-label"
                  label={t('lease.property')}
                  {...field}
                  value={field.value || ''}
                  onChange={(e) => field.onChange(Number(e.target.value))}
                >
                  {properties.map((p) => (
                    <MenuItem key={p.id} value={p.id}>
                      {p.name} ({p.code})
                    </MenuItem>
                  ))}
                </Select>
              )}
            />
            {errors.property_id && (
              <FormHelperText>{t(`lease.${errors.property_id.message}`)}</FormHelperText>
            )}
          </FormControl>
        </Grid>

        {/* Tenant Selector */}
        <Grid size={{ xs: 12, sm: 6 }}>
          <FormControl fullWidth error={!!errors.tenant_id}>
            <InputLabel id="tenant-select-label">{t('lease.tenant')}</InputLabel>
            <Controller
              name="tenant_id"
              control={control}
              render={({ field }) => (
                <Select
                  labelId="tenant-select-label"
                  label={t('lease.tenant')}
                  {...field}
                  value={field.value || ''}
                  onChange={(e) => field.onChange(Number(e.target.value))}
                >
                  {tenants.map((t) => (
                    <MenuItem key={t.id} value={t.id}>
                      {t.fullname} ({t.code})
                    </MenuItem>
                  ))}
                </Select>
              )}
            />
            {errors.tenant_id && (
              <FormHelperText>{t(`lease.${errors.tenant_id.message}`)}</FormHelperText>
            )}
          </FormControl>
        </Grid>

        {/* Start Date */}
        <Grid size={{ xs: 12, sm: 6 }}>
          <Controller
            name="start_date"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label={t('lease.startDate')}
                type="date"
                fullWidth
                slotProps={{ inputLabel: { shrink: true } }}
                error={!!errors.start_date}
                helperText={errors.start_date ? t(`lease.${errors.start_date.message}`) : ''}
              />
            )}
          />
        </Grid>

        {/* End Date */}
        <Grid size={{ xs: 12, sm: 6 }}>
          <Controller
            name="end_date"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label={t('lease.endDate')}
                type="date"
                fullWidth
                slotProps={{ inputLabel: { shrink: true } }}
                error={!!errors.end_date}
                helperText={errors.end_date ? t(`lease.${errors.end_date.message}`) : ''}
              />
            )}
          />
        </Grid>

        {/* Rent Amount */}
        <Grid size={{ xs: 12, sm: 6 }}>
          <Controller
            name="rent_amount"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                value={field.value || ''}
                onChange={(e) => field.onChange(Number(e.target.value))}
                label={t('lease.rentAmount')}
                type="number"
                fullWidth
                error={!!errors.rent_amount}
                helperText={errors.rent_amount ? t(`lease.${errors.rent_amount.message}`) : ''}
              />
            )}
          />
        </Grid>

        {/* Currency (Locked based on property currency) */}
        <Grid size={{ xs: 12, sm: 6 }}>
          <Controller
            name="currency"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label={t('lease.currency')}
                fullWidth
                disabled
                error={!!errors.currency}
              />
            )}
          />
        </Grid>

        {/* Payment Frequency */}
        <Grid size={{ xs: 12, sm: 6 }}>
          <FormControl fullWidth error={!!errors.payment_frequency}>
            <InputLabel id="payment-frequency-label">{t('lease.frequency')}</InputLabel>
            <Controller
              name="payment_frequency"
              control={control}
              render={({ field }) => (
                <Select labelId="payment-frequency-label" label={t('lease.frequency')} {...field}>
                  <MenuItem value="monthly">{t('lease.monthly')}</MenuItem>
                  <MenuItem value="quarterly">{t('lease.quarterly')}</MenuItem>
                  <MenuItem value="semi-annual">{t('lease.semiAnnual')}</MenuItem>
                  <MenuItem value="annual">{t('lease.annual')}</MenuItem>
                </Select>
              )}
            />
          </FormControl>
        </Grid>

        {/* Security Deposit */}
        <Grid size={{ xs: 12, sm: 6 }}>
          <Controller
            name="security_deposit"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                value={field.value || ''}
                onChange={(e) => field.onChange(Number(e.target.value))}
                label={t('lease.securityDeposit')}
                type="number"
                fullWidth
                error={!!errors.security_deposit}
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
                label={t('lease.notes')}
                multiline
                rows={3}
                fullWidth
              />
            )}
          />
        </Grid>
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
  )
}
