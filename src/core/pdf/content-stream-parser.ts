// Content stream parser for PDF operations

import { PDFOperation, PDFValue } from './types';
import { ContentStreamParseError } from './error-handler';

/**
 * Parse a PDF content stream into structured operations
 */
export function parseContentStream(streamBytes: Uint8Array, pageIndex?: number): PDFOperation[] {
  try {
    const content = new TextDecoder('latin1').decode(streamBytes);
    console.log(`[Content Parser] Parsing content stream (${streamBytes.length} bytes, ${content.length} chars)`);
    const tokens = tokenize(content);
    console.log(`[Content Parser] Tokenized into ${tokens.length} tokens`);
    const allOperations = parseTokens(tokens);
    console.log(`[Content Parser] Parsed into ${allOperations.length} operations`);

    // Filter to only include operations within text blocks (BT...ET)
    const textBlockOperations = filterTextBlockOperations(allOperations);
    console.log(`[Content Parser] Found ${textBlockOperations.length} operations within text blocks`);

    // Log operator types
    const operatorCounts = new Map<string, number>();
    for (const op of textBlockOperations) {
      operatorCounts.set(op.operator, (operatorCounts.get(op.operator) || 0) + 1);
    }
    console.log('[Content Parser] Text block operator breakdown:', Object.fromEntries(operatorCounts));

    return textBlockOperations;
  } catch (error) {
    if (error instanceof Error) {
      throw new ContentStreamParseError(error.message, pageIndex);
    }
    throw new ContentStreamParseError('Unknown error', pageIndex);
  }
}

/**
 * Filter operations to only include those within text blocks (BT...ET)
 */
function filterTextBlockOperations(operations: PDFOperation[]): PDFOperation[] {
  const textBlockOps: PDFOperation[] = [];
  let inTextBlock = false;

  for (const op of operations) {
    if (op.operator === 'BT') {
      // Begin text block
      inTextBlock = true;
      textBlockOps.push(op);
    } else if (op.operator === 'ET') {
      // End text block
      textBlockOps.push(op);
      inTextBlock = false;
    } else if (inTextBlock) {
      // Inside text block, include operation
      textBlockOps.push(op);
    }
  }

  return textBlockOps;
}

/**
 * Tokenize content stream into tokens
 */
function tokenize(content: string): string[] {
  const tokens: string[] = [];
  let i = 0;

  while (i < content.length) {
    const char = content[i];

    // Skip whitespace
    if (/\s/.test(char)) {
      i++;
      continue;
    }

    // String literal: (text)
    if (char === '(') {
      let depth = 1;
      let str = '(';
      i++;

      while (i < content.length && depth > 0) {
        const c = content[i];
        str += c;

        if (c === '\\' && i + 1 < content.length) {
          // Escaped character
          i++;
          str += content[i];
        } else if (c === '(') {
          depth++;
        } else if (c === ')') {
          depth--;
        }
        i++;
      }

      tokens.push(str);
      continue;
    }

    // Hex string: <hex>
    if (char === '<' && i + 1 < content.length && content[i + 1] !== '<') {
      let str = '<';
      i++;

      while (i < content.length && content[i] !== '>') {
        str += content[i];
        i++;
      }

      if (i < content.length) {
        str += content[i]; // Add closing >
        i++;
      }

      tokens.push(str);
      continue;
    }

    // Array: [elements]
    if (char === '[') {
      tokens.push('[');
      i++;
      continue;
    }

    if (char === ']') {
      tokens.push(']');
      i++;
      continue;
    }

    // Dictionary: <<key value>>
    if (char === '<' && i + 1 < content.length && content[i + 1] === '<') {
      tokens.push('<<');
      i += 2;
      continue;
    }

    if (char === '>' && i + 1 < content.length && content[i + 1] === '>') {
      tokens.push('>>');
      i += 2;
      continue;
    }

    // Regular token (number, name, operator)
    let token = '';
    while (i < content.length && !/[\s\[\]<>()]/.test(content[i])) {
      token += content[i];
      i++;
    }

    if (token) {
      tokens.push(token);
    }
  }

  return tokens;
}

/**
 * Parse tokens into operations
 */
function parseTokens(tokens: string[]): PDFOperation[] {
  const operations: PDFOperation[] = [];
  const stack: PDFValue[] = [];
  let position = 0;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const startIndex = position;
    position += token.length + 1; // +1 for space

    // Array
    if (token === '[') {
      const array: PDFValue[] = [];
      i++;

      while (i < tokens.length && tokens[i] !== ']') {
        const value = parseValue(tokens[i]);
        if (value !== null) {
          array.push(value);
        }
        i++;
      }

      stack.push(array);
      continue;
    }

    // Skip closing brackets and dict markers (we don't parse dicts in content streams)
    if (token === ']' || token === '<<' || token === '>>') {
      continue;
    }

    // Check if token is an operator (contains only letters)
    if (/^[a-zA-Z'"*]+$/.test(token)) {
      // This is an operator
      const operation: PDFOperation = {
        operator: token,
        operands: [...stack],
        startIndex,
        endIndex: position
      };

      operations.push(operation);
      stack.length = 0; // Clear stack
    } else {
      // This is an operand
      const value = parseValue(token);
      if (value !== null) {
        stack.push(value);
      }
    }
  }

  return operations;
}

/**
 * Parse a single token value
 */
function parseValue(token: string): PDFValue | null {
  // String literal
  if (token.startsWith('(') && token.endsWith(')')) {
    return stringLiteralToBytes(token);
  }

  // Hex string
  if (token.startsWith('<') && token.endsWith('>')) {
    return hexStringToBytes(token);
  }

  // Name
  if (token.startsWith('/')) {
    return token;
  }

  // Number
  if (/^-?\d+\.?\d*$/.test(token)) {
    return parseFloat(token);
  }

  return null;
}

/**
 * Convert PDF string literal to bytes
 */
function stringLiteralToBytes(literal: string): Uint8Array {
  // Remove parentheses
  const content = literal.slice(1, -1);
  const bytes: number[] = [];

  let i = 0;
  while (i < content.length) {
    if (content[i] === '\\') {
      i++;
      if (i >= content.length) break;

      const escaped = content[i];
      switch (escaped) {
        case 'n':
          bytes.push(0x0A);
          break;
        case 'r':
          bytes.push(0x0D);
          break;
        case 't':
          bytes.push(0x09);
          break;
        case 'b':
          bytes.push(0x08);
          break;
        case 'f':
          bytes.push(0x0C);
          break;
        case '(':
        case ')':
        case '\\':
          bytes.push(escaped.charCodeAt(0));
          break;
        default:
          // Octal escape
          if (/[0-7]/.test(escaped)) {
            let octal = escaped;
            let j = 1;
            while (j < 3 && i + j < content.length && /[0-7]/.test(content[i + j])) {
              octal += content[i + j];
              j++;
            }
            bytes.push(parseInt(octal, 8));
            i += j - 1;
          } else {
            bytes.push(escaped.charCodeAt(0));
          }
      }
      i++;
    } else {
      bytes.push(content.charCodeAt(i));
      i++;
    }
  }

  return new Uint8Array(bytes);
}

/**
 * Convert hex string to bytes
 */
function hexStringToBytes(hexString: string): Uint8Array {
  // Remove angle brackets
  const hex = hexString.slice(1, -1).replace(/\s/g, '');
  const bytes: number[] = [];

  for (let i = 0; i < hex.length; i += 2) {
    const byte = hex.slice(i, i + 2);
    bytes.push(parseInt(byte.padEnd(2, '0'), 16));
  }

  return new Uint8Array(bytes);
}
