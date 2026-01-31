export const IPC_CHANNELS = {
  // File operations
  SELECT_SPREADSHEET: 'select-spreadsheet',
  READ_SPREADSHEET: 'read-spreadsheet',
  SELECT_PDF: 'select-pdf',
  SELECT_OUTPUT: 'select-output',

  // Processing
  PROCESS_PDF: 'process-pdf',
  PROCESS_PROGRESS: 'process-progress',

  // Settings
  GET_SETTINGS: 'get-settings',
  SET_SETTINGS: 'set-settings',

  // App
  GET_APP_VERSION: 'get-app-version',

  // Updates
  CHECK_FOR_UPDATES: 'check-for-updates',
  DOWNLOAD_UPDATE: 'download-update',
  INSTALL_UPDATE: 'install-update',
  UPDATE_AVAILABLE: 'update-available',
  UPDATE_NOT_AVAILABLE: 'update-not-available',
  UPDATE_ERROR: 'update-error',
  UPDATE_DOWNLOAD_PROGRESS: 'update-download-progress',
  UPDATE_DOWNLOADED: 'update-downloaded'
} as const;

export const SUPPORTED_SPREADSHEET_EXTENSIONS = [
  { name: 'Spreadsheet Files', extensions: ['xlsx', 'xls', 'csv'] }
];

export const SUPPORTED_PDF_EXTENSIONS = [{ name: 'PDF Files', extensions: ['pdf'] }];

export const CHAR_BYTES = {
  SPACE: 0x20,
  CARRIAGE_RETURN: 0x0d,
  LINE_FEED: 0x0a,
  OPEN_BRACKET: 0x5b,
  CLOSE_BRACKET: 0x5d,
  LESS_THAN: 0x3c,
  GREATER_THAN: 0x3e
} as const;
