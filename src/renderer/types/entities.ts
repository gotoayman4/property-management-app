/**
 * @file entities — Domain entity interfaces across the Property Management App.
 * INTENT: Centralized shape definitions for database tables and UI domain entities.
 */

export interface Property {
  id: number
  code: string
  name: string
  address: string
  city?: string | null
  country?: string | null
  currency: string
  status: 'available' | 'rented' | 'maintenance'
  is_archived: boolean | number
  notes?: string | null
  created_at?: string
  updated_at?: string
}

export interface Tenant {
  id: number
  code: string
  fullname: string
  phone: string
  email?: string | null
  id_number?: string | null
  preferred_language?: string | null
  is_active: boolean | number
  notes?: string | null
  created_at?: string
  updated_at?: string
}

export interface Contract {
  id: number
  contract_number: string
  property_id: number
  tenant_id: number
  start_date: string
  end_date: string
  rent_amount: number
  currency: string
  payment_frequency: 'monthly' | 'quarterly' | 'semi_annual' | 'annual'
  deposit_amount?: number | null
  status: 'active' | 'ended' | 'terminated' | 'cancelled'
  is_archived: boolean | number
  notes?: string | null
  property_name?: string
  tenant_name?: string
}

export interface Payment {
  id: number
  payment_number?: string
  receipt_number?: string | null
  property_id?: number | null
  contract_id?: number | null
  tenant_id?: number | null
  payment_type: 'rent' | 'deposit' | 'other_income'
  payment_date: string
  amount: number
  currency: string
  payment_method: 'cash' | 'bank_transfer' | 'cheque' | 'other'
  is_partial: boolean | number
  is_void: boolean | number
  notes?: string | null
  property_name?: string
  tenant_name?: string
}

export interface Expense {
  id: number
  property_id?: number | null
  category_id: number
  expense_date: string
  vendor_name?: string | null
  amount: number
  currency: string
  notes?: string | null
  is_void: boolean | number
  category_name?: string
  property_name?: string
}

export interface LedgerRow {
  id: number
  property_id?: number | null
  entry_date: string
  entry_type: 'income' | 'expense' | 'adjustment'
  amount: number
  currency: string
  running_balance: number
  description: string
  reference_type?: string | null
  reference_id?: number | null
  property_name?: string
}
