import { ElectronAPI } from '@electron-toolkit/preload'

export interface CountryItem {
  id: number
  code: string
  name: string
  default_currency: string
  is_active: number
}

export type ReportRequestParams = {
  type:
    | 'income'
    | 'expense'
    | 'profit_loss'
    | 'property_profitability'
    | 'tenant_payment_history'
    | 'outstanding_balances'
    | 'vacancy'
    | 'contract_expiry'
    | 'recurring_schedule'
    | 'document_expiry'
    | 'ledger'
  from_date?: string
  to_date?: string
  property_id?: number
  tenant_id?: number
  ledger_property_id?: number
  payment_method?: string
  category_id?: number
  language?: 'ar' | 'en'
}

// --- Shared sub-types ---

interface PropertyRow {
  id: number
  code: string
  name: string
  type: 'apartment' | 'shop'
  country: string
  currency: string
  address: string | null
  area_sqm: number | null
  status: 'vacant' | 'rented' | 'maintenance'
  monthly_rent_default: number
  notes: string | null
  is_archived: number
  created_at: string
  updated_at: string
}

interface TenantRow {
  id: number
  code: string
  fullname: string
  national_id: string | null
  country_code: string | null
  phone: string
  email: string | null
  type: 'individual' | 'company'
  company_reg_no: string | null
  representative_name: string | null
  preferred_language: string
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  address: string | null
  notes: string | null
  is_active: number
  created_at: string
  updated_at: string
}

interface ContractRow {
  id: number
  contract_number: string
  property_id: number
  tenant_id: number
  start_date: string
  end_date: string
  rent_amount: number
  currency: string
  payment_frequency: string
  security_deposit: number
  status: string
  contract_term_years: number
  has_variable_escalation: number
  annual_increase_percent: number | null
  payment_method: string | null
  notes: string | null
  cancellation_reason: string | null
  deposit_status: string | null
  is_archived: number
  created_at: string
  updated_at: string
  property_name: string
  property_code: string
  tenant_fullname: string
  tenant_code: string
}

interface PaymentRow {
  id: number
  contract_id: number | null
  property_id: number
  tenant_id: number | null
  payment_type: string
  payment_date: string
  amount: number
  currency: string
  payment_method: string | null
  receipt_number: string
  is_partial: number
  related_period_month: string | null
  notes: string | null
  is_voided: number
  void_reason: string | null
  reporting_currency: string | null
  exchange_rate: number | null
  base_amount: number | null
  created_at: string
  property_name: string
  property_code: string
  tenant_fullname: string
  tenant_code: string
  contract_number: string
}

interface ExpenseRow {
  id: number
  property_id: number | null
  category_id: number
  recurring_template_id: number | null
  expense_date: string
  vendor_name: string | null
  amount: number
  currency: string
  notes: string | null
  receipt_file_path: string | null
  is_voided: number
  void_reason: string | null
  reporting_currency: string | null
  exchange_rate: number | null
  base_amount: number | null
  created_at: string
  property_name: string
  property_code: string
  category_name_key: string
}

interface LedgerRow {
  id: number
  entry_date: string
  entry_type: 'income' | 'expense' | 'income_void' | 'expense_void' | 'manual_adjustment'
  reference_type: 'payment' | 'expense' | 'recurring_expense' | 'manual' | null
  reference_id: number | null
  property_id: number | null
  description: string
  debit: number
  credit: number
  currency: string
  is_manual_adjustment: number
  created_at: string
  running_balance: number
  reporting_currency: string | null
  exchange_rate: number | null
  base_amount: number | null
}

interface LedgerSummary {
  total_debit: number
  total_credit: number
  net_balance: number
  row_count: number
}

interface DocumentRow {
  id: number
  entity_type: string
  entity_id: number
  file_name: string
  mime_type: string
  file_size: number
  description: string | null
  document_type: string
  issue_date: string | null
  expiry_date: string | null
  is_archived: number
  replaced_by: number | null
  uploaded_at: string
}

interface ExchangeRateRow {
  id: number
  currency_from: string
  currency_to: string
  rate: number
  effective_date: string
  source: string
  fetched_at: string
  entered_by_note: string | null
}

