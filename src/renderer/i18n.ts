import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import arTranslations from './locales/ar.json'
import enTranslations from './locales/en.json'

// INTENT: Resolve the initial language from the persisted direction (written by the
// index.html inline script + the languageChanged listener) so i18n's first render
// matches the <html dir> already set before paint — no flicker, no async DB wait.
function detectInitialLanguage(): string {
  try {
    const dir = localStorage.getItem('app-dir')
    if (dir === 'ltr') return 'en'
    if (dir === 'rtl') return 'ar'
  } catch {
    /* localStorage unavailable — fall through to navigator/default */
  }
  const navLang = (typeof navigator !== 'undefined' ? navigator.language : '').toLowerCase()
  return navLang.startsWith('ar') ? 'ar' : 'ar' // Arabic-first product default
}

i18n.use(initReactI18next).init({
  resources: {
    ar: { translation: arTranslations },
    en: { translation: enTranslations }
  },
  lng: detectInitialLanguage(),
  fallbackLng: 'ar',
  interpolation: {
    escapeValue: false // React already escapes values
  }
})

// Listen for language changes: update HTML attributes AND persist the direction to
// localStorage('app-dir') so the inline first-paint script in index.html can restore
// the correct direction on the next launch without an LTR->RTL flicker.
i18n.on('languageChanged', (lng) => {
  const dir = lng === 'ar' ? 'rtl' : 'ltr'
  document.documentElement.dir = dir
  document.documentElement.lang = lng
  try {
    localStorage.setItem('app-dir', dir)
  } catch {
    /* localStorage unavailable — ignore */
  }
})

// Set initial document attributes on load
const initialLng = i18n.language || 'ar'
document.documentElement.dir = initialLng === 'ar' ? 'rtl' : 'ltr'
document.documentElement.lang = initialLng

export default i18n
