import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import de from './locales/de.json';

// Detect system language
const getSystemLanguage = (): 'en' | 'de' => {
  const lang = navigator.language.toLowerCase();
  if (lang.startsWith('de')) {
    return 'de';
  }
  return 'en';
};

// Get language from LOCALE env variable or system detection
const getLanguage = (): 'en' | 'de' => {
  // Check for LOCALE environment variable (exposed through preload)
  if (window.electron?.env?.LOCALE) {
    return window.electron.env.LOCALE;
  }
  // Fall back to system language detection
  return getSystemLanguage();
};

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    de: { translation: de }
  },
  lng: getLanguage(),
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false
  }
});

export default i18n;
