/**
 * @file ipc — Typed IPC payload and response interfaces.
 */

export interface CreatePropertyInput {
  code: string
  name: string
  address: string
  city?: string
  country?: string
  currency: string
  status?: 'available' | 'rented' | 'maintenance'
  notes?: string
}

export interface CreateTenantInput {
  code: string
  fullname: string
  phone: string
  email?: string
  id_number?: string
  preferred_language?: string
  notes?: string
}

export interface CreateContractInput {
  property_id: number
  tenant_id: number
  start_date: string
  end_date: string
  rent_amount: number
  currency: string
  payment_frequency?: 'monthly' | 'quarterly' | 'every_4_months' | 'semi_annual' | 'annual'
  deposit_amount?: number
  notes?: string
}

export interface CreatePaymentInput {
  property_id: number
  contract_id?: number | null
  tenant_id?: number | null
  payment_type: 'rent' | 'deposit' | 'other_income'
  payment_date: string
  amount: number
  currency: string
  payment_method?: 'cash' | 'bank_transfer' | 'cheque' | 'other'
  is_partial?: boolean
  notes?: string
}

export interface CreateExpenseInput {
  property_id?: number | null
  category_id: number
  expense_date: string
  vendor_name?: string
  amount: number
  currency: string
  notes?: string
}

export interface ChangePasswordInput {
  userId: number
  currentPassword?: string
  newPassword?: string
}
