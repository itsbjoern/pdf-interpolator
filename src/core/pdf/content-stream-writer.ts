// Content stream serialization

import { PDFValue, ParsedContentStream } from './types';

/**
 * Rebuild content stream from parsed data
 * Rebuilds entire stream from all operations (preserves graphics)
 * Handles operation replacements for multi-font text
 */
export function patchContentStream(parsed: ParsedContentStream): Uint8Array {
  const modifiedBlocks = parsed.textBlocks.filter((b) => b.modified);

  if (modifiedBlocks.length === 0) {
    return parsed.originalBytes;
  }

  // Build a map of operation -> TextBlock for quick lookup
  const operationToBlock = new Map<any, { block: any; localIndex: number }>();
  for (const block of parsed.textBlocks) {
    for (let i = 0; i < block.operations.length; i++) {
      operationToBlock.set(block.operations[i], { block, localIndex: i });
    }
  }

  // Rebuild entire stream from all operations
  // Build bytes directly to avoid string encoding issues with bytes 128-255
  const byteArrays: Uint8Array[] = [];

  for (const operation of parsed.allOperations) {
    // Check if this operation belongs to a text block with replacements
    const blockInfo = operationToBlock.get(operation);

    if (blockInfo && blockInfo.block.operationReplacements) {
      const replacements = blockInfo.block.operationReplacements.get(blockInfo.localIndex);

      if (replacements && replacements.length > 0) {
        for (const replOp of replacements) {
          byteArrays.push(serializeOperation(replOp));
        }
        continue; // Skip original operation
      }
    }

    // Serialize original operation (may have modified operands from simple replacement)
    byteArrays.push(serializeOperation(operation));
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
function serializeOperation(operation: any): Uint8Array {
  const parts: Uint8Array[] = [];

  // Serialize operands
  for (const operand of operation.operands) {
    const serialized = serializeValueToBytes(operand);
    if (serialized.length > 0) {
      parts.push(serialized);
      parts.push(new Uint8Array([0x20])); // space
    }
  }

  // Add operator
  const opBytes = new Uint8Array(operation.operator.length);
  for (let i = 0; i < operation.operator.length; i++) {
    opBytes[i] = operation.operator.charCodeAt(i);
  }
  parts.push(opBytes);
  parts.push(new Uint8Array([0x0d, 0x0a])); // newline

  // Concatenate parts
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
  // Number
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
    parts.push(new Uint8Array([0x5b])); // [

    for (let i = 0; i < value.length; i++) {
      parts.push(serializeValueToBytes(value[i]));
    }

    parts.push(new Uint8Array([0x5d])); // ]

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
    parts.push(new Uint8Array([0x3c, 0x3c])); // <<

    const dict = value as { [key: string]: PDFValue };
    const keys = Object.keys(dict);

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const val = dict[key];

      // Serialize key (should already have / prefix)
      const keyBytes = new Uint8Array(key.length);
      for (let j = 0; j < key.length; j++) {
        keyBytes[j] = key.charCodeAt(j);
      }
      parts.push(keyBytes);
      parts.push(new Uint8Array([0x20])); // space

      // Serialize value
      parts.push(serializeValueToBytes(val));

      // Add space between key-value pairs (except after last pair)
      if (i < keys.length - 1) {
        parts.push(new Uint8Array([0x20])); // space
      }
    }

    parts.push(new Uint8Array([0x3e, 0x3e])); // >>

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
 * Convert bytes to PDF hex string notation
 * Returns bytes directly to avoid JavaScript string encoding issues
 * Uses <...> notation instead of (...) to match original PDF encoding
 */
function bytesToPDFStringLiteral(bytes: Uint8Array): Uint8Array {
  const result: number[] = [];

  result.push(0x3c); // <

  // Convert each byte to two hex digits
  for (const byte of bytes) {
    const hex = byte.toString(16).toUpperCase().padStart(2, '0');
    result.push(hex.charCodeAt(0), hex.charCodeAt(1));
  }

  result.push(0x3e); // >

  const resultBytes = new Uint8Array(result);
  return resultBytes;
}
