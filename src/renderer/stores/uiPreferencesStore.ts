/**
 * @file uiPreferencesStore — reactive Zustand store for theme / font_size / language / sidebar.
 *
 * INTENT: App.tsx subsribes so theme + font_size changes take effect immediately without a
 *         restart. Settings.tsx calls refresh() after any settings:update call so the store
 *         stays in sync with the persisted DB values.
 *
 * DECISION: Minimal store — only holds the UI-preference fields that affect rendering.
 *           Other settings (reminders, backup path, etc.) are consumed directly via IPC
 *           and don't need reactive propagation. sidebarCollapsed is persisted to localStorage
 *           since it's a transient layout preference, not a DB-backed setting.
 */
import { create } from 'zustand'

const SIDEBAR_COLLAPSED_KEY = 'sidebar-collapsed'

/** Read sidebar collapsed state from localStorage, falling back to false. */
function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true'
  } catch {
    return false
  }
}

interface UiPreferences {
  theme: 'light' | 'dark'
  fontSize: 'small' | 'medium' | 'large'
  language: 'ar' | 'en'
  sidebarCollapsed: boolean
  /** Toggle sidebar between expanded (240px) and collapsed icon-only mode. */
  toggleSidebar: () => void
  /** Pull latest settings from the DB into the store. Called on app mount + after any save. */
  refresh: () => Promise<void>
}

export const useUiPreferences = create<UiPreferences>((set) => ({
  theme: 'light',
  fontSize: 'medium',
  language: 'ar',
  sidebarCollapsed: readSidebarCollapsed(),

  toggleSidebar: () =>
    set((state) => {
      const next = !state.sidebarCollapsed
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next))
      } catch {
        /* localStorage may not be available in some environments */
      }
      return { sidebarCollapsed: next }
    }),

  refresh: async () => {
    try {
      const settings = (await window.api.settings.get()) as {
        theme?: string
        font_size?: string
        app_language?: string
      }
      set({
        theme: settings?.theme === 'dark' ? 'dark' : 'light',
        fontSize:
          settings?.font_size && ['small', 'medium', 'large'].includes(settings.font_size)
            ? (settings.font_size as 'small' | 'medium' | 'large')
            : 'medium',
        language: settings?.app_language === 'en' ? 'en' : 'ar'
      })
    } catch {
      /* keep defaults — IPC may not be ready during very early mount */
    }
  }
}))
