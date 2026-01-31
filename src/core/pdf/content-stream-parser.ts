import { ContentStreamParseError } from './error-handler';
import type { ParsedContentStream, PDFDict, PDFOperation, PDFValue, TextBlock } from './types';

/**
 * Parse a PDF content stream with position tracking for surgical editing
 * This is the NEW approach that preserves ALL operations and tracks BT/ET blocks
 */
export function parseContentStreamWithPositions(
  streamBytes: Uint8Array,
  pageIndex?: number
): ParsedContentStream {
  try {
    const content = new TextDecoder('latin1').decode(streamBytes);
    const tokens = tokenize(content);
    const allOperations = parseTokens(tokens);

    // Identify BT/ET blocks and track their positions
    const textBlocks: TextBlock[] = [];
    let currentBlock: (Partial<TextBlock> & { operations: PDFOperation[] }) | null = null;

    for (let i = 0; i < allOperations.length; i++) {
      const op = allOperations[i];

      if (op.operator === 'BT') {
        currentBlock = {
          btIndex: i,
          startBytePos: op.startIndex,
          operations: [op],
          fonts: new Map(),
          textElements: [],
          modified: false,
          currentFontSize: 12 // Default, will be updated by extractTextFromBlock
        };
      } else if (op.operator === 'ET' && currentBlock) {
        // End text block
        currentBlock.etIndex = i;
        currentBlock.endBytePos = op.endIndex;
        currentBlock.operations.push(op);
        textBlocks.push(currentBlock as TextBlock);
        currentBlock = null;
      } else if (currentBlock) {
        currentBlock.operations.push(op);
      }
    }

    return {
      originalBytes: streamBytes,
      allOperations,
      textBlocks
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new ContentStreamParseError(error.message, pageIndex);
    }
    throw new ContentStreamParseError('Unknown error', pageIndex);
  }
}

/**
 * Token with position information
 */
interface TokenWithPos {
  token: string;
  startPos: number;
  endPos: number;
}

/**
 * Tokenize content stream into tokens with byte positions
 */
function tokenize(content: string): TokenWithPos[] {
  const tokens: TokenWithPos[] = [];
  let i = 0;

  while (i < content.length) {
    const char = content[i];

    // Skip whitespace
    if (/\s/.test(char)) {
      i++;
      continue;
    }

    const startPos = i;

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

      tokens.push({ token: str, startPos, endPos: i });
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

      tokens.push({ token: str, startPos, endPos: i });
      continue;
    }

    // Array: [elements]
    if (char === '[') {
      tokens.push({ token: '[', startPos, endPos: i + 1 });
      i++;
      continue;
    }

    if (char === ']') {
      tokens.push({ token: ']', startPos, endPos: i + 1 });
      i++;
      continue;
    }

    // Dictionary: <<key value>>
    if (char === '<' && i + 1 < content.length && content[i + 1] === '<') {
      tokens.push({ token: '<<', startPos, endPos: i + 2 });
      i += 2;
      continue;
    }

    if (char === '>' && i + 1 < content.length && content[i + 1] === '>') {
      tokens.push({ token: '>>', startPos, endPos: i + 2 });
      i += 2;
      continue;
    }

    // Regular token (number, name, operator)
    let token = '';
    // biome-ignore lint/complexity/noUselessEscapeInRegex: More obvious if escaped
    while (i < content.length && !/[\s\[\]<>()]/.test(content[i])) {
      token += content[i];
      i++;
    }

    if (token) {
      tokens.push({ token, startPos, endPos: i });
    }
  }

  return tokens;
}

/**
 * Parse tokens into operations with accurate byte positions
 */
