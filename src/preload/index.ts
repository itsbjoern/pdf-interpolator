import { contextBridge, ipcRenderer } from 'electron';

import { IPC_CHANNELS } from '@shared/constants';
import { AppSettings, SheetMapping } from '@shared/types';

console.log('[Preload] Script executing...');
console.log('[Preload] contextBridge available:', !!contextBridge);
console.log('[Preload] IPC_CHANNELS:', IPC_CHANNELS);

// Expose protected methods to renderer process
contextBridge.exposeInMainWorld('electron', {
  // File selection
  selectSpreadsheet: () => ipcRenderer.invoke(IPC_CHANNELS.SELECT_SPREADSHEET),
  selectPDF: () => ipcRenderer.invoke(IPC_CHANNELS.SELECT_PDF),
  selectOutput: () => ipcRenderer.invoke(IPC_CHANNELS.SELECT_OUTPUT),

  // Spreadsheet operations
  readSpreadsheet: (filePath: string, selectedSheets?: string[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.READ_SPREADSHEET, filePath, selectedSheets),

  // PDF processing
  processPDF: (
    pdfPath: string,
    spreadsheetPath: string,
    mappings: SheetMapping[],
    outputPath: string
  ) => ipcRenderer.invoke(IPC_CHANNELS.PROCESS_PDF, pdfPath, spreadsheetPath, mappings, outputPath),

  // Progress updates
  onProcessProgress: (callback: (progress: number, message: string) => void) => {
    ipcRenderer.on(IPC_CHANNELS.PROCESS_PROGRESS, (_event, progress, message) =>
      callback(progress, message)
    );
  },

  // Settings
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.GET_SETTINGS),
  setSettings: (settings: Partial<AppSettings>) =>
    ipcRenderer.invoke(IPC_CHANNELS.SET_SETTINGS, settings),

  // App
  getAppVersion: () => ipcRenderer.invoke(IPC_CHANNELS.GET_APP_VERSION),
  checkForUpdates: () => ipcRenderer.invoke(IPC_CHANNELS.CHECK_FOR_UPDATES)
});

console.log('[Preload] window.electron exposed successfully');

// Type definitions for TypeScript
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
        mappings: SheetMapping[],
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
