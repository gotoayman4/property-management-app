/**
 * @file DuesReviewDialog — post-save review of the dues a (possibly backdated) contract generated.
 *
 * INTENT: When a backdated contract is saved, its full historical rent schedule is materialized
 *         as `rent_dues` rows. This dialog lists those periods so the user can either bulk-mark
 *         the already-collected past periods as "settled before app" (migration workflow, no
 *         ledger writes) or record a lump-sum opening balance when only the total owed is known.
 *
 * CONSTRAINT: All strings via t(); logical CSS only (RTL-safe); numbers shown with currency.
 */
import { Add as AddIcon, DoneAll as SettleIcon, Edit as EditIcon } from '@mui/icons-material'
import {
  Box,
  Button,
  Chip,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography
} from '@mui/material'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import StandardDialog from '../../components/StandardDialog'
import { useFetch } from '../../hooks/useFetch'
import DueActionsDialog, { type DueActionMode } from './DueActionsDialog'

interface ReviewDueRow {
  id: number
  due_type?: string
  period_key: string
  due_date: string
  amount_due: number
  amount_paid: number
  outstanding: number
  currency: string
  status: string
  status_reason?: string | null
}

interface DuesReviewDialogProps {
  contractId: number
  open: boolean
  onClose: () => void
  onSuccess: (messageKey: string) => void
  onError: (messageKey: string) => void
}

function statusColor(status: string): 'default' | 'success' | 'warning' | 'info' {
  if (status === 'paid') return 'success'
  if (status === 'partial') return 'warning'
  if (status === 'settled_before_app' || status === 'waived') return 'info'
  return 'default'
}

export default function DuesReviewDialog({
  contractId,
  open,
  onClose,
  onSuccess,
  onError
}: DuesReviewDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const fetchDues = useCallback(() => window.api.dues.listByContract(contractId), [contractId])
  const { data, refetch } = useFetch(fetchDues)
  const dues = (data ?? []) as unknown as ReviewDueRow[]

  const [action, setAction] = useState<{
    mode: DueActionMode
    dueId?: number
    editSeed?: { amount: number; as_of_date: string; note?: string | null }
  } | null>(null)

  // Past-due, still-open periods are the ones a migrating user typically already collected.
  const settleableIds = dues
    .filter((d) => d.status === 'pending' || d.status === 'partial')
    .map((d) => d.id)

  const handleActionSuccess = useCallback(
    (key: string): void => {
      setAction(null)
      refetch()
      onSuccess(key)
    },
    [refetch, onSuccess]
  )

  return (
    <StandardDialog
      open={open}
      onClose={onClose}
      title={t('dues.reviewTitle')}
      maxWidth="md"
      actions={
        <Button onClick={onClose} variant="contained">
          {t('common.close')}
        </Button>
      }
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography variant="body2" color="text.secondary">
          {t('dues.reviewSubtitle')}
        </Typography>

        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<SettleIcon />}
            disabled={settleableIds.length === 0}
            onClick={() => setAction({ mode: 'settle' })}
          >
            {t('dues.reviewSettleAll')}
          </Button>
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={() => setAction({ mode: 'opening' })}
          >
            {t('dues.action.openingBalance')}
          </Button>
        </Stack>

        <TableContainer sx={{ maxHeight: 360 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>{t('dues.col.period')}</TableCell>
                <TableCell>{t('dues.col.dueDate')}</TableCell>
                <TableCell sx={{ textAlign: 'end' }}>{t('dues.col.amountDue')}</TableCell>
                <TableCell sx={{ textAlign: 'end' }}>{t('dues.col.outstanding')}</TableCell>
                <TableCell>{t('dues.col.status')}</TableCell>
                <TableCell>{t('dues.col.note')}</TableCell>
                <TableCell>{t('common.actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {dues.map((d) => {
                const editable =
                  d.due_type === 'opening_balance' &&
                  Number(d.amount_paid) === 0 &&
                  d.status === 'pending'
                return (
                  <TableRow key={d.id}>
                    <TableCell>
                      {d.period_key === 'opening' ? t('dues.period.opening') : d.period_key}
                    </TableCell>
                    <TableCell>{d.due_date}</TableCell>
                    <TableCell
                      sx={{ textAlign: 'end' }}
                    >{`${d.amount_due.toLocaleString()} ${d.currency}`}</TableCell>
                    <TableCell
                      sx={{ textAlign: 'end' }}
                    >{`${d.outstanding.toLocaleString()} ${d.currency}`}</TableCell>
                    <TableCell>
                      <Chip
                        label={t(`dues.status.${d.status}`)}
                        color={statusColor(d.status)}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      {d.status_reason ? (
                        <Tooltip title={d.status_reason} placement="top">
                          <Box
                            sx={{
                              maxWidth: 180,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {d.status_reason}
                          </Box>
                        </Tooltip>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>
                      {editable ? (
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() =>
                            setAction({
                              mode: 'edit',
                              dueId: d.id,
                              editSeed: {
                                amount: d.amount_due,
                                as_of_date: d.due_date,
                                note: d.status_reason ?? null
                              }
                            })
                          }
                          aria-label={t('dues.action.edit')}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
              {dues.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7}>
                    <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                      {t('dues.noDues')}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      {action && (
        <DueActionsDialog
          open
          mode={action.mode}
          dueIds={action.mode === 'settle' ? settleableIds : undefined}
          contractId={action.mode === 'opening' ? contractId : undefined}
          dueId={action.dueId}
          editSeed={action.editSeed}
          onClose={() => setAction(null)}
          onSuccess={handleActionSuccess}
          onError={onError}
        />
      )}
    </StandardDialog>
  )
}
