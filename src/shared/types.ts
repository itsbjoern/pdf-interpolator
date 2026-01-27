// Shared types used across main and renderer processes

export interface SpreadsheetData {
  fileName: string;
  sheets: string[];
  selectedSheets: string[];
  columns: Record<string, string[]>;
  data: Record<string, Record<string, string[]>>;
}

export interface SheetMapping {
  sheetName: string;
  sourceColumn: string;
  targetColumn: string;
}

export interface PDFInfo {
  fileName: string;
  filePath: string;
  pageCount: number;
}

export interface ReplacementStats {
  mappingId: string;
  sourceColumn: string;
  targetColumn: string;
  replacementCount: number;
  matchCount: number; // Total matches found (attempted)
  failedCount: number; // Matches that failed to replace
}

export interface CharacterIssue {
  character: string;
  strings: string[]; // List of strings that couldn't be encoded due to this character
}

export interface ProcessingWarning {
  pageNumber: number;
  characterIssues: CharacterIssue[];
}

export interface ProcessResult {
  success: boolean;
  outputPath?: string;
  stats?: ReplacementStats[];
  warnings?: ProcessingWarning[];
  totalMatches?: number;
  totalReplacements?: number;
  error?: string;
}

export interface AppSettings {
  lastSpreadsheetPath?: string;
  lastPDFPath?: string;
  lastOutputPath?: string;
  language: 'en' | 'de';
}
