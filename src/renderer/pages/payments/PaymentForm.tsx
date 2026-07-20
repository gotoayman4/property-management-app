import { zodResolver } from '@hookform/resolvers/zod'
import {
  Box,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormHelperText,
  Grid,
  FormControlLabel,
  Checkbox,
  Typography
} from '@mui/material'
import React, { useEffect, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { CurrencyInput } from '../../components/CurrencyInput'
import { FormField } from '../../components/FormField'
import GlobalSnackbar from '../../components/GlobalSnackbar'
import { useCurrencyConversion } from '../../hooks/useCurrencyConversion'
import { useSnackbar } from '../../hooks/useSnackbar'
import { notifyDataChanged } from '../../utils/eventBus'

/**
 * INTENT: Create a payment (income). Editing/voiding are separate flows — a payment's amount is
 *         immutable once written; corrections use void + re-record (BR-20).
 * CONSTRAINT (BR-13): currency is locked to the selected property's currency and sent read-only.
 *           The server rejects any mismatch with PAYMENT_CURRENCY_MISMATCH.
 * DECISION: contract_id is auto-suggested from active contracts on the property but optional, so
 *           "other_income" not tied to a contract can still be recorded (FR-INC-03).
 */

const paymentSchema = z.object({
  property_id: z.number().int().positive('propertyRequired'),
  contract_id: z.number().int().positive().optional().nullable(),
  tenant_id: z.number().int().positive().optional().nullable(),
  payment_type: z.enum(['rent', 'deposit', 'other_income']),
  payment_date: z.string().min(1, 'dateRequired'),
  amount: z.number().positive('amountRequired'),
  currency: z.string().min(3).max(3),
  payment_method: z.enum(['cash', 'bank_transfer', 'cheque', 'other']).default('cash'),
  is_partial: z.boolean().default(false),
  related_period_month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'dateRequired')
    .optional()
    .nullable(),
  notes: z.string().optional().nullable()
})

// Form values hold the raw user input (the schema's INPUT shape) — fields with `.default()`
// are optional here. `onSubmit` receives the OUTPUT shape after Zod applies defaults.
type PaymentFormValues = z.input<typeof paymentSchema>
type PaymentFormOutput = z.output<typeof paymentSchema>

interface Property {
  id: number
  code: string
  name: string
  currency: string
  status: string
}
interface Contract {
  id: number
  contract_number: string
  property_id: number
  tenant_id: number | null
  tenant_fullname: string
  status: string
}

interface PaymentFormProps {
  /** Called after a successful save; the parent closes the dialog and refreshes the list. */
  onSuccess: (receiptNumber: string) => void
  onCancel: () => void
}

