// Font handling and encoding/decoding

import {
  decodePDFRawStream,
  PDFDict as PDFLibDict,
  PDFName,
  type PDFObject,
  type PDFPage,
  type PDFRawStream,
  PDFStream
} from 'pdf-lib';
import {
  COMMON_GLYPH_MAP,
  MAC_ROMAN_ENCODING,
  STANDARD_ENCODING,
  WIN_ANSI_ENCODING
} from './font-encodings';
import type { FontRegistry } from './font-registry';
import type { EncodedSegment, EncodedText, FontEncoding, FontInfo } from './types';

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
    for (const fontNameObj of fontNames) {
      const fontName = fontNameObj.asString();
      const fontRef = fontDict.lookup(fontNameObj);

      if (!fontRef) continue;

      const fontInfo = await parseFontInfo(fontName, fontRef);
      if (fontInfo) {
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
export async function parseFontInfo(
  fontName: string,
  fontRef: PDFObject
): Promise<FontInfo | null> {
  try {
    let fontDict: PDFLibDict | null = null;

    // Handle indirect references
    if (fontRef && typeof fontRef === 'object' && 'lookup' in fontRef) {
      const resolved = fontRef.lookup ? fontRef : null;
      if (resolved instanceof PDFLibDict) {
        fontDict = resolved;
      }
    } else if (fontRef instanceof PDFLibDict) {
      fontDict = fontRef;
    }

    if (!fontDict) return null;

    const baseFontObj = fontDict.lookup(PDFName.of('BaseFont'));
    const baseFont = baseFontObj?.toString().replace(/^\//, '') || 'Unknown';

    const encodingObj = fontDict.lookup(PDFName.of('Encoding'));
    const toUnicode = fontDict.lookup(PDFName.of('ToUnicode'));

    let encoding: FontEncoding = 'WinAnsiEncoding';
    let encodingMap = new Map(WIN_ANSI_ENCODING);

    if (encodingObj) {
      const encodingStr = encodingObj.toString();

      // Handle Encoding as a dictionary (with potential Differences array)
      if (encodingObj instanceof PDFLibDict) {
        const baseEncodingObj = encodingObj.lookup(PDFName.of('BaseEncoding'));
        const baseEncodingStr = baseEncodingObj?.toString() || '/WinAnsiEncoding';

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
          encodingMap = new Map(WIN_ANSI_ENCODING);
        }

        const differencesObj = encodingObj.lookup(PDFName.of('Differences'));
        if (differencesObj) {
          applyDifferences(encodingMap, differencesObj);
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
        encodingMap = new Map();
        // Identity-H fallback
        for (let i = 0; i < 65536; i++) {
          encodingMap.set(i, String.fromCharCode(i));
        }
      }
    }

    if (toUnicode && toUnicode instanceof PDFStream) {
      const unicodeMap = await parseToUnicodeCMap(toUnicode);
      encodingMap = unicodeMap;
    }

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
function applyDifferences(encodingMap: Map<number, string>, differencesObj: PDFObject): void {
  try {
    const differencesArray = (differencesObj as any).asArray?.() || [];

    let currentCode: number | null = null;

    for (const item of differencesArray) {
      const itemStr = item.toString();

      // Check if this is a number (new starting code)
      if (/^\d+$/.test(itemStr)) {
        currentCode = parseInt(itemStr, 10);
      } else if (itemStr.startsWith('/') && currentCode !== null) {
        const glyphName = itemStr.slice(1); // Remove leading slash

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
            const dstHex = charMatch[2];

            const char = hexToUnicode(dstHex);
            if (char) {
              const isInvalid = char === '\uFFFD' || char === '\x00' || char === '';
              if (isInvalid) {
                continue;
              }
              map.set(srcCode, char);
            }
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
            const dstHex = rangeMatch[3];

            // For ranges, increment the Unicode value for each code
            const baseCodePoint = parseInt(dstHex, 16);
            for (let code = startCode; code <= endCode; code++) {
              const offset = code - startCode;
              const codePoint = baseCodePoint + offset;
              const char = String.fromCodePoint(codePoint);
              if (char && char !== '\x00') {
                map.set(code, char);
              }
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
 * Convert hex string to Unicode character(s)
 * Handles both single-byte (e.g., "0041" = 'A') and multi-byte UTF-16 sequences
 */
function hexToUnicode(hexStr: string): string | null {
  try {
    if (hexStr.length > 4) {
      const bytes: number[] = [];
      for (let i = 0; i < hexStr.length; i += 2) {
        bytes.push(parseInt(hexStr.substr(i, 2), 16));
      }

      const utf16Codes: number[] = [];
      for (let i = 0; i < bytes.length; i += 2) {
        if (i + 1 < bytes.length) {
          utf16Codes.push((bytes[i] << 8) | bytes[i + 1]);
        }
      }

      const result = String.fromCharCode(...utf16Codes);

      if (result && result !== '\x00' && !result.includes('\uFFFD')) {
        return result;
      }
      return null;
    } else {
      const codePoint = parseInt(hexStr, 16);
      if (codePoint === 0) {
        return null;
      }
      return String.fromCodePoint(codePoint);
    }
  } catch (error) {
    console.warn(`[Font Handler] Failed to parse hex string: ${hexStr}`, error);
    return null;
  }
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
    for (const byte of bytes) {
      const char = font.encodingMap.get(byte);
      if (char !== undefined) {
        text += char;
      } else {
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
    for (const char of text) {
      let code = font.reverseMap.get(char);

      if (code === undefined) {
        for (const [_otherFontName, otherFont] of fontMap) {
          code = otherFont.reverseMap.get(char);
        }
        if (!code) {
          console.warn(`[Font Handler] Character "${char}" not found in font ${font.name}`);
          return null;
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

  for (const char of text) {
    let code = currentFont.reverseMap.get(char);

    if (code === undefined) {
      const fallbackFont = fontRegistry.findFallbackFont(char, currentFont);

      if (!fallbackFont) {
        console.log(
          `[Font Handler] No fallback font found for character "${char}" in family ${currentFont.baseFont}`
        );
        if (!missingCharacters.includes(char)) {
          missingCharacters.push(char);
        }
        return { segments: [], success: false, missingCharacters };
      }

      if (currentBytes.length > 0) {
        segments.push({
          bytes: new Uint8Array(currentBytes),
          font: currentFont
        });
        currentBytes = [];
      }

      // We know the character is in the fallback font, so we can safely get the code
      code = fallbackFont.reverseMap.get(char)!;
      currentFont = fallbackFont;
    }

    // CRITICAL: Check encoding of CURRENT font, not primary font
    if (currentFont.encoding === 'Identity-H') {
      currentBytes.push((code >> 8) & 0xff);
      currentBytes.push(code & 0xff);
    } else {
      currentBytes.push(code);
    }
  }

  if (currentBytes.length > 0) {
    segments.push({
      bytes: new Uint8Array(currentBytes),
      font: currentFont
    });
  }

  return { segments, success: true, missingCharacters: [] };
}
