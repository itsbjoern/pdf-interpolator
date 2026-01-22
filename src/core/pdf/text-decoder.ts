// Text extraction from PDF operations

import { PDFOperation, TextElement, FontInfo } from './types';
import { decodeText } from './font-handler';

/**
 * Extract text elements from parsed operations
 */
export function extractTextElements(
  operations: PDFOperation[],
  fontMap: Map<string, FontInfo>
): TextElement[] {
  const textElements: TextElement[] = [];
  let currentFont: FontInfo | null = null;

  for (const operation of operations) {
    const { operator, operands } = operation;

    // Tf: Set text font and size
    if (operator === 'Tf' && operands.length >= 2) {
      const fontName = operands[0] as string;
      // Remove leading slash from font name
      const cleanFontName = fontName.startsWith('/') ? fontName.slice(1) : fontName;
      currentFont = fontMap.get(cleanFontName) || fontMap.get(fontName) || null;

      if (!currentFont) {
        console.warn(
          `[Text Decoder] Font not found: ${fontName}. Available fonts:`,
          Array.from(fontMap.keys())
        );
      } else {
        console.log(`[Text Decoder] Set font: ${fontName} (encoding: ${currentFont.encoding})`);
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
        console.log(`[Text Decoder] Tj operator decoded: "${text}"`);
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
            const text = decodeText(item, currentFont);
            combinedText += text;
          }
          // Numbers in TJ arrays are character spacing adjustments, skip them
        }

        if (combinedText) {
          console.log(`[Text Decoder] TJ operator decoded: "${combinedText}"`);
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

  return textElements;
}

/**
 * Extract all text from a page (for debugging/logging)
 */
export function extractPageText(
  operations: PDFOperation[],
  fontMap: Map<string, FontInfo>
): string {
  const textElements = extractTextElements(operations, fontMap);
  return textElements.map((el) => el.text).join(' ');
}
