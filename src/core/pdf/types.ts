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
