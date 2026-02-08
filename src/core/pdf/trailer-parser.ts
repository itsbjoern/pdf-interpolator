/**
 * PDF Trailer Parser
 *
 * Handles PDFs with multiple trailers or incremental updates where the correct
 * trailer dictionary may not be the first one encountered.
 */

interface TrailerInfo {
  startPos: number;
  endPos: number;
  dict: Record<string, any>;
  dictRaw: string;
  hasRoot: boolean;
  hasInfo: boolean;
  hasID: boolean;
  xrefPos: number | null;
}

/**
 * Parse a PDF dictionary string into an object
 * Handles nested dictionaries, arrays, and references
 */
function parsePDFDict(dictStr: string): Record<string, any> {
  const result: Record<string, any> = {};

  // Remove outer << >>
  let content = dictStr.trim();
  if (content.startsWith('<<')) {
    content = content.substring(2);
  }
  if (content.endsWith('>>')) {
    content = content.substring(0, content.length - 2);
  }

  let i = 0;
  while (i < content.length) {
    // Skip whitespace
    while (i < content.length && /\s/.test(content[i])) {
      i++;
    }

    if (i >= content.length) break;

    // Read key (should start with /)
    if (content[i] !== '/') {
      i++;
      continue;
    }

    let keyEnd = i + 1;
    while (keyEnd < content.length && !/[\s<>/\[\]]/.test(content[keyEnd])) {
      keyEnd++;
    }

    const key = content.substring(i, keyEnd);
    i = keyEnd;

    // Skip whitespace after key
    while (i < content.length && /\s/.test(content[i])) {
      i++;
    }

    if (i >= content.length) break;

    // Read value
    let value: any = null;

    // Nested dictionary
    if (content.substring(i, i + 2) === '<<') {
      let depth = 1;
      let valueStart = i;
      i += 2;
      while (i < content.length && depth > 0) {
        if (content.substring(i, i + 2) === '<<') {
          depth++;
          i += 2;
        } else if (content.substring(i, i + 2) === '>>') {
          depth--;
          i += 2;
        } else {
          i++;
        }
      }
      value = parsePDFDict(content.substring(valueStart, i));
    }
    // Array
    else if (content[i] === '[') {
      let depth = 1;
      let valueStart = i;
      i++;
      while (i < content.length && depth > 0) {
        if (content[i] === '[') depth++;
        else if (content[i] === ']') depth--;
        i++;
      }
      value = content.substring(valueStart, i);
    }
    // Reference (e.g., "123 0 R")
    else if (/\d/.test(content[i])) {
      let valueEnd = i;
      while (valueEnd < content.length && !/[<>/\[\]]/.test(content[valueEnd])) {
        valueEnd++;
      }
      const refStr = content.substring(i, valueEnd).trim();
      if (refStr.endsWith(' R')) {
        value = refStr; // Store as string reference
      } else {
        value = refStr;
      }
      i = valueEnd;
    }
    // Name (starts with /)
    else if (content[i] === '/') {
      let valueEnd = i + 1;
      while (valueEnd < content.length && !/[\s<>/\[\]]/.test(content[valueEnd])) {
        valueEnd++;
      }
      value = content.substring(i, valueEnd);
      i = valueEnd;
    }
    // String (parentheses or hex)
    else if (content[i] === '(') {
      let depth = 1;
      let valueStart = i;
      i++;
      while (i < content.length && depth > 0) {
        if (content[i] === '\\') {
          i += 2; // Skip escaped character
          continue;
        }
        if (content[i] === '(') depth++;
        else if (content[i] === ')') depth--;
        i++;
      }
      value = content.substring(valueStart, i);
    }
    else if (content[i] === '<' && content[i + 1] !== '<') {
      // Hex string
      let valueEnd = i;
      while (valueEnd < content.length && content[valueEnd] !== '>') {
        valueEnd++;
      }
      value = content.substring(i, valueEnd + 1);
      i = valueEnd + 1;
    }
    // Boolean or number
    else {
      let valueEnd = i;
      while (valueEnd < content.length && !/[\s<>/\[\]]/.test(content[valueEnd])) {
        valueEnd++;
      }
      const valueStr = content.substring(i, valueEnd);
      if (valueStr === 'true') value = true;
      else if (valueStr === 'false') value = false;
      else if (/^-?\d+(\.\d+)?$/.test(valueStr)) value = parseFloat(valueStr);
      else value = valueStr;
      i = valueEnd;
    }

    result[key] = value;
  }

  return result;
}

/**
 * Find all trailer sections in a PDF file
 * Returns array of trailer locations and their properties
 */
export function findAllTrailers(pdfBytes: Uint8Array): TrailerInfo[] {
  const text = new TextDecoder('latin1').decode(pdfBytes);
  const trailers: TrailerInfo[] = [];

  // Find all occurrences of "trailer"
  let searchPos = 0;
  while (true) {
    const trailerPos = text.indexOf('trailer', searchPos);
    if (trailerPos === -1) break;

    // Extract the trailer dictionary
    const dictStart = text.indexOf('<<', trailerPos);
    if (dictStart === -1 || dictStart - trailerPos > 50) {
      searchPos = trailerPos + 7;
      continue;
    }

    // Find matching >>
    let dictEnd = dictStart + 2;
    let depth = 1;
    while (depth > 0 && dictEnd < text.length) {
      if (text.substring(dictEnd, dictEnd + 2) === '<<') {
        depth++;
        dictEnd += 2;
      } else if (text.substring(dictEnd, dictEnd + 2) === '>>') {
        depth--;
        dictEnd += 2;
      } else {
        dictEnd++;
      }
    }

    if (depth !== 0) {
      searchPos = trailerPos + 7;
      continue;
    }

    const dictRaw = text.substring(dictStart, dictEnd);

    // Parse the dictionary
    let dict: Record<string, any> = {};
    try {
      dict = parsePDFDict(dictRaw);
    } catch (error) {
      console.warn('[Trailer Parser] Failed to parse trailer dictionary:', error);
    }

    // Check what keys this trailer has
    const hasRoot = '/Root' in dict;
    const hasInfo = '/Info' in dict;
    const hasID = '/ID' in dict;

    // Try to find associated startxref value
    let xrefPos: number | null = null;
    const startxrefPos = text.indexOf('startxref', dictEnd);
    if (startxrefPos !== -1 && startxrefPos - dictEnd < 100) {
      const xrefMatch = text.substring(startxrefPos, startxrefPos + 100).match(/startxref\s+(\d+)/);
      if (xrefMatch) {
        xrefPos = parseInt(xrefMatch[1], 10);
      }
    }

    trailers.push({
      startPos: trailerPos,
      endPos: dictEnd,
      dict,
      dictRaw,
      hasRoot,
      hasInfo,
      hasID,
      xrefPos
    });

    searchPos = dictEnd;
  }

  return trailers;
}

/**
 * Find the "best" trailer - the one most likely to contain complete PDF metadata
 * Prioritizes trailers with Root, Info, and ID
 */
export function findBestTrailer(trailers: TrailerInfo[]): TrailerInfo | null {
  if (trailers.length === 0) return null;
  if (trailers.length === 1) return trailers[0];

  // Score each trailer
  const scored = trailers.map((trailer) => ({
    trailer,
    score: (trailer.hasRoot ? 100 : 0) + (trailer.hasInfo ? 10 : 0) + (trailer.hasID ? 10 : 0)
  }));

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  return scored[0].trailer;
}
