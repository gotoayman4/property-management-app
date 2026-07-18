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
import { AmountField } from '../../components/AmountField'
import { CurrencyInput } from '../../components/CurrencyInput'
import GlobalSnackbar from '../../components/GlobalSnackbar'
import { useCurrencyConversion } from '../../hooks/useCurrencyConversion'
import { useSnackbar } from '../../hooks/useSnackbar'

/**
 * INTENT: Record an expense. Category is required (FR-EXP-01); property is optional so a general
 *         expense (BR-11) can be recorded without any property link.
 * CONSTRAINT (BR-13): when a property IS selected, the currency is locked to that property's
 *           currency and the server enforces the match. General expenses accept a free currency.
 */

const expenseSchema = z.object({
  property_id: z.number().int().positive().optional().nullable(),
  category_id: z.number().int().positive('categoryRequired'),
  expense_date: z.string().min(1, 'dateRequired'),
  vendor_name: z.string().optional().nullable(),
  amount: z.number().positive('amountRequired'),
  currency: z.string().min(3).max(3),
  notes: z.string().optional().nullable()
})

type ExpenseFormValues = z.infer<typeof expenseSchema>

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

interface ExpenseFormProps {
  onSuccess: () => void
  onCancel: () => void
}

export function ExpenseForm({ onSuccess, onCancel }: ExpenseFormProps): React.ReactElement {
  const { t } = useTranslation()
  const { snack, showError, showSuccess, hideSnackbar } = useSnackbar()

  const [properties, setProperties] = useState<Property[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [newCategoryKey, setNewCategoryKey] = useState<string>('')

  const defaultValues: ExpenseFormValues = {
    property_id: null,
    category_id: 0,
    expense_date: new Date().toISOString().split('T')[0],
    vendor_name: '',
    amount: 0,
    currency: 'JOD',
    notes: ''
  }

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting }
  } = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseSchema),
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
        console.error('Failed to load properties/categories:', err)
      }
    }
    load()
  }, [])

  const selectedPropertyId = watch('property_id')
  const selectedCurrency = watch('currency')
  const watchedAmount = watch('amount')
  const conversions = useCurrencyConversion(watchedAmount, selectedCurrency)
  const primaryConversion =
    conversions.find((c) => c.currency === 'USD' && c.currency !== selectedCurrency) ?? null

  // Lock currency to the selected property (BR-13); when no property, keep the editable default.
  useEffect(() => {
    if (selectedPropertyId) {
      const prop = properties.find((p) => p.id === selectedPropertyId)
      if (prop) setValue('currency', prop.currency)
    }
  }, [selectedPropertyId, properties, setValue])

  const handleAddCategory = async (): Promise<void> => {
    const key = newCategoryKey.trim()
    if (!key) return
    try {
      const result = await window.api.expenseCategories.create({ name_key: key })
      const fresh = (await window.api.expenseCategories.list()) as Category[]
      setCategories(fresh)
      setValue('category_id', result.id)
      setNewCategoryKey('')
    } catch (err: unknown) {
      console.error(err)
      const msg = err instanceof Error ? err.message : ''
      if (msg === 'EXPENSE_CATEGORY_DUPLICATE') showError('expense.categoryExists')
      else showError('common.saveError')
    }
  }

  const onSubmit = async (data: ExpenseFormValues): Promise<void> => {
    try {
      await window.api.expenses.create({
        property_id: data.property_id ?? null,
        category_id: data.category_id,
        expense_date: data.expense_date,
        vendor_name: data.vendor_name ?? null,
        amount: data.amount,
        currency: data.currency,
        notes: data.notes ?? null
      })
      showSuccess('common.saveSuccess')
      onSuccess()
    } catch (err: unknown) {
      console.error(err)
      const msg = err instanceof Error ? err.message : ''
      if (msg === 'EXPENSE_CURRENCY_MISMATCH') {
        setError('amount', { type: 'manual', message: t('expense.currencyMismatch') })
      } else if (msg === 'EXPENSE_AMOUNT_INVALID') {
        setError('amount', { type: 'manual', message: t('expense.amountRequired') })
      } else if (msg === 'EXPENSE_CATEGORY_NOT_FOUND') {
        setError('category_id', { type: 'manual', message: t('expense.categoryRequired') })
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
            <FormControl fullWidth>
              <InputLabel>{t('expense.propertyOptional')}</InputLabel>
              <Controller
                name="property_id"
                control={control}
                render={({ field }) => (
                  <Select
                    label={t('expense.propertyOptional')}
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
              <InputLabel>{t('expense.category')}</InputLabel>
              <Controller
                name="category_id"
                control={control}
                render={({ field }) => (
                  <Select
                    {...field}
                    label={t('expense.category')}
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
                <FormHelperText>{t(`expense.${errors.category_id.message}`)}</FormHelperText>
              )}
            </FormControl>
          </Grid>

          {/* Inline new-category creation (FR-EXP-03) */}
          <Grid size={{ xs: 12 }}>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
              <TextField
                label={t('expense.newCategory')}
                placeholder={t('common.newCategoryName')}
                value={newCategoryKey}
                onChange={(e) => setNewCategoryKey(e.target.value)}
                size="small"
                sx={{ flex: 1 }}
              />
              <Button
                variant="outlined"
                size="small"
                onClick={handleAddCategory}
                disabled={!newCategoryKey.trim()}
                sx={{ py: 0.9 }}
              >
                {t('common.addCategory')}
              </Button>
            </Box>
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <Controller
              name="expense_date"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label={t('expense.expenseDate')}
                  type="date"
                  fullWidth
                  slotProps={{ inputLabel: { shrink: true } }}
                  error={!!errors.expense_date}
                  helperText={
                    errors.expense_date ? t(`expense.${errors.expense_date.message}`) : ''
                  }
                />
              )}
            />
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
            {selectedPropertyId ? (
              <CurrencyInput
                name="amount"
                control={control}
                label={t('expense.amount')}
                currency={selectedCurrency}
                required
                conversion={primaryConversion}
                noRateLabel={t('common.noRateAvailable')}
              />
            ) : (
              <AmountField
                name="amount"
                control={control}
                label={t('expense.amount')}
                endAdornment={<strong>{selectedCurrency}</strong>}
              />
            )}
          </Grid>

          {/* Currency is read-only when a property locks it; editable for general expenses. */}
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

          <Grid size={{ xs: 12 }}>
            <Controller
              name="notes"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  value={field.value || ''}
                  label={t('contract.notes')}
                  multiline
                  rows={2}
                  fullWidth
                />
              )}
            />
          </Grid>

          <Grid size={{ xs: 12 }}>
            <Typography variant="caption" color="text.secondary">
              {t('expense.receiptNote')}
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
