// Shared types used across main and renderer processes

export interface SpreadsheetData {
  fileName: string;
  sheets: string[];
  selectedSheets: string[];
  columns: Record<string, string[]>;
  data: Record<string, string[]>;
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
}

export interface ProcessResult {
  success: boolean;
  outputPath?: string;
  stats?: ReplacementStats[];
  error?: string;
}

export interface AppSettings {
  lastSpreadsheetPath?: string;
  lastPDFPath?: string;
  lastOutputPath?: string;
  language: 'en' | 'de';
}
