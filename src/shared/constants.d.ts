export declare const IPC_CHANNELS: {
  readonly SELECT_SPREADSHEET: 'select-spreadsheet';
  readonly READ_SPREADSHEET: 'read-spreadsheet';
  readonly SELECT_PDF: 'select-pdf';
  readonly SELECT_OUTPUT: 'select-output';
  readonly PROCESS_PDF: 'process-pdf';
  readonly PROCESS_PROGRESS: 'process-progress';
  readonly GET_SETTINGS: 'get-settings';
  readonly SET_SETTINGS: 'set-settings';
  readonly GET_APP_VERSION: 'get-app-version';
  readonly CHECK_FOR_UPDATES: 'check-for-updates';
};
export declare const SUPPORTED_SPREADSHEET_EXTENSIONS: readonly [
  {
    readonly name: 'Excel Files';
    readonly extensions: readonly ['xlsx', 'xls'];
  },
  {
    readonly name: 'CSV Files';
    readonly extensions: readonly ['csv'];
  }
];
export declare const SUPPORTED_PDF_EXTENSIONS: readonly [
  {
    readonly name: 'PDF Files';
    readonly extensions: readonly ['pdf'];
  }
];
