/**
 * INTENT: Create or edit a recurring expense template. The template defines a repeating cost
 *         (monthly cleaning, annual insurance, etc.) that the backend evaluator auto-generates.
 * CONSTRAINT: BR-13 — when a property IS selected, currency is locked to that property's currency.
 * DECISION: Reuses the same Grid/form patterns as ExpenseForm for visual consistency.
 */
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Box,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormHelperText,
  Grid,
  Typography
} from '@mui/material'
import React, { useEffect, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { CurrencyInput } from '../../components/CurrencyInput'
import GlobalSnackbar from '../../components/GlobalSnackbar'
import { useSnackbar } from '../../hooks/useSnackbar'

const templateSchema = z.object({
  name: z.string().min(2, 'nameRequired').max(150),
  property_id: z.number().int().positive().optional().nullable(),
  category_id: z.number().int().positive('categoryRequired'),
  vendor_name: z.string().optional().nullable(),
  amount: z.number().positive('amountRequired'),
  currency: z.string().min(3).max(3),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'semi_annual', 'annual']),
  day_of_month: z.number().int().min(1).max(28),
  start_date: z.string().min(1, 'startDateRequired'),
  end_date: z.string().optional().nullable(),
  notes: z.string().optional().nullable()
})

type TemplateFormValues = z.infer<typeof templateSchema>

interface Property {
  id: number
  code: string
  name: string
  currency: string
}
interface Category {
  id: number
  name_key: string
  is_default: number
}

interface RecurringExpenseFormProps {
  template?: {
    id: number
    property_id: number | null
    category_id: number
    name: string
    amount: number
    currency: string
    frequency: string
    day_of_month: number
    start_date: string
    end_date: string | null
    vendor_name: string | null
    notes: string | null
  } | null
  onSuccess: () => void
  onCancel: () => void
}

