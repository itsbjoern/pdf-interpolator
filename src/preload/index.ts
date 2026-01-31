import { contextBridge, ipcRenderer } from 'electron';

import { IPC_CHANNELS } from '@shared/constants';
import { AppSettings, SheetMapping } from '@shared/types';

console.log('[Preload] Script executing...');
console.log('[Preload] contextBridge available:', !!contextBridge);
console.log('[Preload] IPC_CHANNELS:', IPC_CHANNELS);

// Expose protected methods to renderer process
contextBridge.exposeInMainWorld('electron', {
  // Environment variables
  env: {
    LOCALE: process.env.LOCALE as 'en' | 'de' | undefined
  },

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

  // Updates
  checkForUpdates: () => ipcRenderer.invoke(IPC_CHANNELS.CHECK_FOR_UPDATES),
  downloadUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.DOWNLOAD_UPDATE),
  installUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.INSTALL_UPDATE),

  // Update event listeners
  onUpdateAvailable: (callback: (info: any) => void) => {
    ipcRenderer.on('update-available', (_event, info) => callback(info));
  },
  onUpdateNotAvailable: (callback: (info: any) => void) => {
    ipcRenderer.on('update-not-available', (_event, info) => callback(info));
  },
  onUpdateError: (callback: (error: string) => void) => {
    ipcRenderer.on('update-error', (_event, error) => callback(error));
  },
  onUpdateDownloadProgress: (callback: (progress: any) => void) => {
    ipcRenderer.on('update-download-progress', (_event, progress) => callback(progress));
  },
  onUpdateDownloaded: (callback: (info: any) => void) => {
    ipcRenderer.on('update-downloaded', (_event, info) => callback(info));
  },

  // Cleanup
  removeUpdateListeners: () => {
    ipcRenderer.removeAllListeners('update-available');
    ipcRenderer.removeAllListeners('update-not-available');
    ipcRenderer.removeAllListeners('update-error');
    ipcRenderer.removeAllListeners('update-download-progress');
    ipcRenderer.removeAllListeners('update-downloaded');
  }
});

console.log('[Preload] window.electron exposed successfully');

// Type definitions for TypeScript
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
        mappings: SheetMapping[],
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
