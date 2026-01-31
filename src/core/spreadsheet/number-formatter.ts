import { getNumberFormat } from '@shared/locale-config';

/**
 * Converts English-formatted numbers to locale-specific format
 *
 * @param value - The value to format (expected to be from XLSX in English format)
 * @param locale - The target locale ('en' or 'de')
 * @returns Formatted number string or original value if not a number
 *
 * @example
 * formatNumberForLocale('1,000.50', 'de') // '1.000,50'
 * formatNumberForLocale('€1,000.50', 'de') // '€1.000,50'
 * formatNumberForLocale('1,000.50 €', 'de') // '1.000,50 €'
 * formatNumberForLocale('1000.50', 'de') // '1000,50'
 * formatNumberForLocale('Text, with periods.', 'de') // 'Text, with periods.' (unchanged)
 */
export function formatNumberForLocale(value: string, locale: 'en' | 'de'): string {
  // Early return for empty values
  if (!value || value.trim() === '') {
    return value;
  }

  const sourceFormat = getNumberFormat('en'); // XLSX always returns English format
  const targetFormat = getNumberFormat(locale);

  if (
    sourceFormat.thousandsSeparator === targetFormat.thousandsSeparator &&
    sourceFormat.decimalSeparator === targetFormat.decimalSeparator
  ) {
    return value;
  }

  // Pattern to match English-formatted numbers with optional currency symbols:
  // - Optional currency symbol at start (£, $, €, ¥, ₹, etc.) OR at end
  // - Optional whitespace around currency
  // - Digits with optional thousand separators and optional decimal separator
  const numberPattern = /^([$£€¥₹]\s?)?([\d,]+(?:\.\d+)?)(\s?[$£€¥₹])?$/;
  const match = value.match(numberPattern);

  if (!match) {
    return value;
  }

  const currencyPrefix = match[1] || '';
  const numericPart = match[2];
  const currencySuffix = match[3] || '';

  if (!isValidNumber(numericPart, sourceFormat)) {
    return value;
  }

  const convertedNumber = convertNumberFormat(numericPart, sourceFormat, targetFormat);
  return currencyPrefix + convertedNumber + currencySuffix;
}

/**
 * Validates if a string is a valid number in the given format
 * @param numericPart - The numeric part without currency symbols
 * @param format - The number format configuration
 */
function isValidNumber(
  numericPart: string,
  format: { thousandsSeparator: string; decimalSeparator: string }
): boolean {
  const withoutThousands = numericPart.replace(
    new RegExp(`\\${format.thousandsSeparator}`, 'g'),
    ''
  );
  const normalized = withoutThousands.replace(format.decimalSeparator, '.');

  const parsed = parseFloat(normalized);
  return !isNaN(parsed) && isFinite(parsed);
}

/**
 * Converts a number from one format to another
 * - Swaps thousand and decimal separators based on source and target formats
 *
 * @param number - Number in source format (e.g., "1,000.50")
 * @param sourceFormat - Source number format configuration
 * @param targetFormat - Target number format configuration
 * @returns Number in target format (e.g., "1.000,50")
 */
function convertNumberFormat(
  number: string,
  sourceFormat: { thousandsSeparator: string; decimalSeparator: string },
  targetFormat: { thousandsSeparator: string; decimalSeparator: string }
): string {
  const parts = number.split(sourceFormat.decimalSeparator);

  if (parts.length === 1) {
    // No decimal part, only thousands separators
    // Replace source thousands separator with target thousands separator
    return parts[0].replace(
      new RegExp(`\\${sourceFormat.thousandsSeparator}`, 'g'),
      targetFormat.thousandsSeparator
    );
  } else if (parts.length === 2) {
    // Has both integer and decimal parts
    // Integer part: replace thousands separator
    const integerPart = parts[0].replace(
      new RegExp(`\\${sourceFormat.thousandsSeparator}`, 'g'),
      targetFormat.thousandsSeparator
    );
    const decimalPart = parts[1];
    return `${integerPart}${targetFormat.decimalSeparator}${decimalPart}`;
  } else {
    return number;
  }
}