export function RecurringExpenseForm({
  template,
  onSuccess,
  onCancel
}: RecurringExpenseFormProps): React.ReactElement {
  const { t } = useTranslation()
  const { snack, showError, showSuccess, hideSnackbar } = useSnackbar()

  const [properties, setProperties] = useState<Property[]>([])
  const [categories, setCategories] = useState<Category[]>([])

  const defaultValues: TemplateFormValues = {
    name: template?.name ?? '',
    property_id: template?.property_id ?? null,
    category_id: template?.category_id ?? 0,
    vendor_name: template?.vendor_name ?? '',
    amount: template?.amount ?? 0,
    currency: template?.currency ?? 'JOD',
    frequency: (template?.frequency as TemplateFormValues['frequency']) ?? 'monthly',
    day_of_month: template?.day_of_month ?? 1,
    start_date: template?.start_date ?? new Date().toISOString().split('T')[0],
    end_date: template?.end_date ?? '',
    notes: template?.notes ?? ''
  }

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting }
  } = useForm({
    resolver: zodResolver(templateSchema),
    defaultValues
  })

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const [propsData, catsData] = await Promise.all([
          window.api.properties.list() as Promise<Property[]>,
          window.api.expenseCategories.list() as Promise<Category[]>
        ])
        setProperties(propsData)
        setCategories(catsData)
      } catch (err) {
        console.error('Failed to load dropdown data:', err)
      }
    }
    load()
  }, [])

  const selectedPropertyId = watch('property_id')
  const selectedCurrency = watch('currency')

  useEffect(() => {
    if (selectedPropertyId) {
      const prop = properties.find((p) => p.id === selectedPropertyId)
      if (prop) setValue('currency', prop.currency)
    }
  }, [selectedPropertyId, properties, setValue])

  const onSubmit = async (data: TemplateFormValues): Promise<void> => {
    try {
      const payload = {
        ...(template ? { id: template.id } : {}),
        property_id: data.property_id ?? null,
        category_id: data.category_id,
        name: data.name,
        amount: data.amount,
        currency: data.currency,
        frequency: data.frequency,
        day_of_month: data.day_of_month,
        start_date: data.start_date,
        end_date: data.end_date || null,
        vendor_name: data.vendor_name || null,
        notes: data.notes || null
      }

      if (template) {
        await window.api.recurringExpenses.update(payload)
      } else {
        await window.api.recurringExpenses.create(payload)
      }
      showSuccess('common.saveSuccess')
      onSuccess()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      if (msg === 'TEMPLATE_ENDED') showError('recurringExpense.templateEnded')
      else showError('common.saveError')
    }
  }

  // FR-REC-02: daily and weekly are now first-class frequencies.
  const frequencyOptions: Array<{ value: string; labelKey: string }> = [
    { value: 'daily', labelKey: 'recurringExpense.frequencyDaily' },
    { value: 'weekly', labelKey: 'recurringExpense.frequencyWeekly' },
    { value: 'monthly', labelKey: 'contract.monthly' },
    { value: 'quarterly', labelKey: 'contract.quarterly' },
    { value: 'semi_annual', labelKey: 'contract.semiAnnual' },
    { value: 'annual', labelKey: 'contract.annual' }
  ]

  return (
    <>
      <Box component="form" onSubmit={handleSubmit(onSubmit)} sx={{ mt: 1 }}>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Controller
              name="name"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label={t('recurringExpense.name')}
                  fullWidth
                  required
                  error={!!errors.name}
                  helperText={errors.name ? t(`recurringExpense.${errors.name.message}`) : ''}
                />
              )}
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <FormControl fullWidth>
              <InputLabel>{t('recurringExpense.propertyOptional')}</InputLabel>
              <Controller
                name="property_id"
                control={control}
                render={({ field }) => (
                  <Select
                    label={t('recurringExpense.propertyOptional')}
                    value={field.value ? String(field.value) : ''}
                    onChange={(e) =>
                      field.onChange(e.target.value === '' ? null : Number(e.target.value))
                    }
                  >
                    <MenuItem value="">{t('common.general')}</MenuItem>
                    {properties.map((p) => (
                      <MenuItem key={p.id} value={p.id}>
                        {p.name} ({p.code})
                      </MenuItem>
                    ))}
                  </Select>
                )}
              />
            </FormControl>
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <FormControl fullWidth error={!!errors.category_id}>
              <InputLabel>{t('common.category')}</InputLabel>
              <Controller
                name="category_id"
                control={control}
                render={({ field }) => (
                  <Select
                    {...field}
                    label={t('common.category')}
                    value={field.value || ''}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                  >
                    <MenuItem value="" disabled>
                      {t('expense.selectCategory')}
                    </MenuItem>
                    {categories.map((c) => (
                      <MenuItem key={c.id} value={c.id}>
                        {t(c.name_key)}
                      </MenuItem>
                    ))}
                  </Select>
                )}
              />
              {errors.category_id && (
                <FormHelperText>
                  {t(`recurringExpense.${errors.category_id.message}`)}
                </FormHelperText>
              )}
            </FormControl>
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <Controller
              name="vendor_name"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  value={field.value ?? ''}
                  label={t('expense.vendor')}
                  fullWidth
                />
              )}
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <CurrencyInput
              name="amount"
              control={control}
              label={t('common.amount')}
              currency={selectedCurrency}
              required
              noRateLabel={t('common.noRateAvailable')}
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <Controller
              name="currency"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label={t('common.currency')}
                  fullWidth
                  disabled={!!selectedPropertyId}
                  helperText={selectedPropertyId ? t('expense.currencyMismatch') : undefined}
                />
              )}
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <FormControl fullWidth error={!!errors.frequency}>
              <InputLabel>{t('recurringExpense.frequency')}</InputLabel>
              <Controller
                name="frequency"
                control={control}
                render={({ field }) => (
                  <Select
                    {...field}
                    label={t('recurringExpense.frequency')}
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value)}
                  >
                    {frequencyOptions.map((opt) => (
                      <MenuItem key={opt.value} value={opt.value}>
                        {t(opt.labelKey)}
                      </MenuItem>
                    ))}
                  </Select>
                )}
              />
              {errors.frequency && (
                <FormHelperText>{t('recurringExpense.frequencyRequired')}</FormHelperText>
              )}
            </FormControl>
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <Controller
              name="day_of_month"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label={t('recurringExpense.dayOfMonth')}
                  type="number"
                  fullWidth
                  slotProps={{ htmlInput: { min: 1, max: 28 } }}
                  error={!!errors.day_of_month}
                  helperText={errors.day_of_month ? t('recurringExpense.dayOfMonthInvalid') : ''}
                />
              )}
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <Controller
              name="start_date"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label={t('recurringExpense.startDate')}
                  type="date"
                  fullWidth
                  slotProps={{ inputLabel: { shrink: true } }}
                  error={!!errors.start_date}
                  helperText={
                    errors.start_date ? t(`recurringExpense.${errors.start_date.message}`) : ''
                  }
                />
              )}
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <Controller
              name="end_date"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  value={field.value ?? ''}
                  label={t('recurringExpense.endDateOptional')}
                  type="date"
                  fullWidth
                  slotProps={{ inputLabel: { shrink: true } }}
                />
              )}
            />
          </Grid>

          <Grid size={{ xs: 12 }}>
            <Typography variant="caption" color="text.secondary">
              {t('recurringExpense.helpText')}
            </Typography>
          </Grid>

          <Grid size={{ xs: 12 }}>
            <Controller
              name="notes"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  value={field.value ?? ''}
                  label={t('common.notes')}
                  multiline
                  rows={2}
                  fullWidth
                />
              )}
            />
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
