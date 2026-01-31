import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import de from './locales/de.json';

// Detect system language from browser
export const getSystemLanguage = (): 'en' | 'de' => {
  const lang = navigator.language.toLowerCase();
  if (lang.startsWith('de')) {
    return 'de';
  }
  return 'en';
};

// Initialize with English as default - will be updated in App.tsx on startup
i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    de: { translation: de }
  },
  lng: 'en', // Default - will be updated by App.tsx to match system language
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false
  }
});

export default i18n;
