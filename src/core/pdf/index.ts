import { deflateSync } from 'node:zlib';
import { getSystemLanguage } from '@shared/i18n/format';
import type {
  ProcessingWarning,
  ProcessResult,
  ReplacementStats,
  SheetMapping
} from '@shared/types';
import {
  decodePDFRawStream,
  PDFArray,
  PDFDict as PDFLibDict,
  PDFName,
  PDFNumber,
  type PDFPage,
  type PDFRawStream,
  PDFRef,
  PDFStream
} from 'pdf-lib';
import { readSpreadsheet } from '../spreadsheet/reader';
import { parseContentStreamWithPositions } from './content-stream-parser';
import { patchContentStream } from './content-stream-writer';
import { formatErrorForUser } from './error-handler';
import { extractFonts, parseFontInfo } from './font-handler';
import { FontRegistry } from './font-registry';
import { loadPDF, savePDF } from './pdf-handler';
import { extractTextFromBlock } from './text-decoder';
import { performReplacementsOnBlock } from './text-replacer';
import { processMarkedContent } from './marked-content-handler';
import type {
  FontInfo,
  ParsedContentStream,
  ProgressCallback,
  ProgressPhase,
  XObjectModifications,
  XObjectProcessingContext,
  XObjectReference
} from './types';

/**
 * One content stream to process (single stream or one element of Contents array).
 * ref is set when this came from a PDFArray (so we can preserve it when unmodified).
 */
interface ContentStreamEntry {
  stream: PDFStream;
  bytes: Uint8Array;
  ref: PDFRef | null;
  parsed: ParsedContentStream;
  modified?: boolean;
  patchedBytes?: Uint8Array;
  // Track if this came from concatenating array streams
  isArrayConcatenation?: boolean;
  // Reference to original PDFArray for replacement
  originalArray?: PDFArray;
}

/**
 * Progress phase ranges
 */
const PROGRESS_PHASES = {
  LOAD_PDF: { start: 0, end: 5 },
  LOAD_SPREADSHEET: { start: 5, end: 10 },
  PROCESS_PAGES: { start: 10, end: 95 },
  SAVE_PDF: { start: 95, end: 100 }
};

/**
 * Main PDF processing function
 */
