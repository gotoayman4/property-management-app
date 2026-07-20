import { electronAPI } from '@electron-toolkit/preload'
import { contextBridge, ipcRenderer } from 'electron'

// Custom APIs for renderer
const api = {
  countries: {
    list: () => ipcRenderer.invoke('countries:list'),
    listWithProperties: () => ipcRenderer.invoke('countries:listWithProperties'),
    create: (data: unknown) => ipcRenderer.invoke('countries:create', data),
    update: (data: unknown) => ipcRenderer.invoke('countries:update', data),
    delete: (code: string) => ipcRenderer.invoke('countries:delete', code),
    listAll: () => ipcRenderer.invoke('countries:listAll')
  },
  properties: {
    list: (filters?: unknown) => ipcRenderer.invoke('properties:list', filters),
    get: (id: number) => ipcRenderer.invoke('properties:get', id),
    create: (data: unknown) => ipcRenderer.invoke('properties:create', data),
    update: (data: unknown) => ipcRenderer.invoke('properties:update', data),
    delete: (id: number) => ipcRenderer.invoke('properties:delete', id),
    generateCode: (params: { country: string; type: string }) =>
      ipcRenderer.invoke('properties:generateCode', params)
  },
  tenants: {
    list: (filters?: unknown) => ipcRenderer.invoke('tenants:list', filters),
    get: (id: number) => ipcRenderer.invoke('tenants:get', id),
    create: (data: unknown) => ipcRenderer.invoke('tenants:create', data),
    update: (data: unknown) => ipcRenderer.invoke('tenants:update', data),
    delete: (id: number) => ipcRenderer.invoke('tenants:delete', id),
    generateCode: (params: { type: string }) => ipcRenderer.invoke('tenants:generateCode', params)
  },
  contracts: {
    list: (filters?: unknown) => ipcRenderer.invoke('contracts:list', filters),
    get: (id: number) => ipcRenderer.invoke('contracts:get', id),
    getDetail: (id: number) => ipcRenderer.invoke('contracts:getDetail', id),
    create: (data: unknown) => ipcRenderer.invoke('contracts:create', data),
    update: (data: unknown) => ipcRenderer.invoke('contracts:update', data),
    setEscalation: (data: unknown) => ipcRenderer.invoke('contracts:setEscalation', data),
    renew: (data: unknown) => ipcRenderer.invoke('contracts:renew', data),
    terminate: (payload: { id: number; reason?: string }) =>
      ipcRenderer.invoke('contracts:terminate', payload),
    delete: (id: number) => ipcRenderer.invoke('contracts:delete', id),
    updateDepositStatus: (data: unknown) =>
      ipcRenderer.invoke('contracts:updateDepositStatus', data)
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
    create: (data: unknown) => ipcRenderer.invoke('expenseCategories:create', data),
    update: (data: unknown) => ipcRenderer.invoke('expenseCategories:update', data),
    delete: (id: number) => ipcRenderer.invoke('expenseCategories:delete', id)
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
  },
  auth: {
    hasUsers: () => ipcRenderer.invoke('auth:hasUsers'),
    register: (data: unknown) => ipcRenderer.invoke('auth:register', data),
    login: (data: unknown) => ipcRenderer.invoke('auth:login', data),
    changePassword: (data: unknown) => ipcRenderer.invoke('auth:changePassword', data),
    getSavedCredentials: () => ipcRenderer.invoke('auth:getSavedCredentials'),
    saveCredentials: (data: { username: string; password: string }) =>
      ipcRenderer.invoke('auth:saveCredentials', data),
    clearSavedCredentials: () => ipcRenderer.invoke('auth:clearSavedCredentials')
  },
  dashboard: {
    summary: (country?: string) => ipcRenderer.invoke('dashboard:summary', country),
    recentPayments: (country?: string) => ipcRenderer.invoke('dashboard:recentPayments', country),
    recentExpenses: (country?: string) => ipcRenderer.invoke('dashboard:recentExpenses', country),
    recentActivities: (country?: string) =>
      ipcRenderer.invoke('dashboard:recentActivities', country),
    upcomingDue: (country?: string) => ipcRenderer.invoke('dashboard:upcomingDue', country),
    overdue: (country?: string) => ipcRenderer.invoke('dashboard:overdue', country),
    upcomingRecurring: (country?: string) =>
      ipcRenderer.invoke('dashboard:upcomingRecurring', country),
    expiringDocuments: (country?: string) =>
      ipcRenderer.invoke('dashboard:expiringDocuments', country),
    trends: (country?: string) => ipcRenderer.invoke('dashboard:trends', country)
  },
  exchangeRates: {
    list: (filters?: unknown) => ipcRenderer.invoke('exchangeRates:list', filters),
    latest: (data: unknown) => ipcRenderer.invoke('exchangeRates:latest', data),
    add: (data: unknown) => ipcRenderer.invoke('exchangeRates:add', data),
    fetchOnline: (data: unknown) => ipcRenderer.invoke('exchangeRates:fetchOnline', data)
  },
  recurringExpenses: {
    list: (filters?: unknown) => ipcRenderer.invoke('recurringExpenses:list', filters),
    get: (id: number) => ipcRenderer.invoke('recurringExpenses:get', id),
    create: (data: unknown) => ipcRenderer.invoke('recurringExpenses:create', data),
    update: (data: unknown) => ipcRenderer.invoke('recurringExpenses:update', data),
    deactivate: (id: number) => ipcRenderer.invoke('recurringExpenses:deactivate', id),
    activate: (id: number) => ipcRenderer.invoke('recurringExpenses:activate', id),
    pendingDue: () => ipcRenderer.invoke('recurringExpenses:pendingDue'),
    confirmInstance: (data: unknown) =>
      ipcRenderer.invoke('recurringExpenses:confirmInstance', data),
    skipInstance: (data: unknown) => ipcRenderer.invoke('recurringExpenses:skipInstance', data),
    log: (id: number) => ipcRenderer.invoke('recurringExpenses:log', id)
  },
  documents: {
    upload: (data: unknown) => ipcRenderer.invoke('documents:upload', data),
    replace: (data: unknown) => ipcRenderer.invoke('documents:replace', data),
    list: (data: unknown) => ipcRenderer.invoke('documents:list', data),
    get: (id: number) => ipcRenderer.invoke('documents:get', id),
    read: (id: number) => ipcRenderer.invoke('documents:read', id),
    delete: (id: number) => ipcRenderer.invoke('documents:delete', id),
    purge: (id: number) => ipcRenderer.invoke('documents:purge', id)
  },
  notifications: {
    list: (filters?: unknown) => ipcRenderer.invoke('notifications:list', filters),
    unreadCount: () => ipcRenderer.invoke('notifications:unreadCount'),
    markRead: (id: number) => ipcRenderer.invoke('notifications:markRead', id),
    markAllRead: () => ipcRenderer.invoke('notifications:markAllRead'),
    dismiss: (id: number) => ipcRenderer.invoke('notifications:dismiss', id)
  },
  templates: {
    list: () => ipcRenderer.invoke('templates:list'),
    update: (data: { id: number; message_body: string }) =>
      ipcRenderer.invoke('templates:update', data),
    resetDefaults: (data: { trigger_type: string; language: string }) =>
      ipcRenderer.invoke('templates:resetDefaults', data)
  },
  search: {
    global: (query: string) => ipcRenderer.invoke('search:global', query)
  },
  reports: {
    preview: (data: unknown) => ipcRenderer.invoke('reports:preview', data),
    exportExcel: (data: unknown) => ipcRenderer.invoke('reports:exportExcel', data),
    exportHtml: (data: unknown) => ipcRenderer.invoke('reports:exportHtml', data)
  },
  dialog: {
    pickFolder: () => ipcRenderer.invoke('dialog:pickFolder'),
    pickImage: () => ipcRenderer.invoke('dialog:pickImage')
  },
  backup: {
    create: () => ipcRenderer.invoke('backup:create'),
    list: () => ipcRenderer.invoke('backup:list'),
    verify: (data: { backupId: number }) => ipcRenderer.invoke('backup:verify', data),
    restore: (data: { backupId: number; confirm?: boolean }) =>
      ipcRenderer.invoke('backup:restore', data),
    delete: (data: { backupId: number }) => ipcRenderer.invoke('backup:delete', data),
    prune: () => ipcRenderer.invoke('backup:prune'),
    relaunch: () => ipcRenderer.invoke('app:relaunch')
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
  // @ts-expect-error (define in dts)
  window.electron = electronAPI
  // @ts-expect-error (define in dts)
  window.api = api
}
