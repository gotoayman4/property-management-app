import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      countries: {
        list: () => Promise<unknown[]>
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
        get: () => Promise<unknown>
        update: (data: unknown) => Promise<{ success: boolean; settings: unknown }>
      }
    }
  }
}
