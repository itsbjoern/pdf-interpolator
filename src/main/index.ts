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
import log from 'electron-log';
import Store from 'electron-store';
import { autoUpdater } from 'electron-updater';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Configure electron-updater logging
autoUpdater.logger = log;
if (autoUpdater.logger) {
  (autoUpdater.logger as typeof log).transports.file.level = 'info';
}

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
  const icon = is.dev ? join(__dirname, '../../build/icon.png') : undefined; // electron-builder handles production icons

  mainWindow = new BrowserWindow({
    width: 860,
    height: 600,
    minWidth: 800,
    minHeight: 600,
    title: 'PDF Interpolator',
    icon: icon,
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

// Auto-updater setup
function setupAutoUpdater(window: BrowserWindow) {
  // Configure auto-updater
  autoUpdater.autoDownload = false; // Manual download after user confirmation
  autoUpdater.autoInstallOnAppQuit = true;

  // Update available
  autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info);
    window.webContents.send(IPC_CHANNELS.UPDATE_AVAILABLE, info);
  });

  // Update not available
  autoUpdater.on('update-not-available', (info) => {
    log.info('Update not available:', info);
    window.webContents.send(IPC_CHANNELS.UPDATE_NOT_AVAILABLE, info);
  });

  // Update error
  autoUpdater.on('error', (err) => {
    log.error('Update error:', err);
    window.webContents.send(IPC_CHANNELS.UPDATE_ERROR, err.message);
  });

  // Download progress
  autoUpdater.on('download-progress', (progressObj) => {
    window.webContents.send(IPC_CHANNELS.UPDATE_DOWNLOAD_PROGRESS, progressObj);
  });

  // Update downloaded
  autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded:', info);
    window.webContents.send(IPC_CHANNELS.UPDATE_DOWNLOADED, info);
  });
}

// App lifecycle
app.whenReady().then(() => {
  createWindow();
  setupIpcHandlers();

  // Initialize auto-updater
  if (mainWindow) {
    mainWindow.webContents.on('did-finish-load', () => {
      if (mainWindow) {
        setupAutoUpdater(mainWindow);
      }
    });

    // Check for updates on app start (after 3 seconds delay)
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((err) => {
        log.error('Failed to check for updates:', err);
      });
    }, 3000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  app.quit();
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
        // Read locale from env variable (for development/testing) or electron-store
        const locale =
          (process.env.LOCALE as 'en' | 'de') || (store.get('language', 'en') as 'en' | 'de');
        // Pass locale to readSpreadsheet
        return readSpreadsheet(filePath, selectedSheets, locale);
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

  // Auto-update handlers
  ipcMain.handle(IPC_CHANNELS.CHECK_FOR_UPDATES, async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      return {
        updateInfo: result?.updateInfo,
        available: result?.updateInfo?.version !== app.getVersion()
      };
    } catch (error) {
      log.error('Error checking for updates:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.DOWNLOAD_UPDATE, async () => {
    try {
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (error) {
      log.error('Error downloading update:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.INSTALL_UPDATE, async () => {
    autoUpdater.quitAndInstall(false, true);
  });
}
