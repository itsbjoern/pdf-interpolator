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
 * Character position mapping for cross-element replacement
 */
interface CharacterMapping {
  elementIndex: number;
  charIndexInElement: number;
}

/**
 * Perform text replacements on a single TextBlock (surgical approach)
 * Updates the block in-place and sets the modified flag
 * Uses FontRegistry for cross-font character fallback
 * Dynamically injects Tf operators when font changes are needed
 *
 * NEW: Handles replacements that span across multiple text elements
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

  // Build full text representation and character mapping
  let fullText = '';
  const charMap: CharacterMapping[] = [];

  for (let elemIdx = 0; elemIdx < block.textElements.length; elemIdx++) {
    const element = block.textElements[elemIdx];
    for (let charIdx = 0; charIdx < element.text.length; charIdx++) {
      fullText += element.text[charIdx];
      charMap.push({ elementIndex: elemIdx, charIndexInElement: charIdx });
    }
  }

  if (fullText.trim().length === 0) {
    return {
      modified: false,
      count: 0,
      matchCount: 0,
      characterIssues
    };
  }

  console.log('fullText in block:', fullText);

  // Track which elements have been processed to avoid duplicate replacements
  const processedElements = new Set<number>();

  // Find and apply replacements in the full text
  for (const replacement of replacements) {
    const { source, target } = replacement;

    if (!fullText.includes(source)) {
      continue;
    }

    // Find all matches in the full text
    const regex = new RegExp(escapeRegex(source), 'g');
    let match: RegExpExecArray | null;
    const matches: Array<{ start: number; end: number }> = [];

    // biome-ignore lint/suspicious/noAssignInExpressions: allow here
    while ((match = regex.exec(fullText)) !== null) {
      matches.push({ start: match.index, end: match.index + source.length });
    }

    totalMatches += matches.length;

    // Process each match
    for (const matchPos of matches) {
      // Determine which elements this match spans
      const startMapping = charMap[matchPos.start];
      const endMapping = charMap[matchPos.end - 1];

      if (!startMapping || !endMapping) {
        console.warn('[Text Replacer] Invalid match position');
        continue;
      }

      const startElemIdx = startMapping.elementIndex;
      const endElemIdx = endMapping.elementIndex;

      // Skip if any element in this range was already processed
      let alreadyProcessed = false;
      for (let i = startElemIdx; i <= endElemIdx; i++) {
        if (processedElements.has(i)) {
          alreadyProcessed = true;
          break;
        }
      }
      if (alreadyProcessed) {
        continue;
      }

      // Mark elements as processed
      for (let i = startElemIdx; i <= endElemIdx; i++) {
        processedElements.add(i);
      }

      // Case 1: Match is within a single element
      if (startElemIdx === endElemIdx) {
        const element = block.textElements[startElemIdx];
        const result = replaceSingleElement(
          element,
          source,
          target,
          block,
          fontRegistry,
          characterIssues
        );
        if (result) {
          blockModified = true;
          totalCount++;
        }
      }
      // Case 2: Match spans multiple elements
      else {
        const result = replaceAcrossElements(
          block,
          startElemIdx,
          endElemIdx,
          startMapping.charIndexInElement,
          endMapping.charIndexInElement,
          target,
          fontRegistry,
          characterIssues
        );
        if (result) {
          blockModified = true;
          totalCount++;
        }
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
 * Replace text within a single element
 */
