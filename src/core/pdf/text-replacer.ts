// Text replacement logic

import { TextElement, ReplacementEntry, PDFOperation } from './types';
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
 * Perform text replacements on text elements
 */
export function performReplacements(
  textElements: TextElement[],
  replacements: ReplacementEntry[]
): Map<string, ReplacementResult> {
  const stats = new Map<string, ReplacementResult>();

  // Initialize stats for each replacement
  for (const replacement of replacements) {
    stats.set(replacement.source, {
      modified: false,
      count: 0,
      warnings: []
    });
  }

  console.log(`[Text Replacer] Processing ${textElements.length} text elements with ${replacements.length} replacement rules`);

  for (const element of textElements) {
    for (const replacement of replacements) {
      const { source, target } = replacement;

      // Check if source text exists in this element
      if (!element.text.includes(source)) {
        continue;
      }

      console.log(`[Text Replacer] Found match! "${source}" in text: "${element.text}"`);
      console.log(`[Text Replacer] Will replace with: "${target}"`);
      console.log(`[Text Replacer] Using font: ${element.font.name} (encoding: ${element.font.encoding})`);

      // Try to encode the target text with the current font
      const encodedTarget = encodeText(target, element.font);

      if (!encodedTarget) {
        // Cannot encode target with this font
        const stat = stats.get(source)!;
        const warning = `Cannot encode "${target}" with font ${element.font.name}`;
        console.warn(`[Text Replacer] ${warning}`);
        if (!stat.warnings.includes(warning)) {
          stat.warnings.push(warning);
        }
        continue;
      }

      console.log(`[Text Replacer] Successfully encoded target text`);

      // Perform the replacement
      const newText = element.text.replace(new RegExp(escapeRegex(source), 'g'), target);

      // Count occurrences
      const count = (element.text.match(new RegExp(escapeRegex(source), 'g')) || []).length;

      // Update the operation with new text
      const success = updateOperationText(element.operation, element.text, newText, element.font);

      if (success) {
        console.log(`[Text Replacer] Successfully updated operation. Count: ${count}`);
        const stat = stats.get(source)!;
        stat.modified = true;
        stat.count += count;

        // Update element text for potential subsequent replacements
        element.text = newText;
      } else {
        console.warn(`[Text Replacer] Failed to update operation text`);
      }
    }
  }

  return stats;
}

/**
 * Update operation text (modify operands in place)
 */
function updateOperationText(
  operation: PDFOperation,
  oldText: string,
  newText: string,
  font: any
): boolean {
  const { operator, operands } = operation;

  // Tj: Show text string
  if (operator === 'Tj' && operands.length >= 1) {
    const encoded = encodeText(newText, font);
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
      // Rebuild the array with replaced text
      // For simplicity, combine all text segments and replace, then create single text operand
      let combinedOldText = '';
      const textIndices: number[] = [];

      for (let i = 0; i < array.length; i++) {
        const item = array[i];
        if (item instanceof Uint8Array) {
          textIndices.push(i);
          combinedOldText += oldText;
        }
      }

      if (combinedOldText.includes(oldText)) {
        // Replace first text segment with full replaced text, remove others
        const encoded = encodeText(newText, font);
        if (encoded && textIndices.length > 0) {
          // Replace first text element
          array[textIndices[0]] = encoded;

          // Remove other text elements (backwards to maintain indices)
          for (let i = textIndices.length - 1; i > 0; i--) {
            array.splice(textIndices[i], 1);
          }

          return true;
        }
      }
    }
    return false;
  }

  // ' and " operators
  if ((operator === '\'' || operator === '"') && operands.length >= 1) {
    const textIndex = operator === '\'' ? 0 : 2;
    const encoded = encodeText(newText, font);
    if (encoded) {
      operands[textIndex] = encoded;
      return true;
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
