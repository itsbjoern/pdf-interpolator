import type { PDFInfo, SheetMapping, SpreadsheetData } from '@shared/types';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AppState {
  spreadsheetPath: string | null;
  spreadsheetData: SpreadsheetData | null;
  setSpreadsheetPath: (path: string | null) => void;
  setSpreadsheetData: (data: SpreadsheetData | null) => void;

  sheetMappings: Record<string, SheetMapping>;
  updateSheetMapping: (
    sheetName: string,
    updates: Partial<Omit<SheetMapping, 'sheetName'>>
  ) => void;

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
      spreadsheetPath: null,
      spreadsheetData: null,
      setSpreadsheetPath: (path) => set({ spreadsheetPath: path }),
      setSpreadsheetData: (data) => {
        set({ spreadsheetData: data });
        if (data) {
          set((state) => {
            const newMappings: Record<string, SheetMapping> = {};
            data.selectedSheets.forEach((sheetName) => {
              if (state.sheetMappings[sheetName]) {
                newMappings[sheetName] = state.sheetMappings[sheetName];
              } else {
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

      pdfPath: null,
      pdfInfo: null,
      setPdfPath: (path) => set({ pdfPath: path }),
      setPdfInfo: (info) => set({ pdfInfo: info }),

      outputPath: null,
      setOutputPath: (path) => set({ outputPath: path }),

      isProcessing: false,
      progress: 0,
      progressMessage: '',
      setProcessing: (isProcessing) => set({ isProcessing }),
      setProgress: (progress, message) => set({ progress, progressMessage: message }),

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
