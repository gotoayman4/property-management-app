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
  Tabs,
  Tab
} from '@mui/material'
import React, { useEffect, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { AmountField } from '../../components/AmountField'
import { CurrencyInput } from '../../components/CurrencyInput'
import EntityDocumentsTab from '../../components/EntityDocumentsTab'
import { FormField } from '../../components/FormField'
import GlobalSnackbar from '../../components/GlobalSnackbar'
import { useSnackbar } from '../../hooks/useSnackbar'
import { notifyDataChanged } from '../../utils/eventBus'
import { ContractIncreaseMode } from './ContractIncreaseMode'
import type { EscalationRow } from './EscalationScheduleEditor'

/**
 * INTENT: Create/edit a contract with optional multi-year variable rent escalation (FR-CON-09..13).
 * CONSTRAINT: When increase mode = 'variable', the escalation schedule is submitted via a separate
 *             contracts:setEscalation call after the contract is created (the schedule needs the
 *             contract id). Currency is locked to the property's currency.
 */

const contractSchema = z
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
    status: z.enum(['draft', 'active', 'expired', 'renewing', 'cancelled']).default('draft'),
    annual_increase_percent: z.number().min(0).max(100).optional().nullable(),
    payment_method: z.string().optional().nullable(),
    notes: z.string().optional().nullable()
  })
  .refine((d) => new Date(d.end_date) > new Date(d.start_date), {
    message: 'endDateAfterStart',
    path: ['end_date']
  })

// Form values hold raw user input (schema INPUT shape); `onSubmit` receives the OUTPUT shape.
export type ContractFormValues = z.input<typeof contractSchema>
export type ContractFormOutput = z.output<typeof contractSchema>

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
interface Contract {
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
  status: 'draft' | 'active' | 'expired' | 'renewing' | 'cancelled'
  notes?: string
}

interface ContractFormProps {
  contract: Contract | null
  onSuccess: () => void
  onCancel: () => void
}

export type IncreaseMode = 'flat' | 'variable'

