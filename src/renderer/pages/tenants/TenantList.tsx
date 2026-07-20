import {
  Add as AddIcon,
  ArchiveOutlined as ArchiveOutlinedIcon,
  Edit as EditIcon,
  People as PeopleIcon,
  Search as SearchIcon,
  Send as SendWhatsAppIcon,
  Visibility as VisibilityIcon
} from '@mui/icons-material'
import { Box, Typography, Button, IconButton, TextField, Chip, Tooltip } from '@mui/material'
import { GridColDef } from '@mui/x-data-grid'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import ConfirmDialog from '../../components/ConfirmDialog'
import GlobalSnackbar from '../../components/GlobalSnackbar'
import PageHeader from '../../components/PageHeader'
import StandardDialog from '../../components/StandardDialog'
import StandardTable from '../../components/StandardTable'
import { useSnackbar } from '../../hooks/useSnackbar'
import { buildWhatsAppUrl } from '../../utils/whatsappUtils'
import { TenantForm } from './TenantForm'

interface Tenant {
  id: number
  code: string
  fullname: string
  national_id?: string
  country_code?: string
  phone: string
  email?: string
  type: 'individual' | 'company'
  company_reg_no?: string
  representative_name?: string
  is_active: number
}

export function TenantList(): React.ReactElement {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const isRtl = i18n.language === 'ar'
  const { snack, showError, showSuccess, hideSnackbar } = useSnackbar()
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [search, setSearch] = useState<string>('')

  // Dialog state
  const [openDialog, setOpenDialog] = useState<boolean>(false)
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null)
  // Tenant id awaiting archive confirmation (null = dialog closed)
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null)

  const fetchTenants = useCallback(async (): Promise<void> => {
    try {
      setLoading(true)
      setError(null)
      const data = await window.api.tenants.list({ search })
      setTenants(data as Tenant[])
    } catch (err: unknown) {
      console.error(err)
      setError(t('common.error'))
    } finally {
      setLoading(false)
    }
  }, [search, t])

  // Refetch when the search filter changes. fetchTenants calls setLoading/setTenants internally,
  // so the react-hooks/set-state-in-effect rule flags it — this is the canonical data-fetch
  // pattern with a stable useCallback dependency, so the warning is a known false positive here.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchTenants()
  }, [fetchTenants])

  const handleAddClick = (): void => {
    setSelectedTenant(null)
    setOpenDialog(true)
  }

  const handleEditClick = (tenant: Tenant): void => {
    setSelectedTenant(tenant)
    setOpenDialog(true)
  }

  // Open the shared confirm dialog instead of confirm()
  const handleDeleteClick = (id: number): void => {
    setPendingDeleteId(id)
  }

  // Actually deactivate the tenant after the user confirms
  const confirmDelete = async (): Promise<void> => {
    if (pendingDeleteId === null) return
    const id = pendingDeleteId
    setPendingDeleteId(null)
    try {
      await window.api.tenants.delete(id)
      showSuccess('common.deleteSuccess')
      fetchTenants()
    } catch (err) {
      console.error(err)
      showError('common.deleteError')
    }
  }

  const columns: GridColDef[] = [
    {
      field: 'code',
      headerName: t('tenant.code'),
      flex: 1
    },
    {
      field: 'fullname',
      headerName: t('tenant.fullname'),
      flex: 1.5,
      renderCell: (params) => {
        const row = params.row as Tenant
        return (
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {row.fullname}
            </Typography>
            {row.type === 'company' && (
              <Typography variant="caption" color="text.secondary">
                {t('tenant.company')}
              </Typography>
            )}
          </Box>
        )
      }
    },
    {
      field: 'phone',
      headerName: t('tenant.phone'),
      flex: 1.2,
      renderCell: (params) => {
        const row = params.row as Tenant
        const fullPhone = row.country_code ? `+${row.country_code} ${row.phone}` : row.phone
        return (
          <Typography variant="body2" sx={{ direction: 'ltr', textAlign: 'start', width: '100%' }}>
            {fullPhone}
          </Typography>
        )
      }
    },
    {
      field: 'national_id',
      headerName: t('tenant.nationalId'),
      flex: 1.2,
      renderCell: (params) => (params.row as Tenant).national_id || '-'
    },
    {
      field: 'is_active',
      headerName: t('common.status'),
      flex: 1,
      renderCell: (params) => {
        const row = params.row as Tenant
        return (
          <Chip
            label={row.is_active === 1 ? t('tenant.statusActive') : t('tenant.statusInactive')}
            color={row.is_active === 1 ? 'success' : 'default'}
            size="small"
            variant="outlined"
          />
        )
      }
    },
    {
      field: 'actions',
      headerName: t('common.actions'),
      flex: 1,
      sortable: false,
      renderCell: (params) => {
        const row = params.row as Tenant
        return (
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Tooltip title={t('common.view')}>
              <IconButton
                size="small"
                color="primary"
                onClick={() => navigate(`/tenants/${row.id}`)}
                aria-label={t('common.view')}
              >
                <VisibilityIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title={t('common.edit')}>
              <IconButton
                size="small"
                color="primary"
                onClick={() => handleEditClick(row)}
                aria-label={t('common.edit')}
              >
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            {row.is_active === 1 && (
              <Tooltip title={t('common.archive')}>
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => handleDeleteClick(row.id)}
                  aria-label={t('common.archive')}
                >
                  <ArchiveOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {row.phone && (
              <Tooltip title={t('common.sendWhatsApp')}>
                <IconButton
                  size="small"
                  color="success"
                  onClick={() =>
                    window.open(buildWhatsAppUrl(row.phone, row.country_code), '_blank')
                  }
                  aria-label={t('common.sendWhatsApp')}
                >
                  <SendWhatsAppIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        )
      }
    }
  ]

  return (
    <Box sx={{ py: 3, px: 4 }}>
      <PageHeader
        icon={<PeopleIcon />}
        title={t('tenant.title')}
        action={
          <Button
            variant="contained"
            startIcon={isRtl ? undefined : <AddIcon />}
            endIcon={isRtl ? <AddIcon /> : undefined}
            onClick={handleAddClick}
            sx={{ px: 3, py: 1, borderRadius: 2 }}
          >
            {t('tenant.add')}
          </Button>
        }
      />

      {/* Filters Bar */}
      <Box
        sx={{
          display: 'flex',
          gap: 2,
          mb: 4,
          alignItems: 'center',
          flexDirection: isRtl ? 'row-reverse' : 'row'
        }}
      >
        <TextField
          placeholder={t('common.search')}
          size="small"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ width: 300 }}
          slotProps={{
            input: {
              startAdornment: <SearchIcon sx={{ color: 'text.secondary', me: 1 }} />
            }
          }}
        />
      </Box>

      <StandardTable
        columns={columns}
        rows={tenants}
        loading={loading}
        error={error ?? undefined}
        onRetry={fetchTenants}
        emptyMessage={search ? t('tenant.noTenantsFiltered') : t('tenant.noTenants')}
      />

      <StandardDialog
        open={openDialog}
        onClose={() => setOpenDialog(false)}
        title={selectedTenant ? t('tenant.editTitle') : t('tenant.add')}
        maxWidth="md"
      >
        <TenantForm
          tenant={selectedTenant}
          onSuccess={() => {
            setOpenDialog(false)
            fetchTenants()
          }}
          onCancel={() => setOpenDialog(false)}
        />
      </StandardDialog>

      {/* Archive confirmation */}
      <ConfirmDialog
        open={pendingDeleteId !== null}
        title={t('common.confirmArchive')}
        message={t('common.confirmArchive')}
        confirmLabel={t('common.archive')}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDeleteId(null)}
      />

      <GlobalSnackbar state={snack} onClose={hideSnackbar} />
    </Box>
  )
}
