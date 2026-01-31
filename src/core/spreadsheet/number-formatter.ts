import { getNumberFormat } from '@shared/i18n/format';

/**
 * Converts English-formatted numbers to locale-specific format
 *
 * @example
 * formatNumberForLocale('1,000.50', 'de') // '1.000,50'
 * formatNumberForLocale('€1,000.50', 'de') // '€1.000,50'
 * formatNumberForLocale('1,000.50 €', 'de') // '1.000,50 €'
 * formatNumberForLocale('1000.50', 'de') // '1000,50'
 * formatNumberForLocale('Text, with periods.', 'de') // 'Text, with periods.' (unchanged)
 */
export function formatNumberForLocale(value: string, locale: string): string {
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
  return !Number.isNaN(parsed) && Number.isFinite(parsed);
}

/**
 * Converts a number from one format to another
 * - Swaps thousand and decimal separators based on source and target formats
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
