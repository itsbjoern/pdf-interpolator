/**
 * Detects system language in the main process (Node.js environment)
 * Uses Node.js Intl API to determine system locale
 */
export function getSystemLanguage(): 'en' | 'de' {
  try {
    // Get system locale from Intl API
    const systemLocale = Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase();

    if (systemLocale.startsWith('de')) {
      return 'de';
    }

    return 'en';
  } catch (error) {
    // Fallback to English if detection fails
    console.error('Failed to detect system language:', error);
    return 'en';
  }
}
