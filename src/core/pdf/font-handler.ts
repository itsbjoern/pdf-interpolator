// Font handling and encoding/decoding

import { PDFPage, PDFName, PDFDict as PDFLibDict, PDFStream } from 'pdf-lib';
import { FontInfo, FontEncoding } from './types';

/**
 * WinAnsiEncoding table (Windows Code Page 1252)
 */
const WIN_ANSI_ENCODING: Map<number, string> = new Map([
  ...Array.from({ length: 128 }, (_, i) => [i, String.fromCharCode(i)] as [number, string]),
  [128, '\u20AC'],
  [130, '\u201A'],
  [131, '\u0192'],
  [132, '\u201E'],
  [133, '\u2026'],
  [134, '\u2020'],
  [135, '\u2021'],
  [136, '\u02C6'],
  [137, '\u2030'],
  [138, '\u0160'],
  [139, '\u2039'],
  [140, '\u0152'],
  [142, '\u017D'],
  [145, '\u2018'],
  [146, '\u2019'],
  [147, '\u201C'],
  [148, '\u201D'],
  [149, '\u2022'],
  [150, '\u2013'],
  [151, '\u2014'],
  [152, '\u02DC'],
  [153, '\u2122'],
  [154, '\u0161'],
  [155, '\u203A'],
  [156, '\u0153'],
  [158, '\u017E'],
  [159, '\u0178'],
  ...Array.from(
    { length: 96 },
    (_, i) => [i + 160, String.fromCharCode(i + 160)] as [number, string]
  )
]);

/**
 * MacRomanEncoding table
 */
const MAC_ROMAN_ENCODING: Map<number, string> = new Map([
  ...Array.from({ length: 128 }, (_, i) => [i, String.fromCharCode(i)] as [number, string]),
  [128, '\u00C4'],
  [129, '\u00C5'],
  [130, '\u00C7'],
  [131, '\u00C9'],
  [132, '\u00D1'],
  [133, '\u00D6'],
  [134, '\u00DC'],
  [135, '\u00E1'],
  [136, '\u00E0'],
  [137, '\u00E2'],
  [138, '\u00E4'],
  [139, '\u00E3'],
  [140, '\u00E5'],
  [141, '\u00E7'],
  [142, '\u00E9'],
  [143, '\u00E8'],
  [144, '\u00EA'],
  [145, '\u00EB'],
  [146, '\u00ED'],
  [147, '\u00EC'],
  [148, '\u00EE'],
  [149, '\u00EF'],
  [150, '\u00F1'],
  [151, '\u00F3'],
  [152, '\u00F2'],
  [153, '\u00F4'],
  [154, '\u00F6'],
  [155, '\u00F5'],
  [156, '\u00FA'],
  [157, '\u00F9'],
  [158, '\u00FB'],
  [159, '\u00FC'],
  [160, '\u2020'],
  [161, '\u00B0'],
  [162, '\u00A2'],
  [163, '\u00A3'],
  [164, '\u00A7'],
  [165, '\u2022'],
  [166, '\u00B6'],
  [167, '\u00DF'],
  [168, '\u00AE'],
  [169, '\u00A9'],
  [170, '\u2122'],
  [171, '\u00B4'],
  [172, '\u00A8'],
  [173, '\u2260'],
  [174, '\u00C6'],
  [175, '\u00D8'],
  [176, '\u221E'],
  [177, '\u00B1'],
  [178, '\u2264'],
  [179, '\u2265'],
  [180, '\u00A5'],
  [181, '\u00B5'],
  [182, '\u2202'],
  [183, '\u2211'],
  [184, '\u220F'],
  [185, '\u03C0'],
  [186, '\u222B'],
  [187, '\u00AA'],
  [188, '\u00BA'],
  [189, '\u03A9'],
  [190, '\u00E6'],
  [191, '\u00F8'],
  [192, '\u00BF'],
  [193, '\u00A1'],
  [194, '\u00AC'],
  [195, '\u221A'],
  [196, '\u0192'],
  [197, '\u2248'],
  [198, '\u2206'],
  [199, '\u00AB'],
  [200, '\u00BB'],
  [201, '\u2026'],
  [202, '\u00A0'],
  [203, '\u00C0'],
  [204, '\u00C3'],
  [205, '\u00D5'],
  [206, '\u0152'],
  [207, '\u0153'],
  [208, '\u2013'],
  [209, '\u2014'],
  [210, '\u201C'],
  [211, '\u201D'],
  [212, '\u2018'],
  [213, '\u2019'],
  [214, '\u00F7'],
  [215, '\u25CA'],
  [216, '\u00FF'],
  [217, '\u0178'],
  [218, '\u2044'],
  [219, '\u20AC'],
  [220, '\u2039'],
  [221, '\u203A'],
  [222, '\uFB01'],
  [223, '\uFB02'],
  [224, '\u2021'],
  [225, '\u00B7'],
  [226, '\u201A'],
  [227, '\u201E'],
  [228, '\u2030'],
  [229, '\u00C2'],
  [230, '\u00CA'],
  [231, '\u00C1'],
  [232, '\u00CB'],
  [233, '\u00C8'],
  [234, '\u00CD'],
  [235, '\u00CE'],
  [236, '\u00CF'],
  [237, '\u00CC'],
  [238, '\u00D3'],
  [239, '\u00D4'],
  [240, '\uF8FF'],
  [241, '\u00D2'],
  [242, '\u00DA'],
  [243, '\u00DB'],
  [244, '\u00D9'],
  [245, '\u0131'],
  [246, '\u02C6'],
  [247, '\u02DC'],
  [248, '\u00AF'],
  [249, '\u02D8'],
  [250, '\u02D9'],
  [251, '\u02DA'],
  [252, '\u00B8'],
  [253, '\u02DD'],
  [254, '\u02DB'],
  [255, '\u02C7']
]);

