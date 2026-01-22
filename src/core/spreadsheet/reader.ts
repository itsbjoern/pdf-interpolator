import * as XLSX from 'xlsx';
import { readFileSync } from 'fs';
import { SpreadsheetData } from '@shared/types';

export function readSpreadsheet(filePath: string, selectedSheets?: string[]): SpreadsheetData {
  try {
    // Read the file
    const buffer = readFileSync(filePath);
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    // Get sheet names
    const sheets = workbook.SheetNames;
    if (sheets.length === 0) {
      throw new Error('No sheets found in spreadsheet');
    }

    // Default to all sheets if none specified
    const sheetsToRead = selectedSheets && selectedSheets.length > 0 ? selectedSheets : sheets;

    // Combine data from all selected sheets
    const allColumns: Record<string, string[]> = {};
    const combinedData: Record<string, string[]> = {};

    sheetsToRead.forEach((sheetName) => {
      if (!sheets.includes(sheetName)) {
        throw new Error(`Sheet "${sheetName}" not found`);
      }

      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][];

      if (jsonData.length === 0) {
        return; // Skip empty sheets
      }

      // First row is assumed to be headers
      const headers = (jsonData[0] as string[]).filter((h) => h !== undefined && h !== '');

      const columns = new Set<string>();

      headers.forEach((header, colIndex) => {
        // Add sheet name prefix if column exists in multiple sheets
        const columnKey = columns.has(header) ? `${header} (${sheetName})` : header;
        columns.add(header);

        combinedData[columnKey] = [];
        for (let rowIndex = 1; rowIndex < jsonData.length; rowIndex++) {
          const row = jsonData[rowIndex] as unknown[];
          const value = row[colIndex];
          combinedData[columnKey].push(value !== undefined && value !== null ? String(value) : '');
        }
      });
      allColumns[sheetName] = Array.from(columns);
    });

    return {
      fileName: filePath.split('/').pop() || filePath.split('\\').pop() || filePath,
      sheets,
      selectedSheets: sheetsToRead,
      columns: allColumns,
      data: combinedData
    };
  } catch (error) {
    throw new Error(
      `Failed to read spreadsheet: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export function readSpreadsheetSheets(filePath: string, sheetNames: string[]): SpreadsheetData {
  return readSpreadsheet(filePath, sheetNames);
}
