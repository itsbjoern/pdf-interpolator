// Text extraction from PDF operations

import { TextElement, FontInfo, TextBlock } from './types';
import { decodeText } from './font-handler';

/**
 * Extract text from a single TextBlock (NEW surgical approach)
 * Processes only operations within this block and updates the block in-place
 */
export function extractTextFromBlock(block: TextBlock, fontMap: Map<string, FontInfo>): void {
  const textElements: TextElement[] = [];
  const usedFonts = new Map<string, FontInfo>();
  let currentFont: FontInfo | null = null;
  let currentFontSize = 12; // Default font size

  for (const operation of block.operations) {
    const { operator, operands } = operation;

    // Tf: Set text font and size
    if (operator === 'Tf' && operands.length >= 2) {
      const fontName = operands[0] as string;
      const cleanFontName = fontName.startsWith('/') ? fontName.slice(1) : fontName;
      currentFont = fontMap.get(cleanFontName) || fontMap.get(fontName) || null;

      // Track font size
      const fontSize = operands[1];
      if (typeof fontSize === 'number') {
        currentFontSize = fontSize;
      }

      if (currentFont) {
        usedFonts.set(cleanFontName, currentFont);
      }
      continue;
    }

    // Skip if no font is set
    if (!currentFont) continue;

    // Tj: Show text string
    if (operator === 'Tj' && operands.length >= 1) {
      const textBytes = operands[0];
      if (textBytes instanceof Uint8Array) {
        const text = decodeText(textBytes, currentFont);
        textElements.push({
          text,
          operation,
          font: currentFont
        });
      }
      continue;
    }

    // TJ: Show text with individual character positioning
    if (operator === 'TJ' && operands.length >= 1) {
      const array = operands[0];
      if (Array.isArray(array)) {
        let combinedText = '';

        for (let i = 0; i < array.length; i++) {
          const item = array[i];
          if (item instanceof Uint8Array) {
            combinedText += decodeText(item, currentFont);
          }
        }

        if (combinedText) {
          textElements.push({
            text: combinedText,
            operation,
            font: currentFont
          });
        }
      }
      continue;
    }

    // ': Move to next line and show text
    if (operator === "'" && operands.length >= 1) {
      const textBytes = operands[0];
      if (textBytes instanceof Uint8Array) {
        const text = decodeText(textBytes, currentFont);
        textElements.push({
          text,
          operation,
          font: currentFont
        });
      }
      continue;
    }

    // ": Set word and character spacing, move to next line, and show text
    if (operator === '"' && operands.length >= 3) {
      const textBytes = operands[2];
      if (textBytes instanceof Uint8Array) {
        const text = decodeText(textBytes, currentFont);
        textElements.push({
          text,
          operation,
          font: currentFont
        });
      }
      continue;
    }
  }

  // Update block with extracted text and font size
  block.textElements = textElements;
  block.fonts = usedFonts;
  block.currentFontSize = currentFontSize;
}
