import { CHAR_BYTES } from '@shared/constants';
import type { ParsedContentStream, PDFOperation, PDFValue, TextBlock } from './types';

/**
 * Rebuild content stream from parsed data
 * Rebuilds entire stream from all operations (preserves graphics)
 * Handles operation replacements for multi-font text
 */
export function patchContentStream(parsed: ParsedContentStream): Uint8Array {
  const modifiedBlocks = parsed.textBlocks.filter((b) => b.modified);
  const hasGlobalRemovals = (parsed.globalOperationReplacements?.size ?? 0) > 0;

  if (modifiedBlocks.length === 0 && !hasGlobalRemovals) {
    return parsed.originalBytes;
  }

  // Build a map of operation -> TextBlock for quick lookup
  const operationToBlock = new Map<PDFOperation, { block: TextBlock; localIndex: number }>();
  for (const block of parsed.textBlocks) {
    for (let i = 0; i < block.operations.length; i++) {
      operationToBlock.set(block.operations[i], { block, localIndex: i });
    }
  }

  // Rebuild entire stream from all operations
  const byteArrays: Uint8Array[] = [];

  for (let i = 0; i < parsed.allOperations.length; i++) {
    const operation = parsed.allOperations[i];

    // Global replacements (e.g. BDC/EMC removal) apply to all operations
    const globalRepl = parsed.globalOperationReplacements?.get(i);
    if (globalRepl !== undefined) {
      if (globalRepl.length === 0) continue;
      for (const replOp of globalRepl) {
        byteArrays.push(serializeOperation(replOp));
      }
      continue;
    }

    const blockInfo = operationToBlock.get(operation);
    if (!blockInfo?.block.operationReplacements) {
      byteArrays.push(serializeOperation(operation));
      continue;
    }

    const replacements = blockInfo.block.operationReplacements.get(blockInfo.localIndex);

    // No replacement entry = use original operation
    if (replacements === undefined) {
      byteArrays.push(serializeOperation(operation));
      continue;
    }

    // Empty array = remove this operation (don't serialize)
    if (replacements.length === 0) {
      continue;
    }

    // Non-empty array = replace with new operations
    for (const replOp of replacements) {
      byteArrays.push(serializeOperation(replOp));
    }
  }

  // Concatenate all byte arrays
  const totalLength = byteArrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of byteArrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/**
 * Serialize a single PDF operation to bytes
 */
function serializeOperation(operation: PDFOperation): Uint8Array {
  const parts: Uint8Array[] = [];

  for (let i = 0; i < operation.operands.length; i++) {
    const operand = operation.operands[i];
    const serialized = serializeValueToBytes(operand);
    if (serialized.length > 0) {
      parts.push(serialized);

      // Only add space if next token needs it (not before delimiters or at end)
      const needsSpace = i < operation.operands.length - 1 || operation.operator.length > 0;
      if (needsSpace && !endsWithDelimiter(serialized)) {
        // Check if next operand starts with delimiter
        if (i < operation.operands.length - 1) {
          const nextSerialized = serializeValueToBytes(operation.operands[i + 1]);
          if (!startsWithDelimiter(nextSerialized)) {
            parts.push(new Uint8Array([CHAR_BYTES.SPACE]));
          }
        } else {
          // Space before operator
          parts.push(new Uint8Array([CHAR_BYTES.SPACE]));
        }
      }
    }
  }

  const opBytes = new Uint8Array(operation.operator.length);
  for (let i = 0; i < operation.operator.length; i++) {
    opBytes[i] = operation.operator.charCodeAt(i);
  }
  parts.push(opBytes);

  if (
    operation.operator === 'Tc' ||
    operation.operator === 'Tw' ||
    operation.operator === 'Ts' ||
    operation.operator === 'Tz' ||
    operation.operator === 'Tr'
  ) {
    parts.push(new Uint8Array([CHAR_BYTES.SPACE]));
  }

  if (operation.operator === 'W' || operation.operator === 'cs') {
    parts.push(new Uint8Array([CHAR_BYTES.SPACE]));
  } else {
    parts.push(new Uint8Array([CHAR_BYTES.CARRIAGE_RETURN, CHAR_BYTES.LINE_FEED]));
  }

  const totalLength = parts.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

/**
 * Serialize a PDF value to bytes (avoids string encoding issues)
 */
function serializeValueToBytes(value: PDFValue): Uint8Array {
  if (typeof value === 'number') {
    const str = value.toString();
    const bytes = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
      bytes[i] = str.charCodeAt(i);
    }
    return bytes;
  }

  // String (name like /F1)
  else if (typeof value === 'string') {
    const bytes = new Uint8Array(value.length);
    for (let i = 0; i < value.length; i++) {
      bytes[i] = value.charCodeAt(i);
    }
    return bytes;
  }

  // Byte array (text string)
  else if (value instanceof Uint8Array) {
    return bytesToPDFStringLiteral(value);
  }

  // Array
  else if (Array.isArray(value)) {
    const parts: Uint8Array[] = [];
    parts.push(new Uint8Array([CHAR_BYTES.OPEN_BRACKET]));

    for (let i = 0; i < value.length; i++) {
      parts.push(serializeValueToBytes(value[i]));
    }

    parts.push(new Uint8Array([CHAR_BYTES.CLOSE_BRACKET]));

    const totalLength = parts.reduce((sum, arr) => sum + arr.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of parts) {
      result.set(part, offset);
      offset += part.length;
    }
    return result;
  }

  // Dictionary (appears in content streams for BDC marked content, etc.)
  else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const parts: Uint8Array[] = [];
    parts.push(new Uint8Array([CHAR_BYTES.LESS_THAN, CHAR_BYTES.LESS_THAN]));

    const dict = value as { [key: string]: PDFValue };
    const keys = Object.keys(dict);

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const val = dict[key];

      const keyBytes = new Uint8Array(key.length);
      for (let j = 0; j < key.length; j++) {
        keyBytes[j] = key.charCodeAt(j);
      }
      parts.push(keyBytes);

      // Add space after key only if value doesn't start with delimiter
      const valBytes = serializeValueToBytes(val);
      if (!startsWithDelimiter(valBytes)) {
        parts.push(new Uint8Array([CHAR_BYTES.SPACE]));
      }

      parts.push(valBytes);

      // Add space between key-value pairs (except after last pair)
      // Only needed if value doesn't end with delimiter or next key doesn't start with /
      if (i < keys.length - 1) {
        if (!endsWithDelimiter(valBytes)) {
          parts.push(new Uint8Array([CHAR_BYTES.SPACE]));
        }
      }
    }

    parts.push(new Uint8Array([CHAR_BYTES.GREATER_THAN, CHAR_BYTES.GREATER_THAN]));

    const totalLength = parts.reduce((sum, arr) => sum + arr.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of parts) {
      result.set(part, offset);
      offset += part.length;
    }
    return result;
  }

  // Should never happen
  else {
    throw new Error(`Unsupported value type: ${typeof value}`);
  }
}

