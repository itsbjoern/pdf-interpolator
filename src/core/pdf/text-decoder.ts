import { decodeText } from './font-handler';
import type { FontInfo, TextBlock, TextElement } from './types';

/**
 * Check if an operator is a text-positioning operator
 */
function isPositioningOperator(operator: string): boolean {
  return operator === 'Td' || operator === 'TD' || operator === 'Tm' || operator === 'T*';
}

/**
 * Extract text from a single TextBlock (NEW surgical approach)
 * Processes only operations within this block and updates the block in-place
 * Combines consecutive text elements with the same font (no positioning operators between them)
 */
export function extractTextFromBlock(block: TextBlock, fontMap: Map<string, FontInfo>): void {
  const textElements: TextElement[] = [];
  const usedFonts = new Map<string, FontInfo>();
  let currentFont: FontInfo | null = null;
  let currentFontSize = 12; // Default font size

  // First pass: extract individual text segments
  const segments: Array<{ text: string; operation: any; font: FontInfo; index: number }> = [];

  for (let i = 0; i < block.operations.length; i++) {
    const operation = block.operations[i];
    const { operator, operands } = operation;

    // Tf: Set text font and size
    if (operator === 'Tf' && operands.length >= 2) {
      const fontName = operands[0] as string;
      const cleanFontName = fontName.startsWith('/') ? fontName.slice(1) : fontName;
      currentFont = fontMap.get(cleanFontName) || fontMap.get(fontName) || null;

      const fontSize = operands[1];
      if (typeof fontSize === 'number') {
        currentFontSize = fontSize;
      }

      if (currentFont) {
        usedFonts.set(cleanFontName, currentFont);
      }
      continue;
    }

    if (!currentFont) continue;

    // Tj: Show text string
    if (operator === 'Tj' && operands.length >= 1) {
      const textBytes = operands[0];
      if (textBytes instanceof Uint8Array) {
        const text = decodeText(textBytes, currentFont);
        segments.push({ text, operation, font: currentFont, index: i });
      }
      continue;
    }

    // TJ: Show text with individual character positioning
    if (operator === 'TJ' && operands.length >= 1) {
      const array = operands[0];
      if (Array.isArray(array)) {
        let combinedText = '';

        for (let j = 0; j < array.length; j++) {
          const item = array[j];
          if (item instanceof Uint8Array) {
            combinedText += decodeText(item, currentFont);
          }
        }

        if (combinedText) {
          segments.push({ text: combinedText, operation, font: currentFont, index: i });
        }
      }
      continue;
    }

    // ': Move to next line and show text
    if (operator === "'" && operands.length >= 1) {
      const textBytes = operands[0];
      if (textBytes instanceof Uint8Array) {
        const text = decodeText(textBytes, currentFont);
        segments.push({ text, operation, font: currentFont, index: i });
      }
      continue;
    }

    // ": Set word and character spacing, move to next line, and show text
    if (operator === '"' && operands.length >= 3) {
      const textBytes = operands[2];
      if (textBytes instanceof Uint8Array) {
        const text = decodeText(textBytes, currentFont);
        segments.push({ text, operation, font: currentFont, index: i });
      }
    }
  }

  // Second pass: combine consecutive segments with same font
  let i = 0;
  while (i < segments.length) {
    const firstSegment = segments[i];
    let combinedText = firstSegment.text;
    const operations = [firstSegment.operation];
    let j = i + 1;

    // Look ahead to combine consecutive same-font text
    while (j < segments.length) {
      const nextSegment = segments[j];

      // Check if next segment has same font
      if (nextSegment.font.name !== firstSegment.font.name) {
        break;
      }

      // Check if there's a positioning operator between them
      let hasPositioningBetween = false;
      for (let k = segments[j - 1].index + 1; k < nextSegment.index; k++) {
        const op = block.operations[k];
        if (isPositioningOperator(op.operator)) {
          hasPositioningBetween = true;
          break;
        }
      }

      if (hasPositioningBetween) {
        break;
      }

      // Combine this segment
      combinedText += nextSegment.text;
      operations.push(nextSegment.operation);
      j++;
    }

    const finalText = combinedText.trim();
    if (finalText.length === 0) {
      i = j;
      continue;
    }

    // Create text element (might be single or combined)
    textElements.push({
      text: finalText,
      operation: firstSegment.operation, // Keep reference to first operation
      font: firstSegment.font,
      combinedOperations: operations.length > 1 ? operations : undefined
    });

    i = j;
  }

  block.textElements = textElements;
  block.fonts = usedFonts;
  block.currentFontSize = currentFontSize;
}
