// Content stream serialization

import { PDFOperation, PDFValue } from './types';

/**
 * Rebuild content stream from modified operations
 */
export function rebuildContentStream(operations: PDFOperation[]): Uint8Array {
  const parts: string[] = [];

  for (const operation of operations) {
    // Serialize operands
    for (const operand of operation.operands) {
      const serialized = serializeValue(operand);
      if (serialized) {
        parts.push(serialized);
        parts.push(' ');
      }
    }

    // Add operator
    parts.push(operation.operator);
    parts.push('\n');
  }

  const content = parts.join('');
  return new TextEncoder().encode(content);
}

/**
 * Serialize a PDF value to string
 */
function serializeValue(value: PDFValue): string {
  // Number
  if (typeof value === 'number') {
    return value.toString();
  }

  // String (name like /F1)
  if (typeof value === 'string') {
    return value;
  }

  // Byte array (text string)
  if (value instanceof Uint8Array) {
    return bytesToStringLiteral(value);
  }

  // Array
  if (Array.isArray(value)) {
    const elements = value.map(serializeValue).filter(Boolean);
    return `[${elements.join(' ')}]`;
  }

  // Dictionary (shouldn't appear in content streams, but handle anyway)
  if (typeof value === 'object' && value !== null) {
    return '<<>>';
  }

  return '';
}

/**
 * Convert bytes to PDF string literal with proper escaping
 */
function bytesToStringLiteral(bytes: Uint8Array): string {
  let result = '(';

  for (const byte of bytes) {
    // Escape special characters
    if (byte === 0x28) {
      // (
      result += '\\(';
    } else if (byte === 0x29) {
      // )
      result += '\\)';
    } else if (byte === 0x5C) {
      // \
      result += '\\\\';
    } else if (byte === 0x0A) {
      // \n
      result += '\\n';
    } else if (byte === 0x0D) {
      // \r
      result += '\\r';
    } else if (byte === 0x09) {
      // \t
      result += '\\t';
    } else if (byte === 0x08) {
      // \b
      result += '\\b';
    } else if (byte === 0x0C) {
      // \f
      result += '\\f';
    } else if (byte >= 32 && byte <= 126) {
      // Printable ASCII
      result += String.fromCharCode(byte);
    } else {
      // Octal escape for non-printable characters
      result += '\\' + byte.toString(8).padStart(3, '0');
    }
  }

  result += ')';
  return result;
}
