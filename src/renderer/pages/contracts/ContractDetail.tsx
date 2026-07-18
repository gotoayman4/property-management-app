/**
 * INTENT: Display full contract details across tabs: data, escalation schedule, audit history,
 *         and attached documents. The backend data comes from contracts:getDetail which returns
 *         { contract, schedule, history }.
 * CONSTRAINT: Uses PageHeader, StandardTable, and explicit dir props on dialogs (portal RTL).
 * DECISION: Tab loading is lazy — data fetched only when the tab is first activated.
 */
import {
  ArrowBack as BackIcon,
  Delete as DeleteIcon,
  Description as ContractIcon,
  ExpandMore as ExpandMoreIcon
} from '@mui/icons-material'
import {
  Box,
  Button,
  Chip,
  IconButton,
  Tab,
  Tabs,
  Tooltip,
  Typography,
  Card,
  CardContent,
  Grid,
  Collapse
} from '@mui/material'
import { GridColDef } from '@mui/x-data-grid'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import DocumentUploadForm from '../../components/DocumentUploadForm'
import GlobalSnackbar from '../../components/GlobalSnackbar'
import StandardTable from '../../components/StandardTable'
import { useSnackbar } from '../../hooks/useSnackbar'

interface ContractData {
  id: number
  contract_number: string
  property_id: number
  tenant_id: number
  start_date: string
  end_date: string
  rent_amount: number
  currency: string
  payment_frequency: string
  security_deposit: number | null
  status: string
  contract_term_years: number
  has_variable_escalation: number
  annual_increase_percent: number | null
  payment_method: string | null
  notes: string | null
  cancellation_reason: string | null
  property_name: string
  property_code: string
  tenant_fullname: string
  tenant_code: string
  created_at: string
}

interface EscalationRow {
  id: number
  year_number: number
  effective_start_date: string
  rent_amount: number
  increase_percent_applied: number | null
  notes: string | null
}

interface HistoryRow {
  id: number
  action_type: string
  previous_values_json: string | null
  changed_at: string
  changed_by_note: string | null
}

interface DocumentRow {
  id: number
  file_name: string
  mime_type: string
  file_size: number
  description: string | null
  issue_date: string | null
  expiry_date: string | null
  uploaded_at: string
}

const STATUS_COLORS: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  active: 'success',
  draft: 'warning',
  expired: 'error',
  terminated: 'default'
}