export function ContractForm({
  contract,
  onSuccess,
  onCancel
}: ContractFormProps): React.ReactElement {
  const { t } = useTranslation()
  const { snack, showError, showSuccess, hideSnackbar } = useSnackbar()
  const isEdit = !!contract
  const [createdEntity, setCreatedEntity] = useState<{ id: number } | null>(null)
  const effectiveIsEdit = isEdit || !!createdEntity
  const currentEntityId = contract?.id ?? createdEntity?.id ?? null
  const [activeTab, setActiveTab] = useState(0)

  const [properties, setProperties] = useState<Property[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [increaseMode, setIncreaseMode] = useState<IncreaseMode>('flat')
  const [schedule, setSchedule] = useState<EscalationRow[]>([])

  const defaultValues: Partial<ContractFormValues> = contract
    ? {
        contract_number: contract.contract_number,
        property_id: contract.property_id,
        tenant_id: contract.tenant_id,
        start_date: contract.start_date,
        end_date: contract.end_date,
        rent_amount: contract.rent_amount,
        currency: contract.currency,
        payment_frequency: contract.payment_frequency,
        security_deposit: contract.security_deposit,
        status: contract.status,
        notes: contract.notes || ''
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
  } = useForm<ContractFormValues, unknown, ContractFormOutput>({
    resolver: zodResolver(contractSchema),
    defaultValues
  })

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const propsData = (await window.api.properties.list()) as Property[]
        const tenantsData = (await window.api.tenants.list({ is_active: 1 })) as Tenant[]
        setProperties(
          propsData.filter(
            (p) => p.status === 'vacant' || (contract && p.id === contract.property_id)
          )
        )
        setTenants(tenantsData)
      } catch (err) {
        console.error('Failed to load properties/tenants:', err)
      }
    }
    load()
  }, [contract])

  const selectedPropertyId = watch('property_id')
  const startDate = watch('start_date')
  const rentAmount = watch('rent_amount')
  const currency = watch('currency')

  // Auto-fill rent + currency from the selected property
  useEffect(() => {
    if (selectedPropertyId && !isEdit) {
      const prop = properties.find((p) => p.id === selectedPropertyId)
      if (prop) {
        setValue('rent_amount', prop.monthly_rent_default)
        setValue('currency', prop.currency)
      }
    }
  }, [selectedPropertyId, properties, isEdit, setValue])

  // When entering variable mode, seed a default 3-year schedule if empty
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
  }, [increaseMode, schedule.length, startDate, rentAmount])

  const onSubmit = async (data: ContractFormOutput): Promise<void> => {
    try {
      const base = {
        ...data,
        contract_term_years: increaseMode === 'variable' ? schedule.length : 1,
        has_variable_escalation: increaseMode === 'variable' ? 1 : 0
      }
      let newId: number
      if (isEdit && contract) {
        await window.api.contracts.update({ id: contract.id, ...base })
        newId = contract.id
      } else {
        const res = (await window.api.contracts.create(base)) as { id: number }
        newId = res.id
      }
      // Persist the multi-year schedule if variable mode (FR-CON-10)
      if (increaseMode === 'variable' && schedule.length >= 2) {
        await window.api.contracts.setEscalation({
          contract_id: newId,
          schedule: schedule.map((r) => ({
            year_number: r.year_number,
            effective_start_date: r.effective_start_date,
            rent_amount: r.rent_amount,
            increase_percent_applied: r.increase_percent_applied,
            notes: r.notes
          }))
        })
      }
      if (isEdit && contract) {
        showSuccess('common.saveSuccess')
        notifyDataChanged()
        onSuccess()
      } else {
        setCreatedEntity({ id: newId })
        showSuccess('common.saveSuccess')
        notifyDataChanged()
        onSuccess()
      }
    } catch (err: unknown) {
      console.error(err)
      const msg = err instanceof Error ? err.message : ''
      if (msg === 'CONTRACT_OVERLAPS')
        setError('property_id', { type: 'manual', message: t('contract.overlapError') })
      else if (msg === 'CONTRACT_NUMBER_DUPLICATE')
        setError('contract_number', { type: 'manual', message: t('contract.numberUnique') })
      else if (
        msg.startsWith('YEAR') ||
        msg.startsWith('SCHEDULE') ||
        msg === 'PERCENT_OUT_OF_RANGE' ||
        msg === 'RENT_NON_POSITIVE'
      ) {
        showError('contract.escalationInvalid')
      } else {
        showError('common.saveError')
      }
    }
  }

  return (
    <>
      {effectiveIsEdit && (
        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ mb: 1 }}>
          <Tab label={t('common.details')} />
          <Tab label={t('contractDetail.documents')} />
        </Tabs>
      )}
      <Box
        component="form"
        onSubmit={handleSubmit(onSubmit)}
        sx={{ mt: 1 }}
        hidden={activeTab !== 0}
      >
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <FormField
              name="contract_number"
              control={control}
              errors={errors}
              label={t('contract.contractNumber')}
              required
              errorNamespace="contract"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <FormControl fullWidth error={!!errors.status}>
              <InputLabel>{t('contract.status')}</InputLabel>
              <Controller
                name="status"
                control={control}
                render={({ field }) => (
                  <Select {...field} label={t('contract.status')}>
                    <MenuItem value="draft">{t('contract.draft')}</MenuItem>
                    <MenuItem value="active">{t('contract.active')}</MenuItem>
                    <MenuItem value="expired">{t('contract.expired')}</MenuItem>
                    <MenuItem value="cancelled">{t('contract.cancelled')}</MenuItem>
                  </Select>
                )}
              />
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <FormControl fullWidth error={!!errors.property_id}>
              <InputLabel>{t('contract.property')}</InputLabel>
              <Controller
                name="property_id"
                control={control}
                render={({ field }) => {
                  const hasOption = properties.some((p) => p.id === field.value)
                  return (
                    <Select
                      {...field}
                      label={t('contract.property')}
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
                <FormHelperText>{t(`contract.${errors.property_id.message}`)}</FormHelperText>
              )}
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <FormControl fullWidth error={!!errors.tenant_id}>
              <InputLabel>{t('contract.tenant')}</InputLabel>
              <Controller
                name="tenant_id"
                control={control}
                render={({ field }) => {
                  const hasOption = tenants.some((tn) => tn.id === field.value)
                  return (
                    <Select
                      {...field}
                      label={t('contract.tenant')}
                      value={hasOption ? field.value : ''}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    >
                      {tenants.map((tn) => (
                        <MenuItem key={tn.id} value={tn.id}>
                          {tn.fullname} ({tn.code})
                        </MenuItem>
                      ))}
                    </Select>
                  )
                }}
              />
              {errors.tenant_id && (
                <FormHelperText>{t(`contract.${errors.tenant_id.message}`)}</FormHelperText>
              )}
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <FormField
              name="start_date"
              control={control}
              errors={errors}
              label={t('contract.startDate')}
              required
              errorNamespace="contract"
              type="date"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <FormField
              name="end_date"
              control={control}
              errors={errors}
              label={t('contract.endDate')}
              required
              errorNamespace="contract"
              type="date"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <CurrencyInput
              name="rent_amount"
              control={control}
              label={t('contract.rentAmount')}
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
                    <MenuItem value="semi-annual">{t('contract.semiAnnual')}</MenuItem>
                    <MenuItem value="annual">{t('contract.annual')}</MenuItem>
                  </Select>
                )}
              />
            </FormControl>
          </Grid>

          <ContractIncreaseMode
            increaseMode={increaseMode}
            onIncreaseModeChange={setIncreaseMode}
            schedule={schedule}
            onScheduleChange={setSchedule}
            startDate={startDate}
            rentAmount={rentAmount}
            currency={currency}
            control={control}
          />

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
            mt: 4
          }}
        >
          {createdEntity ? (
            <>
              <Button variant="outlined" onClick={onCancel} disabled={isSubmitting}>
                {t('common.cancel')}
              </Button>
              <Button variant="contained" onClick={onSuccess} disabled={isSubmitting}>
                {t('common.close')}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outlined" onClick={onCancel} disabled={isSubmitting}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" variant="contained" disabled={isSubmitting}>
                {t('common.save')}
              </Button>
            </>
          )}
        </Box>
      </Box>
      {effectiveIsEdit && activeTab === 1 && currentEntityId !== null && (
        <EntityDocumentsTab entityType="contract" entityId={currentEntityId} />
      )}
      <GlobalSnackbar state={snack} onClose={hideSnackbar} />
    </>
  )
}

function addYear(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCFullYear(d.getUTCFullYear() + 1)
  return d.toISOString().split('T')[0]
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