export async function processPDF(
  pdfPath: string,
  spreadsheetPath: string,
  mappings: SheetMapping[],
  outputPath: string,
  onProgress?: ProgressCallback
): Promise<ProcessResult> {
  try {
    const reportProgress = (phase: ProgressPhase, subProgress: number, message: string) => {
      if (!onProgress) return;

      const range = PROGRESS_PHASES[phase];
      const totalProgress = range.start + (range.end - range.start) * subProgress;
      onProgress(Math.round(totalProgress), message);
    };

    // Phase 1: Load PDF
    reportProgress('LOAD_PDF', 0, 'Loading PDF document...');
    const pdfDoc = await loadPDF(pdfPath);
    const pageCount = pdfDoc.getPageCount();
    reportProgress('LOAD_PDF', 1, `PDF loaded: ${pageCount} pages`);

    // Phase 2: Load spreadsheet data
    reportProgress('LOAD_SPREADSHEET', 0, 'Reading spreadsheet data...');

    const locale = process.env.LOCALE || getSystemLanguage();

    const spreadsheetData = readSpreadsheet(
      spreadsheetPath,
      mappings.map((m) => m.sheetName),
      locale
    );
    reportProgress('LOAD_SPREADSHEET', 1, 'Spreadsheet loaded');

    const replacementMap = new Map<string, Map<string, number>>();
    const matchMap = new Map<string, Map<string, number>>();
    const allWarnings: ProcessingWarning[] = [];

    const allReplacements = mappings.flatMap((mapping) => {
      const sourceData = spreadsheetData.data[mapping.sheetName][mapping.sourceColumn] || [];
      const targetData = spreadsheetData.data[mapping.sheetName][mapping.targetColumn] || [];

      const entries: Array<{
        source: string;
        target: string;
        mappingId: string;
      }> = [];

      // For each row, create a replacement: find targetColumn value, replace with sourceColumn value
      const maxLength = Math.max(sourceData.length, targetData.length);
      for (let i = 0; i < maxLength; i++) {
        const sourceValue = sourceData[i]?.trim();
        const targetValue = targetData[i]?.trim();

        if (targetValue && sourceValue) {
          entries.push({
            source: sourceValue, // What to find in PDF
            target: targetValue, // What to replace with
            mappingId: `${mapping.sheetName}:${mapping.sourceColumn}→${mapping.targetColumn}`
          });
        }
      }

      const mappingId = `${mapping.sheetName}:${mapping.sourceColumn}→${mapping.targetColumn}`;
      replacementMap.set(mappingId, new Map());
      matchMap.set(mappingId, new Map());

      return entries;
    });

    // Phase 3: Process pages
    const pages = pdfDoc.getPages();
    let totalReplacements = 0;
    let totalMatches = 0;

    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      const page = pages[pageIndex];
      const pageProgress = pageIndex / pages.length;
      reportProgress(
        'PROCESS_PAGES',
        pageProgress,
        `Processing page ${pageIndex + 1} of ${pages.length}...`
      );

      try {
        const pageReplacements = await processPage(page, allReplacements, pageIndex);
        totalReplacements += pageReplacements.totalCount;
        totalMatches += pageReplacements.totalMatches;

        for (const [mappingId, counts] of pageReplacements.countsByMapping) {
          const mappingCounts = replacementMap.get(mappingId);
          if (mappingCounts) {
            for (const [source, count] of counts) {
              mappingCounts.set(source, (mappingCounts.get(source) || 0) + count);
            }
          }
        }

        for (const [mappingId, counts] of pageReplacements.matchesByMapping) {
          const mappingMatches = matchMap.get(mappingId);
          if (mappingMatches) {
            for (const [source, count] of counts) {
              mappingMatches.set(source, (mappingMatches.get(source) || 0) + count);
            }
          }
        }

        if (pageReplacements.characterIssues.size > 0) {
          const characterIssues: { character: string; strings: string[] }[] = [];
          for (const [char, strings] of pageReplacements.characterIssues) {
            characterIssues.push({
              character: char,
              strings: Array.from(strings)
            });
          }
          allWarnings.push({
            pageNumber: pageIndex + 1,
            characterIssues
          });
        }
      } catch (error) {
        console.warn(`Error processing page ${pageIndex + 1}:`, error);
      }
    }

    reportProgress('PROCESS_PAGES', 1, 'All pages processed');

    // Phase 4: Save PDF
    reportProgress('SAVE_PDF', 0, 'Saving modified PDF...');
    await savePDF(pdfDoc, outputPath);
    reportProgress('SAVE_PDF', 1, 'PDF saved successfully');

    // Build statistics
    const stats: ReplacementStats[] = [];
    for (const mapping of mappings) {
      const mappingId = `${mapping.sheetName}:${mapping.sourceColumn}→${mapping.targetColumn}`;
      const replacementCounts = replacementMap.get(mappingId);
      const matchCounts = matchMap.get(mappingId);

      const totalReplacementCount = replacementCounts
        ? Array.from(replacementCounts.values()).reduce((a, b) => a + b, 0)
        : 0;
      const totalMatchCount = matchCounts
        ? Array.from(matchCounts.values()).reduce((a, b) => a + b, 0)
        : 0;
      const failedCount = totalMatchCount - totalReplacementCount;

      stats.push({
        mappingId,
        sourceColumn: mapping.sourceColumn,
        targetColumn: mapping.targetColumn,
        replacementCount: totalReplacementCount,
        matchCount: totalMatchCount,
        failedCount: failedCount
      });
    }

    const failedReplacements = totalMatches - totalReplacements;
    const completionMessage =
      failedReplacements > 0
        ? `Complete! Made ${totalReplacements} replacements (${failedReplacements} failed due to encoding issues).`
        : `Complete! Made ${totalReplacements} replacements.`;

    onProgress?.(100, completionMessage);

    return {
      success: true,
      outputPath,
      stats,
      warnings: allWarnings.length > 0 ? allWarnings : undefined,
      totalMatches,
      totalReplacements
    };
  } catch (error) {
    console.error('PDF processing error:', error);

    const errorMessage =
      error instanceof Error ? formatErrorForUser(error) : 'Unknown error occurred';

    return {
      success: false,
      error: errorMessage
    };
  }
}