interface ResolvedRate {
  id?: number
  currency_from: string
  currency_to: string
  rate: number
  effective_date: string
  source: string
  fetched_at: string | null
  inferred_from_reverse: boolean
}

interface RecurringTemplateRow {
  id: number
  property_id: number | null
  category_id: number
  name: string
  description: string
  amount: number
  currency: string
  frequency: string
  day_of_month: number
  start_date: string
  end_date: string | null
  next_due_date: string | null
  last_generated_date: string | null
  vendor_name: string | null
  notes: string | null
  is_active: number | boolean
  created_at: string
  updated_at: string
  property_name: string | null
  property_code: string | null
  category_name_key: string | null
  is_ended: boolean
}

interface NotificationRow {
  id: number
  notification_type: string
  entity_type: string
  entity_id: number
  status: string
  title: string
  message: string
  due_date: string | null
  is_read: number
  read_at: string | null
  created_at: string
  tenant_phone: string | null
  tenant_country_code: string | null
}

interface TemplateRow {
  id: number
  name: string
  trigger_type:
    | 'rent_due'
    | 'overdue'
    | 'contract_expiring'
    | 'escalation_upcoming'
    | 'recurring_expense_due'
    | 'document_expiring'
    | 'backup_failed'
  language: 'ar' | 'tr' | 'en'
  message_body: string
}

interface SearchResult {
  entity_type: string
  entity_id: number
  title: string
  subtitle: string
  parent_type: string | null
  parent_id: number | null
}

interface ReportColumn {
  key: string
  headerKey: string
  type?: 'text' | 'number' | 'currency' | 'date'
  currencyField?: string
  sumInTotals?: boolean
  isRunningBalance?: boolean
}

interface ReportCurrencyGroup {
  currency: string
  rows: Record<string, unknown>[]
  totals: Record<string, number>
}

interface ReportData {
  titleKey: string
  subtitleKey?: string
  columns: ReportColumn[]
  groups: ReportCurrencyGroup[]
  consolidatedNote?: string
  consolidatedGroup?: ReportCurrencyGroup
}

interface BackupLogRow {
  id: number
  backup_file_path: string
  backup_type: 'manual' | 'automatic' | 'pre_restore'
  backup_content: 'database-only' | 'full'
  file_size_kb: number | null
  checksum: string | null
  is_verified: number
  status: 'success' | 'failed'
  error_message: string | null
  created_at: string
}

interface BackupResult {
  success: boolean
  filePath: string | null
  checksum: string | null
  error?: string
}

interface SystemSettings {
  id: number
  app_language: string
  theme: string
  reporting_currency: string
  default_payment_method: string
  backup_path: string | null
  date_format: string
  reminder_days_before_due: number
  reminder_days_before_contract_end: number
  reminder_days_before_document_expiry: number
  reminder_days_before_recurring_expense: number
  require_auth: number
  default_country: string | null
  max_backup_count: number
  receipt_prefix: string
  receipt_starting_sequence: number
  backup_enabled: number
  backup_frequency: string
  backup_time: string
  full_backup_enabled: number
  full_backup_frequency: string
  full_backup_time: string
  last_full_backup_at: string | null
  company_name: string | null
  company_logo: string | null
  dashboard_hidden_widgets: string
  font_size: string
}

// --- Profitability return ---

interface PropertyProfitability {
  totalIncome: number
  totalExpenses: number
  netProfit: number
  paymentCount: number
  expenseCount: number
}

// --- Dashboard return types ---

interface CurrencyFinancialRow {
  currency: string
  income: number
  expenses: number
  netProfit: number
}

interface DashboardSummary {
  totalProperties: number
  rentedProperties: number
  totalTenants: number
  activeContracts: number
  financialSummary: CurrencyFinancialRow[]
  consolidatedSummary: {
    reporting_currency: string
    total_income: number
    total_expenses: number
    total_net_profit: number
  }
}

interface DashboardRecentPayment {
  id: number
  payment_date: string
  amount: number
  currency: string
  payment_type: string
  receipt_number: string
  base_amount: number | null
  reporting_currency: string | null
  property_name: string
  tenant_name: string
}

