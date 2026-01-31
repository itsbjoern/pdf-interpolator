import { encodeTextWithFallback } from './font-handler';
import type { FontRegistry } from './font-registry';
import type { PDFOperation, ReplacementEntry, TextBlock } from './types';

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
 * Perform text replacements on a single TextBlock (surgical approach)
 * Updates the block in-place and sets the modified flag
 * Uses FontRegistry for cross-font character fallback
 * Dynamically injects Tf operators when font changes are needed
 */
export function performReplacementsOnBlock(
  block: TextBlock,
  replacements: ReplacementEntry[],
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

      if (!element.text.includes(source)) {
        continue;
      }

      const matches = element.text.match(new RegExp(escapeRegex(source), 'g')) || [];
      const matchCount = matches.length;
      totalMatches += matchCount;

      const newText = element.text.replace(new RegExp(escapeRegex(source), 'g'), target);

      const encodedText = encodeTextWithFallback(newText, element.font, fontRegistry);
      if (!encodedText.success) {
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

      const operations: PDFOperation[] = [];
      let currentFont = element.font;
      let fontChanged = false;

      for (const segment of encodedText.segments) {
        // Inject Tf operator if font changed
        if (segment.font.name !== currentFont.name) {
          const fontName = segment.font.name.startsWith('/')
            ? segment.font.name
            : `/${segment.font.name}`;

          operations.push({
            operator: 'Tf',
            operands: [fontName, block.currentFontSize],
            startIndex: 0,
            endIndex: 0
          });

          currentFont = segment.font;
          fontChanged = true;
        }

        // Add Tj operator with the text segment
        operations.push({
          operator: 'Tj',
          operands: [segment.bytes],
          startIndex: 0,
          endIndex: 0
        });
      }

      // Revert to original font if we switched away from it
      if (fontChanged && currentFont.name !== element.font.name) {
        const originalFontName = element.font.name.startsWith('/')
          ? element.font.name
          : `/${element.font.name}`;

        operations.push({
          operator: 'Tf',
          operands: [originalFontName, block.currentFontSize],
          startIndex: 0,
          endIndex: 0
        });
      }

      // If we generated multiple operations or font changed, store as replacement
      // Otherwise, update in place for single operation with same font
      if (operations.length > 1 || fontChanged) {
        const opIndex = block.operations.indexOf(element.operation);
        if (opIndex !== -1) {
          if (!block.operationReplacements) {
            block.operationReplacements = new Map();
          }
          block.operationReplacements.set(opIndex, operations);
          blockModified = true;
          totalCount += matchCount;
          element.text = newText;
        } else {
          console.warn(
            `[Text Replacer] WARNING: Could not find operation in block.operations array!`
          );
        }
      } else {
        element.operation.operands = operations[0].operands;
        blockModified = true;
        totalCount += matchCount;
        element.text = newText;
      }
    }
  }

  block.modified = blockModified;

  return {
    modified: blockModified,
    count: totalCount,
    matchCount: totalMatches,
    characterIssues
  };
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
