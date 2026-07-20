/**
 * INTENT: Property detail page — tabbed view showing property info, related contracts,
 *         payments, ledger entries, and documents. Accessed from PropertyList via link.
 * CONSTRAINT (AGENTS.md): i18n keys only, StandardTable for lists, logical CSS.
 */
import BusinessIcon from '@mui/icons-material/Business'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
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
import { getLocalizedCountryName } from '../../utils/countryUtils'
import PropertyExpensesTab from './PropertyExpensesTab'
import PropertyImagesTab from './PropertyImagesTab'
import PropertyProfitabilityTab from './PropertyProfitabilityTab'
import PropertyRecurringTab from './PropertyRecurringTab'

interface PropertyData {
  id: number
  code: string
  name: string
  type: string
  country: string
  currency: string
  address: string | null
  area_sqm: number | null
  status: string
  monthly_rent_default: number
  notes: string | null
}

const STATUS_COLORS: Record<string, 'success' | 'warning' | 'info'> = {
  vacant: 'success',
  rented: 'warning',
  maintenance: 'info'
}

export default function PropertyDetail(): React.JSX.Element {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const [property, setProperty] = useState<PropertyData | null>(null)
  const [tab, setTab] = useState(0)
  const [contracts, setContracts] = useState<GridValidRowModel[]>([])
  const [payments, setPayments] = useState<GridValidRowModel[]>([])
  const [ledgerEntries, setLedgerEntries] = useState<GridValidRowModel[]>([])
  const [documents, setDocuments] = useState<GridValidRowModel[]>([])
  const [showUploadForm, setShowUploadForm] = useState<boolean>(false)
  const [loading, setLoading] = useState(true)

  const fetchDocuments = useCallback(async (): Promise<void> => {
    if (!id) return
    try {
      const data = await window.api.documents.list({
        entity_type: 'property',
        entity_id: Number(id)
      })
      setDocuments(data as GridValidRowModel[])
    } catch {
      /* documents stay empty */
    }
  }, [id])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    async function loadProperty(): Promise<void> {
      try {
        const data = (await window.api.properties.get(Number(id))) as PropertyData
        if (!cancelled) setProperty(data)
      } catch {
        if (!cancelled) navigate('/properties')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadProperty()
    return () => {
      cancelled = true
    }
  }, [id, navigate])

  useEffect(() => {
    if (!id) return
    const pid = Number(id)
    let cancelled = false
    async function loadTabData(): Promise<void> {
      try {
        if (tab === 0) {
          const data = await window.api.contracts.list({ property_id: pid })
          if (!cancelled) setContracts(data as GridValidRowModel[])
        } else if (tab === 1) {
          const data = await window.api.payments.list({ property_id: pid })
          if (!cancelled) setPayments(data as GridValidRowModel[])
        } else if (tab === 2) {
          const data = await window.api.ledger.list({ property_id: pid })
          if (!cancelled) setLedgerEntries(data as GridValidRowModel[])
        } else if (tab === 7) {
          try {
            const docData = await window.api.documents.list({
              entity_type: 'property',
              entity_id: pid
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

  if (loading || !property) return <></>

  const contractCols: GridColDef[] = [
    { field: 'contract_number', headerName: t('contract.contractNumber'), flex: 1 },
    { field: 'tenant_name', headerName: t('common.tenant'), flex: 1 },
    { field: 'start_date', headerName: t('contract.startDate'), flex: 1 },
    { field: 'end_date', headerName: t('contract.endDate'), flex: 1 },
    {
      field: 'status',
      headerName: t('contract.status'),
      flex: 1,
      renderCell: (params) => {
        const status = params.value as string
        const color =
          status === 'active'
            ? 'success'
            : status === 'draft'
              ? 'warning'
              : status === 'expired' || status === 'cancelled'
                ? 'error'
                : 'default'
        return (
          <Chip label={t(`contract.${status}`)} color={color} size="small" variant="outlined" />
        )
      }
    }
  ]

  const paymentCols: GridColDef[] = [
    { field: 'payment_date', headerName: t('common.date'), flex: 1 },
    { field: 'tenant_name', headerName: t('common.tenant'), flex: 1 },
    { field: 'amount', headerName: t('common.amount'), flex: 1, type: 'number' },
    {
      field: 'payment_type',
      headerName: t('payment.paymentType'),
      flex: 1,
      renderCell: (params) =>
        t(`payment.${(params.row as GridValidRowModel).payment_type as string}`)
    },
    { field: 'receipt_number', headerName: t('common.receipt'), flex: 1 }
  ]

  const ledgerCols: GridColDef[] = [
    { field: 'entry_date', headerName: t('ledger.entryDate'), flex: 1 },
    {
      field: 'entry_type',
      headerName: t('ledger.entryType'),
      flex: 1.2,
      renderCell: (params) => {
        const entryType = params.value as string
        const ENTRY_TYPE_LABEL: Record<string, string> = {
          income: 'typeIncome',
          expense: 'typeExpense',
          income_void: 'typeIncomeVoid',
          expense_void: 'typeExpenseVoid',
          manual_adjustment: 'typeManual'
        }
        const tone =
          entryType === 'income' || entryType === 'expense_void'
            ? 'success'
            : entryType === 'manual_adjustment'
              ? 'default'
              : 'error'
        return (
          <Chip
            label={t(`ledger.${ENTRY_TYPE_LABEL[entryType] ?? entryType}`)}
            color={tone}
            size="small"
            variant="outlined"
          />
        )
      }
    },
    { field: 'description', headerName: t('ledger.description'), flex: 2 },
    { field: 'debit', headerName: t('ledger.debit'), flex: 1, type: 'number' },
    { field: 'credit', headerName: t('ledger.credit'), flex: 1, type: 'number' }
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
        <Link to="/properties" style={{ textDecoration: 'none', color: 'inherit' }}>
          <Typography color="text.primary">{t('sidebar.properties')}</Typography>
        </Link>
        <Typography color="text.secondary">{property.name}</Typography>
      </Breadcrumbs>

      <PageHeader
        icon={<BusinessIcon />}
        title={property.name}
        subtitle={`${property.code} — ${property.type}`}
        action={
          <Chip
            label={t(
              `property.status${property.status.charAt(0).toUpperCase() + property.status.slice(1)}`
            )}
            color={STATUS_COLORS[property.status] ?? 'default'}
          />
        }
      />

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Typography variant="body2" color="text.secondary">
                {t('property.country')}
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 500 }}>
                {getLocalizedCountryName(property.country, i18n.language)}
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Typography variant="body2" color="text.secondary">
                {t('property.currency')}
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 500 }}>
                {property.currency}
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Typography variant="body2" color="text.secondary">
                {t('property.area')}
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 500 }}>
                {property.area_sqm ?? '—'}
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Typography variant="body2" color="text.secondary">
                {t('property.monthlyRent')}
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 500 }}>
                {property.monthly_rent_default.toLocaleString()}
              </Typography>
            </Grid>
            {property.address && (
              <Grid size={{ xs: 12 }}>
                <Typography variant="body2" color="text.secondary">
                  {t('property.address')}
                </Typography>
                <Typography variant="body1">{property.address}</Typography>
              </Grid>
            )}
          </Grid>
        </CardContent>
      </Card>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label={t('propertyDetail.contracts')} />
        <Tab label={t('propertyDetail.payments')} />
        <Tab label={t('propertyDetail.ledger')} />
        <Tab label={t('propertyDetail.expenses')} />
        <Tab label={t('propertyDetail.profitability')} />
        <Tab label={t('propertyDetail.recurring')} />
        <Tab label={t('propertyDetail.images')} />
        <Tab label={t('propertyDetail.documents')} />
      </Tabs>

      {tab === 0 && (
        <StandardTable
          columns={contractCols}
          rows={contracts}
          emptyMessage={t('propertyDetail.noContracts')}
        />
      )}
      {tab === 1 && (
        <StandardTable
          columns={paymentCols}
          rows={payments}
          emptyMessage={t('propertyDetail.noPayments')}
        />
      )}
      {tab === 2 && (
        <StandardTable
          columns={ledgerCols}
          rows={ledgerEntries}
          emptyMessage={t('propertyDetail.noLedger')}
        />
      )}
      {tab === 3 && <PropertyExpensesTab propertyId={Number(id)} currency={property.currency} />}
      {tab === 4 && (
        <PropertyProfitabilityTab propertyId={Number(id)} currency={property.currency} />
      )}
      {tab === 5 && <PropertyRecurringTab propertyId={Number(id)} currency={property.currency} />}
      {tab === 6 && <PropertyImagesTab propertyId={Number(id)} />}
      {tab === 7 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <StandardTable
            columns={docCols}
            rows={documents}
            emptyMessage={t('propertyDetail.noDocuments')}
          />
          <Box sx={{ mt: 1 }}>
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
                    entityType="property"
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
        </Box>
      )}
    </Box>
  )
}
