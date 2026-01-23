// Content stream serialization

import { PDFValue, ParsedContentStream } from './types';

/**
 * Rebuild content stream from parsed data
 * Rebuilds entire stream from all operations (preserves graphics)
 */
export function patchContentStream(parsed: ParsedContentStream): Uint8Array {
  const modifiedBlocks = parsed.textBlocks.filter((b) => b.modified);

  if (modifiedBlocks.length === 0) {
    return parsed.originalBytes;
  }

  // Rebuild entire stream from all operations
  // This preserves graphics but doesn't try to do byte-level patching
  const parts: string[] = [];

  for (const operation of parsed.allOperations) {
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

  return new TextEncoder().encode(parts.join(''));
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
    } else if (byte === 0x5c) {
      // \
      result += '\\\\';
    } else if (byte === 0x0a) {
      // \n
      result += '\\n';
    } else if (byte === 0x0d) {
      // \r
      result += '\\r';
    } else if (byte === 0x09) {
      // \t
      result += '\\t';
    } else if (byte === 0x08) {
      // \b
      result += '\\b';
    } else if (byte === 0x0c) {
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
