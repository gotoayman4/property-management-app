/**
 * @file settings — Settings domain interfaces.
 */

export interface SystemSettings {
  id: number
  app_language: string
  theme: 'light' | 'dark' | 'system'
  reporting_currency: string
  receipt_prefix: string
  receipt_starting_sequence: number
  company_name?: string | null
  company_address?: string | null
  company_phone?: string | null
  company_email?: string | null
  company_logo?: string | null
  max_backup_count: number
  backup_path?: string | null
  reminder_days_before_due: number
  reminder_days_before_contract_end: number
  reminder_days_before_document_expiry: number
  reminder_days_before_recurring_expense: number
}
