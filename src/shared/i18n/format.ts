import { I18N_RESOURCES } from './resources';

export interface NumberFormatConfig {
  thousandsSeparator: string;
  decimalSeparator: string;
}

/**
 * Get number format configuration for a locale
 */
export function getNumberFormat(locale: string): NumberFormatConfig {
  const resource = I18N_RESOURCES[locale] || I18N_RESOURCES.en;

  const numberFormat = resource.translation.numberFormat;
  return {
    thousandsSeparator: numberFormat.thousandsSeparator,
    decimalSeparator: numberFormat.decimalSeparator
  };
}

/**
 * Detects system language in the main process (Node.js environment)
 * Uses Node.js Intl API to determine system locale
 */
export function getSystemLanguage(): string {
  try {
    const systemLocale = Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase();

    return systemLocale.split('-')[0];
  } catch (error) {
    console.error('Failed to detect system language:', error);
    return 'en';
  }
}