function replaceSingleElement(
  element: any,
  source: string,
  target: string,
  block: TextBlock,
  fontRegistry: FontRegistry,
  characterIssues: Map<string, Set<string>>
): boolean {
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
    return false;
  }

  const operations: PDFOperation[] = [];
  let currentFont = element.font;
  let fontChanged = false;

  for (const segment of encodedText.segments) {
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

    operations.push({
      operator: 'Tj',
      operands: [segment.bytes],
      startIndex: 0,
      endIndex: 0
    });
  }

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

  if (operations.length > 1 || fontChanged) {
    const opIndex = block.operations.indexOf(element.operation);
    if (opIndex !== -1) {
      if (!block.operationReplacements) {
        block.operationReplacements = new Map();
      }
      block.operationReplacements.set(opIndex, operations);

      if (element.combinedOperations && element.combinedOperations.length > 1) {
        for (let j = 1; j < element.combinedOperations.length; j++) {
          const combinedOpIndex = block.operations.indexOf(element.combinedOperations[j]);
          if (combinedOpIndex !== -1) {
            block.operationReplacements.set(combinedOpIndex, []);
          }
        }
      }

      element.text = newText;
      return true;
    }
  } else {
    element.operation.operands = operations[0].operands;

    if (element.combinedOperations && element.combinedOperations.length > 1) {
      if (!block.operationReplacements) {
        block.operationReplacements = new Map();
      }
      for (let j = 1; j < element.combinedOperations.length; j++) {
        const combinedOpIndex = block.operations.indexOf(element.combinedOperations[j]);
        if (combinedOpIndex !== -1) {
          block.operationReplacements.set(combinedOpIndex, []);
        }
      }
    }

    element.text = newText;
    return true;
  }

  return false;
}

/**
 * Replace text that spans across multiple elements
 */
function replaceAcrossElements(
  block: TextBlock,
  startElemIdx: number,
  endElemIdx: number,
  startCharIdx: number,
  endCharIdx: number,
  target: string,
  fontRegistry: FontRegistry,
  characterIssues: Map<string, Set<string>>
): boolean {
  const firstElement = block.textElements[startElemIdx];
  const lastElement = block.textElements[endElemIdx];

  // Build the replacement text: prefix + target + suffix
  const prefix = firstElement.text.substring(0, startCharIdx);
  const suffix = lastElement.text.substring(endCharIdx + 1);
  const newText = prefix + target + suffix;

  // Try to encode with the first element's font
  const encodedText = encodeTextWithFallback(newText, firstElement.font, fontRegistry);
  if (!encodedText.success) {
    if (encodedText.missingCharacters && encodedText.missingCharacters.length > 0) {
      for (const char of encodedText.missingCharacters) {
        if (!characterIssues.has(char)) {
          characterIssues.set(char, new Set());
        }
        characterIssues.get(char)!.add(newText);
      }
    }
    return false;
  }

  const operations: PDFOperation[] = [];
  let currentFont = firstElement.font;
  let fontChanged = false;

  for (const segment of encodedText.segments) {
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

    operations.push({
      operator: 'Tj',
      operands: [segment.bytes],
      startIndex: 0,
      endIndex: 0
    });
  }

  if (fontChanged && currentFont.name !== firstElement.font.name) {
    const originalFontName = firstElement.font.name.startsWith('/')
      ? firstElement.font.name
      : `/${firstElement.font.name}`;

    operations.push({
      operator: 'Tf',
      operands: [originalFontName, block.currentFontSize],
      startIndex: 0,
      endIndex: 0
    });
  }

  // Replace first element with new operations
  const firstOpIndex = block.operations.indexOf(firstElement.operation);
  if (firstOpIndex === -1) {
    console.warn('[Text Replacer] Could not find first operation');
    return false;
  }

  if (!block.operationReplacements) {
    block.operationReplacements = new Map();
  }

  block.operationReplacements.set(firstOpIndex, operations);

  // Handle combined operations of first element
  if (firstElement.combinedOperations && firstElement.combinedOperations.length > 1) {
    for (let j = 1; j < firstElement.combinedOperations.length; j++) {
      const combinedOpIndex = block.operations.indexOf(firstElement.combinedOperations[j]);
      if (combinedOpIndex !== -1) {
        block.operationReplacements.set(combinedOpIndex, []);
      }
    }
  }

  // Mark all middle and last elements for removal
  for (let i = startElemIdx + 1; i <= endElemIdx; i++) {
    const element = block.textElements[i];
    const opIndex = block.operations.indexOf(element.operation);
    if (opIndex !== -1) {
      block.operationReplacements.set(opIndex, []);
    }

    if (element.combinedOperations && element.combinedOperations.length > 1) {
      for (let j = 1; j < element.combinedOperations.length; j++) {
        const combinedOpIndex = block.operations.indexOf(element.combinedOperations[j]);
        if (combinedOpIndex !== -1) {
          block.operationReplacements.set(combinedOpIndex, []);
        }
      }
    }
  }

  // Update text elements
  firstElement.text = newText;

  return true;
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
