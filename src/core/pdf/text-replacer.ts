// Text replacement logic

import { ReplacementEntry, PDFOperation, TextBlock, FontInfo } from './types';
import { encodeText } from './font-handler';

/**
 * Replacement statistics
 */
export interface ReplacementResult {
  modified: boolean;
  count: number;
  warnings: string[];
}

/**
 * Perform text replacements on a single TextBlock (NEW surgical approach)
 * Updates the block in-place and sets the modified flag
 */
export function performReplacementsOnBlock(
  block: TextBlock,
  replacements: ReplacementEntry[],
  fontMap: Map<string, FontInfo>
): ReplacementResult {
  let blockModified = false;
  let totalCount = 0;
  const warnings: string[] = [];

  for (const element of block.textElements) {
    for (const replacement of replacements) {
      const { source, target } = replacement;

      // Check if source text exists in this element
      if (!element.text.includes(source)) {
        continue;
      }

      // Try to encode the target text with the current font
      const encodedTarget = encodeText(target, element.font, fontMap);

      if (!encodedTarget) {
        const warning = `Cannot encode "${target}" with font ${element.font.name}`;
        if (!warnings.includes(warning)) {
          warnings.push(warning);
        }
        continue;
      }

      // Perform the replacement
      const newText = element.text.replace(new RegExp(escapeRegex(source), 'g'), target);
      const count = (element.text.match(new RegExp(escapeRegex(source), 'g')) || []).length;

      // Update the operation with new text
      const success = updateOperationText(
        element.operation,
        element.text,
        newText,
        element.font,
        fontMap
      );

      if (success) {
        blockModified = true;
        totalCount += count;
        element.text = newText;
      }
    }
  }

  // Mark block as modified
  block.modified = blockModified;

  return {
    modified: blockModified,
    count: totalCount,
    warnings
  };
}

/**
 * Update operation text (modify operands in place)
 */
function updateOperationText(
  operation: PDFOperation,
  _oldText: string,
  newText: string,
  font: FontInfo,
  fontMap: Map<string, FontInfo>
): boolean {
  const { operator, operands } = operation;

  // Tj: Show text string
  if (operator === 'Tj' && operands.length >= 1) {
    const encoded = encodeText(newText, font, fontMap);
    if (encoded) {
      operands[0] = encoded;
      return true;
    }
    return false;
  }

  // TJ: Show text with individual character positioning
  if (operator === 'TJ' && operands.length >= 1) {
    const array = operands[0];
    if (Array.isArray(array)) {
      const encoded = encodeText(newText, font, fontMap);
      if (encoded) {
        // Replace entire array with just the new encoded text
        // This removes all old text segments and positioning adjustments
        operands[0] = [encoded];
        return true;
      }
    }
    return false;
  }

  // ' and " operators
  if (operator === "'" || operator === '"') {
    const textIndex = operator === "'" ? 0 : 2;
    if (operands.length > textIndex) {
      const encoded = encodeText(newText, font, fontMap);
      if (encoded) {
        operands[textIndex] = encoded;
        return true;
      }
    }
    return false;
  }

  return false;
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build replacement entries from spreadsheet data
 */
export function buildReplacementEntries(
  sourceValues: string[],
  targetValue: string
): ReplacementEntry[] {
  const entries: ReplacementEntry[] = [];

  for (const sourceValue of sourceValues) {
    if (sourceValue && sourceValue.trim()) {
      entries.push({
        source: targetValue, // What to find in PDF
        target: sourceValue // What to replace with
      });
    }
  }

  return entries;
}
