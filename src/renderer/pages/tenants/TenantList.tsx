import React, { useEffect, useState } from 'react'
import { Box, Typography, Button, TextField, Chip, Alert } from '@mui/material'
import { Add as AddIcon, Search as SearchIcon } from '@mui/icons-material'
import { useTranslation } from 'react-i18next'
import StandardTable from '../../components/StandardTable'
import StandardDialog from '../../components/StandardDialog'
import { TenantForm } from './TenantForm'
import { GridColDef } from '@mui/x-data-grid'

interface Tenant {
  id: number
  code: string
  fullname: string
  national_id?: string
  phone: string
  email?: string
  type: 'individual' | 'company'
  company_reg_no?: string
  representative_name?: string
  is_active: number
}

export function TenantList(): React.ReactElement {
  const { t, i18n } = useTranslation()
  const isRtl = i18n.language === 'ar'
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [search, setSearch] = useState<string>('')

  // Dialog state
  const [openDialog, setOpenDialog] = useState<boolean>(false)
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null)

  const fetchTenants = async (): Promise<void> => {
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
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchTenants()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const handleAddClick = (): void => {
    setSelectedTenant(null)
    setOpenDialog(true)
  }

  const handleEditClick = (tenant: Tenant): void => {
    setSelectedTenant(tenant)
    setOpenDialog(true)
  }

  const handleDeleteClick = async (id: number): Promise<void> => {
    if (confirm(t('common.confirm'))) {
      try {
        await window.api.tenants.delete(id)
        fetchTenants()
      } catch (err) {
        console.error(err)
        alert(t('common.error'))
      }
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
      flex: 1.2
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
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button size="small" variant="outlined" onClick={() => handleEditClick(row)}>
              {t('common.edit')}
            </Button>
            {row.is_active === 1 && (
              <Button
                size="small"
                variant="outlined"
                color="error"
                onClick={() => handleDeleteClick(row.id)}
              >
                {t('common.archive')}
              </Button>
            )}
          </Box>
        )
      }
    }
  ]

  return (
    <Box sx={{ py: 3, px: 4 }}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 4,
          flexDirection: isRtl ? 'row-reverse' : 'row'
        }}
      >
        <Typography variant="h4" sx={{ fontWeight: 800 }}>
          {t('tenant.title')}
        </Typography>
        <Button
          variant="contained"
          startIcon={isRtl ? undefined : <AddIcon />}
          endIcon={isRtl ? <AddIcon /> : undefined}
          onClick={handleAddClick}
          sx={{ px: 3, py: 1, borderRadius: 2 }}
        >
          {t('tenant.add')}
        </Button>
      </Box>

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

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <StandardTable
        columns={columns}
        rows={tenants}
        loading={loading}
        emptyMessage={search ? t('tenant.noTenantsFiltered') : t('tenant.noTenants')}
      />

      <StandardDialog
        open={openDialog}
        onClose={() => setOpenDialog(false)}
        title={selectedTenant ? t('tenant.editTitle') : t('tenant.add')}
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
    </Box>
  )
}
