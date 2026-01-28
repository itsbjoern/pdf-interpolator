// Text replacement logic

import { encodeText, encodeTextWithFallback } from './font-handler';
import type { FontRegistry } from './font-registry';
import type { EncodedText, FontInfo, PDFOperation, ReplacementEntry, TextBlock } from './types';

/**
 * Character issue tracking
 */
export interface CharacterIssue {
  character: string;
  strings: Set<string>;
}

/**
 * Replacement statistics
 */
export interface ReplacementResult {
  modified: boolean;
  count: number; // Successful replacements
  matchCount: number; // Total matches attempted
  characterIssues: Map<string, Set<string>>; // character -> set of strings
}

/**
 * Create PDF operations for multi-font encoded text
 * Injects Tf operators when font switches are needed
 * IMPORTANT: Reverts back to original font after replacement
 */
function createOperationsForMultiFont(
  encodedText: EncodedText,
  originalFont: FontInfo,
  currentFontSize: number
): PDFOperation[] {
  const operations: PDFOperation[] = [];

  if (encodedText.segments.length === 0) {
    return operations;
  }

  let lastFont = originalFont;

  for (const segment of encodedText.segments) {
    // Inject Tf operator if font changed
    if (segment.font.name !== lastFont.name) {
      const fontName = segment.font.name.startsWith('/')
        ? segment.font.name
        : `/${segment.font.name}`;

      operations.push({
        operator: 'Tf',
        operands: [fontName, currentFontSize],
        startIndex: 0,
        endIndex: 0
      });

      lastFont = segment.font;

      console.log(`[Text Replacer] Injecting Tf operator: ${fontName} ${currentFontSize}`);
    }

    // Add Tj operator with the text segment
    operations.push({
      operator: 'Tj',
      operands: [segment.bytes],
      startIndex: 0,
      endIndex: 0
    });
  }

  // CRITICAL: Revert to original font if we switched away from it
  // This ensures subsequent operations in the same text block use the correct font
  if (lastFont.name !== originalFont.name) {
    const originalFontName = originalFont.name.startsWith('/')
      ? originalFont.name
      : `/${originalFont.name}`;

    operations.push({
      operator: 'Tf',
      operands: [originalFontName, currentFontSize],
      startIndex: 0,
      endIndex: 0
    });

    console.log(
      `[Text Replacer] Reverting to original font: ${originalFontName} ${currentFontSize}`
    );
  }

  return operations;
}

/**
 * Perform text replacements on a single TextBlock (NEW surgical approach)
 * Updates the block in-place and sets the modified flag
 * Uses FontRegistry for cross-font character fallback
 */
export function performReplacementsOnBlock(
  block: TextBlock,
  replacements: ReplacementEntry[],
  fontMap: Map<string, FontInfo>,
  fontRegistry: FontRegistry
): ReplacementResult {
  let blockModified = false;
  let totalCount = 0;
  let totalMatches = 0;
  const characterIssues = new Map<string, Set<string>>();

  for (let i = 0; i < block.textElements.length; i++) {
    const element = block.textElements[i];

    for (const replacement of replacements) {
      const { source, target } = replacement;

      // Check if source text exists in this element
      if (!element.text.includes(source)) {
        continue;
      }

      // Count matches
      const matches = element.text.match(new RegExp(escapeRegex(source), 'g')) || [];
      const matchCount = matches.length;
      totalMatches += matchCount;

      // Perform the replacement
      const newText = element.text.replace(new RegExp(escapeRegex(source), 'g'), target);

      const encodedText = encodeTextWithFallback(newText, element.font, fontRegistry);
      if (!encodedText.success) {
        // Track which characters caused issues
        if (encodedText.missingCharacters && encodedText.missingCharacters.length > 0) {
          for (const char of encodedText.missingCharacters) {
            if (!characterIssues.has(char)) {
              characterIssues.set(char, new Set());
            }
            characterIssues.get(char)!.add(newText);
          }
        }
        // Once there was a theoretical match but it failed due to encoding the whole text is marked as invalid. This prevents substring issues later on.
        break;
      }

      // Check if we need multi-font replacement
      const needsMultiFontReplacement =
        encodedText.segments.length > 1 ||
        (encodedText.segments.length === 1 &&
          encodedText.segments[0].font.name !== element.font.name);

      if (needsMultiFontReplacement) {
        // Complex case: need font switching
        console.log(
          `[Text Replacer] Multi-font replacement needed for "${newText}" (${encodedText.segments.length} segments)`
        );
        console.log(
          `[Text Replacer] Original font: ${element.font.name}, Original operation: ${element.operation.operator}`
        );

        const newOperations = createOperationsForMultiFont(
          encodedText,
          element.font,
          block.currentFontSize
        );

        // Store operation replacement
        const opIndex = block.operations.indexOf(element.operation);
        if (opIndex !== -1) {
          if (!block.operationReplacements) {
            block.operationReplacements = new Map();
          }
          block.operationReplacements.set(opIndex, newOperations);
          console.log(`[Text Replacer] Stored replacement for operation at index ${opIndex}`);
          blockModified = true;
          totalCount += matchCount;
          element.text = newText;
        } else {
          console.warn(
            `[Text Replacer] WARNING: Could not find operation in block.operations array!`
          );
        }
      } else {
        // Simple case: single font, update in place
        const success = updateOperationText(
          element.operation,
          element.text,
          newText,
          element.font,
          fontMap
        );

        if (success) {
          blockModified = true;
          totalCount += matchCount;
          element.text = newText;
        }
      }
    }
  }

  // Mark block as modified
  block.modified = blockModified;

  return {
    modified: blockModified,
    count: totalCount,
    matchCount: totalMatches,
    characterIssues
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
