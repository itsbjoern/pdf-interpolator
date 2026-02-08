/**
 * Marked Content Handler
 *
 * Processes PDF marked content (BDC/EMC) operators after text replacement:
 * - Removes empty marked content sections where all text operators have been deleted
 * - Updates ActualText properties to match replaced text for accessibility
 * - Handles nested marked content correctly
 */

import type { TextBlock, PDFOperation, PDFDict } from './types';

/**
 * Represents a matched BDC/EMC pair
 */
interface MarkedContentPair {
  bdcIndex: number;                    // Index in block.operations
  emcIndex: number;                    // Index in block.operations
  bdcOperation: PDFOperation;
  emcOperation: PDFOperation;
  tag: string;                         // e.g., "/Span"
  properties: PDFDict | null;          // Dictionary (may contain /ActualText)
  containedOperations: PDFOperation[];
  containsText: boolean;               // Has text operators after replacement
  depth: number;                       // Nesting depth
}

/**
 * Information about text content in a marked section
 */
interface TextContentInfo {
  hasTextOperators: boolean;
  extractedText: string;
  isEmpty: boolean;
}

/**
 * Statistics about marked content processing
 */
export interface MarkedContentStats {
  totalPairs: number;
  emptyRemoved: number;
  actualTextUpdated: number;
}

/**
 * Process marked content (BDC/EMC pairs) in a TextBlock after text replacement
 * - Removes empty marked content sections
 * - Updates ActualText properties to match replaced text
 *
 * @param block - TextBlock that has been processed for text replacement
 * @returns Statistics about marked content processing
 */
export function processMarkedContent(
  block: TextBlock
): MarkedContentStats {
  // Early exit optimization
  const hasBDC = block.operations.some(op => op.operator === 'BDC');
  if (!hasBDC) {
    return { totalPairs: 0, emptyRemoved: 0, actualTextUpdated: 0 };
  }

  // 1. Find all BDC/EMC pairs (handles nesting)
  const pairs = findMarkedContentPairs(block);

  if (pairs.length === 0) {
    return { totalPairs: 0, emptyRemoved: 0, actualTextUpdated: 0 };
  }

  // 2. Analyze each pair for text content (accounting for operationReplacements)
  analyzePairs(pairs, block);

  // 3. Update ActualText in non-empty pairs
  const updatedCount = updateActualText(pairs, block);

  // 4. Remove empty pairs
  const removedCount = removeEmptyPairs(pairs, block);

  return {
    totalPairs: pairs.length,
    emptyRemoved: removedCount,
    actualTextUpdated: updatedCount
  };
}

/**
 * Find all BDC/EMC pairs using stack-based matching
 * Handles nested marked content correctly
 */
function findMarkedContentPairs(block: TextBlock): MarkedContentPair[] {
  const pairs: MarkedContentPair[] = [];
  const stack: Array<{
    bdcIndex: number;
    bdcOperation: PDFOperation;
    tag: string;
    properties: PDFDict | null;
    depth: number;
  }> = [];

  for (let i = 0; i < block.operations.length; i++) {
    const op = block.operations[i];

    // BDC operator has 2 forms:
    // 1. With properties: /Tag <<dict>> BDC
    // 2. Tag only: /Tag BDC (less common, but valid)
    if (op.operator === 'BDC') {
      if (op.operands.length >= 2) {
        // Full BDC with properties
        const tag = op.operands[0] as string; // e.g., "/Span"
        const properties = op.operands[1] as PDFDict;

        stack.push({
          bdcIndex: i,
          bdcOperation: op,
          tag: tag,
          properties: properties,
          depth: stack.length // Current depth before push
        });
      } else if (op.operands.length === 1) {
        // Tag-only BDC (no properties to update later)
        const tag = op.operands[0] as string;

        stack.push({
          bdcIndex: i,
          bdcOperation: op,
          tag: tag,
          properties: null,
          depth: stack.length
        });
      } else {
        console.warn('[Marked Content] Invalid BDC operator at index', i);
      }
    }

    // EMC operator: closes the most recent BDC
    else if (op.operator === 'EMC') {
      if (stack.length > 0) {
        const bdcInfo = stack.pop()!;

        // Collect all operations between BDC and EMC
        const containedOperations = block.operations.slice(
          bdcInfo.bdcIndex + 1,
          i
        );

        pairs.push({
          bdcIndex: bdcInfo.bdcIndex,
          emcIndex: i,
          bdcOperation: bdcInfo.bdcOperation,
          emcOperation: op,
          tag: bdcInfo.tag,
          properties: bdcInfo.properties,
          containedOperations,
          containsText: false, // Will be determined in analysis
          depth: bdcInfo.depth
        });
      } else {
        console.warn('[Marked Content] Unmatched EMC operator at index', i);
      }
    }
  }

  // Warn about unmatched BDC operators (malformed PDF)
  if (stack.length > 0) {
    console.warn(
      '[Marked Content] Unmatched BDC operators:',
      stack.length,
      'pairs incomplete'
    );
  }

  return pairs;
}