interface DashboardRecentExpense {
  id: number
  expense_date: string
  amount: number
  currency: string
  vendor_name: string | null
  base_amount: number | null
  reporting_currency: string | null
  category_key: string
  property_name: string
}

interface DashboardActivity {
  id: number
  entity_type: string
  activity_date: string
  amount: number | null
  currency: string | null
  base_amount: number | null
  reporting_currency: string | null
  property_name: string | null
  contract_number: string | null
  entity_name: string | null
  entity_code: string | null
  created_at: string
}

interface DashboardUpcomingDue {
  id: number
  rent_amount: number
  currency: string
  property_name: string
  tenant_name: string
  end_date: string
}

interface DashboardOverdue {
  id: number
  payment_date: string
  amount: number
  currency: string
  is_partial: number
  property_name: string
  tenant_name: string
  total_paid: number
}

interface DashboardRecurringDue {
  id: number
  name: string
  amount: number
  currency: string
  frequency: string
  next_due_date: string
  property_name: string
  category_key: string
}

interface DashboardExpiringDoc {
  id: number
  file_name: string
  document_type: string
  expiry_date: string
  issue_date: string | null
  property_name: string
}

interface DashboardTrends {
  income: Array<{ month: string; total: number; currency: string }>
  expense: Array<{ month: string; total: number; currency: string }>
  startDate: string
  endDate: string
}

// --- Recurring expense log ---

interface RecurringLogEntry {
  id: number
  template_id: number
  due_date: string
  action: string
  expense_id: number | null
  skip_reason: string | null
  created_at: string
  expense_amount: number | null
  expense_currency: string | null
}

// --- Auth user ---

interface AuthUser {
  id: number
  username: string
  display_name: string | null
}

// --- Backup restore return (discriminated union) ---

interface BackupRestoreUnconfirmed {
  confirmed: false
  backupInfo: {
    id: number
    backup_file_path: string
    backup_type: string
    file_size_kb: number | null
    created_at: string
  }
}

interface BackupRestoreSuccess {
  confirmed: true
  success: true
  emergencyBackupPath: string | null
  requiresRestart: true
}

interface BackupRestoreFailure {
  confirmed: true
  success: false
  error: string
}

// --- Expense category ---

