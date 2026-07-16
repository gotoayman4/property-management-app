import React, { useEffect, useState } from 'react'
import { Box, Typography, Button, Chip } from '@mui/material'
import { Add as AddIcon, Description as DescriptionIcon } from '@mui/icons-material'
import { useTranslation } from 'react-i18next'
import StandardTable from '../../components/StandardTable'
import StandardDialog from '../../components/StandardDialog'
import ConfirmDialog from '../../components/ConfirmDialog'
import GlobalSnackbar from '../../components/GlobalSnackbar'
import PageHeader from '../../components/PageHeader'
import { useSnackbar } from '../../hooks/useSnackbar'
import { LeaseForm } from './LeaseForm'
import { GridColDef } from '@mui/x-data-grid'

interface Lease {
  id: number
  contract_number: string
  property_id: number
  property_name: string
  property_code: string
  tenant_id: number
  tenant_fullname: string
  tenant_code: string
  start_date: string
  end_date: string
  rent_amount: number
  currency: string
  payment_frequency: 'monthly' | 'quarterly' | 'semi-annual' | 'annual'
  security_deposit: number
  status: 'draft' | 'active' | 'expired' | 'terminated'
  notes?: string
}

/** Tracks which destructive action is pending confirmation. */
type PendingAction = { id: number; kind: 'terminate' | 'delete' } | null

export function LeaseList(): React.ReactElement {
  const { t, i18n } = useTranslation()
  const isRtl = i18n.language === 'ar'
  const { snack, showError, showSuccess, hideSnackbar } = useSnackbar()
  const [leases, setLeases] = useState<Lease[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Dialog state
  const [openDialog, setOpenDialog] = useState<boolean>(false)
  const [selectedLease, setSelectedLease] = useState<Lease | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)

  const fetchLeases = async (): Promise<void> => {
    try {
      setLoading(true)
      setError(null)
      const data = await window.api.leases.list()
      setLeases(data as Lease[])
    } catch (err: unknown) {
      console.error(err)
      setError(t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLeases()
  }, [])

  const handleAddClick = (): void => {
    setSelectedLease(null)
    setOpenDialog(true)
  }

  const handleEditClick = (lease: Lease): void => {
    setSelectedLease(lease)
    setOpenDialog(true)
  }

  // Open confirm dialog for terminate; actual call happens in confirmAction
  const handleTerminateClick = (id: number): void => {
    setPendingAction({ id, kind: 'terminate' })
  }

  // Open confirm dialog for delete; actual call happens in confirmAction
  const handleDeleteClick = (id: number): void => {
    setPendingAction({ id, kind: 'delete' })
  }

  // Execute whichever destructive action the user confirmed
  const confirmAction = async (): Promise<void> => {
    if (!pendingAction) return
    const { id, kind } = pendingAction
    setPendingAction(null)
    try {
      if (kind === 'terminate') {
        await window.api.leases.terminate(id)
        showSuccess('common.saveSuccess')
      } else {
        await window.api.leases.delete(id)
        showSuccess('common.deleteSuccess')
      }
      fetchLeases()
    } catch (err) {
      console.error(err)
      showError('common.deleteError')
    }
  }

  const getStatusColor = (status: string): 'success' | 'warning' | 'error' | 'default' => {
    switch (status) {
      case 'active':
        return 'success'
      case 'draft':
        return 'warning'
      case 'expired':
        return 'error'
      default:
        return 'default'
    }
  }

  const columns: GridColDef[] = [
    {
      field: 'contract_number',
      headerName: t('lease.contractNumber'),
      flex: 1.2
    },
    {
      field: 'property_name',
      headerName: t('sidebar.properties'),
      flex: 1.5,
      renderCell: (params) => {
        const row = params.row as Lease
        return (
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {row.property_name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {row.property_code}
            </Typography>
          </Box>
        )
      }
    },
    {
      field: 'tenant_fullname',
      headerName: t('sidebar.tenants'),
      flex: 1.5,
      renderCell: (params) => {
        const row = params.row as Lease
        return (
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {row.tenant_fullname}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {row.tenant_code}
            </Typography>
          </Box>
        )
      }
    },
    {
      field: 'duration',
      headerName: `${t('lease.startDate')} - ${t('lease.endDate')}`,
      flex: 2,
      renderCell: (params) => {
        const row = params.row as Lease
        return `${row.start_date} / ${row.end_date}`
      }
    },
    {
      field: 'rent_amount',
      headerName: t('lease.rentAmount'),
      flex: 1.3,
      renderCell: (params) => {
        const row = params.row as Lease
        return `${row.rent_amount.toLocaleString()} ${row.currency} (${t(`lease.${row.payment_frequency}`)})`
      }
    },
    {
      field: 'status',
      headerName: t('lease.status'),
      flex: 1,
      renderCell: (params) => {
        const row = params.row as Lease
        return (
          <Chip
            label={t(`lease.${row.status}`)}
            color={getStatusColor(row.status)}
            size="small"
            variant="outlined"
          />
        )
      }
    },
    {
      field: 'actions',
      headerName: t('common.actions'),
      flex: 2.2,
      sortable: false,
      renderCell: (params) => {
        const row = params.row as Lease
        return (
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button size="small" variant="outlined" onClick={() => handleEditClick(row)}>
              {t('common.edit')}
            </Button>
            {row.status === 'active' && (
              <Button
                size="small"
                variant="outlined"
                color="warning"
                onClick={() => handleTerminateClick(row.id)}
              >
                {t('lease.terminate')}
              </Button>
            )}
            <Button
              size="small"
              variant="outlined"
              color="error"
              onClick={() => handleDeleteClick(row.id)}
            >
              {t('common.delete')}
            </Button>
          </Box>
        )
      }
    }
  ]

  return (
    <Box sx={{ py: 3, px: 4 }}>
      <PageHeader
        icon={<DescriptionIcon />}
        title={t('lease.title')}
        action={
          <Button
            variant="contained"
            startIcon={isRtl ? undefined : <AddIcon />}
            endIcon={isRtl ? <AddIcon /> : undefined}
            onClick={handleAddClick}
            sx={{ px: 3, py: 1, borderRadius: 2 }}
          >
            {t('lease.add')}
          </Button>
        }
      />

      <StandardTable
        columns={columns}
        rows={leases}
        loading={loading}
        error={error ?? undefined}
        onRetry={fetchLeases}
        emptyMessage={t('lease.noLeases')}
      />

      <StandardDialog
        open={openDialog}
        onClose={() => setOpenDialog(false)}
        title={selectedLease ? t('lease.editTitle') : t('lease.add')}
      >
        <LeaseForm
          lease={selectedLease}
          onSuccess={() => {
            setOpenDialog(false)
            fetchLeases()
          }}
          onCancel={() => setOpenDialog(false)}
        />
      </StandardDialog>

      {/* Terminate / delete confirmation — adapts labels to the pending action */}
      <ConfirmDialog
        open={pendingAction !== null}
        title={
          pendingAction?.kind === 'terminate'
            ? t('lease.terminateConfirm')
            : t('common.confirmDelete')
        }
        message={
          pendingAction?.kind === 'terminate'
            ? t('lease.terminateConfirm')
            : t('common.confirmDelete')
        }
        confirmLabel={
          pendingAction?.kind === 'terminate' ? t('lease.terminate') : t('common.delete')
        }
        severity={pendingAction?.kind === 'terminate' ? 'warning' : 'error'}
        onConfirm={confirmAction}
        onCancel={() => setPendingAction(null)}
      />

      <GlobalSnackbar state={snack} onClose={hideSnackbar} />
    </Box>
  )
}
