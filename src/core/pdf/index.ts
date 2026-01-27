// Main PDF processing entry point

import { PDFPage, PDFStream, PDFArray, decodePDFRawStream, PDFRawStream } from 'pdf-lib';
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
import { FontRegistry } from './font-registry';

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

  // Handle content stream (can be array or single stream)
  const streamBytes = await getContentStreamBytes(contentStream, page);
  if (!streamBytes || streamBytes.length === 0) {
    console.warn(
      `[PDF Processor] Page ${pageIndex + 1}: No stream bytes extracted (got ${streamBytes?.length || 0} bytes)`
    );
    return {
      totalCount: 0,
      totalMatches: 0,
      countsByMapping,
      matchesByMapping,
      characterIssues: new Map()
    };
  }

  console.log(
    `[PDF Processor] Page ${pageIndex + 1}: Successfully extracted ${streamBytes.length} bytes from content stream`
  );

  // NEW: Parse with positions, preserve original bytes
  const parsed = parseContentStreamWithPositions(streamBytes, pageIndex);
  console.log(
    `[PDF Processor] Page ${pageIndex + 1}: Parsed ${parsed.allOperations.length} operations (ALL preserved)`
  );
  console.log(
    `[PDF Processor] Page ${pageIndex + 1}: Found ${parsed.textBlocks.length} text blocks`
  );

  // Extract fonts
  const fontMap = await extractFonts(page);
  console.log(
    `[PDF Processor] Page ${pageIndex + 1}: Found ${fontMap.size} fonts`,
    Array.from(fontMap.keys())
  );

  // Build font registry for cross-font character fallback
  const fontRegistry = new FontRegistry();
  for (const font of fontMap.values()) {
    fontRegistry.addFont(font);
  }

  // Debug: Log font families
  const families = fontRegistry.getFamilies();
  console.log(
    `[PDF Processor] Page ${pageIndex + 1}: Built font registry with ${families.size} font families`
  );
  for (const [familyName, family] of families) {
    console.log(
      `[PDF Processor]   Family "${familyName}": ${family.fonts.size} fonts (${Array.from(family.fonts.keys()).join(', ')})`
    );
  }

  // Process each text block independently
  let totalPageMatches = 0;
  const pageCharacterIssues = new Map<string, Set<string>>();

  // Perform replacements on this block
  const blockReplacements = replacements
    .map((r) => ({
      source: r.source,
      target: r.target
    }))
    .sort((a, b) => b.source.length - a.source.length); // Longer first

  for (const block of parsed.textBlocks) {
    // Extract text from this block only
    extractTextFromBlock(block, fontMap);

    const result = performReplacementsOnBlock(block, blockReplacements, fontMap, fontRegistry);

    totalPageMatches += result.matchCount;

    // Track stats if modified
    if (result.modified && result.count > 0) {
      console.log(
        `[PDF Processor] Page ${pageIndex + 1}: Block modified with ${result.count} replacements from ${result.matchCount} matches`
      );
    }

    // Collect character issues
    if (result.characterIssues.size > 0) {
      console.warn(
        `[PDF Processor] Page ${pageIndex + 1}: Block has ${result.characterIssues.size} character encoding issues`
      );
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

  // Count total modifications and track per-mapping statistics
  const modifiedBlocks = parsed.textBlocks.filter((b) => b.modified);
  let totalCount = 0;

  // Track replacements and matches per source text
  for (const block of parsed.textBlocks) {
    for (const element of block.textElements) {
      // Count both matches and replacements for each source
      for (const replacement of replacements) {
        const sourceMatches = element.text.match(
          new RegExp(replacement.source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
        );
        const targetMatches = element.text.match(
          new RegExp(replacement.target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
        );

        if (sourceMatches) {
          const matchCount = sourceMatches.length;
          const matchCounts = matchesByMapping.get(replacement.mappingId)!;
          matchCounts.set(
            replacement.source,
            (matchCounts.get(replacement.source) || 0) + matchCount
          );
        }

        if (targetMatches && block.modified) {
          const count = targetMatches.length;
          totalCount += count;

          const replacementCounts = countsByMapping.get(replacement.mappingId)!;
          replacementCounts.set(
            replacement.source,
            (replacementCounts.get(replacement.source) || 0) + count
          );
        }
      }
    }
  }

  // Surgical patch - only rebuild modified blocks
  if (modifiedBlocks.length > 0) {
    console.log(
      `[PDF Processor] Page ${pageIndex + 1}: ${modifiedBlocks.length} blocks modified (out of ${parsed.textBlocks.length})`
    );

    try {
      // NEW: Surgical patch - preserves graphics and unchanged blocks
      const patchedStream = patchContentStream(parsed);

      // Validate
      if (patchedStream.length === 0) {
        console.error('[PDF Processor] ERROR: Patched stream is empty! Skipping update.');
        return {
          totalCount: 0,
          totalMatches: totalPageMatches,
          countsByMapping,
          matchesByMapping,
          characterIssues: pageCharacterIssues
        };
      }

      console.log(
        `[PDF Processor] Patched stream: ${patchedStream.length} bytes (original: ${streamBytes.length} bytes)`
      );

      // Update page content stream
      await updatePageContentStream(page, contentStream, patchedStream);

      console.log('[PDF Processor] Successfully updated page content stream (surgical patch)');
    } catch (error) {
      console.error('[PDF Processor] Failed to patch content stream:', error);
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
 * Get content stream bytes from content stream reference
 * IMPORTANT: Properly decodes streams with filters (FlateDecode, etc.)
 */
async function getContentStreamBytes(
  contentStream: unknown,
  page: PDFPage
): Promise<Uint8Array | null> {
  try {
    // Content stream can be a single stream or an array of streams
    if (contentStream instanceof PDFStream) {
      return await decodeStream(contentStream);
    }

    if (contentStream instanceof PDFArray) {
      // Multiple content streams - concatenate them
      const streams = contentStream.asArray();
      const allBytes: number[] = [];

      for (const streamRef of streams) {
        if (streamRef instanceof PDFStream) {
          const bytes = await decodeStream(streamRef);
          if (bytes) {
            allBytes.push(...Array.from(bytes));
          }
        }
      }

      return new Uint8Array(allBytes);
    }

    // Try to get from page node directly
    const pageDict = page.node;
    const contents = pageDict.get(pageDict.context.obj('Contents'));

    if (contents instanceof PDFStream) {
      return await decodeStream(contents);
    }

    return null;
  } catch (error) {
    console.warn('[PDF Processor] Error getting content stream bytes:', error);
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
 * Update page content stream with new bytes
 */
async function updatePageContentStream(
  page: PDFPage,
  originalStream: unknown,
  newBytes: Uint8Array
): Promise<void> {
  try {
    const context = page.doc.context;

    console.log(`[PDF Processor] Updating content stream with ${newBytes.length} bytes`);
    console.log(`[PDF Processor] Original stream type: ${originalStream?.constructor.name}`);

    // IMPORTANT: We need to properly create and register the stream
    // pdf-lib's context.stream() creates a raw stream that needs to be registered

    // Method 1: If original was a single stream, try to modify it in place
    if (originalStream instanceof PDFStream) {
      try {
        // Replace the stream contents directly
        const streamDict = (originalStream as any).dict;

        // Remove Filter and DecodeParms if they exist (we're writing uncompressed)
        if (streamDict) {
          streamDict.delete(context.obj('Filter'));
          streamDict.delete(context.obj('DecodeParms'));
        }

        // Update the stream contents
        (originalStream as any).contents = newBytes;

        // Update Length
        if (streamDict) {
          streamDict.set(context.obj('Length'), context.obj(newBytes.length));
        }

        console.log('[PDF Processor] Updated stream in place');
        return;
      } catch (inPlaceError) {
        console.warn(
          '[PDF Processor] Failed to update in place, will create new stream:',
          inPlaceError
        );
      }
    }

    // Method 2: Create a new stream and replace the Contents entry
    // This is safer but may break some PDF structures
    const newStream = context.stream(newBytes, {
      // Don't add filters - write uncompressed for now
    });

    // Register the stream in the context
    const streamRef = context.register(newStream);

    // Update page's Contents entry with the new stream reference
    const contentsKey = context.obj('Contents');
    page.node.set(contentsKey, streamRef);

    console.log('[PDF Processor] Created new stream and updated page reference');
  } catch (error) {
    console.error('[PDF Processor] Error updating content stream:', error);
    throw error;
  }
}
