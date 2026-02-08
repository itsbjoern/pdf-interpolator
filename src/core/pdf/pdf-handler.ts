import { readFile, writeFile } from 'node:fs/promises';
import { PDFArray, PDFDocument, PDFHexString, PDFRef } from 'pdf-lib';
import { PDFLoadError } from './error-handler';
import { findAllTrailers, findBestTrailer } from './trailer-parser';

/**
 * Load a PDF document from a file path
 * Handles PDFs with multiple trailers or incremental updates
 */
export async function loadPDF(filePath: string): Promise<PDFDocument> {
  try {
    const pdfBytes = await readFile(filePath);

    // Load the PDF (either original or reconstructed)
    const pdfDoc = await PDFDocument.load(pdfBytes, {
      ignoreEncryption: true,
      updateMetadata: false,
      capNumbers: true
    });

    try {
      const trailers = findAllTrailers(pdfBytes);
      const bestTrailer = findBestTrailer(trailers);
      if (bestTrailer) {
        if (bestTrailer.hasID) {
          const idArray = PDFArray.withContext(pdfDoc.context);
          const theId = bestTrailer.dict['/ID'].replace('[<', '').replace('>]', '').split('><');
          if (theId) {
            idArray.push(PDFHexString.of(theId[0]));
            idArray.push(PDFHexString.of(theId[1]));
          }
          pdfDoc.context.trailerInfo.ID = idArray;
        }
        if (bestTrailer.hasRoot) {
          const splitRoot = bestTrailer.dict['/Root'].split(' ');
          const ref = PDFRef.of(splitRoot[0], splitRoot[1]);
          if (pdfDoc.context.lookup(ref)) {
            pdfDoc.context.trailerInfo.Root = ref;
          }
        }
        if (bestTrailer.hasInfo) {
          const splitInfo = bestTrailer.dict['/Info'].split(' ');
          const ref = PDFRef.of(splitInfo[0], splitInfo[1]);
          if (pdfDoc.context.lookup(ref)) {
            pdfDoc.context.trailerInfo.Info = ref;
          }
        }
      }
    } catch (error) {
      console.warn('[PDF Handler] Failed to find best trailer:', error);
    }

    // One write/load cycle to ensure the PDF is fully loaded
    const fixedBytes = await pdfDoc.save({ useObjectStreams: false });
    await writeFile('/Users/bjoern/Downloads/clean_6.pdf', fixedBytes);
    const fixedPdfDoc = await PDFDocument.load(fixedBytes);

    return fixedPdfDoc;
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
    const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
    await writeFile(outputPath, pdfBytes);
  } catch (error) {
    if (error instanceof Error) {
      throw new PDFLoadError(`Failed to save PDF: ${error.message}`, outputPath);
    }
    throw new PDFLoadError('Failed to save PDF: Unknown error', outputPath);
  }
}