/**
 * Analyze all pairs to determine if they contain text
 * Must account for operationReplacements map
 */
function analyzePairs(
  pairs: MarkedContentPair[],
  block: TextBlock
): void {
  for (const pair of pairs) {
    const textInfo = analyzeTextContent(pair, block);
    pair.containsText = !textInfo.isEmpty;
  }
}

/**
 * Analyze text content in a marked content section
 * Accounts for operations that may have been replaced/deleted
 */
function analyzeTextContent(
  pair: MarkedContentPair,
  block: TextBlock
): TextContentInfo {
  const textOperators = new Set(['Tj', 'TJ', "'", '"']);
  let hasTextOperators = false;
  let hasNonEmptyText = false;

  // Check operations between BDC and EMC
  for (let i = pair.bdcIndex + 1; i < pair.emcIndex; i++) {
    const opIndex = i;
    const operation = block.operations[opIndex];

    // Check if this operation was replaced
    const replacements = block.operationReplacements?.get(opIndex);

    // If replaced with empty array, operation was deleted
    if (replacements !== undefined && replacements.length === 0) {
      continue;
    }

    // If replaced with new operations, check those instead
    const opsToCheck = replacements || [operation];

    for (const op of opsToCheck) {
      if (textOperators.has(op.operator)) {
        hasTextOperators = true;

        // Check if this operation has non-empty text
        if (hasNonEmptyTextContent(op)) {
          hasNonEmptyText = true;
          break;
        }
      }
    }

    if (hasNonEmptyText) break;
  }

  return {
    hasTextOperators,
    extractedText: hasNonEmptyText ? '(text)' : '',
    isEmpty: !hasNonEmptyText
  };
}

/**
 * Check if a text operation has non-empty content
 * Simplified check - just looks for Uint8Array operands with length > 0
 */
function hasNonEmptyTextContent(operation: PDFOperation): boolean {
  if (operation.operator === 'Tj') {
    const textBytes = operation.operands[0];
    return textBytes instanceof Uint8Array && textBytes.length > 0;
  }

  if (operation.operator === 'TJ') {
    const array = operation.operands[0];
    if (Array.isArray(array)) {
      for (const item of array) {
        if (item instanceof Uint8Array && item.length > 0) {
          return true;
        }
      }
    }
    return false;
  }

  if (operation.operator === "'") {
    const textBytes = operation.operands[0];
    return textBytes instanceof Uint8Array && textBytes.length > 0;
  }

  if (operation.operator === '"') {
    const textBytes = operation.operands[2]; // Third operand for "
    return textBytes instanceof Uint8Array && textBytes.length > 0;
  }

  return false;
}

/**
 * Update ActualText properties in non-empty pairs
 * ActualText should match the actual rendered text
 */
