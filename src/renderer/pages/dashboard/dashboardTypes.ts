/**
 * @file dashboardTypes — shared interfaces for Dashboard components.
 *
 * INTENT: Keep Dashboard.tsx under the 500-line limit by extracting data shapes.
 * CONSTRAINT: All interfaces are exported so dashboardCharts.tsx and Dashboard.tsx can share them.
 */

export interface CurrencyFinancialRow {
  currency: string
  income: number
  expenses: number
  netProfit: number
}

export interface ConsolidatedSummary {
  reporting_currency: string
  total_income: number | 'rate_missing'
  total_expenses: number | 'rate_missing'
  total_net_profit: number | 'rate_missing'
}

export interface DashboardSummary {
  totalProperties: number
  rentedProperties: number
  totalTenants: number
  activeContracts: number
  /** Per-currency income/expense/net for the current calendar month (BR-14). */
  financialSummary: CurrencyFinancialRow[]
  consolidatedSummary: ConsolidatedSummary
}
export interface UpcomingDueRow {
  id: number
  rent_amount: number
  currency: string
  property_name: string
  tenant_name: string
  end_date: string
}
export interface OverdueRow {
  id: number
  payment_date: string
  amount: number
  currency: string
  is_partial: number
  property_name: string
  tenant_name: string
  total_paid: number
}
export interface UpcomingRecurringRow {
  id: number
  name: string
  amount: number
  currency: string
  frequency: string
  next_due_date: string
  property_name: string | null
  category_key: string | null
}
export interface ExpiringDocumentRow {
  id: number
  file_name: string
  document_type: string | null
  expiry_date: string
  issue_date: string | null
  property_name: string
}
export interface TrendPoint {
  month: string
  total: number
  currency: string
}
export interface TrendsData {
  income: TrendPoint[]
  expense: TrendPoint[]
  startDate: string
  endDate: string
}
export interface RecentPaymentRow {
  id: number
  payment_date: string
  amount: number
  currency: string
  property_name: string
  tenant_name: string
}
export interface RecentExpenseRow {
  id: number
  expense_date: string
  amount: number
  currency: string
  property_name: string
  category_key: string | null
}
export interface CountryOption {
  code: string
  name: string
}
