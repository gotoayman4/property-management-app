/**
 * INTENT: Tenant detail page — tabbed view showing tenant info, related contracts,
 *         payments, and documents. Accessed from TenantList via link.
 * CONSTRAINT (AGENTS.md): i18n keys only, StandardTable for lists, logical CSS.
 */
import PeopleIcon from '@mui/icons-material/People'
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong'
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
  IconButton,
  Tooltip
} from '@mui/material'
import type { GridColDef, GridValidRowModel } from '@mui/x-data-grid'
import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useNavigate, Link } from 'react-router-dom'
import EntityDocumentsTab from '../../components/EntityDocumentsTab'
import PageHeader from '../../components/PageHeader'
import ReceiptDialog, { ReceiptPaymentData } from '../../components/ReceiptDialog'
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
  const [loading, setLoading] = useState(true)
  const [receiptTarget, setReceiptTarget] = useState<ReceiptPaymentData | null>(null)

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
    { field: 'receipt_number', headerName: t('common.receipt'), flex: 1 },
    {
      field: 'actions',
      headerName: t('common.actions'),
      flex: 1,
      sortable: false,
      renderCell: (params) => {
        const row = params.row as ReceiptPaymentData
        return (
          <Tooltip title={t('receipt.print', 'Print Receipt')}>
            <IconButton
              size="small"
              color="primary"
              onClick={() => setReceiptTarget(row)}
              aria-label={t('receipt.print', 'Print Receipt')}
            >
              <ReceiptLongIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )
      }
    }
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
          tableId="tenant-detail-contracts"
        />
      )}
      {tab === 1 && (
        <StandardTable
          columns={paymentCols}
          rows={payments}
          emptyMessage={t('tenantDetail.noPayments')}
          tableId="tenant-detail-payments"
        />
      )}
      {tab === 2 && id && <EntityDocumentsTab entityType="tenant" entityId={Number(id)} />}

      <ReceiptDialog
        open={receiptTarget !== null}
        onClose={() => setReceiptTarget(null)}
        payment={receiptTarget}
      />
    </Box>
  )
}
