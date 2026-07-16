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
  leases: {
    list: (filters?: unknown) => ipcRenderer.invoke('leases:list', filters),
    get: (id: number) => ipcRenderer.invoke('leases:get', id),
    create: (data: unknown) => ipcRenderer.invoke('leases:create', data),
    update: (data: unknown) => ipcRenderer.invoke('leases:update', data),
    terminate: (id: number) => ipcRenderer.invoke('leases:terminate', id),
    delete: (id: number) => ipcRenderer.invoke('leases:delete', id)
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