/**
 * Process a single PDF page
 */
async function processPage(
  page: PDFPage,
  replacements: Array<{ source: string; target: string; mappingId: string }>,
  pageIndex: number
): Promise<{
  totalCount: number;
  totalMatches: number;
  countsByMapping: Map<string, Map<string, number>>;
  matchesByMapping: Map<string, Map<string, number>>;
  characterIssues: Map<string, Set<string>>;
}> {
  const countsByMapping = new Map<string, Map<string, number>>();
  const matchesByMapping = new Map<string, Map<string, number>>();

  for (const replacement of replacements) {
    if (!countsByMapping.has(replacement.mappingId)) {
      countsByMapping.set(replacement.mappingId, new Map());
      matchesByMapping.set(replacement.mappingId, new Map());
    }
  }

  const contentStream = page.node.Contents();
  if (!contentStream) {
    console.log(`[PDF Processor] Page ${pageIndex + 1}: No content stream found`);
    return {
      totalCount: 0,
      totalMatches: 0,
      countsByMapping,
      matchesByMapping,
      characterIssues: new Map()
    };
  }

  const streamEntries = await getContentStreams(contentStream, page, pageIndex);
  if (!streamEntries || streamEntries.length === 0) {
    console.warn(`[PDF Processor] Page ${pageIndex + 1}: No content streams extracted`);
    return {
      totalCount: 0,
      totalMatches: 0,
      countsByMapping,
      matchesByMapping,
      characterIssues: new Map()
    };
  }

  const fontMap = await extractFonts(page);
  const fontRegistry = new FontRegistry();
  for (const font of fontMap.values()) {
    fontRegistry.addFont(font);
  }

  const blockReplacements = replacements
    .map((r) => ({ source: r.source, target: r.target }))
    .sort((a, b) => b.source.length - a.source.length);

  let totalPageMatches = 0;
  const pageCharacterIssues = new Map<string, Set<string>>();

  const xobjectRefs: XObjectReference[] = [];
  for (const entry of streamEntries) {
    const refs = extractXObjectReferences(entry.parsed, page);
    xobjectRefs.push(...refs);
  }

  for (let streamIndex = 0; streamIndex < streamEntries.length; streamIndex++) {
    const entry = streamEntries[streamIndex];
    const parsed = entry.parsed;

    for (const block of parsed.textBlocks) {
      extractTextFromBlock(block, fontMap);
      const result = performReplacementsOnBlock(block, blockReplacements, fontRegistry);
      totalPageMatches += result.matchCount;

      // Process marked content after text replacement
      const mcStats = processMarkedContent(block);
      if (mcStats.totalPairs > 0) {
        console.log(
          `[Page ${pageIndex + 1} Stream ${streamIndex + 1}] Marked Content: ` +
            `${mcStats.emptyRemoved} empty removed, ${mcStats.actualTextUpdated} ActualText updated`
        );
      }

      if (result.characterIssues.size > 0) {
        for (const [char, strings] of result.characterIssues) {
          if (!pageCharacterIssues.has(char)) {
            pageCharacterIssues.set(char, new Set());
          }
          for (const str of strings) {
            pageCharacterIssues.get(char)!.add(str);
          }
        }
      }
    }

    const modifiedBlocks = parsed.textBlocks.filter((b) => b.modified);
    if (modifiedBlocks.length > 0) {
      const patchedBytes = patchContentStream(parsed);
      if (patchedBytes.length === 0) {
        console.error(
          `[PDF Processor] Page ${pageIndex + 1} stream ${streamIndex + 1}: Patched stream is empty, skipping`
        );
      } else {
        entry.modified = true;
        entry.patchedBytes = patchedBytes;
      }
    }
  }

  // Process XObjects
  let xobjectMatchCount = 0;
  let xobjectReplacementCount = 0;
  const xobjectModifications = new Map<PDFStream, Uint8Array>();

  if (xobjectRefs.length > 0) {
    const xobjectContext: XObjectProcessingContext = {
      replacements: blockReplacements,
      visitedXObjects: new Set(),
      depth: 0,
      maxDepth: 10,
      pageIndex,
      pageFontRegistry: fontRegistry,
      page
    };

    for (const xobjectRef of xobjectRefs) {
      if (!xobjectRef.xobjectStream) {
        continue;
      }

      try {
        const xobjMods = await processXObject(xobjectRef, xobjectContext);

        // Merge modifications
        for (const [stream, bytes] of xobjMods.modifications) {
          xobjectModifications.set(stream, bytes);
        }

        // Merge character issues
        for (const [char, strings] of xobjMods.characterIssues) {
          if (!pageCharacterIssues.has(char)) {
            pageCharacterIssues.set(char, new Set());
          }
          for (const str of strings) {
            pageCharacterIssues.get(char)!.add(str);
          }
        }

        xobjectMatchCount += xobjMods.matchCount;
        xobjectReplacementCount += xobjMods.replacementCount;
      } catch (error) {
        console.error(`[PDF Processor] Error processing XObject "${xobjectRef.name}":`, error);
      }
    }

    totalPageMatches += xobjectMatchCount;
  }

  let totalCount = 0;
  for (const entry of streamEntries) {
    const parsed = entry.parsed;

    for (const block of parsed.textBlocks) {
      for (const element of block.textElements) {
        for (const replacement of replacements) {
          const sourceMatches = element.text.match(
            new RegExp(replacement.source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
          );
          const targetMatches = element.text.match(
            new RegExp(replacement.target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
          );
          if (sourceMatches) {
            const matchCounts = matchesByMapping.get(replacement.mappingId)!;
            matchCounts.set(
              replacement.source,
              (matchCounts.get(replacement.source) || 0) + sourceMatches.length
            );
          }
          if (targetMatches && block.modified) {
            totalCount += targetMatches.length;
            const replacementCounts = countsByMapping.get(replacement.mappingId)!;
            replacementCounts.set(
              replacement.source,
              (replacementCounts.get(replacement.source) || 0) + targetMatches.length
            );
          }
        }
      }
    }
  }

  const anyModified = streamEntries.some((e) => e.modified);
  if (anyModified) {
    try {
      await updatePageContentStream(page, contentStream, streamEntries);
    } catch (error) {
      console.error('[PDF Processor] Failed to update content stream(s):', error);
      return {
        totalCount: 0,
        totalMatches: totalPageMatches,
        countsByMapping,
        matchesByMapping,
        characterIssues: pageCharacterIssues
      };
    }
  } else {
  }

  if (xobjectModifications.size > 0) {
    try {
      await updateXObjectStreams(xobjectModifications);
    } catch (error) {
      console.error('[PDF Processor] Failed to update XObject stream(s):', error);
    }
  }

  return {
    totalCount: totalCount + xobjectReplacementCount,
    totalMatches: totalPageMatches,
    countsByMapping,
    matchesByMapping,
    characterIssues: pageCharacterIssues
  };
}

/**
 * Concatenate multiple stream byte arrays into one continuous buffer.
 * Adds whitespace between streams to prevent token merging.
 */
function concatenateStreamBytes(streamBytes: Uint8Array[]): Uint8Array {
  if (streamBytes.length === 1) return streamBytes[0];

  // Calculate total size (streams + separating spaces)
  const totalSize =
    streamBytes.reduce((sum, bytes) => sum + bytes.length, 0) + (streamBytes.length - 1);

  const result = new Uint8Array(totalSize);
  let offset = 0;

  for (let i = 0; i < streamBytes.length; i++) {
    result.set(streamBytes[i], offset);
    offset += streamBytes[i].length;

    // Add space between streams (not after last)
    if (i < streamBytes.length - 1) {
      result[offset] = 0x20; // ASCII space
      offset++;
    }
  }

  return result;
}

/**
 * Resolve page Contents into an array of stream entries (one per stream).
 * Single stream -> one entry with ref=null. PDFArray -> one entry per ref, ref preserved.
 */
async function getContentStreams(
  contentStream: PDFStream | PDFArray,
  page: PDFPage,
  pageIndex: number
): Promise<ContentStreamEntry[] | null> {
  try {
    if (contentStream instanceof PDFStream) {
      const bytes = await decodeStream(contentStream);
      if (!bytes) return null;

      const parsed = parseContentStreamWithPositions(bytes, pageIndex);
      return [{ stream: contentStream, bytes, ref: null, parsed }];
    }
    if (contentStream instanceof PDFArray) {
      const context = page.doc.context;
      const streamRefs = contentStream.asArray();

      // Decode all streams first
      const decodedStreams: Array<{ stream: PDFStream; bytes: Uint8Array }> = [];

      for (const refOrStream of streamRefs) {
        const stream: PDFStream | undefined =
          refOrStream instanceof PDFRef
            ? context.lookupMaybe(refOrStream, PDFStream)
            : refOrStream instanceof PDFStream
              ? refOrStream
              : undefined;

        if (stream) {
          const bytes = await decodeStream(stream);
          if (bytes) {
            decodedStreams.push({ stream, bytes });
          }
        }
      }

      if (decodedStreams.length === 0) return null;

      // Concatenate all stream bytes into one
      const allBytes = decodedStreams.map((s) => s.bytes);
      const concatenatedBytes = concatenateStreamBytes(allBytes);

      // Parse the concatenated stream ONCE
      const parsed = parseContentStreamWithPositions(concatenatedBytes, pageIndex);

      // Return a single entry representing the concatenation
      return [
        {
          stream: decodedStreams[0].stream, // Use first stream as container
          bytes: concatenatedBytes,
          ref: null,
          parsed,
          isArrayConcatenation: true,
          originalArray: contentStream // Preserve reference to replace it
        }
      ];
    }

    throw new Error('Unsupported content stream type');
  } catch (error) {
    console.warn('[PDF Processor] Error getting content streams:', error);
    return null;
  }
}

/**
 * Decode a PDF stream, handling filters like FlateDecode
 */
async function decodeStream(stream: PDFStream): Promise<Uint8Array | null> {
  try {
    const decodedStream = decodePDFRawStream(stream as PDFRawStream);
    return decodedStream.decode();
  } catch (error) {
    console.warn('[PDF Processor] Error decoding stream:', error);
    return null;
  }
}

/**
 * Extract XObject references from parsed content stream
 * Finds all "Do" operators and resolves them to XObject Form streams
 */
function extractXObjectReferences(parsed: ParsedContentStream, page: PDFPage): XObjectReference[] {
  const xobjectRefs: XObjectReference[] = [];
  const resources = page.node.Resources();

  if (!resources) {
    return xobjectRefs;
  }

  const xobjectDict = resources.lookupMaybe(PDFName.of('XObject'), PDFLibDict);
  if (!xobjectDict) {
    return xobjectRefs;
  }

  // Find all "Do" operators in operations
  for (const operation of parsed.allOperations) {
    if (operation.operator === 'Do' && operation.operands.length >= 1) {
      const xobjectName = operation.operands[0] as string; // e.g., "/Fm1" or "Fm1"
      const cleanName = xobjectName.startsWith('/') ? xobjectName.slice(1) : xobjectName;

      const xobjectRef = xobjectDict.lookup(PDFName.of(cleanName));
      if (!xobjectRef) {
        console.warn(`[XObject] XObject "${cleanName}" not found in Resources`);
        continue;
      }

      // Resolve to PDFStream
      const context = page.doc.context;
      const xobjectStream = context.lookupMaybe(xobjectRef, PDFStream);

      if (!xobjectStream) {
        console.warn(`[XObject] XObject "${cleanName}" is not a stream`);
        continue;
      }

      // Check if it's a Form XObject (not Image)
      const subtype = xobjectStream.dict.lookupMaybe(PDFName.of('Subtype'), PDFName);
      const subtypeStr = subtype?.asString() || '';
      if (!subtypeStr.includes('Form')) {
        continue;
      }

      // Get XObject's Resources
      const xobjResources = xobjectStream.dict.lookupMaybe(PDFName.of('Resources'), PDFLibDict);

      xobjectRefs.push({
        name: cleanName,
        xobjectStream,
        resources: xobjResources || null
      });
    }
  }

  return xobjectRefs;
}

/**
 * Extract fonts from XObject Resources dictionary
 * Similar to extractFonts() but works with XObject context
 */
async function extractXObjectFonts(
  xobjectResources: PDFLibDict | null,
  xobjectName: string
): Promise<Map<string, FontInfo>> {
  const fontMap = new Map<string, FontInfo>();

  if (!xobjectResources) {
    console.log(`[XObject] No resources in XObject "${xobjectName}"`);
    return fontMap;
  }

  const fontDict = xobjectResources.lookupMaybe?.(PDFName.of('Font'), PDFLibDict);
  if (!fontDict) {
    console.log(`[XObject] No Font dictionary in XObject "${xobjectName}"`);
    return fontMap;
  }

  const fontNames = fontDict.keys();
  console.log(`[XObject] Found ${fontNames.length} fonts in XObject "${xobjectName}"`);

  for (const fontNameObj of fontNames) {
    const fontName = fontNameObj.asString();
    const fontRef = fontDict.lookup(fontNameObj);

    if (!fontRef) continue;

    // Reuse exported parseFontInfo from font-handler.ts
    const fontInfo = await parseFontInfo(fontName, fontRef);
    if (fontInfo) {
      console.log(
        `[XObject] Loaded font in XObject "${xobjectName}": ${fontName} -> ${fontInfo.baseFont}`
      );
      fontMap.set(fontName, fontInfo);
    }
  }

  return fontMap;
}

/**
 * Process a single XObject Form's content stream
 * Returns modifications to be applied to the XObject stream
 * Handles nested XObjects recursively
 */
async function processXObject(
  xobjectRef: XObjectReference,
  context: XObjectProcessingContext
): Promise<XObjectModifications> {
  const modifications: Map<PDFStream, Uint8Array> = new Map();
  const characterIssues = new Map<string, Set<string>>();
  let matchCount = 0;
  let replacementCount = 0;

  // Check recursion depth
  if (context.depth >= context.maxDepth) {
    console.warn(
      `[XObject] Max recursion depth ${context.maxDepth} reached for XObject "${xobjectRef.name}"`
    );
    return { modifications, characterIssues, matchCount, replacementCount };
  }

  // Check for circular references
  if (xobjectRef.xobjectStream && context.visitedXObjects.has(xobjectRef.xobjectStream)) {
    console.warn(`[XObject] Circular reference detected for XObject "${xobjectRef.name}"`);
    return { modifications, characterIssues, matchCount, replacementCount };
  }

  if (xobjectRef.xobjectStream) {
    context.visitedXObjects.add(xobjectRef.xobjectStream);
  }

  if (!xobjectRef.xobjectStream) {
    console.warn(`[XObject] XObject "${xobjectRef.name}" has no stream`);
    return { modifications, characterIssues, matchCount, replacementCount };
  }

  const xobjectBytes = await decodeStream(xobjectRef.xobjectStream);
  if (!xobjectBytes) {
    console.warn(`[XObject] Failed to decode XObject "${xobjectRef.name}"`);
    return { modifications, characterIssues, matchCount, replacementCount };
  }

  const parsed = parseContentStreamWithPositions(xobjectBytes, context.pageIndex);

  if (parsed.textBlocks.length === 0) {
    return { modifications, characterIssues, matchCount, replacementCount };
  }

  const xobjectFonts = await extractXObjectFonts(xobjectRef.resources, xobjectRef.name);
  const xobjectFontRegistry = new FontRegistry();

  for (const family of context.pageFontRegistry.getFamilies().values()) {
    for (const fontInfo of family.fonts.values()) {
      xobjectFontRegistry.addFont(fontInfo);
    }
  }

  for (const font of xobjectFonts.values()) {
    xobjectFontRegistry.addFont(font);
  }

  const nestedXObjects = extractXObjectReferences(parsed, context.page);

  if (nestedXObjects.length > 0) {
    console.log(`[XObject] Found ${nestedXObjects.length} nested XObjects in "${xobjectRef.name}"`);

    const nestedContext: XObjectProcessingContext = {
      ...context,
      depth: context.depth + 1,
      pageFontRegistry: xobjectFontRegistry // Pass merged registry down
    };

    for (const nestedXObj of nestedXObjects) {
      try {
        const nestedMods = await processXObject(nestedXObj, nestedContext);

        // Merge nested modifications
        for (const [stream, bytes] of nestedMods.modifications) {
          modifications.set(stream, bytes);
        }

        // Merge character issues
        for (const [char, strings] of nestedMods.characterIssues) {
          if (!characterIssues.has(char)) {
            characterIssues.set(char, new Set());
          }
          for (const str of strings) {
            characterIssues.get(char)!.add(str);
          }
        }

        matchCount += nestedMods.matchCount;
        replacementCount += nestedMods.replacementCount;
      } catch (error) {
        console.error(`[XObject] Error processing nested XObject "${nestedXObj.name}":`, error);
      }
    }
  }

  // Process text blocks in XObject content stream
  for (const block of parsed.textBlocks) {
    extractTextFromBlock(block, xobjectFonts);

    const result = performReplacementsOnBlock(block, context.replacements, xobjectFontRegistry);

    matchCount += result.matchCount;

    if (result.modified) {
      replacementCount += result.count;
    }

    // Process marked content in XObjects
    const mcStats = processMarkedContent(block);
    if (mcStats.totalPairs > 0) {
      console.log(
        `[XObject "${xobjectRef.name}"] Marked Content: ` +
          `${mcStats.emptyRemoved} empty removed, ${mcStats.actualTextUpdated} ActualText updated`
      );
    }

    // Merge character issues
    for (const [char, strings] of result.characterIssues) {
      if (!characterIssues.has(char)) {
        characterIssues.set(char, new Set());
      }
      for (const str of strings) {
        characterIssues.get(char)!.add(str);
      }
    }
  }

  const modifiedBlocks = parsed.textBlocks.filter((b) => b.modified);
  if (modifiedBlocks.length > 0) {
    const patchedBytes = patchContentStream(parsed);

    if (patchedBytes.length === 0) {
      console.error(`[XObject] Patched stream is empty for XObject "${xobjectRef.name}", skipping`);
    } else {
      modifications.set(xobjectRef.xobjectStream, patchedBytes);
    }
  }

  return { modifications, characterIssues, matchCount, replacementCount };
}

/**
 * Re-encode stream bytes with the same filter as the original stream when supported.
 * Supports single FlateDecode without predictor (DecodeParms Predictor > 1 not implemented).
 * Returns compressed bytes, or null to write uncompressed.
 */
function encodeStreamWithFilter(
  bytes: Uint8Array,
  filterVal: unknown,
  decodeParmsVal: unknown
): Uint8Array | null {
  if (!filterVal) return null;

  let isFlateDecode = false;
  if (filterVal instanceof PDFName) {
    isFlateDecode = filterVal.asString() === '/FlateDecode';
  } else if (filterVal instanceof PDFArray && filterVal.size() === 1) {
    const first = filterVal.lookup(0, PDFName);
    isFlateDecode = first.asString() === '/FlateDecode';
  }

  if (!isFlateDecode) return null;

  if (decodeParmsVal instanceof PDFLibDict) {
    const predictor = decodeParmsVal.lookupMaybe(PDFName.of('Predictor'), PDFNumber);
    if (predictor !== undefined && predictor.asNumber() > 1) {
      return null;
    }
  }

  try {
    const encoded = deflateSync(bytes, { level: 9 });
    return new Uint8Array(encoded);
  } catch (error) {
    console.warn('[PDF Processor] FlateDecode re-encode failed:', error);
    return null;
  }
}

/**
 * Update an existing stream in place with new bytes, re-using FlateDecode when the original had it.
 */
function updateStreamInPlace(entry: ContentStreamEntry): void {
  const originalDict = entry.stream.dict;
  const filterVal = originalDict.get(PDFName.of('Filter'));
  const decodeParmsVal = originalDict.get(PDFName.of('DecodeParms'));

  const encodedBytes = encodeStreamWithFilter(entry.patchedBytes!, filterVal, decodeParmsVal);
  const bytesToWrite = encodedBytes ?? entry.patchedBytes!;

  const rawStream = entry.stream as PDFRawStream;
  (rawStream as any).contents = bytesToWrite;

  rawStream.dict.set(PDFName.of('Length'), PDFNumber.of(bytesToWrite.length));

  if (encodedBytes !== null) {
    rawStream.dict.set(PDFName.of('Filter'), PDFName.of('FlateDecode'));
  } else {
    rawStream.dict.delete(PDFName.of('Filter'));
    rawStream.dict.delete(PDFName.of('DecodeParms'));
  }
}

/**
 * Replace a PDFArray (Contents array) with a single PDFStream.
 * Updates the page dictionary to point to the single stream.
 */
async function replaceArrayWithSingleStream(
  page: PDFPage,
  entry: ContentStreamEntry
): Promise<void> {
  // Encode the patched bytes (with FlateDecode compression)
  const filterVal = entry.stream.dict.get(PDFName.of('Filter'));
  const decodeParmsVal = entry.stream.dict.get(PDFName.of('DecodeParms'));

  const encodedBytes = encodeStreamWithFilter(entry.patchedBytes!, filterVal, decodeParmsVal);
  const bytesToWrite = encodedBytes ?? entry.patchedBytes!;

  // Update the first stream with new content
  const rawStream = entry.stream as PDFRawStream;
  (rawStream as any).contents = bytesToWrite;
  rawStream.dict.set(PDFName.of('Length'), PDFNumber.of(bytesToWrite.length));

  if (encodedBytes !== null) {
    rawStream.dict.set(PDFName.of('Filter'), PDFName.of('FlateDecode'));
  } else {
    rawStream.dict.delete(PDFName.of('Filter'));
    rawStream.dict.delete(PDFName.of('DecodeParms'));
  }

  // Replace array with single stream in page dictionary
  const pageDict = page.node;
  const context = page.doc.context;

  // Get reference to the updated stream, or create one
  const streamRef = context.getObjectRef(entry.stream);
  if (streamRef) {
    pageDict.set(PDFName.of('Contents'), streamRef);
  } else {
    // Direct stream (unlikely but handle it)
    pageDict.set(PDFName.of('Contents'), entry.stream);
  }

  // Clean up orphaned streams from the original array
  // These are no longer referenced and should be removed from the PDF
  if (entry.originalArray) {
    const originalRefs = entry.originalArray.asArray();
    const keptStreamRef = streamRef;

    for (const refOrStream of originalRefs) {
      if (refOrStream instanceof PDFRef) {
        // Skip the stream we're keeping
        if (keptStreamRef && refOrStream.tag === keptStreamRef.tag) {
          continue;
        }

        // Delete the orphaned stream object from the PDF context
        // This reduces final PDF file size by removing unused objects
        try {
          // pdf-lib doesn't have a public delete API, but we can mark objects
          // as deleted by removing them from the context's object map
          const contextInternal = context as any;
          if (contextInternal.indirectObjects) {
            contextInternal.indirectObjects.delete(refOrStream);
          }
        } catch (error) {
          // If deletion fails, pdf-lib's save process will still perform
          // garbage collection and exclude unreachable objects
          console.warn('[PDF Processor] Could not explicitly delete orphaned stream:', error);
        }
      }
    }
  }
}

/**
 * Update page Contents from per-stream entries.
 * Modifies streams in place, preserving original object references.
 */
async function updatePageContentStream(
  page: PDFPage,
  originalStream: PDFStream | PDFArray,
  streamEntries: ContentStreamEntry[]
): Promise<void> {
  // Single stream case - unchanged
  if (originalStream instanceof PDFStream) {
    const entry = streamEntries[0];
    if (!entry.modified || !entry.patchedBytes) return;

    updateStreamInPlace(entry);
    return;
  }

  // Array case
  if (originalStream instanceof PDFArray) {
    const entry = streamEntries[0];

    // Check if this is a concatenated array
    if (entry.isArrayConcatenation) {
      if (entry.modified && entry.patchedBytes) {
        await replaceArrayWithSingleStream(page, entry);
      }
    } else {
      // Backward compatibility: multiple independent entries (shouldn't happen anymore)
      for (let i = 0; i < streamEntries.length; i++) {
        const e = streamEntries[i];
        if (e.modified && e.patchedBytes) {
          updateStreamInPlace(e);
        }
      }
    }
  }
}

/**
 * Update XObject streams with modified content
 * Similar to updateStreamInPlace but for XObjects
 */
async function updateXObjectStreams(modifications: Map<PDFStream, Uint8Array>): Promise<void> {
  for (const [xobjectStream, patchedBytes] of modifications) {
    const entry: ContentStreamEntry = {
      stream: xobjectStream,
      bytes: new Uint8Array(), // Not used
      ref: null,
      modified: true,
      parsed: {
        originalBytes: new Uint8Array(), // Not used
        allOperations: [],
        textBlocks: []
      },
      patchedBytes
    };

    updateStreamInPlace(entry);
  }
}
