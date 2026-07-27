/**
 * @file errorMessages — Helper utility for resolving IPC machine error codes to localized messages.
 * INTENT: Prevent raw machine error codes (e.g., FAILED_TO_LIST_CONTRACTS) from displaying to users.
 */
import { TFunction } from 'i18next'

const KNOWN_ERROR_MAP: Record<string, string> = {
  FAILED_TO_LIST_PROPERTIES: 'errors.failedToListProperties',
  FAILED_TO_GET_PROPERTY: 'errors.failedToGetProperty',
  FAILED_TO_CREATE_PROPERTY: 'errors.failedToCreateProperty',
  FAILED_TO_UPDATE_PROPERTY: 'errors.failedToUpdateProperty',
  FAILED_TO_DELETE_PROPERTY: 'errors.failedToDeleteProperty',
  PROPERTY_NOT_FOUND: 'errors.propertyNotFound',

  FAILED_TO_LIST_TENANTS: 'errors.failedToListTenants',
  FAILED_TO_GET_TENANT: 'errors.failedToGetTenant',
  FAILED_TO_CREATE_TENANT: 'errors.failedToCreateTenant',
  FAILED_TO_UPDATE_TENANT: 'errors.failedToUpdateTenant',
  FAILED_TO_DELETE_TENANT: 'errors.failedToDeleteTenant',
  TENANT_NOT_FOUND: 'errors.tenantNotFound',

  FAILED_TO_LIST_CONTRACTS: 'errors.failedToListContracts',
  FAILED_TO_GET_CONTRACT: 'errors.failedToGetContract',
  FAILED_TO_CREATE_CONTRACT: 'errors.failedToCreateContract',
  FAILED_TO_UPDATE_CONTRACT: 'errors.failedToUpdateContract',
  FAILED_TO_DELETE_CONTRACT: 'errors.failedToDeleteContract',
  CONTRACT_NOT_FOUND: 'errors.contractNotFound',
  OVERLAPPING_CONTRACT: 'errors.overlappingContract',

  FAILED_TO_LIST_PAYMENTS: 'errors.failedToListPayments',
  FAILED_TO_CREATE_PAYMENT: 'errors.failedToCreatePayment',

  FAILED_TO_LIST_EXPENSES: 'errors.failedToListExpenses',
  FAILED_TO_CREATE_EXPENSE: 'errors.failedToCreateExpense',

  // Backup/restore (FR-BAK-05/06). These codes are returned in the restore result's `error` field,
  // not thrown — the BackupPage routes them through resolveIpcError for localization. Keys live in
  // the existing `backup` namespace alongside the other restore strings.
  FAILED_TO_CREATE_BACKUP: 'backup.createFailed',
  FAILED_TO_RESTORE_BACKUP: 'backup.restoreFailed',
  BACKUP_DB_CORRUPT: 'backup.restoreFailedDbCorrupt',
  BACKUP_FORMAT_UNKNOWN: 'backup.restoreFailedFormatUnknown',
  BACKUP_MISSING_DATABASE_ENTRY: 'backup.restoreFailedMissingDb',

  INVALID_INPUT: 'errors.invalidInput',
  UNAUTHORIZED: 'errors.unauthorized'
}

/**
 * Resolves an error object or raw string code into a human-readable localized string.
 */
export function resolveIpcError(err: unknown, t: TFunction): string {
  const code = err instanceof Error ? err.message : String(err || '')

  if (KNOWN_ERROR_MAP[code]) {
    return t(KNOWN_ERROR_MAP[code], { defaultValue: code })
  }

  // If code starts with an uppercase underscore string, treat as machine code fallback
  if (/^[A-Z0-9_]+$/.test(code)) {
    return t('common.genericError', {
      defaultValue: 'An unexpected error occurred. Please try again.'
    })
  }

  return (
    code ||
    t('common.genericError', { defaultValue: 'An unexpected error occurred. Please try again.' })
  )
}
