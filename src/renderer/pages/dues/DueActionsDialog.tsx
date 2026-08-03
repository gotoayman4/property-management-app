/**
 * @file DueActionsDialog — settle-before-app / waive / opening-balance actions for rent dues.
 *
 * INTENT: One dialog covers the dues mutations that never touch the ledger:
 *   - settle: bulk-mark selected dues as collected BEFORE the app (migration workflow).
 *   - waive:  forgive a single due with a required reason.
 *   - opening: record a lump-sum opening_balance due for a contract (owner only knows the total).
 *   - edit:   correct amount/date/note on a never-collected opening_balance due.
 *
 * CONSTRAINT: All strings via t(); the dialog inherits portal `dir` from StandardDialog. Domain
 *             error codes from the IPC layer (e.g. OPENING_BALANCE_ALREADY_EXISTS) are mapped to
 *             specific i18n keys here — never surface raw codes in the UI.
 */
import { Box, Button, MenuItem, TextField } from '@mui/material'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import StandardDialog from '../../components/StandardDialog'

export type DueActionMode = 'settle' | 'waive' | 'opening' | 'edit'

interface ContractOption {
  id: number
  contract_number: string
  property_name: string
  tenant_fullname: string
}

interface DueActionsDialogProps {
  mode: DueActionMode
  open: boolean
  /** Selected due ids (settle mode). */
  dueIds?: number[]
  /** Single due id (waive / edit modes). */
  dueId?: number
  /** Pre-selected contract id (opening mode); when absent a picker is shown. */
  contractId?: number
  /** Seed values for edit mode (the existing opening-balance row being corrected). */
  editSeed?: { amount: number; as_of_date: string; note?: string | null }
  onClose: () => void
  onSuccess: (messageKey: string) => void
  onError: (messageKey: string) => void
}

const todayISO = (): string => new Date().toISOString().split('T')[0]

export default function DueActionsDialog({
  mode,
  open,
  dueIds = [],
  dueId,
  contractId,
  editSeed,
  onClose,
  onSuccess,
  onError
}: DueActionsDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const [note, setNote] = useState(editSeed?.note ?? '')
  const [amount, setAmount] = useState(editSeed ? String(editSeed.amount) : '')
  const [asOfDate, setAsOfDate] = useState(editSeed?.as_of_date ?? todayISO())
  const [selectedContract, setSelectedContract] = useState<number | ''>(contractId ?? '')
  const [contracts, setContracts] = useState<ContractOption[]>([])
  const [submitting, setSubmitting] = useState(false)

  // Opening-balance mode without a pre-selected contract needs the contract picker populated.
  // NOTE: the parent mounts this dialog fresh on each open (`{open && <DueActionsDialog/>}`), so
  // state initializers above (seeded directly from editSeed for edit mode) reset the form naturally
  // — no reset effect needed.
  useEffect(() => {
    if (open && mode === 'opening' && !contractId) {
      window.api.contracts
        .list()
        .then((rows) => setContracts((rows ?? []) as unknown as ContractOption[]))
        .catch(() => setContracts([]))
    }
  }, [open, mode, contractId])

  const title =
    mode === 'settle'
      ? t('dues.settleTitle')
      : mode === 'waive'
        ? t('dues.waiveTitle')
        : mode === 'edit'
          ? t('dues.editOpeningTitle')
          : t('dues.openingBalanceTitle')

  const handleSubmit = useCallback(async (): Promise<void> => {
    setSubmitting(true)
    try {
      if (mode === 'settle') {
        await window.api.dues.settleBeforeApp({ due_ids: dueIds, note: note.trim() })
        onSuccess('dues.settleSuccess')
      } else if (mode === 'waive') {
        if (dueId == null) return
        await window.api.dues.waive({ due_id: dueId, reason: note.trim() })
        onSuccess('dues.waiveSuccess')
      } else if (mode === 'edit') {
        if (dueId == null) return
        await window.api.dues.updateOpeningBalance({
          due_id: dueId,
          amount: Number(amount),
          as_of_date: asOfDate,
          note: note.trim() || null
        })
        onSuccess('dues.editOpeningSuccess')
      } else {
        const cId = contractId ?? (selectedContract === '' ? null : Number(selectedContract))
        if (cId == null) return
        await window.api.dues.createOpeningBalance({
          contract_id: cId,
          amount: Number(amount),
          as_of_date: asOfDate,
          note: note.trim() || null
        })
        onSuccess('dues.openingBalanceSuccess')
      }
      onClose()
    } catch (err) {
      console.error(err)
      // Map machine-readable domain codes to specific, actionable messages (never raw codes).
      const code = err instanceof Error ? err.message : ''
      if (code.startsWith('OPENING_BALANCE_ALREADY_EXISTS')) {
        onError('dues.openingBalanceAlreadyExists')
      } else if (code === 'OPENING_BALANCE_NOT_EDITABLE') {
        onError('dues.cannotEditAllocated')
      } else if (code === 'DUE_AMOUNT_INVALID') {
        onError('dues.amountInvalid')
      } else {
        onError('common.error')
      }
    } finally {
      setSubmitting(false)
    }
  }, [
    mode,
    dueIds,
    dueId,
    note,
    amount,
    asOfDate,
    contractId,
    selectedContract,
    onSuccess,
    onError,
    onClose
  ])

  // Guard the submit button — each mode has its own required fields.
  const noteRequired = mode === 'settle' || mode === 'waive'
  const showAmountFields = mode === 'opening' || mode === 'edit'
  const canSubmit =
    !submitting &&
    (mode === 'settle'
      ? dueIds.length > 0 && note.trim().length > 0
      : mode === 'waive'
        ? dueId != null && note.trim().length > 0
        : mode === 'edit'
          ? dueId != null && Number(amount) > 0 && asOfDate.length > 0
          : (contractId != null || selectedContract !== '') &&
            Number(amount) > 0 &&
            asOfDate.length > 0)

  return (
    <StandardDialog
      open={open}
      onClose={onClose}
      title={title}
      isDirty={note.length > 0 || amount.length > 0}
      actions={
        <>
          <Button onClick={onClose} color="inherit">
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit} variant="contained" disabled={!canSubmit}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        {mode === 'settle' && (
          <TextField
            label={t('dues.selectedCount', { n: dueIds.length })}
            value={dueIds.length}
            disabled
            fullWidth
            size="small"
          />
        )}

        {mode === 'opening' && !contractId && (
          <TextField
            select
            label={t('dues.contract')}
            value={selectedContract}
            onChange={(e) =>
              setSelectedContract(e.target.value === '' ? '' : Number(e.target.value))
            }
            fullWidth
            size="small"
          >
            {contracts.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {`${c.contract_number} — ${c.property_name} (${c.tenant_fullname})`}
              </MenuItem>
            ))}
          </TextField>
        )}

        {showAmountFields && (
          <>
            <TextField
              label={t('dues.amount')}
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              fullWidth
              size="small"
              slotProps={{ htmlInput: { min: 0, step: '0.01' } }}
            />
            <TextField
              label={t('dues.asOfDate')}
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              fullWidth
              size="small"
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </>
        )}

        <TextField
          label={mode === 'waive' ? t('dues.reason') : t('dues.note')}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          fullWidth
          multiline
          minRows={2}
          required={noteRequired}
          size="small"
        />
      </Box>
    </StandardDialog>
  )
}
