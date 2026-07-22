/**
 * @file uiPreferencesStore — reactive Zustand store for theme / font_size / language / sidebar / dashboard widget visibility.
 *
 * INTENT: App.tsx subscribes so theme + font_size changes take effect immediately without a
 *         restart. Settings.tsx calls refresh() after any settings:update call so the store
 *         stays in sync with the persisted DB values. Dashboard reads hiddenWidgets to
 *         conditionally render sections. Settings page toggles widgets through hideWidget/showWidget.
 *
 * DECISION: Minimal store — only holds the UI-preference fields that affect rendering.
 *           Other settings (reminders, backup path, etc.) are consumed directly via IPC
 *           and don't need reactive propagation. sidebarCollapsed is persisted to localStorage
 *           since it's a transient layout preference, not a DB-backed setting.
 *           hiddenWidgets is persisted to the settings DB table as a JSON array string.
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

/** Safely parse the JSON array of hidden widget IDs from DB string. */
function parseHiddenWidgets(raw: string | undefined | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as string[]) : []
  } catch {
    return []
  }
}

interface UiPreferences {
  theme: 'light' | 'dark'
  fontSize: 'small' | 'medium' | 'large'
  language: 'ar' | 'en'
  sidebarCollapsed: boolean
  hiddenWidgets: string[]
  /** Toggle sidebar between expanded (240px) and collapsed icon-only mode. */
  toggleSidebar: () => void
  /** Toggle theme between light and dark, persists to DB, and refreshes the store. */
  toggleTheme: () => Promise<void>
  /** Hide a dashboard widget. Persists to DB immediately. */
  hideWidget: (id: string) => void
  /** Show (re-enable) a dashboard widget. Persists to DB immediately. */
  showWidget: (id: string) => void
  /** Pull latest settings from the DB into the store. Called on app mount + after any save. */
  refresh: () => Promise<void>
}

export const useUiPreferences = create<UiPreferences>((set) => ({
  theme: 'light',
  fontSize: 'medium',
  language: 'ar',
  sidebarCollapsed: readSidebarCollapsed(),
  hiddenWidgets: [],

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

  toggleTheme: async () => {
    const next = useUiPreferences.getState().theme === 'dark' ? 'light' : 'dark'
    set({ theme: next })
    try {
      await window.api.settings.update({ theme: next })
    } catch {
      /* DB may not be ready */
    }
  },

  hideWidget: (id: string) => {
    const current = useUiPreferences.getState().hiddenWidgets
    if (current.includes(id)) return
    const next = [...current, id]
    set({ hiddenWidgets: next })
    try {
      window.api.settings.update({ dashboard_hidden_widgets: JSON.stringify(next) })
    } catch {
      /* DB may not be ready */
    }
  },

  showWidget: (id: string) => {
    const current = useUiPreferences.getState().hiddenWidgets
    const next = current.filter((w) => w !== id)
    set({ hiddenWidgets: next })
    try {
      window.api.settings.update({ dashboard_hidden_widgets: JSON.stringify(next) })
    } catch {
      /* DB may not be ready */
    }
  },

  refresh: async () => {
    try {
      const settings = (await window.api.settings.get()) as {
        theme?: string
        font_size?: string
        app_language?: string
        dashboard_hidden_widgets?: string
      }
      set({
        theme: settings?.theme === 'dark' ? 'dark' : 'light',
        fontSize:
          settings?.font_size && ['small', 'medium', 'large'].includes(settings.font_size)
            ? (settings.font_size as 'small' | 'medium' | 'large')
            : 'medium',
        language: settings?.app_language === 'en' ? 'en' : 'ar',
        hiddenWidgets: parseHiddenWidgets(settings?.dashboard_hidden_widgets)
      })
    } catch {
      /* keep defaults — IPC may not be ready during very early mount */
    }
  }
}))
