/**
 * @file uiPreferencesStore — reactive Zustand store for theme / font_size / language.
 *
 * INTENT: App.tsx subsribes so theme + font_size changes take effect immediately without a
 *         restart. Settings.tsx calls refresh() after any settings:update call so the store
 *         stays in sync with the persisted DB values.
 *
 * DECISION: Minimal store — only holds the 3 UI-preference fields that affect rendering.
 *           Other settings (reminders, backup path, etc.) are consumed directly via IPC
 *           and don't need reactive propagation.
 */
import { create } from 'zustand'

interface UiPreferences {
  theme: 'light' | 'dark'
  fontSize: 'small' | 'medium' | 'large'
  language: 'ar' | 'en'
  /** Pull latest settings from the DB into the store. Called on app mount + after any save. */
  refresh: () => Promise<void>
}

export const useUiPreferences = create<UiPreferences>((set) => ({
  theme: 'light',
  fontSize: 'medium',
  language: 'ar',

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
