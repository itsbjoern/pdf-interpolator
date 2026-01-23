import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { SpreadsheetData, SheetMapping, PDFInfo } from '@shared/types';

interface AppState {
  // Spreadsheet state
  spreadsheetPath: string | null;
  spreadsheetData: SpreadsheetData | null;
  setSpreadsheetPath: (path: string | null) => void;
  setSpreadsheetData: (data: SpreadsheetData | null) => void;

  // Mapping state - one mapping per sheet
  sheetMappings: Record<string, SheetMapping>;
  updateSheetMapping: (sheetName: string, updates: Partial<Omit<SheetMapping, 'sheetName'>>) => void;

  // PDF state
  pdfPath: string | null;
  pdfInfo: PDFInfo | null;
  setPdfPath: (path: string | null) => void;
  setPdfInfo: (info: PDFInfo | null) => void;

  // Output state
  outputPath: string | null;
  setOutputPath: (path: string | null) => void;

  // Processing state
  isProcessing: boolean;
  progress: number;
  progressMessage: string;
  setProcessing: (isProcessing: boolean) => void;
  setProgress: (progress: number, message: string) => void;

  // Reset
  reset: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // Spreadsheet state
      spreadsheetPath: null,
      spreadsheetData: null,
      setSpreadsheetPath: (path) => set({ spreadsheetPath: path }),
      setSpreadsheetData: (data) => {
        set({ spreadsheetData: data });
        // Initialize mappings for new sheets
        if (data) {
          set((state) => {
            const newMappings: Record<string, SheetMapping> = {};
            data.selectedSheets.forEach((sheetName) => {
              if (state.sheetMappings[sheetName]) {
                // Keep existing mapping
                newMappings[sheetName] = state.sheetMappings[sheetName];
              } else {
                // Create new empty mapping
                newMappings[sheetName] = {
                  sheetName,
                  sourceColumn: '',
                  targetColumn: ''
                };
              }
            });
            return { sheetMappings: newMappings };
          });
        }
      },

      // Mapping state - one mapping per sheet
      sheetMappings: {},
      updateSheetMapping: (sheetName, updates) =>
        set((state) => ({
          sheetMappings: {
            ...state.sheetMappings,
            [sheetName]: {
              ...state.sheetMappings[sheetName],
              sheetName,
              ...updates
            }
          }
        })),

      // PDF state
      pdfPath: null,
      pdfInfo: null,
      setPdfPath: (path) => set({ pdfPath: path }),
      setPdfInfo: (info) => set({ pdfInfo: info }),

      // Output state
      outputPath: null,
      setOutputPath: (path) => set({ outputPath: path }),

      // Processing state
      isProcessing: false,
      progress: 0,
      progressMessage: '',
      setProcessing: (isProcessing) => set({ isProcessing }),
      setProgress: (progress, message) => set({ progress, progressMessage: message }),

      // Reset
      reset: () =>
        set({
          spreadsheetPath: null,
          spreadsheetData: null,
          sheetMappings: {},
          pdfPath: null,
          pdfInfo: null,
          outputPath: null,
          isProcessing: false,
          progress: 0,
          progressMessage: ''
        })
    }),
    {
      name: 'pdf-spreadsheet-rewriter-storage',
      partialize: (state) => ({
        spreadsheetPath: state.spreadsheetPath,
        spreadsheetData: state.spreadsheetData,
        sheetMappings: state.sheetMappings,
        pdfPath: state.pdfPath,
        pdfInfo: state.pdfInfo,
        outputPath: state.outputPath
        // Exclude processing state (isProcessing, progress, progressMessage)
      })
    }
  )
);
