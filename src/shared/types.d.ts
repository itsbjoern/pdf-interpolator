export interface SpreadsheetData {
  fileName: string;
  sheets: string[];
  selectedSheet: string;
  columns: string[];
  data: Record<string, string[]>;
}
export interface ColumnMapping {
  id: string;
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
