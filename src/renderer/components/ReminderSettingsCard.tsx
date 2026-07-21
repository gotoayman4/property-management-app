/**
 * INTENT: Reminder-days configuration card — lets the user customise how many days
 *         before a due date, contract end, document expiry, or recurring expense
 *         the app should send a notification.
 * CONSTRAINT (AGENTS.md): i18n keys only, theme.palette tokens, logical CSS.
 * DECISION: Extracted from Settings.tsx to keep it under the 500-line limit.
 */
import { Card, CardContent, Alert, TextField, Typography } from '@mui/material'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSnackbar } from '../hooks/useSnackbar'

interface ReminderSettings {
  reminder_days_before_due: number
  reminder_days_before_contract_end: number
  reminder_days_before_document_expiry: number
  reminder_days_before_recurring_expense: number
}

interface ReminderSettingsCardProps {
  /** When true, renders content without Card/CardContent wrapper (for embedding in SettingsSection). */
  compact?: boolean
}

const SPINNER_LESS = {
  '&::-webkit-outer-spin-button, &::-webkit-inner-spin-button': {
    WebkitAppearance: 'none',
    margin: 0
  },
  MozAppearance: 'textfield'
} as const

export default function ReminderSettingsCard({
  compact = false
}: ReminderSettingsCardProps): React.ReactElement {
  const { t } = useTranslation()
  const { showSuccess, showError } = useSnackbar()
  const [settings, setSettings] = useState<ReminderSettings | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load(): Promise<void> {
      try {
        const data = (await window.api.settings.get()) as ReminderSettings
        if (!cancelled) setSettings(data)
      } catch {
        if (!cancelled) showError('common.error')
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [showError])

  const updateField = async (field: keyof ReminderSettings, value: number): Promise<void> => {
    try {
      await window.api.settings.update({ [field]: value })
      setSettings((prev) => (prev ? { ...prev, [field]: value } : prev))
      showSuccess('common.saveSuccess')
    } catch {
      showError('common.saveError')
    }
  }

  if (!settings) return <></>

  const content = (
    <>
      <Alert severity="info" sx={{ mb: 2 }}>
        {t('settings.reminderHelp')}
      </Alert>

      <TextField
        fullWidth
        type="text"
        inputMode="decimal"
        label={t('settings.reminderDaysBeforeDue')}
        value={settings.reminder_days_before_due}
        onChange={(e) => updateField('reminder_days_before_due', Number(e.target.value))}
        slotProps={{
          htmlInput: {
            dir: 'ltr',
            min: 0,
            max: 90,
            sx: SPINNER_LESS
          }
        }}
        sx={{ mb: 2 }}
      />
      <TextField
        fullWidth
        type="text"
        inputMode="decimal"
        label={t('settings.reminderDaysBeforeContractEnd')}
        value={settings.reminder_days_before_contract_end}
        onChange={(e) => updateField('reminder_days_before_contract_end', Number(e.target.value))}
        slotProps={{
          htmlInput: {
            dir: 'ltr',
            min: 0,
            max: 365,
            sx: SPINNER_LESS
          }
        }}
        sx={{ mb: 2 }}
      />
      <TextField
        fullWidth
        type="text"
        inputMode="decimal"
        label={t('settings.reminderDaysBeforeDocumentExpiry')}
        value={settings.reminder_days_before_document_expiry}
        onChange={(e) =>
          updateField('reminder_days_before_document_expiry', Number(e.target.value))
        }
        slotProps={{
          htmlInput: {
            dir: 'ltr',
            min: 0,
            max: 365,
            sx: SPINNER_LESS
          }
        }}
        sx={{ mb: 2 }}
      />
      <TextField
        fullWidth
        type="text"
        inputMode="decimal"
        label={t('settings.reminderDaysBeforeRecurringExpense')}
        value={settings.reminder_days_before_recurring_expense}
        onChange={(e) =>
          updateField('reminder_days_before_recurring_expense', Number(e.target.value))
        }
        slotProps={{
          htmlInput: {
            dir: 'ltr',
            min: 0,
            max: 30,
            sx: SPINNER_LESS
          }
        }}
      />
    </>
  )

  if (compact) return content

  return (
    <Card>
      <CardContent sx={{ p: 3 }}>
        <Typography variant="h5" sx={{ mb: 2.5 }}>
          {t('settings.reminders')}
        </Typography>
        {content}
      </CardContent>
    </Card>
  )
}