interface ExpenseCategory {
  id: number
  name_key: string
  is_default: number
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      countries: {
        list: () => Promise<CountryItem[]>
        listWithProperties: () => Promise<CountryItem[]>
        listAll: () => Promise<CountryItem[]>
        create: (data: {
          code: string
          name: string
          default_currency: string
        }) => Promise<{ changes: number; lastInsertRowid: number | bigint }>
        update: (data: {
          id: number
          name?: string
          default_currency?: string
        }) => Promise<{ success: true }>
        delete: (code: string) => Promise<{ success: true }>
      }
      properties: {
        list: (filters?: {
          type?: string
          status?: string
          country?: string
          search?: string
        }) => Promise<PropertyRow[]>
        get: (id: number) => Promise<PropertyRow | undefined>
        create: (data: {
          code: string
          name: string
          type: 'apartment' | 'shop'
          country: string
          currency: string
          address?: string | null
          area_sqm?: number | null
          status?: 'vacant' | 'rented' | 'maintenance'
          monthly_rent_default?: number
          notes?: string | null
        }) => Promise<PropertyRow>
        update: (data: Partial<PropertyRow> & { id: number }) => Promise<PropertyRow>
        delete: (id: number) => Promise<{ success: true }>
        generateCode: (params: { country: string; type: string }) => Promise<string>
        profitability: (data: { property_id: number }) => Promise<PropertyProfitability>
      }
      tenants: {
        list: (filters?: {
          search?: string
          type?: string
          is_active?: number
        }) => Promise<TenantRow[]>
        get: (id: number) => Promise<TenantRow | undefined>
        create: (data: {
          code: string
          fullname: string
          phone: string
          email?: string | null
          national_id?: string | null
          country_code?: string | null
          type?: 'individual' | 'company'
          company_reg_no?: string | null
          representative_name?: string | null
          preferred_language?: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          address?: string | null
          notes?: string | null
          is_active?: number
        }) => Promise<TenantRow>
        update: (data: Partial<TenantRow> & { id: number }) => Promise<TenantRow>
        delete: (id: number) => Promise<{ success: true }>
        generateCode: (params: { type: string }) => Promise<string>
      }
      contracts: {
        list: (filters?: {
          status?: string
          property_id?: number
          tenant_id?: number
        }) => Promise<ContractRow[]>
        get: (id: number) => Promise<ContractRow | undefined>
        getDetail: (id: number) => Promise<{
          contract: ContractRow | undefined
          schedule: Array<{
            id: number
            contract_id: number
            year_number: number
            effective_start_date: string
            rent_amount: number
            increase_percent_applied: number | null
            notes: string | null
            created_at: string
          }>
          history: Array<{
            id: number
            contract_id: number
            action_type: string
            previous_values_json: string | null
            notes: string | null
            changed_at: string
            changed_by_note: string | null
          }>
        }>
        create: (data: {
          contract_number: string
          property_id: number
          tenant_id: number
          start_date: string
          end_date: string
          rent_amount: number
          currency: string
          payment_frequency?:
            'monthly' | 'quarterly' | 'semi_annual' | 'semi-annual' | 'annual' | 'one_time'
          deposit_amount?: number
          deposit_currency?: string | null
          terms?: string | null
          status?: string
          escalation_schedule?: Array<{
            year_number: number
            effective_start_date: string
            rent_amount: number
            increase_percent_applied?: number | null
            notes?: string | null
          }>
          notes?: string | null
        }) => Promise<ContractRow>
        update: (data: Partial<ContractRow> & { id: number }) => Promise<ContractRow>
        setEscalation: (data: {
          contract_id: number
          schedule: Array<{
            year_number: number
            effective_start_date: string
            rent_amount: number
            increase_percent_applied?: number | null
            notes?: string | null
          }>
        }) => Promise<{ success: true; yearCount: number }>
        renew: (data: {
          contract_id: number
          new_start_date: string
          new_end_date: string
          rent_amount: number
          security_deposit?: number
          has_variable_escalation: number
          contract_term_years: number
          annual_increase_percent?: number | null
          schedule?: Array<{
            year_number: number
            effective_start_date: string
            rent_amount: number
            increase_percent_applied?: number | null
            notes?: string | null
          }>
          notes?: string | null
        }) => Promise<{ success: true; id: number }>
        terminate: (payload: { id: number; reason?: string }) => Promise<{ success: true }>
        delete: (id: number) => Promise<{ success: true }>
        updateDepositStatus: (data: {
          contract_id: number
          new_status: 'returned' | 'partially_forfeited' | 'forfeited'
          refund_amount?: number
          forfeit_amount?: number
          notes?: string | null
        }) => Promise<{ success: true }>
      }
      payments: {
        list: (filters?: {
          property_id?: number
          tenant_id?: number
          contract_id?: number
          from_date?: string
          to_date?: string
          payment_type?: 'rent' | 'deposit' | 'other_income'
        }) => Promise<PaymentRow[]>
        get: (id: number) => Promise<PaymentRow | undefined>
        create: (data: {
          contract_id?: number | null
          property_id: number
          tenant_id?: number | null
          payment_type: 'rent' | 'deposit' | 'other_income'
          payment_date: string
          amount: number
          currency: string
          payment_method?: string | null
          is_partial?: boolean
          related_period_month?: string | null
          notes?: string | null
          custom_exchange_rate?: number | null
        }) => Promise<{ payment_id: number; ledger_id: number; receipt_number: string }>
        void: (payload: { id: number; reason: string }) => Promise<{ ledger_id: number }>
      }
      expenses: {
        list: (filters?: {
          property_id?: number
          category_id?: number
          from_date?: string
          to_date?: string
          general_only?: boolean
        }) => Promise<ExpenseRow[]>
        get: (id: number) => Promise<ExpenseRow | undefined>
        create: (data: {
          property_id?: number | null
          category_id: number
          recurring_template_id?: number | null
          expense_date: string
          vendor_name?: string | null
          amount: number
          currency: string
          notes?: string | null
          receipt_file_path?: string | null
          custom_exchange_rate?: number | null
        }) => Promise<{ expense_id: number; ledger_id: number }>
        void: (payload: { id: number; reason: string }) => Promise<{ ledger_id: number }>
      }
      expenseCategories: {
        list: () => Promise<ExpenseCategory[]>
        create: (data: { name_key: string }) => Promise<{ id: number }>
        update: (data: { id: number; name_key: string }) => Promise<{ success: true }>
        delete: (id: number) => Promise<{ success: true }>
      }
      ledger: {
        list: (payload: {
          property_id: number
          from_date?: string
          to_date?: string
          reporting_currency?: boolean
        }) => Promise<LedgerRow[]>
        summary: (payload: {
          property_id: number
          from_date?: string
          to_date?: string
          reporting_currency?: boolean
        }) => Promise<LedgerSummary>
        reconstructBalance: (payload: {
          property_id: number
          as_of_date: string
          reporting_currency?: boolean
        }) => Promise<{ balance: number }>
        addManualAdjustment: (data: {
          property_id: number
          entry_date: string
          description: string
          amount: number
          currency: string
        }) => Promise<{ id: number }>
      }
      settings: {
        get: () => Promise<SystemSettings | undefined>
        update: (
          data: Partial<Omit<SystemSettings, 'id'>>
        ) => Promise<{ success: true; settings: SystemSettings }>
      }
      auth: {
        hasUsers: () => Promise<{ hasUsers: boolean }>
        register: (data: {
          username: string
          password: string
          display_name?: string
        }) => Promise<AuthUser>
        login: (data: { username: string; password: string }) => Promise<AuthUser>
        changePassword: (data: {
          userId: number
          currentPassword: string
          newPassword: string
        }) => Promise<{ success: true }>
        getSavedCredentials: () => Promise<{
          credentials: { username: string; password: string } | null
        }>
        saveCredentials: (data: {
          username: string
          password: string
        }) => Promise<{ success: true }>
        clearSavedCredentials: () => Promise<{ success: true }>
      }
      dashboard: {
        summary: (country?: string) => Promise<DashboardSummary>
        recentPayments: (country?: string) => Promise<DashboardRecentPayment[]>
        recentExpenses: (country?: string) => Promise<DashboardRecentExpense[]>
        recentActivities: (country?: string) => Promise<DashboardActivity[]>
        upcomingDue: (country?: string) => Promise<DashboardUpcomingDue[]>
        overdue: (country?: string) => Promise<DashboardOverdue[]>
        upcomingRecurring: (country?: string) => Promise<DashboardRecurringDue[]>
        expiringDocuments: (country?: string) => Promise<DashboardExpiringDoc[]>
        trends: (country?: string) => Promise<DashboardTrends>
      }
      exchangeRates: {
        list: (filters?: {
          currency_from?: string
          currency_to?: string
        }) => Promise<ExchangeRateRow[]>
        latest: (data: {
          currency_from: string
          currency_to: string
        }) => Promise<ResolvedRate | null>
        add: (data: {
          currency_from: string
          currency_to: string
          rate: number
          effective_date: string
          source?: 'manual' | 'online'
          entered_by_note?: string
        }) => Promise<{ id: number; upserted: boolean }>
        fetchOnline: (data: { currency_from: string; currency_to: string }) => Promise<{
          currency_from: string
          currency_to: string
          rate: number
          effective_date: string
          source: 'online'
        }>
      }
      recurringExpenses: {
        list: (filters?: {
          property_id?: number
          is_active?: boolean
          frequency?: string
        }) => Promise<RecurringTemplateRow[]>
        get: (id: number) => Promise<RecurringTemplateRow | undefined>
        create: (data: {
          property_id?: number | null
          category_id: number
          name: string
          amount: number
          currency: string
          frequency: string
          day_of_month?: number
          start_date: string
          end_date?: string | null
          vendor_name?: string | null
          notes?: string | null
        }) => Promise<{ success: true; id: number }>
        update: (data: {
          id?: number
          property_id?: number | null
          category_id: number
          name: string
          amount: number
          currency: string
          frequency: string
          day_of_month?: number
          start_date: string
          end_date?: string | null
          vendor_name?: string | null
          notes?: string | null
        }) => Promise<{ success: true }>
        deactivate: (id: number) => Promise<{ success: true; is_active: false }>
        activate: (id: number) => Promise<{ success: true; is_active: true }>
        pendingDue: () => Promise<
          Array<{
            template_id: number
            name: string
            property_id: number | null
            property_name: string | null
            due_date: string
            amount: number
            currency: string
            vendor_name: string | null
            frequency: string
          }>
        >
        confirmInstance: (data: {
          template_id: number
          due_date: string
          amount?: number
          notes?: string | null
        }) => Promise<{ success: true; expense_id: number }>
        skipInstance: (data: {
          template_id: number
          due_date: string
          skip_reason: string
        }) => Promise<{ success: true }>
        log: (id: number) => Promise<RecurringLogEntry[]>
      }
      documents: {
        upload: (data: {
          entity_type: 'property' | 'tenant' | 'contract' | 'expense'
          entity_id: number
          file_name: string
          file_buffer: Uint8Array
          description?: string
          document_type?: string
          issue_date?: string
          expiry_date?: string
        }) => Promise<{ id: number; mime_type: string }>
        replace: (data: {
          old_document_id: number
          file_name: string
          file_buffer: Uint8Array
          description?: string
          document_type?: string
          issue_date?: string
          expiry_date?: string
        }) => Promise<{ id: number; mime_type: string }>
        list: (data: {
          entity_type: 'property' | 'tenant' | 'contract' | 'expense'
          entity_id: number
          include_archived?: boolean
        }) => Promise<DocumentRow[]>
        get: (id: number) => Promise<DocumentRow | undefined>
        read: (id: number) => Promise<{ data: string; mime_type: string }>
        delete: (id: number) => Promise<{ success: true }>
        purge: (id: number) => Promise<{ success: true }>
      }
      notifications: {
        list: (filters?: { unread_only?: boolean }) => Promise<NotificationRow[]>
        unreadCount: () => Promise<{ count: number }>
        markRead: (id: number) => Promise<{ success: boolean }>
        markAllRead: () => Promise<{ success: true }>
        dismiss: (id: number) => Promise<{ success: true }>
      }
      templates: {
        list: () => Promise<TemplateRow[]>
        update: (data: {
          id?: number
          trigger_type?: TemplateRow['trigger_type']
          language?: TemplateRow['language']
          message_body: string
        }) => Promise<{ success: true }>
        resetDefaults: (data?: {
          trigger_type?: string
          language?: string
        }) => Promise<{ success: true }>
      }
      search: {
        global: (query: string) => Promise<SearchResult[]>
      }
      reports: {
        preview: (data: ReportRequestParams) => Promise<ReportData>
        exportExcel: (data: ReportRequestParams) => Promise<{ filePath: string | null }>
        exportHtml: (data: ReportRequestParams) => Promise<{ filePath: string | null }>
      }
      dialog: {
        pickFolder: () => Promise<{ filePath: string | null; canceled: boolean }>
        pickImage: () => Promise<{
          base64: string | null
          canceled: boolean
          /** Machine-readable code when the selected image failed magic-byte validation. */
          error?: string
        }>
        pickBackupFile: () => Promise<{ filePath: string | null; canceled: boolean }>
      }
      data: {
        wipeAll: (token: string) => Promise<{ success: true }>
      }
      backup: {
        create: () => Promise<BackupResult>
        createDatabaseOnly: () => Promise<BackupResult>
        list: () => Promise<BackupLogRow[]>
        verify: (data: { backupId: number }) => Promise<{ valid: boolean; error?: string }>
        restore: (data: {
          backupId?: number
          filePath?: string
          confirm?: boolean
        }) => Promise<BackupRestoreUnconfirmed | BackupRestoreSuccess | BackupRestoreFailure>
        delete: (data: { backupId: number }) => Promise<{ success: boolean; error?: string }>
        prune: () => Promise<{ deleted: number; errors: string[] }>
        relaunch: () => Promise<void>
      }
    }
  }
}