function updateActualText(
  pairs: MarkedContentPair[],
  block: TextBlock
): number {
  let updatedCount = 0;

  for (const pair of pairs) {
    // Skip empty pairs (will be removed)
    if (!pair.containsText) {
      continue;
    }

    // Skip if no properties dictionary
    if (!pair.properties) {
      continue;
    }

    // Check if ActualText exists in properties
    const actualTextKey = '/ActualText';
    if (!(actualTextKey in pair.properties)) {
      continue; // No ActualText to update
    }

    // Extract the rendered text from this marked content section
    const renderedText = extractRenderedText(pair, block);

    if (!renderedText.trim()) {
      continue; // Empty text, leave ActualText as-is
    }

    // Convert text to UTF-16BE hex string with BOM (format: <FEFF...>)
    const newActualTextBytes = stringToUTF16BEHex(renderedText);

    // Update the BDC operation's properties dictionary
    // We need to create a new properties object (immutable update pattern)
    const newProperties = { ...pair.properties };
    newProperties[actualTextKey] = newActualTextBytes;

    // Update the operation's operands
    pair.bdcOperation.operands[1] = newProperties;

    updatedCount++;

    console.log(
      `[Marked Content] Updated ActualText for ${pair.tag}: "${renderedText}"`
    );
  }

  return updatedCount;
}

/**
 * Extract rendered text from a marked content section
 * Uses block.textElements which already have decoded text
 */
function extractRenderedText(
  pair: MarkedContentPair,
  block: TextBlock
): string {
  let text = '';

  // Use block.textElements - they already have decoded text
  // Just need to check if their operations fall within this BDC/EMC pair
  for (const element of block.textElements) {
    const opIndex = block.operations.indexOf(element.operation);

    if (opIndex > pair.bdcIndex && opIndex < pair.emcIndex) {
      text += element.text;
    }
  }

  return text;
}

/**
 * Convert string to UTF-16BE hex string with BOM for ActualText
 * Format: Uint8Array representing the raw bytes of the hex-encoded string
 * Example: "W" -> FEFF0057 (BOM + UTF-16BE code for 'W')
 * The hex string is stored as raw bytes, the PDF serializer will format it as <FEFF0057>
 */
function stringToUTF16BEHex(text: string): Uint8Array {
  const bytes: number[] = [];

  // Add UTF-16BE BOM (Byte Order Mark)
  bytes.push(0xFE, 0xFF);

  // Convert each character to UTF-16BE
  for (let i = 0; i < text.length; i++) {
    const codePoint = text.codePointAt(i);

    if (codePoint === undefined) continue;

    if (codePoint <= 0xFFFF) {
      // BMP character - single UTF-16 code unit (2 bytes)
      bytes.push((codePoint >> 8) & 0xFF);  // High byte
      bytes.push(codePoint & 0xFF);          // Low byte
    } else {
      // Character outside BMP - surrogate pair (4 bytes)
      // JavaScript strings already use UTF-16, so extract surrogate pair
      const high = text.charCodeAt(i);
      const low = text.charCodeAt(i + 1);

      bytes.push((high >> 8) & 0xFF);
      bytes.push(high & 0xFF);
      bytes.push((low >> 8) & 0xFF);
      bytes.push(low & 0xFF);

      i++; // Skip the low surrogate
    }
  }

  return new Uint8Array(bytes);
}

/**
 * Remove empty marked content pairs
 * Process deepest pairs first to handle nesting correctly
 */
function removeEmptyPairs(
  pairs: MarkedContentPair[],
  block: TextBlock
): number {
  let removedCount = 0;

  // Sort pairs by depth (deepest first) to handle nested content correctly
  // This ensures we remove inner pairs before outer pairs
  const sortedPairs = [...pairs].sort((a, b) => b.depth - a.depth);

  for (const pair of sortedPairs) {
    if (!pair.containsText) {
      // Initialize operationReplacements if needed
      if (!block.operationReplacements) {
        block.operationReplacements = new Map();
      }

      // Mark BDC for removal (empty array = delete)
      block.operationReplacements.set(pair.bdcIndex, []);

      // Mark all operations between BDC and EMC for removal
      for (let i = pair.bdcIndex + 1; i < pair.emcIndex; i++) {
        // Only mark if not already marked
        if (!block.operationReplacements.has(i)) {
          block.operationReplacements.set(i, []);
        }
      }

      // Mark EMC for removal
      block.operationReplacements.set(pair.emcIndex, []);

      removedCount++;

      console.log(
        `[Marked Content] Removed empty pair ${pair.tag} at indices ${pair.bdcIndex}-${pair.emcIndex}`
      );
    }
  }

  return removedCount;
}
