// Font handling and encoding/decoding

import {
  PDFPage,
  PDFName,
  PDFDict as PDFLibDict,
  PDFStream,
  decodePDFRawStream,
  PDFRawStream
} from 'pdf-lib';
import { FontInfo, FontEncoding, EncodedText, EncodedSegment } from './types';
import {
  COMMON_GLYPH_MAP,
  MAC_ROMAN_ENCODING,
  STANDARD_ENCODING,
  WIN_ANSI_ENCODING
} from './font-encodings';
import { FontRegistry } from './font-registry';

/**
 * Extract fonts from a PDF page
 */
export async function extractFonts(page: PDFPage): Promise<Map<string, FontInfo>> {
  const fontMap = new Map<string, FontInfo>();

  try {
    const resources = page.node.Resources();
    if (!resources) {
      console.warn('[Font Handler] No resources found on page');
      return fontMap;
    }

    const fontDict = resources.lookup(PDFName.of('Font'));
    if (!fontDict || !(fontDict instanceof PDFLibDict)) {
      console.warn('[Font Handler] No Font dictionary found in resources');
      return fontMap;
    }

    const fontNames = fontDict.keys();
    console.log(`[Font Handler] Found ${fontNames.length} fonts in page resources`);

    for (const fontNameObj of fontNames) {
      const fontName = fontNameObj.asString();
      const fontRef = fontDict.lookup(fontNameObj);

      if (!fontRef) continue;

      const fontInfo = await parseFontInfo(fontName, fontRef);
      if (fontInfo) {
        console.log(
          `[Font Handler] Loaded font: ${fontName} -> ${fontInfo.baseFont} (${fontInfo.encoding})`
        );
        fontMap.set(fontName, fontInfo);
      }
    }
  } catch (error) {
    console.warn('[Font Handler] Error extracting fonts from page:', error);
  }

  return fontMap;
}

/**
 * Parse font information from font dictionary
 */
