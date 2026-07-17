import React, { useCallback, useEffect, useState } from 'react'
import { Box, Button, Chip } from '@mui/material'
import { Add as AddIcon, Description as DescriptionIcon } from '@mui/icons-material'
import { useTranslation } from 'react-i18next'
import StandardTable from '../../components/StandardTable'
import StandardDialog from '../../components/StandardDialog'
import ConfirmDialog from '../../components/ConfirmDialog'
import GlobalSnackbar from '../../components/GlobalSnackbar'
import PageHeader from '../../components/PageHeader'
import { useSnackbar } from '../../hooks/useSnackbar'
import { ContractForm } from './ContractForm'
import { GridColDef } from '@mui/x-data-grid'

interface Contract {
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
  contract_term_years: number
  has_variable_escalation: number
  notes?: string
}

/** Tracks which destructive action is pending confirmation. */
type PendingAction = { id: number; kind: 'terminate' | 'delete' } | null

export function ContractList(): React.ReactElement {
  const { t, i18n } = useTranslation()
  const isRtl = i18n.language === 'ar'
  const { snack, showError, showSuccess, hideSnackbar } = useSnackbar()
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const [openDialog, setOpenDialog] = useState<boolean>(false)
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)

  const fetchContracts = useCallback(async (): Promise<void> => {
    try {
      setLoading(true)
      setError(null)
      const data = await window.api.contracts.list()
      setContracts(data as Contract[])
    } catch (err: unknown) {
      console.error(err)
      setError(t('common.error'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchContracts()
  }, [fetchContracts])

  const handleAddClick = (): void => {
    setSelectedContract(null)
    setOpenDialog(true)
  }

  const handleEditClick = (contract: Contract): void => {
    setSelectedContract(contract)
    setOpenDialog(true)
  }

  const handleTerminateClick = (id: number): void => {
    setPendingAction({ id, kind: 'terminate' })
  }

  const handleDeleteClick = (id: number): void => {
    setPendingAction({ id, kind: 'delete' })
  }

  const confirmAction = async (): Promise<void> => {
    if (!pendingAction) return
    const { id, kind } = pendingAction
    setPendingAction(null)
    try {
      if (kind === 'terminate') {
        await window.api.contracts.terminate({ id })
        showSuccess('common.saveSuccess')
      } else {
        await window.api.contracts.delete(id)
        showSuccess('common.deleteSuccess')
      }
      fetchContracts()
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
    { field: 'contract_number', headerName: t('contract.contractNumber'), flex: 1.2 },
    {
      field: 'property_name',
      headerName: t('sidebar.properties'),
      flex: 1.5
    },
    {
      field: 'tenant_fullname',
      headerName: t('sidebar.tenants'),
      flex: 1.5
    },
    {
      field: 'duration',
      headerName: `${t('contract.startDate')} - ${t('contract.endDate')}`,
      flex: 2,
      renderCell: (params) => {
        const row = params.row as Contract
        return `${row.start_date} / ${row.end_date}`
      }
    },
    {
      field: 'rent_amount',
      headerName: t('contract.rentAmount'),
      flex: 1.3,
      renderCell: (params) => {
        const row = params.row as Contract
        return `${row.rent_amount.toLocaleString()} ${row.currency} (${t(
          `contract.${row.payment_frequency}`
        )})`
      }
    },
    {
      field: 'status',
      headerName: t('contract.status'),
      flex: 1,
      renderCell: (params) => {
        const row = params.row as Contract
        return (
          <Chip
            label={t(`contract.${row.status}`)}
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
        const row = params.row as Contract
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
                {t('contract.terminate')}
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
        title={t('contract.title')}
        action={
          <Button
            variant="contained"
            startIcon={isRtl ? undefined : <AddIcon />}
            endIcon={isRtl ? <AddIcon /> : undefined}
            onClick={handleAddClick}
            sx={{ px: 3, py: 1, borderRadius: 2 }}
          >
            {t('contract.add')}
          </Button>
        }
      />

      <StandardTable
        columns={columns}
        rows={contracts}
        loading={loading}
        error={error ?? undefined}
        onRetry={fetchContracts}
        emptyMessage={t('contract.noContracts')}
      />

      <StandardDialog
        open={openDialog}
        onClose={() => setOpenDialog(false)}
        title={selectedContract ? t('contract.editTitle') : t('contract.add')}
        maxWidth="lg"
      >
        <ContractForm
          contract={selectedContract}
          onSuccess={() => {
            setOpenDialog(false)
            fetchContracts()
          }}
          onCancel={() => setOpenDialog(false)}
        />
      </StandardDialog>

      {/* Terminate / delete confirmation */}
      <ConfirmDialog
        open={pendingAction !== null}
        title={
          pendingAction?.kind === 'terminate'
            ? t('contract.terminateConfirm')
            : t('common.confirmDelete')
        }
        message={
          pendingAction?.kind === 'terminate'
            ? t('contract.terminateConfirm')
            : t('common.confirmDelete')
        }
        confirmLabel={
          pendingAction?.kind === 'terminate' ? t('contract.terminate') : t('common.delete')
        }
        severity={pendingAction?.kind === 'terminate' ? 'warning' : 'error'}
        onConfirm={confirmAction}
        onCancel={() => setPendingAction(null)}
      />

      <GlobalSnackbar state={snack} onClose={hideSnackbar} />
    </Box>
  )
}
