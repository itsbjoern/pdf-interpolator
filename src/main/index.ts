import { processPDF } from '@core/pdf';
import { readSpreadsheet } from '@core/spreadsheet/reader';
import { is } from '@electron-toolkit/utils';
import {
  IPC_CHANNELS,
  SUPPORTED_PDF_EXTENSIONS,
  SUPPORTED_SPREADSHEET_EXTENSIONS
} from '@shared/constants';
import type { AppSettings } from '@shared/types';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import Store from 'electron-store';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ESM compatibility for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize electron-store for persistent settings
const store = new Store<AppSettings>({
  defaults: {
    language: 'en'
  }
});

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
  });

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

// App lifecycle
app.whenReady().then(() => {
  createWindow();
  setupIpcHandlers();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers
function setupIpcHandlers() {
  // File selection
  ipcMain.handle(IPC_CHANNELS.SELECT_SPREADSHEET, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: SUPPORTED_SPREADSHEET_EXTENSIONS
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const filePath = result.filePaths[0];
      store.set('lastSpreadsheetPath', filePath);
      return filePath;
    }
    return null;
  });

  ipcMain.handle(IPC_CHANNELS.SELECT_PDF, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: SUPPORTED_PDF_EXTENSIONS
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const filePath = result.filePaths[0];
      store.set('lastPDFPath', filePath);
      return filePath;
    }
    return null;
  });

  ipcMain.handle(IPC_CHANNELS.SELECT_OUTPUT, async () => {
    const result = await dialog.showSaveDialog({
      filters: SUPPORTED_PDF_EXTENSIONS,
      defaultPath: 'output.pdf'
    });

    if (!result.canceled && result.filePath) {
      store.set('lastOutputPath', result.filePath);
      return result.filePath;
    }
    return null;
  });

  // Spreadsheet operations
  ipcMain.handle(
    IPC_CHANNELS.READ_SPREADSHEET,
    async (_event, filePath: string, selectedSheets?: string[]) => {
      try {
        return readSpreadsheet(filePath, selectedSheets);
      } catch (error) {
        throw new Error(error instanceof Error ? error.message : String(error));
      }
    }
  );

  // PDF processing
  ipcMain.handle(
    IPC_CHANNELS.PROCESS_PDF,
    async (
      event,
      pdfPath: string,
      spreadsheetPath: string,
      mappings: any[],
      outputPath: string
    ) => {
      try {
        // Progress callback to send updates to renderer
        const onProgress = (progress: number, message: string) => {
          event.sender.send(IPC_CHANNELS.PROCESS_PROGRESS, progress, message);
        };

        // Call PDF processor
        const result = await processPDF(pdfPath, spreadsheetPath, mappings, outputPath, onProgress);

        return result;
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }
  );

  // Settings
  ipcMain.handle(IPC_CHANNELS.GET_SETTINGS, () => {
    return store.store;
  });

  ipcMain.handle(IPC_CHANNELS.SET_SETTINGS, (_event, settings: Partial<AppSettings>) => {
    Object.entries(settings).forEach(([key, value]) => {
      store.set(key as keyof AppSettings, value);
    });
    return store.store;
  });

  // App version
  ipcMain.handle(IPC_CHANNELS.GET_APP_VERSION, () => {
    return app.getVersion();
  });
}
