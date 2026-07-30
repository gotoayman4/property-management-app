import { zodResolver } from '@hookform/resolvers/zod'
import {
  Alert,
  Box,
  Button,
  Divider,
  FormControl,
  FormControlLabel,
  FormLabel,
  Grid,
  InputLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  TextField,
  Typography
} from '@mui/material'
import React, { useEffect, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { AmountField } from '../../components/AmountField'
import { CurrencyInput } from '../../components/CurrencyInput'
import { FormField } from '../../components/FormField'
import { addYear, addYears, round2 } from '../../utils/contractDates'
import { AutoRenewSection } from './AutoRenewSection'
import type { IncreaseMode } from './ContractForm'
import { EscalationScheduleEditor, type EscalationRow } from './EscalationScheduleEditor'
import { RenewalIncrementPanel } from './RenewalIncrementPanel'

/**
 * INTENT: Renew an existing contract in place — extends the term, optionally changes the rent
 *         amount, and switches between simple flat % and multi-year variable escalation
 *         (FR-CON-04, FR-CON-13; SRS §11.3 / §11.3b).
 * CONSTRAINT: Property and tenant are immutable in renewal (D5) — they are not part of the form.
 *             The prior term + schedule is snapshotted server-side in contract_history.
 * DECISION: A dedicated form instead of a mode on ContractForm (which is already at the 500-line
 *           limit). Inlines increase-mode toggle (ContractIncreaseMode is non-generic and expects
 *           ContractFormValues).
 */

const renewalSchema = z
  .object({
    new_start_date: z.string().min(1, 'startDateRequired'),
    new_end_date: z.string().min(1, 'endDateRequired'),
    rent_amount: z.number().positive('rentRequired'),
    security_deposit: z.number().nonnegative().default(0.0),
    annual_increase_percent: z.number().min(0).max(100).optional().nullable(),
    payment_frequency: z
      .enum(['monthly', 'quarterly', 'every_4_months', 'semi-annual', 'annual'])
      .default('monthly'),
    payment_method: z.string().optional().nullable(),
    auto_renew: z.number().int().min(0).max(1).default(0),
    auto_renew_increase_percent: z.number().min(0).max(100).optional().nullable(),
    notes: z.string().optional().nullable()
  })
  .refine((d) => new Date(d.new_end_date) > new Date(d.new_start_date), {
    message: 'renewalEndBeforeStart',
    path: ['new_end_date']
  })

type RenewalFormValues = z.input<typeof renewalSchema>
type RenewalFormOutput = z.output<typeof renewalSchema>

export interface RenewalSourceContract {
  id: number
  contract_number: string
  start_date: string
  end_date: string
  rent_amount: number
  currency: string
  security_deposit: number | null
  has_variable_escalation: number
  contract_term_years: number
  annual_increase_percent: number | null
  notes: string | null
  property_name: string
  tenant_fullname: string
}

export interface RenewalSourceScheduleRow {
  year_number: number
  effective_start_date: string
  rent_amount: number
  increase_percent_applied: number | null
  notes?: string | null
}

interface ContractRenewalFormProps {
  sourceContract: RenewalSourceContract
  sourceSchedule: RenewalSourceScheduleRow[]
  onSuccess: () => void
  onCancel: () => void
}

export function ContractRenewalForm({
  sourceContract,
  sourceSchedule,
  onSuccess,
  onCancel
}: ContractRenewalFormProps): React.ReactElement {
  const { t, i18n } = useTranslation()
  const isRtl = i18n.language === 'ar'
  const [increaseMode, setIncreaseMode] = useState<IncreaseMode>(
    sourceContract.has_variable_escalation === 1 ? 'variable' : 'flat'
  )
  const [schedule, setSchedule] = useState<EscalationRow[]>(
    sourceSchedule.map((r) => ({
      year_number: r.year_number,
      effective_start_date: r.effective_start_date,
      rent_amount: r.rent_amount,
      increase_percent_applied: r.increase_percent_applied ?? 0,
      notes: r.notes ?? undefined
    }))
  )

  // Default the renewal start date to the current end date (the natural next-term start).
  const defaultStartDate = sourceContract.end_date
  // Smart end-date default: prior term duration (whole years) added to the new start date, so the
  // user rarely has to hand-type it. contract_term_years is >= 1 (flat contracts default to 1).
  const defaultEndDate = addYears(defaultStartDate, Math.max(sourceContract.contract_term_years, 1))

  const defaultValues: RenewalFormValues = {
    new_start_date: defaultStartDate,
    new_end_date: defaultEndDate,
    rent_amount: sourceContract.rent_amount,
    security_deposit: sourceContract.security_deposit ?? 0,
    annual_increase_percent: sourceContract.annual_increase_percent ?? null,
    payment_frequency: 'monthly',
    payment_method: null,
    auto_renew: 0,
    auto_renew_increase_percent: null,
    notes: sourceContract.notes ?? ''
  }

  // One-time renewal adjustment note produced by the increment calculator (appended on submit).
  const [oneTimeDescription, setOneTimeDescription] = useState<string | null>(null)

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting }
  } = useForm<RenewalFormValues, unknown, RenewalFormOutput>({
    resolver: zodResolver(renewalSchema),
    defaultValues
  })

  const startDate = watch('new_start_date')
  const rentAmount = watch('rent_amount')
  const currency = sourceContract.currency

  // When entering variable mode, seed a default 3-year schedule if none was inherited.
  useEffect(() => {
    if (increaseMode === 'variable' && schedule.length === 0 && startDate) {
      setSchedule([
        {
          year_number: 1,
          effective_start_date: startDate,
          rent_amount: round2(rentAmount),
          increase_percent_applied: 0
        },
        {
          year_number: 2,
          effective_start_date: addYear(startDate),
          rent_amount: round2(rentAmount * 1.05),
          increase_percent_applied: 5
        },
        {
          year_number: 3,
          effective_start_date: addYear(addYear(startDate)),
          rent_amount: round2(rentAmount * 1.05 * 1.05),
          increase_percent_applied: 5
        }
      ])
    }
    // Re-sync year-1 effective date when the renewal start date changes (BR-17 compliance).
    if (increaseMode === 'variable' && schedule.length > 0 && startDate) {
      setSchedule((prev) =>
        prev.map((row, idx) => (idx === 0 ? { ...row, effective_start_date: startDate } : row))
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [increaseMode, startDate])

  const onSubmit = async (data: RenewalFormOutput): Promise<void> => {
    // Append the one-time adjustment description (if any) to the renewal notes.
    const combinedNotes = [data.notes?.trim() || '', oneTimeDescription || '']
      .filter(Boolean)
      .join(' — ')
    const payload = {
      contract_id: sourceContract.id,
      new_start_date: data.new_start_date,
      new_end_date: data.new_end_date,
      rent_amount: data.rent_amount,
      security_deposit: data.security_deposit,
      has_variable_escalation: increaseMode === 'variable' ? 1 : 0,
      contract_term_years: increaseMode === 'variable' ? Math.max(schedule.length, 1) : 1,
      annual_increase_percent:
        increaseMode === 'flat' ? (data.annual_increase_percent ?? null) : null,
      payment_frequency: data.payment_frequency,
      payment_method: data.payment_method ?? null,
      // Auto-renew is flat-mode only; force it off when renewing into variable mode.
      auto_renew: increaseMode === 'variable' ? 0 : data.auto_renew,
      auto_renew_increase_percent:
        increaseMode === 'variable' ? null : (data.auto_renew_increase_percent ?? null),
      schedule:
        increaseMode === 'variable'
          ? schedule.map((r) => ({
              year_number: r.year_number,
              effective_start_date: r.effective_start_date,
              rent_amount: r.rent_amount,
              increase_percent_applied: r.increase_percent_applied,
              notes: r.notes
            }))
          : undefined,
      notes: combinedNotes || null
    }
    try {
      await window.api.contracts.renew(payload)
      onSuccess()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      if (msg === 'RENEWAL_END_BEFORE_START') {
        setError('new_end_date', { type: 'manual', message: t('contract.renewalEndBeforeStart') })
      } else if (msg === 'CONTRACT_NOT_RENEWABLE') {
        setError('root', { type: 'manual', message: t('contract.notEligibleForRenewal') })
      } else if (
        msg.startsWith('YEAR') ||
        msg.startsWith('SCHEDULE') ||
        msg === 'PERCENT_OUT_OF_RANGE' ||
        msg === 'RENT_NON_POSITIVE'
      ) {
        setError('root', { type: 'manual', message: t('contract.escalationInvalid') })
      } else {
        setError('root', { type: 'manual', message: t('common.saveError') })
      }
    }
  }

  const rootError = (errors as { root?: { message?: string } }).root?.message

  return (
    <Box component="form" onSubmit={handleSubmit(onSubmit)}>
      <Alert severity="info" sx={{ mb: 2 }}>
        <Typography variant="body2">
          {t('contract.renewSourceInfo', {
            number: sourceContract.contract_number,
            property: sourceContract.property_name,
            tenant: sourceContract.tenant_fullname
          })}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {t('contract.renewPriorTerm', {
            start: sourceContract.start_date,
            end: sourceContract.end_date
          })}
        </Typography>
      </Alert>

      {rootError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {rootError}
        </Alert>
      )}

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <FormField
            name="new_start_date"
            control={control}
            errors={errors}
            label={t('contract.renewalStartDate')}
            required
            errorNamespace="contract"
            type="date"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <FormField
            name="new_end_date"
            control={control}
            errors={errors}
            label={t('contract.renewalNewEndDate')}
            required
            errorNamespace="contract"
            type="date"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <CurrencyInput
            name="rent_amount"
            control={control}
            label={t('contract.renewalNewRent')}
            currency={currency}
            required
            noRateLabel={t('common.noRateAvailable')}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <AmountField
            name="security_deposit"
            control={control}
            label={t('contract.securityDeposit')}
            min={0}
            endAdornment={<strong>{currency}</strong>}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <FormControl fullWidth>
            <InputLabel>{t('contract.frequency')}</InputLabel>
            <Controller
              name="payment_frequency"
              control={control}
              render={({ field }) => (
                <Select {...field} label={t('contract.frequency')}>
                  <MenuItem value="monthly">{t('contract.monthly')}</MenuItem>
                  <MenuItem value="quarterly">{t('contract.quarterly')}</MenuItem>
                  <MenuItem value="every_4_months">{t('contract.every_4_months')}</MenuItem>
                  <MenuItem value="semi-annual">{t('contract.semiAnnual')}</MenuItem>
                  <MenuItem value="annual">{t('contract.annual')}</MenuItem>
                </Select>
              )}
            />
          </FormControl>
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <Controller
            name="payment_method"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                value={field.value ?? ''}
                onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.value)}
                label={t('contract.paymentMethod')}
                fullWidth
              />
            )}
          />
        </Grid>

        {/* Increase mode toggle (FR-CON-09 / FR-CON-13) */}
        <Grid size={{ xs: 12 }}>
          <Divider sx={{ my: 1 }} />
          <FormControl component="fieldset">
            <FormLabel component="legend">{t('contract.increaseMode')}</FormLabel>
            <RadioGroup
              row
              value={increaseMode}
              onChange={(e) => setIncreaseMode(e.target.value as IncreaseMode)}
              sx={{ flexDirection: isRtl ? 'row-reverse' : 'row' }}
            >
              <FormControlLabel value="flat" control={<Radio />} label={t('contract.flatMode')} />
              <FormControlLabel
                value="variable"
                control={<Radio />}
                label={t('contract.variableMode')}
              />
            </RadioGroup>
          </FormControl>
        </Grid>

        {increaseMode === 'flat' ? (
          <RenewalIncrementPanel
            baseRent={sourceContract.rent_amount}
            currency={currency}
            onComputed={(newRent, regularPercent) => {
              setValue('rent_amount', newRent, { shouldValidate: true })
              setValue('annual_increase_percent', regularPercent)
            }}
            onOneTimeDescriptionChange={setOneTimeDescription}
          />
        ) : (
          <Grid size={{ xs: 12 }}>
            <EscalationScheduleEditor
              rows={schedule}
              onChange={setSchedule}
              contractStartDate={startDate}
              baseRent={rentAmount}
              currency={currency}
            />
          </Grid>
        )}

        {/* Arm auto-renewal for the next cycle (flat mode only). */}
        <AutoRenewSection control={control} disabled={increaseMode === 'variable'} />

        {/* Old → new comparison so the change is verifiable at a glance. */}
        <Grid size={{ xs: 12 }}>
          <Divider sx={{ my: 1 }} />
          <Typography variant="subtitle2" gutterBottom>
            {t('contract.renewalComparison')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('contract.renewalComparisonTerm', {
              oldStart: sourceContract.start_date,
              oldEnd: sourceContract.end_date,
              newStart: watch('new_start_date'),
              newEnd: watch('new_end_date')
            })}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('contract.renewalComparisonRent', {
              oldRent: sourceContract.rent_amount,
              newRent: round2(Number(watch('rent_amount')) || 0),
              currency
            })}
          </Typography>
        </Grid>

        <Grid size={{ xs: 12 }}>
          <FormField
            name="notes"
            control={control}
            errors={errors}
            label={t('contract.notes')}
            errorNamespace="contract"
            multiline
            rows={2}
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
          {t('contract.renew')}
        </Button>
      </Box>
    </Box>
  )
}
