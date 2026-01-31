import { IPC_CHANNELS } from '@shared/constants';
import type { AppSettings, ElectronEnvironment, SheetMapping } from '@shared/types';
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  env: {
    LOCALE: process.env.LOCALE as string | undefined
  },

  selectSpreadsheet: () => ipcRenderer.invoke(IPC_CHANNELS.SELECT_SPREADSHEET),
  selectPDF: () => ipcRenderer.invoke(IPC_CHANNELS.SELECT_PDF),
  selectOutput: () => ipcRenderer.invoke(IPC_CHANNELS.SELECT_OUTPUT),

  readSpreadsheet: (filePath: string, selectedSheets?: string[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.READ_SPREADSHEET, filePath, selectedSheets),

  processPDF: (
    pdfPath: string,
    spreadsheetPath: string,
    mappings: SheetMapping[],
    outputPath: string
  ) => ipcRenderer.invoke(IPC_CHANNELS.PROCESS_PDF, pdfPath, spreadsheetPath, mappings, outputPath),

  onProcessProgress: (callback: (progress: number, message: string) => void) => {
    ipcRenderer.on(IPC_CHANNELS.PROCESS_PROGRESS, (_event, progress, message) =>
      callback(progress, message)
    );
  },

  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.GET_SETTINGS),
  setSettings: (settings: Partial<AppSettings>) =>
    ipcRenderer.invoke(IPC_CHANNELS.SET_SETTINGS, settings),

  checkForUpdates: () => ipcRenderer.invoke(IPC_CHANNELS.CHECK_FOR_UPDATES),
  downloadUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.DOWNLOAD_UPDATE),
  installUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.INSTALL_UPDATE),

  onUpdateAvailable: (callback: (info: any) => void) => {
    ipcRenderer.on(IPC_CHANNELS.UPDATE_AVAILABLE, (_event, info) => callback(info));
  },
  onUpdateNotAvailable: (callback: (info: any) => void) => {
    ipcRenderer.on(IPC_CHANNELS.UPDATE_NOT_AVAILABLE, (_event, info) => callback(info));
  },
  onUpdateError: (callback: (error: string) => void) => {
    ipcRenderer.on(IPC_CHANNELS.UPDATE_ERROR, (_event, error) => callback(error));
  },
  onUpdateDownloadProgress: (callback: (progress: any) => void) => {
    ipcRenderer.on(IPC_CHANNELS.UPDATE_DOWNLOAD_PROGRESS, (_event, progress) => callback(progress));
  },
  onUpdateDownloaded: (callback: (info: any) => void) => {
    ipcRenderer.on(IPC_CHANNELS.UPDATE_DOWNLOADED, (_event, info) => callback(info));
  },

  removeUpdateListeners: () => {
    ipcRenderer.removeAllListeners(IPC_CHANNELS.UPDATE_AVAILABLE);
    ipcRenderer.removeAllListeners(IPC_CHANNELS.UPDATE_NOT_AVAILABLE);
    ipcRenderer.removeAllListeners(IPC_CHANNELS.UPDATE_ERROR);
    ipcRenderer.removeAllListeners(IPC_CHANNELS.UPDATE_DOWNLOAD_PROGRESS);
    ipcRenderer.removeAllListeners(IPC_CHANNELS.UPDATE_DOWNLOADED);
  }
} as ElectronEnvironment);
