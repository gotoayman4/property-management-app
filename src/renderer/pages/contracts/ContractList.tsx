import {
  Add as AddIcon,
  Autorenew as RenewIcon,
  Block as BlockIcon,
  Delete as DeleteIcon,
  Description as DescriptionIcon,
  Edit as EditIcon,
  Visibility as ViewIcon
} from '@mui/icons-material'
import { Box, Button, Chip, IconButton, Link, Tooltip } from '@mui/material'
import { GridColDef } from '@mui/x-data-grid'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import ConfirmDialog from '../../components/ConfirmDialog'
import GlobalSnackbar from '../../components/GlobalSnackbar'
import PageHeader from '../../components/PageHeader'
import StandardDialog from '../../components/StandardDialog'
import StandardTable from '../../components/StandardTable'
import { useFetch } from '../../hooks/useFetch'
import { useSnackbar } from '../../hooks/useSnackbar'
import { ContractForm } from './ContractForm'
import {
  ContractRenewalForm,
  type RenewalSourceContract,
  type RenewalSourceScheduleRow
} from './ContractRenewalForm'

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
  status: 'draft' | 'active' | 'expired' | 'renewing' | 'cancelled'
  contract_term_years: number
  has_variable_escalation: number
  notes?: string
}

/** Tracks which destructive action is pending confirmation. */
type PendingAction = { id: number; kind: 'terminate' | 'delete' } | null

export function ContractList(): React.ReactElement {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { snack, showError, showSuccess, hideSnackbar } = useSnackbar()
  const [openDialog, setOpenDialog] = useState<boolean>(false)
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  const [renewalSource, setRenewalSource] = useState<{
    contract: RenewalSourceContract
    schedule: RenewalSourceScheduleRow[]
  } | null>(null)

  const fetchContracts = useCallback(() => window.api.contracts.list(), [])

  const { data, loading, error, refetch } = useFetch(fetchContracts)
  const contracts = data ?? []

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

  // INTENT: Fetch the full contract detail (including escalation schedule) and open the
  //         renewal dialog. The list row only has summary fields; the renewal form needs the
  //         schedule too so it can pre-fill the variable-escalation editor.
  const handleRenewClick = async (contract: Contract): Promise<void> => {
    try {
      const detail = (await window.api.contracts.getDetail(contract.id)) as {
        contract: RenewalSourceContract
        schedule: RenewalSourceScheduleRow[]
      }
      setRenewalSource({ contract: detail.contract, schedule: detail.schedule })
    } catch (err) {
      console.error(err)
      showError('common.error')
    }
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
      refetch()
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
      case 'cancelled':
        return 'error'
      default:
        return 'default'
    }
  }

  const columns: GridColDef[] = [
    {
      field: 'contract_number',
      headerName: t('contract.contractNumber'),
      flex: 1.2,
      renderCell: (params) => {
        const row = params.row as Contract
        return (
          <Link
            component="button"
            variant="body2"
            onClick={() => navigate(`/contracts/${row.id}`)}
            sx={{ cursor: 'pointer', textAlign: 'start' }}
          >
            {row.contract_number}
          </Link>
        )
      }
    },
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
      flex: 1.5,
      sortable: false,
      renderCell: (params) => {
        const row = params.row as Contract
        return (
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Tooltip title={t('common.view')}>
              <IconButton
                size="small"
                color="primary"
                onClick={() => navigate(`/contracts/${row.id}`)}
                aria-label={t('common.view')}
              >
                <ViewIcon fontSize="small" />
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
            {row.status === 'active' && (
              <Tooltip title={t('contract.terminate')}>
                <IconButton
                  size="small"
                  color="warning"
                  onClick={() => handleTerminateClick(row.id)}
                  aria-label={t('contract.terminate')}
                >
                  <BlockIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {(row.status === 'active' || row.status === 'expired') && (
              <Tooltip title={t('contract.renew')}>
                <IconButton
                  size="small"
                  color="primary"
                  onClick={() => handleRenewClick(row)}
                  aria-label={t('contract.renew')}
                >
                  <RenewIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title={t('common.delete')}>
              <IconButton
                size="small"
                color="error"
                onClick={() => handleDeleteClick(row.id)}
                aria-label={t('common.delete')}
              >
                <DeleteIcon fontSize="small" />
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
        icon={<DescriptionIcon />}
        title={t('contract.title')}
        action={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
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
        onRetry={refetch}
        emptyMessage={t('contract.noContracts')}
        tableId="contract-list"
      />

      <StandardDialog
        open={openDialog}
        onClose={() => {
          setOpenDialog(false)
          refetch()
        }}
        title={selectedContract ? t('contract.editTitle') : t('contract.add')}
        maxWidth="lg"
      >
        <ContractForm
          contract={selectedContract}
          onSuccess={() => {
            refetch()
          }}
          onCancel={() => {
            setOpenDialog(false)
            refetch()
          }}
        />
      </StandardDialog>

      {/* Renewal dialog */}
      {renewalSource && (
        <StandardDialog
          open
          onClose={() => setRenewalSource(null)}
          title={t('contract.renewTitle')}
          maxWidth="lg"
        >
          <ContractRenewalForm
            sourceContract={renewalSource.contract}
            sourceSchedule={renewalSource.schedule}
            onSuccess={() => {
              setRenewalSource(null)
              refetch()
              showSuccess('contract.renewSuccess')
            }}
            onCancel={() => setRenewalSource(null)}
          />
        </StandardDialog>
      )}

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
