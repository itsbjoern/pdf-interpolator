import { AppSettings, ColumnMapping } from '@shared/types';
declare global {
  interface Window {
    electron: {
      selectSpreadsheet: () => Promise<string | null>;
      selectPDF: () => Promise<string | null>;
      selectOutput: () => Promise<string | null>;
      readSpreadsheet: (filePath: string, selectedSheets?: string[]) => Promise<any>;
      processPDF: (
        pdfPath: string,
        spreadsheetPath: string,
        mappings: ColumnMapping[],
        outputPath: string
      ) => Promise<any>;
      onProcessProgress: (callback: (progress: number, message: string) => void) => void;
      getSettings: () => Promise<AppSettings>;
      setSettings: (settings: Partial<AppSettings>) => Promise<AppSettings>;
      getAppVersion: () => Promise<string>;
      checkForUpdates: () => Promise<void>;
    };
  }
}