/**
 * StandardEncoding table
 */
const STANDARD_ENCODING: Map<number, string> = new Map([
  ...Array.from({ length: 32 }, (_, i) => [i, String.fromCharCode(i)] as [number, string]),
  [32, ' '],
  [33, '!'],
  [34, '"'],
  [35, '#'],
  [36, '$'],
  [37, '%'],
  [38, '&'],
  [39, "'"],
  [40, '('],
  [41, ')'],
  [42, '*'],
  [43, '+'],
  [44, ','],
  [45, '-'],
  [46, '.'],
  [47, '/'],
  [48, '0'],
  [49, '1'],
  [50, '2'],
  [51, '3'],
  [52, '4'],
  [53, '5'],
  [54, '6'],
  [55, '7'],
  [56, '8'],
  [57, '9'],
  [58, ':'],
  [59, ';'],
  [60, '<'],
  [61, '='],
  [62, '>'],
  [63, '?'],
  [64, '@'],
  [65, 'A'],
  [66, 'B'],
  [67, 'C'],
  [68, 'D'],
  [69, 'E'],
  [70, 'F'],
  [71, 'G'],
  [72, 'H'],
  [73, 'I'],
  [74, 'J'],
  [75, 'K'],
  [76, 'L'],
  [77, 'M'],
  [78, 'N'],
  [79, 'O'],
  [80, 'P'],
  [81, 'Q'],
  [82, 'R'],
  [83, 'S'],
  [84, 'T'],
  [85, 'U'],
  [86, 'V'],
  [87, 'W'],
  [88, 'X'],
  [89, 'Y'],
  [90, 'Z'],
  [91, '['],
  [92, '\\'],
  [93, ']'],
  [94, '^'],
  [95, '_'],
  [96, '`'],
  [97, 'a'],
  [98, 'b'],
  [99, 'c'],
  [100, 'd'],
  [101, 'e'],
  [102, 'f'],
  [103, 'g'],
  [104, 'h'],
  [105, 'i'],
  [106, 'j'],
  [107, 'k'],
  [108, 'l'],
  [109, 'm'],
  [110, 'n'],
  [111, 'o'],
  [112, 'p'],
  [113, 'q'],
  [114, 'r'],
  [115, 's'],
  [116, 't'],
  [117, 'u'],
  [118, 'v'],
  [119, 'w'],
  [120, 'x'],
  [121, 'y'],
  [122, 'z'],
  [123, '{'],
  [124, '|'],
  [125, '}'],
  [126, '~']
]);

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
async function parseFontInfo(fontName: string, fontRef: unknown): Promise<FontInfo | null> {
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

    if (encodingObj) {
      const encodingStr = encodingObj.toString();

      if (encodingStr.includes('WinAnsiEncoding')) {
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
      // No encoding specified, use WinAnsi
      encodingMap = new Map(WIN_ANSI_ENCODING);
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
 * Parse ToUnicode CMap stream
 */
async function parseToUnicodeCMap(cmapStream: PDFStream): Promise<Map<number, string>> {
  const map = new Map<number, string>();

  try {
    // Get stream contents using pdf-lib API
    const cmapBytes = (cmapStream as any).contents || new Uint8Array();
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
export function encodeText(text: string, font: FontInfo): Uint8Array | null {
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
      const code = font.reverseMap.get(char);
      if (code === undefined) {
        // Character not in font
        console.warn(`Character "${char}" not found in font ${font.name}`);
        return null;
      }
      bytes.push(code);
    }
  }

  return new Uint8Array(bytes);
}
