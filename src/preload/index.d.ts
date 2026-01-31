import { AppSettings, ColumnMapping } from '@shared/types';

declare global {
  interface Window {
    electron: {
      env: {
        LOCALE?: 'en' | 'de';
      };
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

      // Updates
      checkForUpdates: () => Promise<{ updateInfo: any; available: boolean }>;
      downloadUpdate: () => Promise<{ success: boolean }>;
      installUpdate: () => Promise<void>;
      onUpdateAvailable: (callback: (info: any) => void) => void;
      onUpdateNotAvailable: (callback: (info: any) => void) => void;
      onUpdateError: (callback: (error: string) => void) => void;
      onUpdateDownloadProgress: (callback: (progress: any) => void) => void;
      onUpdateDownloaded: (callback: (info: any) => void) => void;
      removeUpdateListeners: () => void;
    };
  }
}
