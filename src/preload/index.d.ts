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
      settings: {
        get: () => Promise<unknown>
        update: (data: unknown) => Promise<{ success: boolean; settings: unknown }>
      }
    }
  }
}
