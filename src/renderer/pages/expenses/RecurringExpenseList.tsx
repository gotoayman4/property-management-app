/**
 * INTENT: List and manage recurring expense templates (FR-REC-08). Shows all templates with
 *         status (active/paused/ended), frequency, and next due date. Two tabs:
 *           - All Templates: CRUD + pause/resume/end
 *           - Pending Due (FR-REC-05/06, §9.9.3): due instances with Record Expense + Skip
 * CONSTRAINT: Uses StandardTable + StandardDialog + i18n keys only. Logical CSS via shared
 *             components (no physical left/right in this file).
 */
import {
  Autorenew as RecurringIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Pause as PauseIcon,
  PlayArrow as ResumeIcon,
  Stop as StopIcon
} from '@mui/icons-material'
import { Box, Button, Chip, IconButton, Tab, Tabs, Tooltip } from '@mui/material'
import { GridColDef } from '@mui/x-data-grid'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ConfirmDialog from '../../components/ConfirmDialog'
import GlobalSnackbar from '../../components/GlobalSnackbar'
import PageHeader from '../../components/PageHeader'
import StandardDialog from '../../components/StandardDialog'
import StandardTable from '../../components/StandardTable'
import { useSnackbar } from '../../hooks/useSnackbar'
import PendingRecurringInstances from './PendingRecurringInstances'
import { RecurringExpenseForm } from './RecurringExpenseForm'

interface RecurringTemplate {
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
  is_active: number
  last_generated_date: string | null
  next_due_date: string | null
  property_name?: string
  property_code?: string
  category_name_key?: string
}

const FREQUENCY_KEYS: Record<string, string> = {
  daily: 'recurringExpense.frequencyDaily',
  weekly: 'recurringExpense.frequencyWeekly',
  monthly: 'contract.monthly',
  quarterly: 'contract.quarterly',
  semi_annual: 'contract.semiAnnual',
  annual: 'contract.annual'
}

function todayISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function RecurringExpenseList(): React.ReactElement {
  const { t, i18n } = useTranslation()
  const isRtl = i18n.language === 'ar'
  const { snack, showError, showSuccess, hideSnackbar } = useSnackbar()

  const [templates, setTemplates] = useState<RecurringTemplate[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<number>(0)
  // Bump this counter to force the Pending tab to refresh after a confirm/skip.
  const [pendingRefreshKey, setPendingRefreshKey] = useState<number>(0)

  const [openForm, setOpenForm] = useState<boolean>(false)
  const [editTarget, setEditTarget] = useState<RecurringTemplate | null>(null)
  const [confirmAction, setConfirmAction] = useState<{
    type: 'pause' | 'resume' | 'end'
    template: RecurringTemplate
  } | null>(null)

  const fetchTemplates = useCallback(async (): Promise<void> => {
    try {
      setLoading(true)
      setError(null)
      const data = (await window.api.recurringExpenses.list()) as RecurringTemplate[]
      setTemplates(data)
    } catch {
      setError(t('common.error'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchTemplates()
  }, [fetchTemplates, pendingRefreshKey])

  const handlePauseResume = async (template: RecurringTemplate): Promise<void> => {
    setConfirmAction(null)
    try {
      if (template.is_active) {
        await window.api.recurringExpenses.deactivate(template.id)
      } else {
        await window.api.recurringExpenses.activate(template.id)
      }
      showSuccess('common.saveSuccess')
      fetchTemplates()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      if (msg === 'TEMPLATE_ENDED') showError('recurringExpense.templateEnded')
      else showError('common.saveError')
    }
  }

  const handleEnd = async (template: RecurringTemplate): Promise<void> => {
    setConfirmAction(null)
    try {
      await window.api.recurringExpenses.update({
        id: template.id,
        property_id: template.property_id,
        category_id: template.category_id,
        name: template.name,
        amount: template.amount,
        currency: template.currency,
        frequency: template.frequency,
        day_of_month: template.day_of_month,
        start_date: template.start_date,
        end_date: todayISO(),
        vendor_name: template.vendor_name,
        notes: template.notes
      })
      showSuccess('common.saveSuccess')
      fetchTemplates()
    } catch {
      showError('common.saveError')
    }
  }

  const getStatus = (
    template: RecurringTemplate
  ): { label: string; color: 'success' | 'warning' | 'default' } => {
    const today = todayISO()
    if (template.end_date && template.end_date < today) {
      return { label: t('recurringExpense.statusEnded'), color: 'default' }
    }
    if (!template.is_active) return { label: t('recurringExpense.statusPaused'), color: 'warning' }
    return { label: t('recurringExpense.statusActive'), color: 'success' }
  }

  const isEnded = (template: RecurringTemplate): boolean =>
    !template.is_active || (template.end_date !== null && template.end_date < todayISO())

  const activeTemplates = templates.filter((t) => t.is_active && !isEnded(t))
  const displayTemplates = tab === 0 ? templates : activeTemplates

  const columns: GridColDef[] = [
    { field: 'name', headerName: t('recurringExpense.name'), flex: 1.5 },
    {
      field: 'property_name',
      headerName: t('common.property'),
      flex: 1.2,
      renderCell: (params) => {
        const row = params.row as RecurringTemplate
        return row.property_name
          ? `${row.property_name} (${row.property_code})`
          : t('common.general')
      }
    },
    {
      field: 'category_name_key',
      headerName: t('common.category'),
      flex: 1,
      renderCell: (params) => {
        const key = (params.row as RecurringTemplate).category_name_key
        return key ? t(key) : '—'
      }
    },
    {
      field: 'amount',
      headerName: t('common.amount'),
      flex: 1,
      renderCell: (params) => {
        const row = params.row as RecurringTemplate
        return `${row.amount.toLocaleString(i18n.language === 'ar' ? 'ar-u-nu-latn' : 'en')} ${row.currency}`
      }
    },
    {
      field: 'frequency',
      headerName: t('recurringExpense.frequency'),
      flex: 1,
      renderCell: (params) => {
        const freq = (params.row as RecurringTemplate).frequency
        return t(FREQUENCY_KEYS[freq] ?? freq)
      }
    },
    {
      field: 'next_due_date',
      headerName: t('recurringExpense.nextDue'),
      flex: 1.1,
      renderCell: (params) => (params.row as RecurringTemplate).next_due_date ?? '—'
    },
    {
      field: 'status',
      headerName: t('common.status'),
      flex: 0.9,
      renderCell: (params) => {
        const status = getStatus(params.row as RecurringTemplate)
        return <Chip label={status.label} color={status.color} size="small" variant="outlined" />
      }
    },
    {
      field: 'actions',
      headerName: t('common.actions'),
      flex: 1.5,
      sortable: false,
      renderCell: (params) => {
        const row = params.row as RecurringTemplate
        if (isEnded(row)) return null
        return (
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Tooltip title={t('common.edit')}>
              <IconButton
                size="small"
                color="primary"
                onClick={() => {
                  setEditTarget(row)
                  setOpenForm(true)
                }}
                aria-label={t('common.edit')}
              >
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            {row.is_active ? (
              <Tooltip title={t('recurringExpense.pause')}>
                <IconButton
                  size="small"
                  color="warning"
                  onClick={() => setConfirmAction({ type: 'pause', template: row })}
                  aria-label={t('recurringExpense.pause')}
                >
                  <PauseIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            ) : (
              <Tooltip title={t('recurringExpense.resume')}>
                <IconButton
                  size="small"
                  color="success"
                  onClick={() => setConfirmAction({ type: 'resume', template: row })}
                  aria-label={t('recurringExpense.resume')}
                >
                  <ResumeIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title={t('recurringExpense.end')}>
              <IconButton
                size="small"
                color="error"
                onClick={() => setConfirmAction({ type: 'end', template: row })}
                aria-label={t('recurringExpense.end')}
              >
                <StopIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        )
      }
    }
  ]

  return (
    <Box sx={{ py: 3, px: 4 }}>
      <PageHeader
        icon={<RecurringIcon />}
        title={t('recurringExpense.title')}
        subtitle={t('recurringExpense.subtitle')}
        action={
          <Button
            variant="contained"
            startIcon={isRtl ? undefined : <AddIcon />}
            endIcon={isRtl ? <AddIcon /> : undefined}
            onClick={() => {
              setEditTarget(null)
              setOpenForm(true)
            }}
            sx={{ px: 3, py: 1, borderRadius: 2 }}
          >
            {t('recurringExpense.add')}
          </Button>
        }
      />

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
        <Tab label={t('recurringExpense.tabAll')} />
        <Tab label={t('recurringExpense.tabActive')} />
        <Tab label={t('recurringExpense.tabPending')} />
      </Tabs>

      {tab === 2 ? (
        <PendingRecurringInstances
          refreshKey={pendingRefreshKey}
          onChanged={() => {
            setPendingRefreshKey((k) => k + 1)
            fetchTemplates()
          }}
        />
      ) : (
        <StandardTable
          columns={columns}
          rows={displayTemplates}
          loading={loading}
          error={error ?? undefined}
          onRetry={fetchTemplates}
          emptyMessage={t('recurringExpense.noTemplates')}
        />
      )}

      <StandardDialog
        open={openForm}
        onClose={() => {
          setOpenForm(false)
          setEditTarget(null)
        }}
        title={editTarget ? t('recurringExpense.editTitle') : t('recurringExpense.add')}
        maxWidth="md"
      >
        <RecurringExpenseForm
          template={editTarget}
          onSuccess={() => {
            setOpenForm(false)
            setEditTarget(null)
            fetchTemplates()
          }}
          onCancel={() => {
            setOpenForm(false)
            setEditTarget(null)
          }}
        />
      </StandardDialog>

      <ConfirmDialog
        open={confirmAction !== null}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          if (!confirmAction) return
          if (confirmAction.type === 'end') handleEnd(confirmAction.template)
          else handlePauseResume(confirmAction.template)
        }}
        title={
          confirmAction?.type === 'pause'
            ? t('recurringExpense.confirmPause')
            : confirmAction?.type === 'resume'
              ? t('recurringExpense.confirmResume')
              : t('recurringExpense.confirmEnd')
        }
        message={
          confirmAction?.type === 'pause'
            ? t('recurringExpense.pauseHelp')
            : confirmAction?.type === 'resume'
              ? t('recurringExpense.resumeHelp')
              : t('recurringExpense.endHelp')
        }
        severity={confirmAction?.type === 'end' ? 'error' : 'warning'}
      />

      <GlobalSnackbar state={snack} onClose={hideSnackbar} />
    </Box>
  )
}
