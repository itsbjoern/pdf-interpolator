// PDF-specific types for text replacement engine

/**
 * Represents a PDF value (operand)
 */
export type PDFValue = string | number | Uint8Array | PDFValue[] | PDFDict;

/**
 * PDF dictionary
 */
export interface PDFDict {
  [key: string]: PDFValue;
}

/**
 * Represents a single PDF operation (operator with operands)
 */
export interface PDFOperation {
  operator: string;
  operands: PDFValue[];
  startIndex: number;
  endIndex: number;
}

/**
 * Font encoding type
 */
export type FontEncoding = 'WinAnsiEncoding' | 'MacRomanEncoding' | 'Identity-H' | 'StandardEncoding' | 'Custom';

/**
 * Font information including encoding
 */
export interface FontInfo {
  name: string;
  baseFont: string;
  encoding: FontEncoding;
  encodingMap: Map<number, string>; // character code -> Unicode string
  reverseMap: Map<string, number>; // Unicode string -> character code
  toUnicodeCMap?: string;
}

/**
 * Text element with decoded text and operation reference
 */
export interface TextElement {
  text: string;
  operation: PDFOperation;
  font: FontInfo;
  operandIndex?: number; // For TJ arrays, which operand this text came from
}

/**
 * Replacement mapping entry
 */
export interface ReplacementEntry {
  source: string; // Text to find in PDF (from targetColumn)
  target: string; // Text to replace with (from sourceColumn)
}

/**
 * Progress callback type
 */
export type ProgressCallback = (progress: number, message: string) => void;

/**
 * Phase for progress reporting
 */
export type ProgressPhase = 'LOAD_PDF' | 'LOAD_SPREADSHEET' | 'PROCESS_PAGES' | 'SAVE_PDF';

/**
 * Encoded text segment with font information
 */
export interface EncodedSegment {
  bytes: Uint8Array;  // Encoded bytes
  font: FontInfo;     // Font used for this segment
}

/**
 * Result of encoding text with cross-font fallback
 */
export interface EncodedText {
  segments: EncodedSegment[];  // May have multiple segments if fonts switched
  success: boolean;            // Whether encoding succeeded
}

/**
 * Represents a BT/ET text block with its position in original stream
 * This enables surgical replacement - only modified blocks are rebuilt
 */
export interface TextBlock {
  btIndex: number;           // Index of BT operation in operations array
  etIndex: number;           // Index of ET operation in operations array
  startBytePos: number;      // Start position in original stream bytes
  endBytePos: number;        // End position in original stream bytes
  operations: PDFOperation[]; // Operations within this block (BT...ET)
  fonts: Map<string, FontInfo>; // Fonts used in this block
  textElements: TextElement[]; // Decoded text in this block
  modified: boolean;         // Has this block been modified?
  currentFontSize: number;   // Track font size for Tf operator injection
  operationReplacements?: Map<number, PDFOperation[]>; // Index → replacement operations
}

/**
 * Content stream with surgical edit capability
 * Preserves original bytes and tracks text blocks for minimal modifications
 */
export interface ParsedContentStream {
  originalBytes: Uint8Array;  // Original stream bytes (PRESERVED)
  allOperations: PDFOperation[]; // All operations (including graphics)
  textBlocks: TextBlock[];    // Only the BT/ET blocks
}
