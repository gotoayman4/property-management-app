/**
 * INTENT: Tenant detail page — tabbed view showing tenant info, related contracts,
 *         payments, and documents. Accessed from TenantList via link.
 * CONSTRAINT (AGENTS.md): i18n keys only, StandardTable for lists, logical CSS.
 */
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import PeopleIcon from '@mui/icons-material/People'
import {
  Box,
  Typography,
  Tabs,
  Tab,
  Card,
  CardContent,
  Grid,
  Chip,
  Breadcrumbs,
  Button,
  Collapse
} from '@mui/material'
import type { GridColDef, GridValidRowModel } from '@mui/x-data-grid'
import React, { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useNavigate, Link } from 'react-router-dom'
import DocumentUploadForm from '../../components/DocumentUploadForm'
import PageHeader from '../../components/PageHeader'
import StandardTable from '../../components/StandardTable'

interface TenantData {
  id: number
  code: string
  fullname: string
  national_id: string
  country_code: string | null
  phone: string
  email: string | null
  type: string
  preferred_language: string
  address: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  notes: string | null
  is_active: number
}

export default function TenantDetail(): React.JSX.Element {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [tenant, setTenant] = useState<TenantData | null>(null)
  const [tab, setTab] = useState(0)
  const [contracts, setContracts] = useState<GridValidRowModel[]>([])
  const [payments, setPayments] = useState<GridValidRowModel[]>([])
  const [documents, setDocuments] = useState<GridValidRowModel[]>([])
  const [showUploadForm, setShowUploadForm] = useState<boolean>(false)
  const [loading, setLoading] = useState(true)

  const fetchDocuments = useCallback(async (): Promise<void> => {
    if (!id) return
    try {
      const data = await window.api.documents.list({ entity_type: 'tenant', entity_id: Number(id) })
      setDocuments(data as GridValidRowModel[])
    } catch {
      /* documents stay empty */
    }
  }, [id])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    async function loadTenant(): Promise<void> {
      try {
        const data = (await window.api.tenants.get(Number(id))) as TenantData
        if (!cancelled) setTenant(data)
      } catch {
        if (!cancelled) navigate('/tenants')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadTenant()
    return () => {
      cancelled = true
    }
  }, [id, navigate])

  useEffect(() => {
    if (!id) return
    const tid = Number(id)
    let cancelled = false
    async function loadTabData(): Promise<void> {
      try {
        if (tab === 0) {
          const data = await window.api.contracts.list({ tenant_id: tid })
          if (!cancelled) setContracts(data as GridValidRowModel[])
        } else if (tab === 1) {
          const data = await window.api.payments.list({ tenant_id: tid })
          if (!cancelled) setPayments(data as GridValidRowModel[])
        } else if (tab === 2) {
          try {
            const docData = await window.api.documents.list({
              entity_type: 'tenant',
              entity_id: tid
            })
            if (!cancelled) setDocuments(docData as GridValidRowModel[])
          } catch {
            /* documents stay empty */
          }
        }
      } catch {
        /* tab data stays empty */
      }
    }
    loadTabData()
    return () => {
      cancelled = true
    }
  }, [id, tab])

  if (loading || !tenant) return <></>

  const contractCols: GridColDef[] = [
    { field: 'contract_number', headerName: t('contract.contractNumber'), flex: 1 },
    { field: 'property_name', headerName: t('common.property'), flex: 1 },
    { field: 'start_date', headerName: t('contract.startDate'), flex: 1 },
    { field: 'end_date', headerName: t('contract.endDate'), flex: 1 },
    { field: 'status', headerName: t('contract.status'), flex: 1 }
  ]

  const paymentCols: GridColDef[] = [
    { field: 'payment_date', headerName: t('common.date'), flex: 1 },
    { field: 'property_name', headerName: t('common.property'), flex: 1 },
    { field: 'amount', headerName: t('common.amount'), flex: 1, type: 'number' },
    { field: 'payment_type', headerName: t('payment.paymentType'), flex: 1 },
    { field: 'receipt_number', headerName: t('common.receipt'), flex: 1 }
  ]

  const docCols: GridColDef[] = [
    { field: 'file_name', headerName: t('documents.fileName'), flex: 2 },
    { field: 'mime_type', headerName: t('documents.mimeType'), flex: 1 },
    {
      field: 'issue_date',
      headerName: t('documents.issueDate'),
      flex: 1,
      renderCell: (params) => (params.row as GridValidRowModel).issue_date ?? '—'
    },
    {
      field: 'expiry_date',
      headerName: t('documents.expiryDate'),
      flex: 1,
      renderCell: (params) => (params.row as GridValidRowModel).expiry_date ?? '—'
    },
    { field: 'uploaded_at', headerName: t('documents.uploadedAt'), flex: 1 }
  ]

  return (
    <Box>
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link to="/tenants" style={{ textDecoration: 'none', color: 'inherit' }}>
          <Typography color="text.primary">{t('sidebar.tenants')}</Typography>
        </Link>
        <Typography color="text.secondary">{tenant.fullname}</Typography>
      </Breadcrumbs>

      <PageHeader
        icon={<PeopleIcon />}
        title={tenant.fullname}
        subtitle={tenant.code}
        action={
          <Chip
            label={tenant.is_active ? t('tenant.statusActive') : t('tenant.statusInactive')}
            color={tenant.is_active ? 'success' : 'default'}
          />
        }
      />

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Typography variant="body2" color="text.secondary">
                {t('tenant.nationalId')}
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 500 }}>
                {tenant.national_id}
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Typography variant="body2" color="text.secondary">
                {t('tenant.phone')}
              </Typography>
              <Typography
                variant="body1"
                sx={{ fontWeight: 500, direction: 'ltr', textAlign: 'start' }}
              >
                {tenant.country_code ? `+${tenant.country_code} ${tenant.phone}` : tenant.phone}
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Typography variant="body2" color="text.secondary">
                {t('tenant.email')}
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 500 }}>
                {tenant.email ?? '—'}
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Typography variant="body2" color="text.secondary">
                {t('tenant.type')}
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 500 }}>
                {tenant.type === 'individual' ? t('tenant.individual') : t('tenant.company')}
              </Typography>
            </Grid>
            {tenant.emergency_contact_name && (
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="body2" color="text.secondary">
                  {t('tenant.emergencyContactName')}
                </Typography>
                <Typography variant="body1">{tenant.emergency_contact_name}</Typography>
              </Grid>
            )}
            {tenant.address && (
              <Grid size={{ xs: 12 }}>
                <Typography variant="body2" color="text.secondary">
                  {t('tenant.address')}
                </Typography>
                <Typography variant="body1">{tenant.address}</Typography>
              </Grid>
            )}
          </Grid>
        </CardContent>
      </Card>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label={t('tenantDetail.contracts')} />
        <Tab label={t('tenantDetail.payments')} />
        <Tab label={t('tenantDetail.documents')} />
      </Tabs>

      {tab === 0 && (
        <StandardTable
          columns={contractCols}
          rows={contracts}
          emptyMessage={t('tenantDetail.noContracts')}
        />
      )}
      {tab === 1 && (
        <StandardTable
          columns={paymentCols}
          rows={payments}
          emptyMessage={t('tenantDetail.noPayments')}
        />
      )}
      {tab === 2 && (
        <StandardTable
          columns={docCols}
          rows={documents}
          emptyMessage={t('tenantDetail.noDocuments')}
        />
      )}
      {tab === 2 && (
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
                  entityType="tenant"
                  entityId={Number(id)}
                  onSuccess={() => {
                    fetchDocuments()
                    setShowUploadForm(false)
                  }}
                />
              </CardContent>
            </Card>
          </Collapse>
        </Box>
      )}
    </Box>
  )
}
