import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      countries: {
        list: () => Promise<
          {
            id: number
            code: string
            name: string
            default_currency: string
            is_active: number
          }[]
        >
        create: (data: {
          code: string
          name: string
          default_currency: string
        }) => Promise<{ changes: number; lastInsertRowid: number }>
        update: (data: {
          id: number
          name?: string
          default_currency?: string
        }) => Promise<{ success: boolean }>
        delete: (code: string) => Promise<{ success: boolean }>
        listAll: () => Promise<
          {
            id: number
            code: string
            name: string
            default_currency: string
            is_active: number
          }[]
        >
      }
      properties: {
        list: (filters?: {
          type?: string
          status?: string
          country?: string
          search?: string
        }) => Promise<unknown[]>
        get: (id: number) => Promise<unknown>
        create: (data: unknown) => Promise<unknown>
        update: (data: unknown) => Promise<unknown>
        delete: (id: number) => Promise<{ success: boolean }>
        generateCode: (params: { country: string; type: string }) => Promise<string>
      }
      tenants: {
        list: (filters?: {
          search?: string
          type?: string
          is_active?: number
        }) => Promise<unknown[]>
        get: (id: number) => Promise<unknown>
        create: (data: unknown) => Promise<unknown>
        update: (data: unknown) => Promise<unknown>
        delete: (id: number) => Promise<{ success: boolean }>
        generateCode: (params: { type: string }) => Promise<string>
      }
      contracts: {
        list: (filters?: {
          status?: string
          property_id?: number
          tenant_id?: number
        }) => Promise<unknown[]>
        get: (id: number) => Promise<unknown>
        getDetail: (id: number) => Promise<{
          contract: unknown
          schedule: unknown[]
          history: unknown[]
        }>
        create: (data: unknown) => Promise<unknown>
        update: (data: unknown) => Promise<unknown>
        setEscalation: (data: unknown) => Promise<{ success: boolean; yearCount: number }>
        terminate: (payload: { id: number; reason?: string }) => Promise<{ success: boolean }>
        delete: (id: number) => Promise<{ success: boolean }>
      }
      payments: {
        list: (filters?: {
          property_id?: number
          tenant_id?: number
          contract_id?: number
          from_date?: string
          to_date?: string
          payment_type?: string
        }) => Promise<unknown[]>
        get: (id: number) => Promise<unknown>
        create: (data: unknown) => Promise<{
          payment_id: number
          ledger_id: number
          receipt_number: string
        }>
        void: (payload: { id: number; reason: string }) => Promise<{ ledger_id: number }>
      }
      expenses: {
        list: (filters?: {
          property_id?: number
          category_id?: number
          from_date?: string
          to_date?: string
          general_only?: boolean
        }) => Promise<unknown[]>
        get: (id: number) => Promise<unknown>
        create: (data: unknown) => Promise<{ expense_id: number; ledger_id: number }>
        void: (payload: { id: number; reason: string }) => Promise<{ ledger_id: number }>
      }
      expenseCategories: {
        list: () => Promise<{ id: number; name_key: string; is_default: number }[]>
        create: (data: unknown) => Promise<{ id: number }>
      }
      ledger: {
        list: (payload: {
          property_id: number
          from_date?: string
          to_date?: string
        }) => Promise<unknown[]>
        summary: (payload: {
          property_id: number
          from_date?: string
          to_date?: string
        }) => Promise<{
          total_debit: number
          total_credit: number
          net_balance: number
          row_count: number
        }>
        reconstructBalance: (payload: {
          property_id: number
          as_of_date: string
        }) => Promise<{ balance: number }>
        addManualAdjustment: (data: unknown) => Promise<{ id: number }>
      }
      settings: {
        get: () => Promise<{
          app_language: string
          theme: string
          font_size: string
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
        }>
        update: (data: unknown) => Promise<{ success: boolean; settings: unknown }>
      }
      auth: {
        hasUsers: () => Promise<{ hasUsers: boolean }>
        register: (data: unknown) => Promise<{
          id: number
          username: string
          display_name: string | null
        }>
        login: (data: unknown) => Promise<{
          id: number
          username: string
          display_name: string | null
        }>
        changePassword: (data: unknown) => Promise<{ success: boolean }>
        getSavedCredentials: () => Promise<{
          credentials: { username: string; password: string } | null
        }>
        saveCredentials: (data: {
          username: string
          password: string
        }) => Promise<{ success: boolean }>
        clearSavedCredentials: () => Promise<{ success: boolean }>
      }
      dashboard: {
        summary: () => Promise<{
          totalProperties: number
          rentedProperties: number
          totalTenants: number
          activeContracts: number
          totalPayments: number
          totalExpenses: number
          netBalance: number
        }>
        recentPayments: () => Promise<unknown[]>
        recentExpenses: () => Promise<unknown[]>
        upcomingDue: () => Promise<
          {
            id: number
            rent_amount: number
            currency: string
            property_name: string
            tenant_name: string
            end_date: string
          }[]
        >
        overdue: () => Promise<
          {
            id: number
            payment_date: string
            amount: number
            currency: string
            is_partial: number
            property_name: string
            tenant_name: string
            total_paid: number
          }[]
        >
        upcomingRecurring: () => Promise<
          {
            id: number
            name: string
            amount: number
            currency: string
            frequency: string
            next_due_date: string
            property_name: string | null
            category_key: string | null
          }[]
        >
        expiringDocuments: () => Promise<
          {
            id: number
            file_name: string
            document_type: string | null
            expiry_date: string
            issue_date: string | null
            property_name: string
          }[]
        >
        trends: () => Promise<{
          income: { month: string; total: number; currency: string }[]
          expense: { month: string; total: number; currency: string }[]
          startDate: string
          endDate: string
        }>
      }
      exchangeRates: {
        list: (filters?: { currency_from?: string; currency_to?: string }) => Promise<unknown[]>
        latest: (data: { currency_from: string; currency_to: string }) => Promise<{
          id: number
          currency_from: string
          currency_to: string
          rate: number
          effective_date: string
          source: string
          fetched_at: string | null
        } | null>
        add: (data: unknown) => Promise<{ id: number; upserted: boolean }>
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
        }) => Promise<unknown[]>
        get: (id: number) => Promise<unknown>
        create: (data: unknown) => Promise<{ id: number }>
        update: (data: unknown) => Promise<{ success: boolean }>
        deactivate: (id: number) => Promise<{ success: boolean }>
        activate: (id: number) => Promise<{ success: boolean }>
        pendingDue: () => Promise<unknown[]>
        confirmInstance: (data: {
          template_id: number
          due_date: string
          amount?: number
          notes?: string | null
        }) => Promise<{ expense_id: number }>
        skipInstance: (data: {
          template_id: number
          due_date: string
          skip_reason: string
        }) => Promise<{ success: boolean }>
        log: (id: number) => Promise<unknown[]>
      }
      documents: {
        upload: (data: unknown) => Promise<{ id: number; mime_type: string }>
        replace: (data: unknown) => Promise<{ id: number; mime_type: string }>
        list: (data: {
          entity_type: string
          entity_id: number
          include_archived?: boolean
        }) => Promise<
          {
            id: number
            entity_type: string
            entity_id: number
            file_name: string
            mime_type: string
            file_size: number
            description: string | null
            document_type: string | null
            issue_date: string | null
            expiry_date: string | null
            is_archived: number
            replaced_by: number | null
            uploaded_at: string
          }[]
        >
        get: (id: number) => Promise<unknown>
        read: (id: number) => Promise<{ data: string; mime_type: string }>
        delete: (id: number) => Promise<{ success: boolean }>
        purge: (id: number) => Promise<{ success: boolean }>
      }
      notifications: {
        list: (filters?: { unread_only?: boolean }) => Promise<
          {
            id: number
            notification_type: string
            entity_type: string
            entity_id: number
            title: string
            message: string
            due_date: string | null
            is_read: number
            read_at: string | null
            created_at: string
          }[]
        >
        unreadCount: () => Promise<{ count: number }>
        markRead: (id: number) => Promise<{ success: boolean }>
        markAllRead: () => Promise<{ success: boolean }>
        dismiss: (id: number) => Promise<{ success: boolean }>
      }
      search: {
        global: (query: string) => Promise<
          {
            entity_type: string
            entity_id: number
            title: string
            subtitle: string
          }[]
        >
      }
      reports: {
        preview: (data: {
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
        }) => Promise<{
          titleKey: string
          subtitleKey?: string
          columns: Array<{
            key: string
            headerKey: string
            type?: 'text' | 'number' | 'currency' | 'date'
            currencyField?: string
            sumInTotals?: boolean
            isRunningBalance?: boolean
          }>
          groups: Array<{
            currency: string
            rows: Record<string, unknown>[]
            totals: Record<string, number>
          }>
          consolidatedNote?: string
        }>
        exportExcel: (data: {
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
        }) => Promise<{ filePath: string | null }>
        exportHtml: (data: {
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
        }) => Promise<{ filePath: string | null }>
      }
      dialog: {
        pickFolder: () => Promise<{ filePath: string | null; canceled: boolean }>
      }
      backup: {
        create: () => Promise<{
          success: boolean
          filePath: string | null
          checksum: string | null
          error?: string
        }>
        list: () => Promise<
          {
            id: number
            backup_file_path: string
            backup_type: 'manual' | 'automatic' | 'pre_restore'
            file_size_kb: number | null
            checksum: string | null
            is_verified: number
            status: 'success' | 'failed'
            error_message: string | null
            created_at: string
          }[]
        >
        verify: (data: { backupId: number }) => Promise<{ valid: boolean; error?: string }>
        restore: (data: { backupId: number; confirm?: boolean }) => Promise<{
          confirmed?: boolean
          success?: boolean
          backupInfo?: unknown
          emergencyBackupPath?: string | null
          requiresRestart?: boolean
          error?: string
        }>
        delete: (data: { backupId: number }) => Promise<{ success: boolean; error?: string }>
        prune: () => Promise<{ deleted: number; errors: string[] }>
        relaunch: () => Promise<void>
      }
    }
  }
}
