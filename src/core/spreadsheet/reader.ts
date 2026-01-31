import { readFileSync } from 'node:fs';
import type { SpreadsheetData } from '@shared/types';
import * as XLSX from 'xlsx';
import { formatNumberForLocale } from './number-formatter';

export function readSpreadsheet(
  filePath: string,
  selectedSheets?: string[],
  locale: string = 'en'
): SpreadsheetData {
  try {
    const buffer = readFileSync(filePath);
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    const sheets = workbook.SheetNames;
    if (sheets.length === 0) {
      throw new Error('No sheets found in spreadsheet');
    }

    const sheetsToRead = sheets.length === 1 ? sheets : selectedSheets || [];

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

      if (jsonData.length === 0) return;

      const headers = jsonData[0] as string[];

      const columns = new Set<string>();
      const data: Record<string, string[]> = {};

      headers.forEach((header, colIndex) => {
        if (!header) return;

        columns.add(header);

        data[header] = [];
        for (let rowIndex = 1; rowIndex < jsonData.length; rowIndex++) {
          const row = jsonData[rowIndex] as unknown[];
          const value = row[colIndex];
          if (value === undefined || value === null) {
            data[header].push('');
          } else {
            const stringValue = String(value);
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
  locale: string = 'en'
): SpreadsheetData {
  return readSpreadsheet(filePath, sheetNames, locale);
}
