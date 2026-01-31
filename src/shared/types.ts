import type { ProgressInfo, UpdateDownloadedEvent, UpdateInfo } from 'electron-updater';

export interface ElectronEnvironment {
  env: {
    LOCALE?: 'en' | 'de';
  };
  selectSpreadsheet: () => Promise<string | null>;
  selectPDF: () => Promise<string | null>;
  selectOutput: () => Promise<string | null>;
  readSpreadsheet: (filePath: string, selectedSheets?: string[]) => Promise<SpreadsheetData>;
  processPDF: (
    pdfPath: string,
    spreadsheetPath: string,
    mappings: SheetMapping[],
    outputPath: string
  ) => Promise<ProcessResult>;
  onProcessProgress: (callback: (progress: number, message: string) => void) => void;
  getSettings: () => Promise<AppSettings>;
  setSettings: (settings: Partial<AppSettings>) => Promise<AppSettings>;
  checkForUpdates: () => Promise<{
    updateInfo: UpdateInfo;
    available: boolean;
  }>;
  downloadUpdate: () => Promise<{ success: boolean }>;
  installUpdate: () => Promise<void>;
  onUpdateAvailable: (callback: (info: UpdateInfo) => void) => void;
  onUpdateNotAvailable: (callback: (info: UpdateInfo) => void) => void;
  onUpdateError: (callback: (error: string) => void) => void;
  onUpdateDownloadProgress: (callback: (progress: ProgressInfo) => void) => void;
  onUpdateDownloaded: (callback: (info: UpdateDownloadedEvent) => void) => void;
  removeUpdateListeners: () => void;
}

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
}