export function PaymentForm({ onSuccess, onCancel }: PaymentFormProps): React.ReactElement {
  const { t } = useTranslation()
  const { snack, showError, showSuccess, hideSnackbar } = useSnackbar()

  const [properties, setProperties] = useState<Property[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])

  const defaultValues: PaymentFormValues = {
    property_id: 0,
    contract_id: null,
    tenant_id: null,
    payment_type: 'rent',
    payment_date: new Date().toISOString().split('T')[0],
    amount: 0,
    currency: 'JOD',
    payment_method: 'cash',
    is_partial: false,
    related_period_month: new Date().toISOString().slice(0, 7),
    notes: ''
  }

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting }
  } = useForm<PaymentFormValues, unknown, PaymentFormOutput>({
    resolver: zodResolver(paymentSchema),
    defaultValues
  })

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const [propsData, contractsData] = await Promise.all([
          window.api.properties.list() as Promise<Property[]>,
          window.api.contracts.list({ status: 'active' }) as Promise<Contract[]>
        ])
        setProperties(propsData)
        setContracts(contractsData)
      } catch (err) {
        console.error('Failed to load properties/contracts:', err)
      }
    }
    load()
  }, [])

  const selectedPropertyId = watch('property_id')
  const selectedContractId = watch('contract_id')
  const watchedAmount = watch('amount')
  const watchedCurrency = watch('currency')
  const conversions = useCurrencyConversion(watchedAmount, watchedCurrency)
  const primaryConversion =
    conversions.find((c) => c.currency === 'USD' && c.currency !== watchedCurrency) ?? null

  // Lock currency to the selected property (BR-13) and clear it when none selected.
  useEffect(() => {
    if (selectedPropertyId) {
      const prop = properties.find((p) => p.id === selectedPropertyId)
      if (prop) setValue('currency', prop.currency)
    }
  }, [selectedPropertyId, properties, setValue])

  // Auto-fill tenant from the selected contract.
  useEffect(() => {
    if (selectedContractId) {
      const c = contracts.find((x) => x.id === selectedContractId)
      if (c?.tenant_id) setValue('tenant_id', c.tenant_id)
    }
  }, [selectedContractId, contracts, setValue])

  // Contracts available for the selected property.
  const availableContracts = contracts.filter((c) => c.property_id === selectedPropertyId)

  const onSubmit = async (data: PaymentFormOutput): Promise<void> => {
    try {
      const result = await window.api.payments.create({
        property_id: data.property_id,
        contract_id: data.contract_id ?? null,
        tenant_id: data.tenant_id ?? null,
        payment_type: data.payment_type,
        payment_date: data.payment_date,
        amount: data.amount,
        currency: data.currency,
        payment_method: data.payment_method,
        is_partial: data.is_partial,
        related_period_month: data.related_period_month ?? null,
        notes: data.notes ?? null
      })
      showSuccess('common.saveSuccess')
      notifyDataChanged()
      onSuccess(result.receipt_number)
    } catch (err: unknown) {
      console.error(err)
      const msg = err instanceof Error ? err.message : ''
      if (msg === 'PAYMENT_CURRENCY_MISMATCH') {
        setError('amount', { type: 'manual', message: t('payment.currencyMismatch') })
      } else if (msg === 'PAYMENT_AMOUNT_INVALID') {
        setError('amount', { type: 'manual', message: t('payment.amountRequired') })
      } else if (msg === 'PROPERTY_NOT_FOUND') {
        setError('property_id', { type: 'manual', message: t('payment.propertyRequired') })
      } else {
        showError('common.saveError')
      }
    }
  }

  return (
    <>
      <Box component="form" onSubmit={handleSubmit(onSubmit)} sx={{ mt: 1 }}>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <FormControl fullWidth error={!!errors.property_id}>
              <InputLabel>{t('common.property')}</InputLabel>
              <Controller
                name="property_id"
                control={control}
                render={({ field }) => {
                  const hasOption = properties.some((p) => p.id === field.value)
                  return (
                    <Select
                      {...field}
                      label={t('common.property')}
                      value={hasOption ? field.value : ''}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    >
                      {properties.map((p) => (
                        <MenuItem key={p.id} value={p.id}>
                          {p.name} ({p.code})
                        </MenuItem>
                      ))}
                    </Select>
                  )
                }}
              />
              {errors.property_id && (
                <FormHelperText>{t(`payment.${errors.property_id.message}`)}</FormHelperText>
              )}
            </FormControl>
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <FormControl fullWidth>
              <InputLabel>{t('payment.selectContract')}</InputLabel>
              <Controller
                name="contract_id"
                control={control}
                render={({ field }) => (
                  <Select
                    label={t('payment.selectContract')}
                    value={field.value ? String(field.value) : ''}
                    onChange={(e) =>
                      field.onChange(e.target.value === '' ? null : Number(e.target.value))
                    }
                  >
                    <MenuItem value="">{t('payment.noContract')}</MenuItem>
                    {availableContracts.map((c) => (
                      <MenuItem key={c.id} value={c.id}>
                        {c.contract_number} — {c.tenant_fullname}
                      </MenuItem>
                    ))}
                  </Select>
                )}
              />
            </FormControl>
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <FormControl fullWidth>
              <InputLabel>{t('payment.paymentType')}</InputLabel>
              <Controller
                name="payment_type"
                control={control}
                render={({ field }) => (
                  <Select {...field} label={t('payment.paymentType')}>
                    <MenuItem value="rent">{t('payment.rent')}</MenuItem>
                    <MenuItem value="deposit">{t('payment.deposit')}</MenuItem>
                    <MenuItem value="other_income">{t('payment.otherIncome')}</MenuItem>
                  </Select>
                )}
              />
            </FormControl>
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <FormField
              name="payment_date"
              control={control}
              errors={errors}
              label={t('payment.paymentDate')}
              required
              errorNamespace="payment"
              type="date"
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <CurrencyInput
              name="amount"
              control={control}
              label={t('payment.amount')}
              currency={watchedCurrency}
              required
              conversion={primaryConversion}
              noRateLabel={t('common.noRateAvailable')}
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <FormControl fullWidth>
              <InputLabel>{t('payment.paymentMethod')}</InputLabel>
              <Controller
                name="payment_method"
                control={control}
                render={({ field }) => (
                  <Select {...field} label={t('payment.paymentMethod')}>
                    <MenuItem value="cash">{t('payment.methodCash')}</MenuItem>
                    <MenuItem value="bank_transfer">{t('payment.methodBank')}</MenuItem>
                    <MenuItem value="cheque">{t('payment.methodCheque')}</MenuItem>
                    <MenuItem value="other">{t('payment.methodOther')}</MenuItem>
                  </Select>
                )}
              />
            </FormControl>
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <FormField
              name="related_period_month"
              control={control}
              errors={errors}
              label={t('payment.relatedPeriod')}
              placeholder="2026-07"
              errorNamespace="payment"
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <Box sx={{ pt: 1.5 }}>
              <Controller
                name="is_partial"
                control={control}
                render={({ field }) => (
                  <FormControlLabel
                    control={<Checkbox {...field} checked={!!field.value} />}
                    label={t('payment.isPartial')}
                  />
                )}
              />
            </Box>
          </Grid>

          <Grid size={{ xs: 12 }}>
            <FormField
              name="notes"
              control={control}
              errors={errors}
              label={t('contract.notes')}
              multiline
              rows={2}
            />
          </Grid>

          <Grid size={{ xs: 12 }}>
            <Typography variant="caption" color="text.secondary">
              {t('payment.receiptNumber')}: {t('payment.autoGenerated')}
            </Typography>
          </Grid>
        </Grid>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mt: 4 }}>
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