export default function ContractDetail(): React.ReactElement {
  const { t, i18n } = useTranslation()
  const isRtl = i18n.language === 'ar'
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { snack, showError, showSuccess, hideSnackbar } = useSnackbar()

  const [tab, setTab] = useState(0)
  const [contract, setContract] = useState<ContractData | null>(null)
  const [schedule, setSchedule] = useState<EscalationRow[]>([])
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [documents, setDocuments] = useState<DocumentRow[]>([])
  const [showUploadForm, setShowUploadForm] = useState<boolean>(false)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const fetchDetail = useCallback(async (): Promise<void> => {
    if (!id) return
    try {
      setLoading(true)
      setError(null)
      const data = (await window.api.contracts.getDetail(Number(id))) as {
        contract: ContractData
        schedule: EscalationRow[]
        history: HistoryRow[]
      }
      setContract(data.contract)
      setSchedule(data.schedule)
      setHistory(data.history)

      try {
        const docs = (await window.api.documents.list({
          entity_type: 'contract',
          entity_id: Number(id)
        })) as DocumentRow[]
        setDocuments(docs)
      } catch {
        setDocuments([])
      }
    } catch (err: unknown) {
      console.error(err)
      setError(t('common.error'))
    } finally {
      setLoading(false)
    }
  }, [id, t])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchDetail()
  }, [fetchDetail])

  const handleDeleteDocument = async (docId: number): Promise<void> => {
    try {
      await window.api.documents.delete(docId)
      showSuccess('common.deleteSuccess')
      setDocuments((prev) => prev.filter((d) => d.id !== docId))
    } catch {
      showError('common.deleteError')
    }
  }

  if (loading) {
    return (
      <Box sx={{ py: 3, px: 4 }}>
        <Typography>{t('common.loading')}</Typography>
      </Box>
    )
  }

  if (error || !contract) {
    return (
      <Box sx={{ py: 3, px: 4 }}>
        <Typography color="error">{error ?? t('common.error')}</Typography>
        <Button onClick={() => navigate('/contracts')} sx={{ mt: 2 }}>
          {t('common.back') ?? 'Back'}
        </Button>
      </Box>
    )
  }

  const scheduleColumns: GridColDef[] = [
    { field: 'year_number', headerName: t('contract.year'), flex: 0.7 },
    { field: 'effective_start_date', headerName: t('contract.effectiveDate'), flex: 1.2 },
    {
      field: 'rent_amount',
      headerName: t('contract.rentAmount'),
      flex: 1.2,
      renderCell: (params) =>
        `${(params.row as EscalationRow).rent_amount.toLocaleString()} ${contract.currency}`
    },
    {
      field: 'increase_percent_applied',
      headerName: t('contract.increasePercent'),
      flex: 1,
      renderCell: (params) => {
        const val = (params.row as EscalationRow).increase_percent_applied
        return val != null ? `${val}%` : '—'
      }
    },
    {
      field: 'notes',
      headerName: t('contract.notes'),
      flex: 1.2,
      renderCell: (params) => (params.row as EscalationRow).notes ?? '—'
    }
  ]

  const historyColumns: GridColDef[] = [
    { field: 'action_type', headerName: t('contract.historyAction'), flex: 1 },
    { field: 'changed_at', headerName: t('contract.historyDate'), flex: 1.2 },
    {
      field: 'changed_by_note',
      headerName: t('contract.historyNote'),
      flex: 1.5,
      renderCell: (params) => (params.row as HistoryRow).changed_by_note ?? '—'
    },
    {
      field: 'previous_values',
      headerName: t('contract.historyPrevious'),
      flex: 2,
      renderCell: (params) => {
        const row = params.row as HistoryRow
        if (!row.previous_values_json) return '—'
        try {
          const obj = JSON.parse(row.previous_values_json) as Record<string, unknown>
          const entries = Object.entries(obj).slice(0, 3)
          return entries.map(([k, v]) => `${k}: ${String(v)}`).join(', ')
        } catch {
          return '—'
        }
      }
    }
  ]

  const docColumns: GridColDef[] = [
    { field: 'file_name', headerName: t('documents.fileName'), flex: 2 },
    { field: 'mime_type', headerName: t('documents.mimeType'), flex: 1 },
    { field: 'description', headerName: t('common.description'), flex: 1.5 },
    {
      field: 'issue_date',
      headerName: t('documents.issueDate'),
      flex: 1,
      renderCell: (params) => (params.row as DocumentRow).issue_date ?? '—'
    },
    {
      field: 'expiry_date',
      headerName: t('documents.expiryDate'),
      flex: 1,
      renderCell: (params) => (params.row as DocumentRow).expiry_date ?? '—'
    },
    { field: 'uploaded_at', headerName: t('documents.uploadedAt'), flex: 1.2 },
    {
      field: 'actions',
      headerName: t('common.actions'),
      flex: 0.8,
      sortable: false,
      renderCell: (params) => (
        <Tooltip title={t('common.delete')}>
          <IconButton
            size="small"
            color="error"
            onClick={() => handleDeleteDocument((params.row as DocumentRow).id)}
            aria-label={t('common.delete')}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )
    }
  ]

  const renderDataTab = (): React.JSX.Element => (
    <Card elevation={1} sx={{ borderRadius: 3 }}>
      <CardContent>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="caption" color="text.secondary">
              {t('contract.contractNumber')}
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 600 }}>
              {contract.contract_number}
            </Typography>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="caption" color="text.secondary">
              {t('common.status')}
            </Typography>
            <Box sx={{ mt: 0.5 }}>
              <Chip
                label={t(`contract.${contract.status}`)}
                color={STATUS_COLORS[contract.status] ?? 'default'}
                size="small"
              />
            </Box>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="caption" color="text.secondary">
              {t('common.property')}
            </Typography>
            <Typography variant="body1">
              {contract.property_name} ({contract.property_code})
            </Typography>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="caption" color="text.secondary">
              {t('common.tenant')}
            </Typography>
            <Typography variant="body1">{contract.tenant_fullname}</Typography>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="caption" color="text.secondary">
              {t('contract.startDate')}
            </Typography>
            <Typography variant="body1">{contract.start_date}</Typography>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="caption" color="text.secondary">
              {t('contract.endDate')}
            </Typography>
            <Typography variant="body1">{contract.end_date}</Typography>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="caption" color="text.secondary">
              {t('contract.rentAmount')}
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 600 }}>
              {contract.rent_amount.toLocaleString()} {contract.currency}
            </Typography>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="caption" color="text.secondary">
              {t('contract.securityDeposit')}
            </Typography>
            <Typography variant="body1">
              {contract.security_deposit != null
                ? `${contract.security_deposit.toLocaleString()} ${contract.currency}`
                : '—'}
            </Typography>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="caption" color="text.secondary">
              {t('contract.frequency')}
            </Typography>
            <Typography variant="body1">{t(`contract.${contract.payment_frequency}`)}</Typography>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="caption" color="text.secondary">
              {t('payment.paymentMethod')}
            </Typography>
            <Typography variant="body1">
              {contract.payment_method
                ? t(
                    `payment.method${contract.payment_method.charAt(0).toUpperCase() + contract.payment_method.slice(1)}`
                  )
                : '—'}
            </Typography>
          </Grid>
          {contract.has_variable_escalation ? (
            <Grid size={{ xs: 12, sm: 6 }}>
              <Typography variant="caption" color="text.secondary">
                {t('contract.increaseMode')}
              </Typography>
              <Typography variant="body1">
                {t('contract.variableMode')} ({contract.contract_term_years} {t('contract.year')})
              </Typography>
            </Grid>
          ) : contract.annual_increase_percent != null ? (
            <Grid size={{ xs: 12, sm: 6 }}>
              <Typography variant="caption" color="text.secondary">
                {t('contract.annualIncreasePercent')}
              </Typography>
              <Typography variant="body1">{contract.annual_increase_percent}%</Typography>
            </Grid>
          ) : null}
          {contract.notes && (
            <Grid size={{ xs: 12 }}>
              <Typography variant="caption" color="text.secondary">
                {t('contract.notes')}
              </Typography>
              <Typography variant="body1">{contract.notes}</Typography>
            </Grid>
          )}
          {contract.cancellation_reason && (
            <Grid size={{ xs: 12 }}>
              <Typography variant="caption" color="text.secondary">
                {t('contract.cancellationReason')}
              </Typography>
              <Typography variant="body1" color="error">
                {contract.cancellation_reason}
              </Typography>
            </Grid>
          )}
        </Grid>
      </CardContent>
    </Card>
  )

  return (
    <Box sx={{ py: 3, px: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <IconButton onClick={() => navigate('/contracts')} size="small">
          <BackIcon sx={{ transform: isRtl ? 'scaleX(-1)' : 'none' }} />
        </IconButton>
        <ContractIcon color="primary" />
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            {contract.contract_number}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {contract.property_name} — {contract.tenant_fullname}
          </Typography>
        </Box>
        <Chip
          label={t(`contract.${contract.status}`)}
          color={STATUS_COLORS[contract.status] ?? 'default'}
          size="small"
          sx={{ marginInlineStart: 'auto' }}
        />
      </Box>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
        <Tab label={t('contract.detailTabData')} />
        <Tab label={t('contract.detailTabSchedule')} />
        <Tab label={t('contract.detailTabHistory')} />
        <Tab label={`${t('contract.detailTabDocuments')} (${documents.length})`} />
      </Tabs>

      {tab === 0 && renderDataTab()}

      {tab === 1 && (
        <StandardTable
          columns={scheduleColumns}
          rows={schedule}
          loading={false}
          emptyMessage={t('contract.detailNoSchedule')}
        />
      )}

      {tab === 2 && (
        <StandardTable
          columns={historyColumns}
          rows={history}
          loading={false}
          emptyMessage={t('contract.detailNoHistory')}
        />
      )}

      {tab === 3 && (
        <StandardTable
          columns={docColumns}
          rows={documents}
          loading={false}
          emptyMessage={t('contract.detailNoDocuments')}
        />
      )}
      {tab === 3 && (
        <Box sx={{ mt: 2 }}>
          <Button
            size="small"
            startIcon={
              <ExpandMoreIcon
                sx={{
                  transform: showUploadForm ? 'rotate(180deg)' : 'none',
                  transition: 'transform 0.2s'
                }}
              />
            }
            onClick={() => setShowUploadForm(!showUploadForm)}
          >
            {showUploadForm ? t('common.close') : t('documents.selectFile')}
          </Button>
          <Collapse in={showUploadForm}>
            <Card sx={{ mt: 1 }}>
              <CardContent>
                <DocumentUploadForm
                  entityType="contract"
                  entityId={Number(id)}
                  onSuccess={() => {
                    fetchDetail()
                    setShowUploadForm(false)
                  }}
                />
              </CardContent>
            </Card>
          </Collapse>
        </Box>
      )}

      <GlobalSnackbar state={snack} onClose={hideSnackbar} />
    </Box>
  )
}
