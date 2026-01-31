/**
 * Locale-specific number formatting configuration
 * Used by both main process (spreadsheet reader) and renderer (i18n)
 */

export interface NumberFormatConfig {
  thousandsSeparator: string;
  decimalSeparator: string;
}

export const LOCALE_NUMBER_FORMATS: Record<'en' | 'de', NumberFormatConfig> = {
  en: {
    thousandsSeparator: ',',
    decimalSeparator: '.'
  },
  de: {
    thousandsSeparator: '.',
    decimalSeparator: ','
  }
};

/**
 * Get number format configuration for a locale
 */
export function getNumberFormat(locale: 'en' | 'de'): NumberFormatConfig {
  return LOCALE_NUMBER_FORMATS[locale];
}