export async function parseFontInfo(fontName: string, fontRef: unknown): Promise<FontInfo | null> {
  try {
    let fontDict: PDFLibDict | null = null;

    // Handle indirect references
    if (fontRef && typeof fontRef === 'object' && 'lookup' in fontRef) {
      const resolved = (fontRef as any).lookup ? (fontRef as any) : null;
      if (resolved instanceof PDFLibDict) {
        fontDict = resolved;
      }
    } else if (fontRef instanceof PDFLibDict) {
      fontDict = fontRef;
    }

    if (!fontDict) return null;

    // Get base font name
    const baseFontObj = fontDict.lookup(PDFName.of('BaseFont'));
    const baseFont = baseFontObj?.toString().replace(/^\//, '') || 'Unknown';

    // Get encoding
    const encodingObj = fontDict.lookup(PDFName.of('Encoding'));
    let encoding: FontEncoding = 'WinAnsiEncoding';
    let encodingMap: Map<number, string>;

    console.log(`[Font Handler] Font ${fontName} Encoding object:`, encodingObj?.toString());

    if (encodingObj) {
      const encodingStr = encodingObj.toString();

      // Check if encoding is a dictionary (with Differences)
      if (encodingObj instanceof PDFLibDict) {
        // Get base encoding
        const baseEncodingObj = encodingObj.lookup(PDFName.of('BaseEncoding'));
        const baseEncodingStr = baseEncodingObj?.toString() || '/WinAnsiEncoding';

        console.log(`[Font Handler] BaseEncoding: ${baseEncodingStr}`);

        // Start with base encoding
        if (baseEncodingStr.includes('WinAnsiEncoding')) {
          encoding = 'WinAnsiEncoding';
          encodingMap = new Map(WIN_ANSI_ENCODING);
        } else if (baseEncodingStr.includes('MacRomanEncoding')) {
          encoding = 'MacRomanEncoding';
          encodingMap = new Map(MAC_ROMAN_ENCODING);
        } else if (baseEncodingStr.includes('StandardEncoding')) {
          encoding = 'StandardEncoding';
          encodingMap = new Map(STANDARD_ENCODING);
        } else {
          // Default to WinAnsi
          encodingMap = new Map(WIN_ANSI_ENCODING);
        }

        // Apply Differences array if present
        const differencesObj = encodingObj.lookup(PDFName.of('Differences'));
        if (differencesObj) {
          console.log(`[Font Handler] Font ${fontName} has Differences array`);
          applyDifferences(encodingMap, differencesObj);
          encoding = 'Custom';
        }
      } else if (encodingStr.includes('WinAnsiEncoding')) {
        encoding = 'WinAnsiEncoding';
        encodingMap = new Map(WIN_ANSI_ENCODING);
      } else if (encodingStr.includes('MacRomanEncoding')) {
        encoding = 'MacRomanEncoding';
        encodingMap = new Map(MAC_ROMAN_ENCODING);
      } else if (encodingStr.includes('StandardEncoding')) {
        encoding = 'StandardEncoding';
        encodingMap = new Map(STANDARD_ENCODING);
      } else if (encodingStr.includes('Identity-H') || encodingStr.includes('Identity-V')) {
        encoding = 'Identity-H';
        // For Identity-H, we need ToUnicode CMap
        const toUnicode = fontDict.lookup(PDFName.of('ToUnicode'));
        if (toUnicode && toUnicode instanceof PDFStream) {
          encodingMap = await parseToUnicodeCMap(toUnicode);
        } else {
          // Fallback: identity mapping (UTF-16 BE)
          encodingMap = new Map();
          for (let i = 0; i < 65536; i++) {
            encodingMap.set(i, String.fromCharCode(i));
          }
        }
      } else {
        // Unknown encoding, use WinAnsi as fallback
        encoding = 'Custom';
        encodingMap = new Map(WIN_ANSI_ENCODING);
      }
    } else {
      // No encoding specified, check for ToUnicode CMap first
      const toUnicode = fontDict.lookup(PDFName.of('ToUnicode'));
      if (toUnicode && toUnicode instanceof PDFStream) {
        encoding = 'Custom';
        encodingMap = await parseToUnicodeCMap(toUnicode);
      } else {
        // Use WinAnsi as default
        encodingMap = new Map(WIN_ANSI_ENCODING);
      }
    }

    // Build reverse map for encoding
    const reverseMap = new Map<string, number>();
    for (const [code, char] of encodingMap) {
      if (!reverseMap.has(char)) {
        reverseMap.set(char, code);
      }
    }

    return {
      name: fontName,
      baseFont,
      encoding,
      encodingMap,
      reverseMap
    };
  } catch (error) {
    console.warn(`Error parsing font ${fontName}:`, error);
    return null;
  }
}

/**
 * Apply Differences array to encoding map
 * Differences format: [code1 /name1 /name2 ... code2 /name3 ...]
 */
function applyDifferences(encodingMap: Map<number, string>, differencesObj: unknown): void {
  try {
    // Get array elements
    const differencesArray = (differencesObj as any).asArray?.() || [];
    console.log(`[Font Handler] Processing ${differencesArray.length} differences entries`);

    let currentCode: number | null = null;

    for (const item of differencesArray) {
      const itemStr = item.toString();

      // Check if this is a number (new starting code)
      if (/^\d+$/.test(itemStr)) {
        currentCode = parseInt(itemStr, 10);
      } else if (itemStr.startsWith('/') && currentCode !== null) {
        // This is a glyph name
        const glyphName = itemStr.slice(1); // Remove leading slash

        // Map glyph name to Unicode character
        const unicode = glyphNameToUnicode(glyphName);
        if (unicode) {
          encodingMap.set(currentCode, unicode);
        }

        currentCode++;
      }
    }
  } catch (error) {
    console.warn('[Font Handler] Error applying differences:', error);
  }
}

/**
 * Map Adobe glyph name to Unicode character
 * This is a simplified mapping - a full implementation would use the Adobe Glyph List
 */
function glyphNameToUnicode(glyphName: string): string | null {
  // Check direct mapping
  if (COMMON_GLYPH_MAP[glyphName]) {
    return COMMON_GLYPH_MAP[glyphName];
  }

  // Handle uniXXXX format (e.g., uni0041 = 'A')
  if (glyphName.startsWith('uni') && glyphName.length === 7) {
    const codePoint = parseInt(glyphName.slice(3), 16);
    return String.fromCharCode(codePoint);
  }

  // Handle uXXXX format
  if (glyphName.startsWith('u') && glyphName.length === 5) {
    const codePoint = parseInt(glyphName.slice(1), 16);
    return String.fromCharCode(codePoint);
  }

  console.warn(`[Font Handler] Unknown glyph name: ${glyphName}`);
  return null;
}

/**
 * Parse ToUnicode CMap stream
 */
async function parseToUnicodeCMap(cmapStream: PDFStream): Promise<Map<number, string>> {
  const map = new Map<number, string>();

  try {
    // Get stream contents using pdf-lib API
    const cmapBytes = decodePDFRawStream(cmapStream as PDFRawStream).decode();
    const cmapText = new TextDecoder('latin1').decode(cmapBytes);

    // Parse beginbfchar and beginbfrange sections
    const bfcharRegex = /beginbfchar[\s\S]*?endbfchar/g;
    const bfrangeRegex = /beginbfrange[\s\S]*?endbfrange/g;

    // Parse beginbfchar (single character mappings)
    const bfcharMatches = cmapText.match(bfcharRegex);
    if (bfcharMatches) {
      for (const match of bfcharMatches) {
        const lines = match.split('\n');
        for (const line of lines) {
          const charMatch = line.match(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/);
          if (charMatch) {
            const srcCode = parseInt(charMatch[1], 16);
            const dstCode = parseInt(charMatch[2], 16);
            map.set(srcCode, String.fromCharCode(dstCode));
          }
        }
      }
    }

    // Parse beginbfrange (range mappings)
    const bfrangeMatches = cmapText.match(bfrangeRegex);
    if (bfrangeMatches) {
      for (const match of bfrangeMatches) {
        const lines = match.split('\n');
        for (const line of lines) {
          const rangeMatch = line.match(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/);
          if (rangeMatch) {
            const startCode = parseInt(rangeMatch[1], 16);
            const endCode = parseInt(rangeMatch[2], 16);
            let dstCode = parseInt(rangeMatch[3], 16);

            for (let code = startCode; code <= endCode; code++) {
              map.set(code, String.fromCharCode(dstCode));
              dstCode++;
            }
          }
        }
      }
    }
  } catch (error) {
    console.warn('Error parsing ToUnicode CMap:', error);
  }

  return map;
}

/**
 * Decode bytes to text using font encoding
 */
export function decodeText(bytes: Uint8Array, font: FontInfo): string {
  let text = '';

  if (font.encoding === 'Identity-H') {
    // UTF-16 BE encoding (2 bytes per character)
    for (let i = 0; i < bytes.length; i += 2) {
      const code = (bytes[i] << 8) | (bytes[i + 1] || 0);
      const char = font.encodingMap.get(code) || String.fromCharCode(code);
      text += char;
    }
  } else {
    // Single-byte encoding
    for (const byte of bytes) {
      const char = font.encodingMap.get(byte);
      if (char !== undefined) {
        text += char;
      } else {
        // Fallback to direct character code
        text += String.fromCharCode(byte);
      }
    }
  }

  return text;
}

/**
 * Encode text to bytes using font encoding
 * Returns null if text contains characters not in font
 */
export function encodeText(
  text: string,
  font: FontInfo,
  fontMap: Map<string, FontInfo>
): Uint8Array | null {
  const bytes: number[] = [];

  if (font.encoding === 'Identity-H') {
    // UTF-16 BE encoding (2 bytes per character)
    for (const char of text) {
      const code = font.reverseMap.get(char) ?? char.charCodeAt(0);
      bytes.push((code >> 8) & 0xff);
      bytes.push(code & 0xff);
    }
  } else {
    // Single-byte encoding
    for (const char of text) {
      let code = font.reverseMap.get(char);
      console.log(`Encoding character "${char}" in font ${font.name}: code=${code}`);
      if (code === undefined) {
        for (const [otherFontName, otherFont] of fontMap) {
          const code = otherFont.reverseMap.get(char);
          if (code !== undefined) {
            console.log(
              `Character "${char}" found in alternative font ${otherFontName} with code ${code}`
            );
          }
        }
        if (!code) {
          return null; // Encoding failure
        }
      }
      bytes.push(code);
    }
  }

  return new Uint8Array(bytes);
}

/**
 * Encode text with automatic fallback to fonts in same family
 * Returns EncodedText with multiple segments if font switching needed
 */
export function encodeTextWithFallback(
  text: string,
  primaryFont: FontInfo,
  fontRegistry: FontRegistry
): EncodedText {
  const segments: EncodedSegment[] = [];
  const missingCharacters: string[] = [];
  let currentFont = primaryFont;
  let currentBytes: number[] = [];

  console.log(
    `[Font Handler] Encoding text "${text}" with fallback support, primary font: ${primaryFont.name} (${primaryFont.encoding})`
  );

  // Process each character, checking encoding per-font (not just once)
  for (const char of text) {
    let code = currentFont.reverseMap.get(char);

    if (code === undefined) {
      // Character not in current font - find fallback
      const fallbackFont = fontRegistry.findFallbackFont(char, currentFont);

      if (!fallbackFont) {
        console.warn(
          `[Font Handler] No fallback font found for character "${char}" in family ${currentFont.baseFont}`
        );
        // Track missing character
        if (!missingCharacters.includes(char)) {
          missingCharacters.push(char);
        }
        // Return encoding failure
        return { segments: [], success: false, missingCharacters };
      }

      console.log(
        `[Font Handler] Found fallback font ${fallbackFont.name} (${fallbackFont.encoding}) for character "${char}"`
      );

      // Save current segment before switching fonts
      if (currentBytes.length > 0) {
        segments.push({
          bytes: new Uint8Array(currentBytes),
          font: currentFont
        });
        currentBytes = [];
      }

      // Switch to fallback font
      currentFont = fallbackFont;
      code = currentFont.reverseMap.get(char)!;
    }

    // CRITICAL: Check encoding of CURRENT font, not primary font
    if (currentFont.encoding === 'Identity-H') {
      // UTF-16 BE encoding (2 bytes per character)
      currentBytes.push((code >> 8) & 0xff);
      currentBytes.push(code & 0xff);
    } else {
      // Single-byte encoding
      currentBytes.push(code);
    }
  }

  // Save final segment
  if (currentBytes.length > 0) {
    segments.push({
      bytes: new Uint8Array(currentBytes),
      font: currentFont
    });
  }

  return { segments, success: true, missingCharacters: [] };
}