/**
 * Convert bytes to PDF string notation
 * Prefers literal notation (en-US) for readability and compatibility
 * Falls back to hex notation <...> only when necessary (special chars, binary data)
 */
function bytesToPDFStringLiteral(bytes: Uint8Array): Uint8Array {
  // Check if we can use literal notation: printable ASCII except ( ) \
  let canUseLiteral = true;
  for (const byte of bytes) {
    // Printable ASCII range (0x20-0x7E) excluding special chars
    if (byte < 0x20 || byte > 0x7e) {
      canUseLiteral = false;
      break;
    }
    // Check for characters that need escaping in literal strings
    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) {
      // ( ) \ need escaping, but we can still use literal notation
      continue;
    }
  }

  const result: number[] = [];

  if (canUseLiteral) {
    // Use literal notation: (en-US)
    result.push(CHAR_BYTES.OPEN_PAREN);

    for (const byte of bytes) {
      // Escape special characters
      if (byte === 0x28 || byte === 0x29 || byte === 0x5c) {
        // Escape (, ), and \
        result.push(0x5c); // backslash
      }

      result.push(byte);
    }

    result.push(CHAR_BYTES.CLOSE_PAREN);
  } else {
    // Use hex notation: <656E2D5553>
    result.push(CHAR_BYTES.LESS_THAN);

    for (const byte of bytes) {
      const hex = byte.toString(16).toUpperCase().padStart(2, '0');
      result.push(hex.charCodeAt(0), hex.charCodeAt(1));
    }

    result.push(CHAR_BYTES.GREATER_THAN);

    // Use octal notation: \065\065\065\065\065
    // result.push(CHAR_BYTES.OPEN_PAREN);
    // for (const byte of bytes) {
    //   result.push(CHAR_BYTES.BACKSLASH);
    //   const octal = byte.toString(8).padStart(3, '0');
    //   result.push(octal.charCodeAt(0), octal.charCodeAt(1), octal.charCodeAt(2));
    // }
    // result.push(CHAR_BYTES.CLOSE_PAREN);
  }

  return new Uint8Array(result);
}

/**
 * Check if a byte array starts with a PDF delimiter
 */
function startsWithDelimiter(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false;
  const first = bytes[0];

  if (bytes.length > 1) {
    const second = bytes[1];
    if (first === CHAR_BYTES.LESS_THAN && second === CHAR_BYTES.LESS_THAN) {
      return false;
    }
  }

  if (first === CHAR_BYTES.LESS_THAN || first === CHAR_BYTES.OPEN_BRACKET) {
    return true;
  }
  return false;
}

/**
 * Check if a byte array ends with a PDF delimiter
 */
function endsWithDelimiter(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false;
  const last = bytes[bytes.length - 1];

  if (bytes.length > 1) {
    const secondLast = bytes[bytes.length - 2];
    if (secondLast === CHAR_BYTES.GREATER_THAN && last === CHAR_BYTES.GREATER_THAN) {
      return false;
    }
  }

  // Check for >, ], ), and >> (need to check two bytes for >>)
  if (
    last === CHAR_BYTES.GREATER_THAN ||
    last === CHAR_BYTES.CLOSE_BRACKET ||
    last === CHAR_BYTES.CLOSE_PAREN
  ) {
    return true;
  }
  return false;
}
