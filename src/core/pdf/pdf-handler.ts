import { readFile, writeFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
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
    const pdfBytes = await pdfDoc.save();
    await writeFile(outputPath, pdfBytes);
  } catch (error) {
    if (error instanceof Error) {
      throw new PDFLoadError(`Failed to save PDF: ${error.message}`, outputPath);
    }
    throw new PDFLoadError('Failed to save PDF: Unknown error', outputPath);
  }
}
