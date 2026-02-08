#!/usr/bin/env node

/**
 * Utility script to analyze PDF trailer structure
 * Usage: node scripts/analyze-pdf-trailers.js <path-to-pdf>
 */

const fs = require('fs');
const path = require('path');

function parsePDFDict(dictStr) {
  const result = {};

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
    let value = null;

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
        value = refStr;
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
          i += 2;
          continue;
        }
        if (content[i] === '(') depth++;
        else if (content[i] === ')') depth--;
        i++;
      }
      value = content.substring(valueStart, i);
    }
    else if (content[i] === '<' && content[i + 1] !== '<') {
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

function findAllTrailers(pdfBytes) {
  const text = new TextDecoder('latin1').decode(pdfBytes);
  const trailers = [];

  let searchPos = 0;
  while (true) {
    const trailerPos = text.indexOf('trailer', searchPos);
    if (trailerPos === -1) break;

    const dictStart = text.indexOf('<<', trailerPos);
    if (dictStart === -1 || dictStart - trailerPos > 50) {
      searchPos = trailerPos + 7;
      continue;
    }

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

    let dict = {};
    try {
      dict = parsePDFDict(dictRaw);
    } catch (error) {
      console.warn('Failed to parse trailer dictionary:', error);
    }

    const hasRoot = '/Root' in dict;
    const hasInfo = '/Info' in dict;
    const hasID = '/ID' in dict;

    let xrefPos = null;
    const startxrefPos = text.indexOf('startxref', dictEnd);
    if (startxrefPos !== -1 && startxrefPos - dictEnd < 100) {
      const xrefMatch = text.substring(startxrefPos, startxrefPos + 100).match(/startxref\s+(\d+)/);
      if (xrefMatch) {
        xrefPos = parseInt(xrefMatch[1], 10);
      }
    }

    // Find EOF after this trailer
    let eofPos = text.indexOf('%%EOF', dictEnd);
    if (eofPos !== -1) {
      eofPos += 5;
    }

    trailers.push({
      index: trailers.length + 1,
      startPos: trailerPos,
      endPos: dictEnd,
      eofPos,
      dict,
      dictRaw,
      hasRoot,
      hasInfo,
      hasID,
      xrefPos,
      score: (hasRoot ? 100 : 0) + (hasInfo ? 10 : 0) + (hasID ? 10 : 0)
    });

    searchPos = dictEnd;
  }

  return trailers;
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: node analyze-pdf-trailers.js <path-to-pdf>');
    process.exit(1);
  }

  const pdfPath = path.resolve(args[0]);

  if (!fs.existsSync(pdfPath)) {
    console.error(`Error: File not found: ${pdfPath}`);
    process.exit(1);
  }

  console.log('Analyzing PDF:', pdfPath);
  console.log('');

  const pdfBytes = fs.readFileSync(pdfPath);
  const trailers = findAllTrailers(pdfBytes);

  console.log(`Found ${trailers.length} trailer(s)\n`);

  if (trailers.length === 0) {
    console.log('❌ No trailers found - PDF may be corrupted');
    process.exit(1);
  }

  trailers.forEach((trailer) => {
    console.log(`Trailer ${trailer.index}:`);
    console.log(`  Position: byte ${trailer.startPos} - ${trailer.endPos}`);
    if (trailer.eofPos) {
      console.log(`  EOF Position: byte ${trailer.eofPos}`);
    }
    console.log(`  Has /Root: ${trailer.hasRoot ? '✓' : '✗'}${trailer.hasRoot ? ' = ' + trailer.dict['/Root'] : ''}`);
    console.log(`  Has /Info: ${trailer.hasInfo ? '✓' : '✗'}${trailer.hasInfo ? ' = ' + trailer.dict['/Info'] : ''}`);
    console.log(`  Has /ID: ${trailer.hasID ? '✓' : '✗'}${trailer.hasID ? ' = ' + (typeof trailer.dict['/ID'] === 'string' ? trailer.dict['/ID'].substring(0, 50) : JSON.stringify(trailer.dict['/ID'])) : ''}`);
    console.log(`  Score: ${trailer.score}`);
    if (trailer.xrefPos !== null) {
      console.log(`  XRef Position: ${trailer.xrefPos}`);
    }
    console.log('  Parsed dictionary keys:', Object.keys(trailer.dict).join(', '));
    console.log('  Dictionary raw preview:');
    const preview = trailer.dictRaw ? trailer.dictRaw.substring(0, 200) : JSON.stringify(trailer.dict).substring(0, 200);
    console.log(`    ${preview}${(trailer.dictRaw || JSON.stringify(trailer.dict)).length > 200 ? '...' : ''}`);
    console.log('');
  });

  // Find best trailer
  const sorted = trailers.slice().sort((a, b) => b.score - a.score);
  const best = sorted[0];

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Best trailer: Trailer ${best.index} (score: ${best.score})`);

  if (trailers.length > 1) {
    const isLastTrailer = best === trailers[trailers.length - 1];
    if (!isLastTrailer) {
      console.log('\n⚠️  WARNING: Best trailer is NOT the last trailer in the file!');
      console.log('This PDF needs reconstruction to work properly with pdf-lib.');
      console.log(`The application will automatically use Trailer ${best.index} and ignore the others.`);
    } else {
      console.log('\n✓ Best trailer is the last one - PDF structure is OK');
    }
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main();
