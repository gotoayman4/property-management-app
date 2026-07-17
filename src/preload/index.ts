import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  countries: {
    list: () => ipcRenderer.invoke('countries:list')
  },
  properties: {
    list: (filters?: unknown) => ipcRenderer.invoke('properties:list', filters),
    get: (id: number) => ipcRenderer.invoke('properties:get', id),
    create: (data: unknown) => ipcRenderer.invoke('properties:create', data),
    update: (data: unknown) => ipcRenderer.invoke('properties:update', data),
    delete: (id: number) => ipcRenderer.invoke('properties:delete', id)
  },
  tenants: {
    list: (filters?: unknown) => ipcRenderer.invoke('tenants:list', filters),
    get: (id: number) => ipcRenderer.invoke('tenants:get', id),
    create: (data: unknown) => ipcRenderer.invoke('tenants:create', data),
    update: (data: unknown) => ipcRenderer.invoke('tenants:update', data),
    delete: (id: number) => ipcRenderer.invoke('tenants:delete', id)
  },
  contracts: {
    list: (filters?: unknown) => ipcRenderer.invoke('contracts:list', filters),
    get: (id: number) => ipcRenderer.invoke('contracts:get', id),
    getDetail: (id: number) => ipcRenderer.invoke('contracts:getDetail', id),
    create: (data: unknown) => ipcRenderer.invoke('contracts:create', data),
    update: (data: unknown) => ipcRenderer.invoke('contracts:update', data),
    setEscalation: (data: unknown) => ipcRenderer.invoke('contracts:setEscalation', data),
    terminate: (payload: { id: number; reason?: string }) =>
      ipcRenderer.invoke('contracts:terminate', payload),
    delete: (id: number) => ipcRenderer.invoke('contracts:delete', id)
  },
  payments: {
    list: (filters?: unknown) => ipcRenderer.invoke('payments:list', filters),
    get: (id: number) => ipcRenderer.invoke('payments:get', id),
    create: (data: unknown) => ipcRenderer.invoke('payments:create', data),
    void: (payload: { id: number; reason: string }) => ipcRenderer.invoke('payments:void', payload)
  },
  expenses: {
    list: (filters?: unknown) => ipcRenderer.invoke('expenses:list', filters),
    get: (id: number) => ipcRenderer.invoke('expenses:get', id),
    create: (data: unknown) => ipcRenderer.invoke('expenses:create', data),
    void: (payload: { id: number; reason: string }) => ipcRenderer.invoke('expenses:void', payload)
  },
  expenseCategories: {
    list: () => ipcRenderer.invoke('expenseCategories:list'),
    create: (data: unknown) => ipcRenderer.invoke('expenseCategories:create', data)
  },
  ledger: {
    list: (payload: { property_id: number; from_date?: string; to_date?: string }) =>
      ipcRenderer.invoke('ledger:list', payload),
    summary: (payload: { property_id: number; from_date?: string; to_date?: string }) =>
      ipcRenderer.invoke('ledger:summary', payload),
    reconstructBalance: (payload: { property_id: number; as_of_date: string }) =>
      ipcRenderer.invoke('ledger:reconstructBalance', payload),
    addManualAdjustment: (data: unknown) => ipcRenderer.invoke('ledger:addManualAdjustment', data)
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (data: unknown) => ipcRenderer.invoke('settings:update', data)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
