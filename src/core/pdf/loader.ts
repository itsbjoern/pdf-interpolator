// PDF loading using pdf-lib

import { PDFDocument } from 'pdf-lib';
import { readFile } from 'fs/promises';
import { PDFLoadError } from './error-handler';

/**
 * Load a PDF document from a file path
 */
export async function loadPDF(filePath: string): Promise<PDFDocument> {
  try {
    const pdfBytes = await readFile(filePath);
    const pdfDoc = await PDFDocument.load(pdfBytes, {
      ignoreEncryption: true,
      updateMetadata: false,
      capNumbers: true
    });
    return pdfDoc;
  } catch (error) {
    if (error instanceof Error) {
      throw new PDFLoadError(error.message, filePath);
    }
    throw new PDFLoadError('Unknown error', filePath);
  }
}

/**
 * Save a PDF document to a file path
 */
export async function savePDF(pdfDoc: PDFDocument, outputPath: string): Promise<void> {
  try {
    const { writeFile } = await import('fs/promises');
    const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
    await writeFile(outputPath, pdfBytes);
  } catch (error) {
    if (error instanceof Error) {
      throw new PDFLoadError(`Failed to save PDF: ${error.message}`, outputPath);
    }
    throw new PDFLoadError('Failed to save PDF: Unknown error', outputPath);
  }
}

/**
 * Get page count from PDF document
 */
export function getPageCount(pdfDoc: PDFDocument): number {
  return pdfDoc.getPageCount();
}