function parseTokens(tokens: TokenWithPos[]): PDFOperation[] {
  const operations: PDFOperation[] = [];
  const stack: PDFValue[] = [];
  let operandStartPos: number | null = null; // Track where operands for current operation start

  for (let i = 0; i < tokens.length; i++) {
    const { token, startPos, endPos } = tokens[i];

    // Array
    if (token === '[') {
      const array: PDFValue[] = [];
      const arrayStartPos = startPos;
      i++;

      while (i < tokens.length && tokens[i].token !== ']') {
        const value = parseValue(tokens[i].token);
        if (value !== null) {
          array.push(value);
        }
        i++;
      }

      // Track start of operands if this is the first operand
      if (operandStartPos === null) {
        operandStartPos = arrayStartPos;
      }

      stack.push(array);
      continue;
    }

    // Dictionary
    if (token === '<<') {
      const dict: PDFDict = {};
      const dictStartPos = startPos;
      i++;

      while (i < tokens.length && tokens[i].token !== '>>') {
        // Parse key (should be a name like /ActualText)
        const keyToken = tokens[i].token;
        if (!keyToken.startsWith('/')) {
          console.warn(`[Content Parser] Dictionary key "${keyToken}" doesn't start with /`);
          i++;
          continue;
        }

        const key = keyToken; // Keep the / prefix
        i++;

        if (i >= tokens.length || tokens[i].token === '>>') {
          console.warn(`[Content Parser] Dictionary key "${key}" has no value`);
          break;
        }

        // Parse value (can be any PDFValue including nested arrays/dicts)
        let value: PDFValue | null = null;

        if (tokens[i].token === '[') {
          // Array value
          const nestedArray: PDFValue[] = [];
          i++;
          while (i < tokens.length && tokens[i].token !== ']') {
            const arrValue = parseValue(tokens[i].token);
            if (arrValue !== null) {
              nestedArray.push(arrValue);
            }
            i++;
          }
          value = nestedArray;
          i++; // Skip ]
        } else if (tokens[i].token === '<<') {
          // Nested dictionary - we'll handle this recursively if needed
          // For now, skip nested dictionaries (rare in content streams)
          console.warn('[Content Parser] Nested dictionaries not fully supported yet');
          let depth = 1;
          i++;
          while (i < tokens.length && depth > 0) {
            if (tokens[i].token === '<<') depth++;
            if (tokens[i].token === '>>') depth--;
            i++;
          }
          continue;
        } else {
          // Simple value (name, string, number, etc.)
          value = parseValue(tokens[i].token);
          i++;
        }

        if (value !== null) {
          dict[key] = value;
        }
      }

      // Track start of operands if this is the first operand
      if (operandStartPos === null) {
        operandStartPos = dictStartPos;
      }

      stack.push(dict);
      continue;
    }

    // Skip closing markers (handled above)
    if (token === ']' || token === '>>') {
      continue;
    }

    // Check if token is an operator (contains only letters)
    if (/^[a-zA-Z'"*]+$/.test(token)) {
      // This is an operator
      // Determine the start of this operation
      let opStartIndex: number;
      if (operandStartPos !== null) {
        // We have operands, start from the first operand
        opStartIndex = operandStartPos;
      } else if (operations.length > 0) {
        // No operands, start from end of previous operation
        opStartIndex = operations[operations.length - 1].endIndex;
      } else {
        // No operands and first operation, start from operator position
        opStartIndex = startPos;
      }

      const operation: PDFOperation = {
        operator: token,
        operands: [...stack],
        startIndex: opStartIndex,
        endIndex: endPos
      };

      operations.push(operation);
      stack.length = 0; // Clear stack
      operandStartPos = null; // Reset for next operation
    } else {
      // This is an operand
      // Track start of operands if this is the first operand
      if (operandStartPos === null) {
        operandStartPos = startPos;
      }

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
          bytes.push(0x0a);
          break;
        case 'r':
          bytes.push(0x0d);
          break;
        case 't':
          bytes.push(0x09);
          break;
        case 'b':
          bytes.push(0x08);
          break;
        case 'f':
          bytes.push(0x0c);
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
