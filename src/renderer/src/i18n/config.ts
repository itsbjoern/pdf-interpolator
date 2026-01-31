import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { I18N_RESOURCES } from '@/shared/i18n/resources';

export const getSystemLanguage = (): string => {
  const lang = navigator.language.toLowerCase();
  return lang.split('-')[0];
};

i18n.use(initReactI18next).init({
  resources: I18N_RESOURCES,
  lng: 'en',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false
  }
});

export default i18n;
