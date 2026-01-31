// Main PDF processing entry point

import { deflateSync } from 'node:zlib';
import {
  PDFPage,
  PDFStream,
  PDFArray,
  PDFRef,
  PDFName,
  PDFDict,
  PDFNumber,
  decodePDFRawStream,
  PDFRawStream
} from 'pdf-lib';
import { SheetMapping, ProcessResult, ReplacementStats, ProcessingWarning } from '@shared/types';
import { readSpreadsheet } from '@core/spreadsheet/reader';
import { loadPDF, savePDF, getPageCount } from './loader';
import { parseContentStreamWithPositions } from './content-stream-parser';
import { extractFonts } from './font-handler';
import { extractTextFromBlock } from './text-decoder';
import { performReplacementsOnBlock } from './text-replacer';
import { patchContentStream } from './content-stream-writer';
import { formatErrorForUser } from './error-handler';
import { ProgressCallback, ProgressPhase } from './types';
import type { ParsedContentStream } from './types';
import { FontRegistry } from './font-registry';

/**
 * One content stream to process (single stream or one element of Contents array).
 * ref is set when this came from a PDFArray (so we can preserve it when unmodified).
 */
interface ContentStreamEntry {
  stream: PDFStream;
  bytes: Uint8Array;
  ref: PDFRef | null;
  parsed?: ParsedContentStream;
  modified?: boolean;
  patchedBytes?: Uint8Array;
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
    // Helper to report progress
    const reportProgress = (phase: ProgressPhase, subProgress: number, message: string) => {
      if (!onProgress) return;

      const range = PROGRESS_PHASES[phase];
      const totalProgress = range.start + (range.end - range.start) * subProgress;
      onProgress(Math.round(totalProgress), message);
    };

    // Phase 1: Load PDF
    reportProgress('LOAD_PDF', 0, 'Loading PDF document...');
    const pdfDoc = await loadPDF(pdfPath);
    const pageCount = getPageCount(pdfDoc);
    reportProgress('LOAD_PDF', 1, `PDF loaded: ${pageCount} pages`);

    // Phase 2: Load spreadsheet data
    reportProgress('LOAD_SPREADSHEET', 0, 'Reading spreadsheet data...');
    const spreadsheetData = readSpreadsheet(
      spreadsheetPath,
      mappings.map((m) => m.sheetName)
    );
    reportProgress('LOAD_SPREADSHEET', 1, 'Spreadsheet loaded');

    console.log('[PDF Processor] Spreadsheet data loaded:', {
      sheets: Object.keys(spreadsheetData.data)
    });

    // Build replacement entries for each mapping
    const replacementMap = new Map<string, Map<string, number>>(); // mappingId -> (source -> replacementCount)
    const matchMap = new Map<string, Map<string, number>>(); // mappingId -> (source -> matchCount)
    const allWarnings: ProcessingWarning[] = [];

    const allReplacements = mappings.flatMap((mapping) => {
      const sourceData = spreadsheetData.data[mapping.sheetName][mapping.sourceColumn] || [];
      const targetData = spreadsheetData.data[mapping.sheetName][mapping.targetColumn] || [];

      console.log(`[PDF Processor] Processing mapping: ${mapping.sheetName}`, {
        sourceColumn: mapping.sourceColumn,
        targetColumn: mapping.targetColumn,
        sourceDataLength: sourceData.length,
        targetDataLength: targetData.length,
        sourceDataSample: sourceData.slice(0, 3),
        targetDataSample: targetData.slice(0, 3)
      });

      // Build replacement entries
      const entries: Array<{ source: string; target: string; mappingId: string }> = [];

      // For each row, create a replacement: find targetColumn value, replace with sourceColumn value
      const maxLength = Math.max(sourceData.length, targetData.length);
      for (let i = 0; i < maxLength; i++) {
        const sourceValue = sourceData[i];
        const targetValue = targetData[i];

        if (targetValue && targetValue.trim() && sourceValue && sourceValue.trim()) {
          entries.push({
            source: sourceValue.trim(), // What to find in PDF
            target: targetValue.trim(), // What to replace with
            mappingId: `${mapping.sheetName}:${mapping.sourceColumn}→${mapping.targetColumn}`
          });
        }
      }

      console.log(
        `[PDF Processor] Built ${entries.length} replacement entries for mapping ${mapping.sheetName}`
      );
      console.log('[PDF Processor] Sample replacements:', entries.slice(0, 3));

      // Initialize replacement and match count tracking
      const mappingId = `${mapping.sheetName}:${mapping.sourceColumn}→${mapping.targetColumn}`;
      replacementMap.set(mappingId, new Map());
      matchMap.set(mappingId, new Map());

      return entries;
    });

    console.log(`[PDF Processor] Total replacement entries: ${allReplacements.length}`);

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
        console.log(`[PDF Processor] Processing page ${pageIndex + 1}/${pages.length}`);

        // Process this page
        const pageReplacements = await processPage(page, allReplacements, pageIndex);
        totalReplacements += pageReplacements.totalCount;
        totalMatches += pageReplacements.totalMatches;

        console.log(
          `[PDF Processor] Page ${pageIndex + 1} completed: ${pageReplacements.totalCount} replacements from ${pageReplacements.totalMatches} matches`
        );

        // Update replacement and match counts
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

        // Collect character issues for this page
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
        // Continue with next page
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

  // Initialize counters
  for (const replacement of replacements) {
    if (!countsByMapping.has(replacement.mappingId)) {
      countsByMapping.set(replacement.mappingId, new Map());
      matchesByMapping.set(replacement.mappingId, new Map());
    }
  }

