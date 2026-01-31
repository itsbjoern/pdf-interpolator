import * as XLSX from 'xlsx';
import { readFileSync } from 'fs';
import { SpreadsheetData } from '@shared/types';
import { formatNumberForLocale } from './number-formatter';

export function readSpreadsheet(
  filePath: string,
  selectedSheets?: string[],
  locale: 'en' | 'de' = 'en'
): SpreadsheetData {
  try {
    // Read the file
    const buffer = readFileSync(filePath);
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    // Get sheet names
    const sheets = workbook.SheetNames;
    if (sheets.length === 0) {
      throw new Error('No sheets found in spreadsheet');
    }

    // Determine which sheets to read
    const sheetsToRead = sheets.length === 1 ? sheets : selectedSheets || [];

    // Combine data from all selected sheets
    const allColumns: Record<string, string[]> = {};
    const combinedData: Record<string, Record<string, string[]>> = {};

    sheetsToRead.forEach((sheetName) => {
      if (!sheets.includes(sheetName)) {
        throw new Error(`Sheet "${sheetName}" not found`);
      }

      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        raw: false
      }) as unknown[][];

      if (jsonData.length === 0) {
        return; // Skip empty sheets
      }

      // First row is assumed to be headers
      const headers = jsonData[0] as string[];

      const columns = new Set<string>();
      const data: Record<string, string[]> = {};

      headers.forEach((header, colIndex) => {
        if (!header) {
          return; // Skip empty headers
        }

        // Add sheet name prefix if column exists in multiple sheets
        columns.add(header);

        data[header] = [];
        for (let rowIndex = 1; rowIndex < jsonData.length; rowIndex++) {
          const row = jsonData[rowIndex] as unknown[];
          const value = row[colIndex];
          if (value === undefined || value === null) {
            data[header].push('');
          } else {
            // XLSX with raw:false returns formatted strings
            const stringValue = String(value);
            // Convert English number format to locale-specific format
            const formattedValue = formatNumberForLocale(stringValue, locale);
            data[header].push(formattedValue);
          }
        }
      });
      allColumns[sheetName] = Array.from(columns);
      combinedData[sheetName] = data;
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

export function readSpreadsheetSheets(
  filePath: string,
  sheetNames: string[],
  locale: 'en' | 'de' = 'en'
): SpreadsheetData {
  return readSpreadsheet(filePath, sheetNames, locale);
}
