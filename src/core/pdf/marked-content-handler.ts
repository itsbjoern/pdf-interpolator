/**
 * Marked Content Handler
 *
 * Removes all BDC and EMC operator lines from the entire content stream.
 * This simplifies the content stream and avoids marked-content/ActualText sync issues.
 */

import type { ParsedContentStream } from './types';

/**
 * Statistics about marked content processing
 */
export interface MarkedContentStats {
  removed: number;
}

/**
 * Remove all BDC and EMC operations from the entire stream (allOperations).
 * Each removed operation is marked via globalOperationReplacements (empty array = delete).
 * Applies to every operation in the stream, not only those inside text blocks.
 *
 * @param parsed - Parsed content stream
 * @returns Statistics about marked content processing
 */
export function processMarkedContent(parsed: ParsedContentStream): MarkedContentStats {
  let removed = 0;

  for (let i = 0; i < parsed.allOperations.length; i++) {
    const op = parsed.allOperations[i];
    if (op.operator === 'BDC' || op.operator === 'EMC') {
      if (!parsed.globalOperationReplacements) {
        parsed.globalOperationReplacements = new Map();
      }
      parsed.globalOperationReplacements.set(i, []);
      removed++;
    }
  }

  return { removed };
}
