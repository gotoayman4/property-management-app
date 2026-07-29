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
import { Add as AddIcon, DoneAll as SettleIcon } from '@mui/icons-material'
import {
  Box,
  Button,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography
} from '@mui/material'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import StandardDialog from '../../components/StandardDialog'
import { useFetch } from '../../hooks/useFetch'
import DueActionsDialog, { type DueActionMode } from './DueActionsDialog'

interface ReviewDueRow {
  id: number
  period_key: string
  due_date: string
  amount_due: number
  amount_paid: number
  outstanding: number
  currency: string
  status: string
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

  const [action, setAction] = useState<DueActionMode | null>(null)

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
            onClick={() => setAction('settle')}
          >
            {t('dues.reviewSettleAll')}
          </Button>
          <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setAction('opening')}>
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
              </TableRow>
            </TableHead>
            <TableBody>
              {dues.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>{d.period_key}</TableCell>
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
                </TableRow>
              ))}
              {dues.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5}>
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
          mode={action}
          dueIds={action === 'settle' ? settleableIds : undefined}
          contractId={action === 'opening' ? contractId : undefined}
          onClose={() => setAction(null)}
          onSuccess={handleActionSuccess}
          onError={onError}
        />
      )}
    </StandardDialog>
  )
}
