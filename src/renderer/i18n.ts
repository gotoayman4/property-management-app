import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import arTranslations from './locales/ar.json'
import enTranslations from './locales/en.json'

i18n.use(initReactI18next).init({
  resources: {
    ar: { translation: arTranslations },
    en: { translation: enTranslations }
  },
  lng: 'ar', // Default Arabic first
  fallbackLng: 'ar',
  interpolation: {
    escapeValue: false // React already escapes values
  }
})

// Listen for language changes and update HTML document attributes instantly
i18n.on('languageChanged', (lng) => {
  const dir = lng === 'ar' ? 'rtl' : 'ltr'
  document.documentElement.dir = dir
  document.documentElement.lang = lng
})

// Set initial document attributes on load
const initialLng = i18n.language || 'ar'
document.documentElement.dir = initialLng === 'ar' ? 'rtl' : 'ltr'
document.documentElement.lang = initialLng

export default i18n