  // Get content stream
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

  console.log(
    `[PDF Processor] Page ${pageIndex + 1}: Content stream type:`,
    contentStream.constructor.name
  );

  const streamEntries = await getContentStreams(contentStream, page);
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

  console.log(
    `[PDF Processor] Page ${pageIndex + 1}: ${streamEntries.length} content stream(s) to process`
  );

  const fontMap = await extractFonts(page);
  console.log(
    `[PDF Processor] Page ${pageIndex + 1}: Found ${fontMap.size} fonts`,
    Array.from(fontMap.keys())
  );

  const fontRegistry = new FontRegistry();
  for (const font of fontMap.values()) {
    fontRegistry.addFont(font);
  }

  const blockReplacements = replacements
    .map((r) => ({ source: r.source, target: r.target }))
    .sort((a, b) => b.source.length - a.source.length);

  let totalPageMatches = 0;
  const pageCharacterIssues = new Map<string, Set<string>>();

  for (let streamIndex = 0; streamIndex < streamEntries.length; streamIndex++) {
    const entry = streamEntries[streamIndex];
    const parsed = parseContentStreamWithPositions(entry.bytes, pageIndex);
    entry.parsed = parsed;

    for (const block of parsed.textBlocks) {
      extractTextFromBlock(block, fontMap);
      const result = performReplacementsOnBlock(block, blockReplacements, fontMap, fontRegistry);
      totalPageMatches += result.matchCount;

      if (result.modified && result.count > 0) {
        console.log(
          `[PDF Processor] Page ${pageIndex + 1} stream ${streamIndex + 1}: Block modified with ${result.count} replacements from ${result.matchCount} matches`
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

  let totalCount = 0;
  for (const entry of streamEntries) {
    const parsed = entry.parsed!;
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
      await updatePageContentStream(contentStream, streamEntries);
      console.log('[PDF Processor] Successfully updated page content stream(s)');
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
    console.log(
      `[PDF Processor] Page ${pageIndex + 1}: No modifications made, content stream unchanged`
    );
  }

  return {
    totalCount,
    totalMatches: totalPageMatches,
    countsByMapping,
    matchesByMapping,
    characterIssues: pageCharacterIssues
  };
}

/**
 * Resolve page Contents into an array of stream entries (one per stream).
 * Single stream -> one entry with ref=null. PDFArray -> one entry per ref, ref preserved.
 */
async function getContentStreams(
  contentStream: PDFStream | PDFArray,
  page: PDFPage
): Promise<ContentStreamEntry[] | null> {
  try {
    if (contentStream instanceof PDFStream) {
      const bytes = await decodeStream(contentStream);
      if (!bytes) return null;
      return [{ stream: contentStream, bytes, ref: null }];
    }
    if (contentStream instanceof PDFArray) {
      const context = page.doc.context;
      const streamRefs = contentStream.asArray();
      const entries: ContentStreamEntry[] = [];

      for (const refOrStream of streamRefs) {
        const ref = refOrStream instanceof PDFRef ? refOrStream : null;
        const stream: PDFStream | undefined =
          refOrStream instanceof PDFRef
            ? context.lookupMaybe(refOrStream, PDFStream)
            : refOrStream instanceof PDFStream
              ? refOrStream
              : undefined;
        if (stream) {
          const bytes = await decodeStream(stream);
          if (bytes) {
            entries.push({ stream, bytes, ref });
          }
        }
      }

      return entries.length > 0 ? entries : null;
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

  if (decodeParmsVal instanceof PDFDict) {
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

  // Update the stream contents in place
  const rawStream = entry.stream as PDFRawStream;
  (rawStream as any).contents = bytesToWrite;

  // Update the Length entry in the dictionary
  rawStream.dict.set(PDFName.of('Length'), PDFNumber.of(bytesToWrite.length));

  // Ensure Filter is set correctly
  if (encodedBytes !== null) {
    rawStream.dict.set(PDFName.of('Filter'), PDFName.of('FlateDecode'));
  } else {
    // Remove Filter if we're writing uncompressed
    rawStream.dict.delete(PDFName.of('Filter'));
    rawStream.dict.delete(PDFName.of('DecodeParms'));
  }
}

/**
 * Update page Contents from per-stream entries.
 * Modifies streams in place, preserving original object references.
 */
async function updatePageContentStream(
  originalStream: PDFStream | PDFArray,
  streamEntries: ContentStreamEntry[]
): Promise<void> {
  if (originalStream instanceof PDFStream) {
    const entry = streamEntries[0];
    if (!entry.modified || !entry.patchedBytes) return;

    updateStreamInPlace(entry);
    console.log(
      `[PDF Processor] Updated content stream in place with ${entry.patchedBytes.length} bytes (re-encoded with original filter when applicable)`
    );
    return;
  }

  if (originalStream instanceof PDFArray) {
    for (let i = 0; i < streamEntries.length; i++) {
      const entry = streamEntries[i];
      if (entry.modified && entry.patchedBytes) {
        updateStreamInPlace(entry);
        console.log(
          `[PDF Processor] Stream ${i + 1}/${streamEntries.length}: updated in place with ${entry.patchedBytes.length} bytes (re-encoded with original filter when applicable)`
        );
      }
    }
    console.log(`[PDF Processor] Updated ${streamEntries.filter(e => e.modified).length} of ${streamEntries.length} stream(s) in place`);
  }
}
